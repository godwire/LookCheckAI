"""
Data access layer for LookCheck AI.

Works against either SQLite (local development) or PostgreSQL (production),
selected by DATABASE_URL. There is no ORM: queries are written once with `?`
placeholders and translated to `%s` for Postgres by `_q()`.

Every query that touches user-owned data takes a user_id and filters on it.
Nothing in this module returns another user's rows.
"""

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timezone
from urllib.parse import urlparse

import config

IS_SQLITE = config.DATABASE_URL.startswith("sqlite")

if not IS_SQLITE:
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "DATABASE_URL points at PostgreSQL but psycopg is not installed. "
            "Run: pip install 'psycopg[binary]'"
        ) from exc

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SCHEMA_FILE = "schema.sqlite.sql" if IS_SQLITE else "schema.postgres.sql"
SCHEMA_PATH = os.path.join(BASE_DIR, SCHEMA_FILE)


def _sqlite_path():
    """sqlite:///relative.db -> relative.db ; sqlite:////abs/path.db -> /abs/path.db"""
    raw = config.DATABASE_URL[len("sqlite://"):]
    if raw.startswith("//"):
        return raw[1:]                       # absolute path
    return os.path.join(BASE_DIR, raw.lstrip("/"))


def _q(sql):
    """Translate `?` placeholders to the dialect in use."""
    return sql if IS_SQLITE else sql.replace("?", "%s")


def get_connection():
    if IS_SQLITE:
        conn = sqlite3.connect(_sqlite_path())
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn
    return psycopg.connect(config.DATABASE_URL, row_factory=dict_row)


@contextmanager
def db_cursor(commit=True):
    conn = get_connection()
    try:
        cur = conn.cursor()
        yield cur
        if commit:
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _one(cur):
    row = cur.fetchone()
    return dict(row) if row is not None else None


def _all(cur):
    return [dict(row) for row in cur.fetchall()]


def _insert(cur, sql, params):
    """Run an INSERT and return the new row's id, on either dialect."""
    if IS_SQLITE:
        cur.execute(_q(sql), params)
        return cur.lastrowid
    cur.execute(_q(sql + " RETURNING id"), params)
    return cur.fetchone()["id"]


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


# Columns added after the first release. `CREATE TABLE IF NOT EXISTS` does
# nothing to a table that already exists, so new columns have to be added
# explicitly or an existing database would be missing them.
MIGRATIONS = (
    ("clothes", "cutout_url", "TEXT"),
    ("clothes", "cutout_joins", "TEXT"),
)


def _existing_columns(cur, table):
    if IS_SQLITE:
        cur.execute(f"PRAGMA table_info({table})")
        return {row[1] for row in cur.fetchall()}
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = %s",
        (table,),
    )
    return {row["column_name"] for row in cur.fetchall()}


def init_db():
    """Create tables, apply pending column additions, seed default events."""
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        script = f.read()

    conn = get_connection()
    try:
        if IS_SQLITE:
            conn.executescript(script)
        else:
            with conn.cursor() as cur:
                cur.execute(script)
        conn.commit()

        cur = conn.cursor()
        for table, column, coltype in MIGRATIONS:
            if column not in _existing_columns(cur, table):
                cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}")
                print(f"[database] added {table}.{column}")
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

PUBLIC_USER_FIELDS = (
    "id, email, name, style_preference, city, lat, lon, ai_consent_at, created_at"
)


def normalize_email(email):
    return (email or "").strip().lower()


def create_user(email, password_hash, name, style_preference="Casual",
                city=None, lat=None, lon=None):
    with db_cursor() as cur:
        return _insert(
            cur,
            """INSERT INTO users
               (email, email_normalized, password_hash, name, style_preference, city, lat, lon)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (email.strip(), normalize_email(email), password_hash, name,
             style_preference, city, lat, lon),
        )


def get_user(user_id):
    with db_cursor(commit=False) as cur:
        cur.execute(_q(f"SELECT {PUBLIC_USER_FIELDS} FROM users WHERE id = ?"), (user_id,))
        return _one(cur)


def get_user_auth_record(email):
    """Includes password_hash - only used by the login flow."""
    with db_cursor(commit=False) as cur:
        cur.execute(
            _q("SELECT id, password_hash FROM users WHERE email_normalized = ?"),
            (normalize_email(email),),
        )
        return _one(cur)


def email_exists(email):
    with db_cursor(commit=False) as cur:
        cur.execute(
            _q("SELECT 1 AS found FROM users WHERE email_normalized = ?"),
            (normalize_email(email),),
        )
        return _one(cur) is not None


def update_user_profile(user_id, name=None, style_preference=None):
    sets, params = [], []
    if name is not None:
        sets.append("name = ?")
        params.append(name)
    if style_preference is not None:
        sets.append("style_preference = ?")
        params.append(style_preference)
    if not sets:
        return get_user(user_id)

    params.append(user_id)
    with db_cursor() as cur:
        cur.execute(_q(f"UPDATE users SET {', '.join(sets)} WHERE id = ?"), tuple(params))
    return get_user(user_id)


def update_user_location(user_id, city, lat, lon):
    with db_cursor() as cur:
        cur.execute(
            _q("UPDATE users SET city = ?, lat = ?, lon = ? WHERE id = ?"),
            (city, lat, lon, user_id),
        )
    return get_user(user_id)


def set_ai_consent(user_id, granted):
    value = _now() if granted else None
    with db_cursor() as cur:
        cur.execute(_q("UPDATE users SET ai_consent_at = ? WHERE id = ?"), (value, user_id))
    return get_user(user_id)


def delete_user(user_id):
    """Hard-deletes the account and everything attached to it (ON DELETE CASCADE)."""
    with db_cursor() as cur:
        cur.execute(_q("DELETE FROM users WHERE id = ?"), (user_id,))
        return cur.rowcount > 0


# ---------------------------------------------------------------------------
# Wardrobe
# ---------------------------------------------------------------------------

def add_clothing_item(user_id, category, color, style, warmth_level,
                      description=None, image_url=None, source_link=None,
                      cutout_url=None, cutout_joins=None):
    with db_cursor() as cur:
        return _insert(
            cur,
            """INSERT INTO clothes
               (user_id, category, color, style, warmth_level, description,
                image_url, cutout_url, cutout_joins, source_link)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, category, color, style, warmth_level,
             description, image_url, cutout_url, cutout_joins, source_link),
        )


def get_wardrobe(user_id):
    with db_cursor(commit=False) as cur:
        cur.execute(
            _q("""SELECT * FROM clothes
                  WHERE user_id = ? AND archived = 0
                  ORDER BY created_at DESC, id DESC"""),
            (user_id,),
        )
        return _all(cur)


def count_wardrobe_items(user_id):
    with db_cursor(commit=False) as cur:
        cur.execute(
            _q("SELECT COUNT(*) AS total FROM clothes WHERE user_id = ? AND archived = 0"),
            (user_id,),
        )
        return _one(cur)["total"]


def get_clothing_item(item_id, user_id):
    with db_cursor(commit=False) as cur:
        cur.execute(_q("SELECT * FROM clothes WHERE id = ? AND user_id = ?"), (item_id, user_id))
        return _one(cur)


def get_clothing_items_by_ids(item_ids, user_id):
    """Always scoped to the owner - an id list from an LLM can never leak
    another user's items."""
    ids = [int(i) for i in item_ids or []]
    if not ids:
        return []
    placeholders = ",".join("?" for _ in ids)
    with db_cursor(commit=False) as cur:
        cur.execute(
            _q(f"SELECT * FROM clothes WHERE user_id = ? AND id IN ({placeholders})"),
            tuple([user_id] + ids),
        )
        rows = _all(cur)

    order = {item_id: index for index, item_id in enumerate(ids)}
    rows.sort(key=lambda row: order.get(row["id"], 0))
    return rows


def update_clothing_item(item_id, user_id, fields):
    allowed = ("category", "color", "style", "warmth_level",
               "description", "image_url", "cutout_url", "cutout_joins",
               "source_link")
    sets, params = [], []
    for key in allowed:
        if key in fields:
            sets.append(f"{key} = ?")
            params.append(fields[key])
    if not sets:
        return get_clothing_item(item_id, user_id)

    params.extend([item_id, user_id])
    with db_cursor() as cur:
        cur.execute(
            _q(f"UPDATE clothes SET {', '.join(sets)} WHERE id = ? AND user_id = ?"),
            tuple(params),
        )
    return get_clothing_item(item_id, user_id)


def delete_clothing_item(item_id, user_id):
    with db_cursor() as cur:
        cur.execute(_q("DELETE FROM clothes WHERE id = ? AND user_id = ?"), (item_id, user_id))
        return cur.rowcount > 0


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

def list_events():
    with db_cursor(commit=False) as cur:
        cur.execute(_q("SELECT * FROM events ORDER BY name"))
        return _all(cur)


def get_event_by_name(name):
    with db_cursor(commit=False) as cur:
        cur.execute(_q("SELECT * FROM events WHERE name = ?"), (name,))
        return _one(cur)


# ---------------------------------------------------------------------------
# Outfits
# ---------------------------------------------------------------------------

def save_outfit(user_id, item_ids, weather_summary, reasoning, styling_tip=None,
                event_id=None, generated_by="mock", outfit_date=None):
    outfit_date = outfit_date or date.today().isoformat()
    with db_cursor() as cur:
        return _insert(
            cur,
            """INSERT INTO daily_outfits
               (user_id, outfit_date, item_ids_json, event_id,
                weather_summary, reasoning, styling_tip, generated_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, outfit_date, json.dumps(list(item_ids)), event_id,
             weather_summary, reasoning, styling_tip, generated_by),
        )


def _hydrate(row):
    if row is None:
        return None
    row["item_ids"] = json.loads(row.pop("item_ids_json"))
    return row


def get_outfit(outfit_id, user_id):
    with db_cursor(commit=False) as cur:
        cur.execute(
            _q("SELECT * FROM daily_outfits WHERE id = ? AND user_id = ?"),
            (outfit_id, user_id),
        )
        return _hydrate(_one(cur))


def get_todays_outfit(user_id, event_id=None, outfit_date=None):
    """The most recent look already generated today, so opening the app twice
    doesn't burn an AI call and doesn't silently change the recommendation."""
    outfit_date = outfit_date or date.today().isoformat()
    condition = "event_id = ?" if event_id is not None else "event_id IS NULL"
    params = [user_id, outfit_date] + ([event_id] if event_id is not None else [])
    with db_cursor(commit=False) as cur:
        cur.execute(
            _q(f"""SELECT * FROM daily_outfits
                   WHERE user_id = ? AND outfit_date = ? AND {condition}
                   ORDER BY id DESC LIMIT 1"""),
            tuple(params),
        )
        return _hydrate(_one(cur))


def count_outfits_today(user_id, outfit_date=None):
    outfit_date = outfit_date or date.today().isoformat()
    with db_cursor(commit=False) as cur:
        cur.execute(
            _q("""SELECT COUNT(*) AS total FROM daily_outfits
                  WHERE user_id = ? AND outfit_date = ?"""),
            (user_id, outfit_date),
        )
        return _one(cur)["total"]


def get_recent_outfits(user_id, limit=14):
    with db_cursor(commit=False) as cur:
        cur.execute(
            _q("""SELECT o.*, f.rating AS feedback
                  FROM daily_outfits o
                  LEFT JOIN outfit_feedback f ON f.outfit_id = o.id
                  WHERE o.user_id = ?
                  ORDER BY o.outfit_date DESC, o.id DESC
                  LIMIT ?"""),
            (user_id, limit),
        )
        return [_hydrate(row) for row in _all(cur)]


def get_recently_used_item_ids(user_id, lookback=3):
    """Items used in the last few looks, so today's suggestion can vary."""
    used = set()
    for outfit in get_recent_outfits(user_id, limit=lookback):
        used.update(outfit["item_ids"])
    return used


def get_disliked_item_ids(user_id, limit=20):
    """Items that appeared in looks the user explicitly rejected. Feeds the
    first, deliberately simple version of preference learning."""
    with db_cursor(commit=False) as cur:
        cur.execute(
            _q("""SELECT o.item_ids_json FROM daily_outfits o
                  JOIN outfit_feedback f ON f.outfit_id = o.id
                  WHERE o.user_id = ? AND f.rating = 'dislike'
                  ORDER BY o.id DESC LIMIT ?"""),
            (user_id, limit),
        )
        rows = _all(cur)

    counts = {}
    for row in rows:
        for item_id in json.loads(row["item_ids_json"]):
            counts[item_id] = counts.get(item_id, 0) + 1
    return counts


def set_outfit_feedback(outfit_id, user_id, rating):
    with db_cursor() as cur:
        cur.execute(
            _q("""INSERT INTO outfit_feedback (outfit_id, user_id, rating)
                  VALUES (?, ?, ?)
                  ON CONFLICT (outfit_id) DO UPDATE SET rating = ?"""),
            (outfit_id, user_id, rating, rating),
        )
    return True
