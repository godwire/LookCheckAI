-- LookCheck AI database schema (SQLite dialect - local development)

CREATE TABLE IF NOT EXISTS users (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    email            TEXT NOT NULL,
    email_normalized TEXT NOT NULL UNIQUE,
    password_hash    TEXT NOT NULL,
    name             TEXT NOT NULL,
    style_preference TEXT NOT NULL DEFAULT 'Casual',
    city             TEXT,
    lat              REAL,
    lon              REAL,
    ai_consent_at    TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clothes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category     TEXT NOT NULL,        -- top | bottom | outerwear | footwear | accessory
    color        TEXT NOT NULL,
    style        TEXT NOT NULL,        -- Casual, Streetwear, Business, Minimalist, Sport, Formal
    warmth_level INTEGER NOT NULL,     -- 1 (very light) .. 5 (very warm)
    description  TEXT,
    image_url    TEXT,
    source_link  TEXT,
    archived     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_clothes_user ON clothes(user_id, archived);

CREATE TABLE IF NOT EXISTS events (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    name                   TEXT UNIQUE NOT NULL,
    dress_code_description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_outfits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    outfit_date     TEXT NOT NULL,       -- YYYY-MM-DD
    item_ids_json   TEXT NOT NULL,       -- JSON array of clothes.id
    event_id        INTEGER REFERENCES events(id),   -- NULL = regular daily look
    weather_summary TEXT,
    reasoning       TEXT,
    styling_tip     TEXT,
    generated_by    TEXT NOT NULL DEFAULT 'mock',    -- mock | gemini | anthropic
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_outfits_user_date
    ON daily_outfits(user_id, outfit_date);

CREATE TABLE IF NOT EXISTS outfit_feedback (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    outfit_id  INTEGER NOT NULL UNIQUE REFERENCES daily_outfits(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating     TEXT NOT NULL,   -- like | dislike
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO events (name, dress_code_description) VALUES
    ('Work',   'Smart, neat, business-casual. Avoid overly casual sportswear.'),
    ('Date',   'Stylish, put-together, flattering. A bit more effort than everyday wear.'),
    ('Sport',  'Comfortable, breathable, freedom of movement. Sportswear encouraged.'),
    ('Party',  'Bold, expressive, fun. Statement pieces welcome.'),
    ('Casual', 'Relaxed and comfortable everyday wear.');
