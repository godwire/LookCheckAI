"""
Lightweight data access layer for LookCheck AI.

Uses Python's built-in sqlite3 module directly (no ORM) - a deliberate,
dependency-free choice so the project runs anywhere with just a stock
Python 3 interpreter.
"""

import sqlite3
import json
import os
from contextlib import contextmanager
from datetime import date

DB_PATH = os.path.join(os.path.dirname(__file__), "lookcheck.db")
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db_cursor():
    conn = get_connection()
    try:
        cur = conn.cursor()
        yield cur
        conn.commit()
    finally:
        conn.close()


def init_db():
    """Create tables (and seed default events) if they don't exist yet."""
    conn = get_connection()
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()


# ---------- Users ----------

def create_user(name, style_preference="Casual", city=None, lat=None, lon=None):
    with db_cursor() as cur:
        cur.execute(
            "INSERT INTO users (name, style_preference, city, lat, lon) VALUES (?, ?, ?, ?, ?)",
            (name, style_preference, city, lat, lon),
        )
        return cur.lastrowid


def get_user(user_id):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        return dict(row) if row else None


def update_user_location(user_id, city, lat, lon):
    with db_cursor() as cur:
        cur.execute(
            "UPDATE users SET city = ?, lat = ?, lon = ? WHERE id = ?",
            (city, lat, lon, user_id),
        )


# ---------- Wardrobe (clothes) ----------

def add_clothing_item(user_id, category, color, style, warmth_level,
                       description=None, image_url=None, source_link=None):
    with db_cursor() as cur:
        cur.execute(
            """INSERT INTO clothes
               (user_id, category, color, style, warmth_level, description, image_url, source_link)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, category, color, style, warmth_level, description, image_url, source_link),
        )
        return cur.lastrowid


def get_wardrobe(user_id):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM clothes WHERE user_id = ? ORDER BY created_at DESC", (user_id,))
        return [dict(row) for row in cur.fetchall()]


def get_clothing_items_by_ids(item_ids):
    if not item_ids:
        return []
    placeholders = ",".join("?" for _ in item_ids)
    with db_cursor() as cur:
        cur.execute(f"SELECT * FROM clothes WHERE id IN ({placeholders})", item_ids)
        return [dict(row) for row in cur.fetchall()]


def delete_clothing_item(item_id, user_id):
    with db_cursor() as cur:
        cur.execute("DELETE FROM clothes WHERE id = ? AND user_id = ?", (item_id, user_id))
        return cur.rowcount > 0


# ---------- Events ----------

def list_events():
    with db_cursor() as cur:
        cur.execute("SELECT * FROM events ORDER BY name")
        return [dict(row) for row in cur.fetchall()]


def get_event_by_name(name):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM events WHERE name = ?", (name,))
        row = cur.fetchone()
        return dict(row) if row else None


# ---------- Daily outfits ----------

def save_outfit(user_id, item_ids, weather_summary, reasoning, event_id=None, outfit_date=None):
    outfit_date = outfit_date or date.today().isoformat()
    with db_cursor() as cur:
        cur.execute(
            """INSERT INTO daily_outfits
               (user_id, outfit_date, item_ids_json, event_id, weather_summary, reasoning)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (user_id, outfit_date, json.dumps(item_ids), event_id, weather_summary, reasoning),
        )
        return cur.lastrowid


def get_recent_outfits(user_id, limit=7):
    with db_cursor() as cur:
        cur.execute(
            "SELECT * FROM daily_outfits WHERE user_id = ? ORDER BY outfit_date DESC LIMIT ?",
            (user_id, limit),
        )
        rows = [dict(row) for row in cur.fetchall()]
        for row in rows:
            row["item_ids"] = json.loads(row["item_ids_json"])
        return rows


def get_recently_used_item_ids(user_id, days=3):
    """Item ids used in the last N recommended outfits, so today's look can avoid repeats."""
    recent = get_recent_outfits(user_id, limit=days)
    used = set()
    for outfit in recent:
        used.update(outfit["item_ids"])
    return used
