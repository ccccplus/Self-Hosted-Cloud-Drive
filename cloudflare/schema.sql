-- ==========================================
-- QR-Relay Cloudflare D1 Database Schema
-- Compatible with SQLite on Cloudflare D1
-- ==========================================

CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,                  -- 'text', 'file', 'image'
    title TEXT,                          -- original filename or text title
    content TEXT,                        -- raw text content OR object key in R2
    file_size INTEGER DEFAULT 0,         -- size in bytes
    mime_type TEXT,
    created_at TEXT NOT NULL,            -- ISO 8601 string
    expires_at TEXT,                     -- ISO 8601 string, NULL = permanent
    burn_after_reading INTEGER DEFAULT 0,-- 1 = auto delete after first fetch
    views_count INTEGER DEFAULT 0,
    openlist_sync_status TEXT DEFAULT 'disabled', -- 'disabled', 'pending', 'synced', 'failed'
    openlist_sync_time TEXT,
    openlist_sync_error TEXT
);

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS admin_tokens (
    token TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_code ON items(code);
CREATE INDEX IF NOT EXISTS idx_items_expires ON items(expires_at);

-- Initial default admin password (admin123)
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('admin_password', 'admin123');
