-- LookCheck AI database schema (PostgreSQL dialect - production)
-- Kept structurally identical to schema.sqlite.sql. If you change one,
-- change the other.

CREATE TABLE IF NOT EXISTS users (
    id               SERIAL PRIMARY KEY,
    email            TEXT NOT NULL,
    email_normalized TEXT NOT NULL UNIQUE,
    password_hash    TEXT NOT NULL,
    name             TEXT NOT NULL,
    style_preference TEXT NOT NULL DEFAULT 'Casual',
    city             TEXT,
    lat              DOUBLE PRECISION,
    lon              DOUBLE PRECISION,
    ai_consent_at    TEXT,
    created_at       TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS clothes (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category     TEXT NOT NULL,
    color        TEXT NOT NULL,
    style        TEXT NOT NULL,
    warmth_level INTEGER NOT NULL,
    description  TEXT,
    image_url    TEXT,
    source_link  TEXT,
    archived     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE INDEX IF NOT EXISTS idx_clothes_user ON clothes(user_id, archived);

CREATE TABLE IF NOT EXISTS events (
    id                     SERIAL PRIMARY KEY,
    name                   TEXT UNIQUE NOT NULL,
    dress_code_description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_outfits (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    outfit_date     TEXT NOT NULL,
    item_ids_json   TEXT NOT NULL,
    event_id        INTEGER REFERENCES events(id),
    weather_summary TEXT,
    reasoning       TEXT,
    styling_tip     TEXT,
    generated_by    TEXT NOT NULL DEFAULT 'mock',
    created_at      TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE INDEX IF NOT EXISTS idx_outfits_user_date
    ON daily_outfits(user_id, outfit_date);

CREATE TABLE IF NOT EXISTS outfit_feedback (
    id         SERIAL PRIMARY KEY,
    outfit_id  INTEGER NOT NULL UNIQUE REFERENCES daily_outfits(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating     TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

INSERT INTO events (name, dress_code_description) VALUES
    ('Work',   'Smart, neat, business-casual. Avoid overly casual sportswear.'),
    ('Date',   'Stylish, put-together, flattering. A bit more effort than everyday wear.'),
    ('Sport',  'Comfortable, breathable, freedom of movement. Sportswear encouraged.'),
    ('Party',  'Bold, expressive, fun. Statement pieces welcome.'),
    ('Casual', 'Relaxed and comfortable everyday wear.')
ON CONFLICT (name) DO NOTHING;
