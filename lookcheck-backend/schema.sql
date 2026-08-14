-- LookCheck AI database schema (SQLite)

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    style_preference TEXT DEFAULT 'Casual',
    city TEXT,
    lat REAL,
    lon REAL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clothes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL,        -- top | bottom | outerwear | footwear | accessory
    color TEXT,
    style TEXT,                    -- e.g. Streetwear, Minimalist, Business, Sport
    warmth_level INTEGER,          -- 1 (very light) .. 5 (very warm)
    description TEXT,
    image_url TEXT,
    source_link TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    dress_code_description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_outfits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    outfit_date TEXT NOT NULL,
    item_ids_json TEXT NOT NULL,   -- JSON array of clothes.id
    event_id INTEGER,              -- NULL = regular daily look
    weather_summary TEXT,
    reasoning TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES events(id)
);

INSERT OR IGNORE INTO events (name, dress_code_description) VALUES
    ('Work', 'Smart, neat, business-casual. Avoid overly casual sportswear.'),
    ('Date', 'Stylish, put-together, flattering. A bit more effort than everyday wear.'),
    ('Sport', 'Comfortable, breathable, freedom of movement. Sportswear encouraged.'),
    ('Party', 'Bold, expressive, fun. Statement pieces welcome.'),
    ('Casual', 'Relaxed and comfortable everyday wear.');
