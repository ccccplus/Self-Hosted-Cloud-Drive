import sqlite3
import random
import string
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from .config import settings

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(settings.DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                type TEXT NOT NULL,          -- 'text', 'file', 'image'
                title TEXT,                  -- original filename or text title
                content TEXT,                -- raw text content OR filename stored in uploads/
                file_size INTEGER DEFAULT 0, -- size in bytes
                mime_type TEXT,
                created_at TEXT NOT NULL,
                expires_at TEXT,             -- NULL means permanent
                burn_after_reading INTEGER DEFAULT 0, -- 1 = auto delete after first fetch
                views_count INTEGER DEFAULT 0,
                openlist_sync_status TEXT DEFAULT 'disabled', -- 'disabled', 'pending', 'synced', 'failed'
                openlist_sync_time TEXT,
                openlist_sync_error TEXT
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_items_code ON items(code)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_items_expires ON items(expires_at)")
        
        # Ensure default admin password is set
        cursor.execute("SELECT value FROM system_settings WHERE key = 'admin_password'")
        if not cursor.fetchone():
            cursor.execute("INSERT INTO system_settings (key, value) VALUES ('admin_password', ?)", (settings.ADMIN_PASSWORD,))
        
        conn.commit()

# In-memory admin tokens set
active_admin_tokens = set()

def get_admin_password() -> str:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT)")
        cursor.execute("SELECT value FROM system_settings WHERE key = 'admin_password'")
        row = cursor.fetchone()
        if not row:
            cursor.execute("INSERT INTO system_settings (key, value) VALUES ('admin_password', ?)", (settings.ADMIN_PASSWORD,))
            conn.commit()
            return settings.ADMIN_PASSWORD
        return row[0]

def set_admin_password(new_password: str):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('admin_password', ?)", (new_password,))
        conn.commit()

def create_admin_token() -> str:
    token = ''.join(random.choices(string.ascii_letters + string.digits, k=32))
    active_admin_tokens.add(token)
    return token

def verify_admin_token(token: Optional[str]) -> bool:
    if not token:
        return False
    return token in active_admin_tokens

def revoke_admin_token(token: Optional[str]):
    if token and token in active_admin_tokens:
        active_admin_tokens.remove(token)

def generate_pickup_code(length: int = 6) -> str:
    """Generate a unique 6-digit numeric code (e.g. 839201). If collision occurs, falls back to 6-char alphanumeric."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        for _ in range(20):
            code = ''.join(random.choices(string.digits, k=length))
            cursor.execute("SELECT 1 FROM items WHERE code = ?", (code,))
            if not cursor.fetchone():
                return code
        # Fallback to alphanumeric 6-char
        for _ in range(20):
            code = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
            cursor.execute("SELECT 1 FROM items WHERE code = ?", (code,))
            if not cursor.fetchone():
                return code
        return f"{int(datetime.now().timestamp()) % 1000000:06d}"
    finally:
        conn.close()

def create_item(
    item_type: str,
    content: str,
    title: Optional[str] = None,
    file_size: int = 0,
    mime_type: Optional[str] = None,
    expires_at: Optional[str] = None,
    burn_after_reading: bool = False,
    sync_to_openlist: bool = True,
    custom_code: Optional[str] = None
) -> Dict[str, Any]:
    if custom_code:
        clean_code = custom_code.strip()
        # Verify custom code is available
        existing = get_item_by_code(clean_code)
        if existing:
            raise ValueError(f"取件码 {clean_code} 已被占用，请更换")
        code = clean_code
    else:
        code = generate_pickup_code(length=6)

    created_at = datetime.now(timezone.utc).isoformat()
    
    sync_status = "pending" if (sync_to_openlist and settings.OPENLIST_WEBDAV_URL) else "disabled"

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO items (
                code, type, title, content, file_size, mime_type,
                created_at, expires_at, burn_after_reading,
                openlist_sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            code, item_type, title, content, file_size, mime_type,
            created_at, expires_at, 1 if burn_after_reading else 0,
            sync_status
        ))
        conn.commit()

    return get_item_by_code(code)

def get_item_by_code(code: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM items WHERE code = ?", (code,))
        row = cursor.fetchone()
        if row:
            return dict(row)
        return None

def increment_views(code: str) -> int:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE items SET views_count = views_count + 1 WHERE code = ?", (code,))
        conn.commit()
        cursor.execute("SELECT views_count FROM items WHERE code = ?", (code,))
        row = cursor.fetchone()
        return row[0] if row else 0

def delete_item_by_code(code: str) -> bool:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM items WHERE code = ?", (code,))
        conn.commit()
        return cursor.rowcount > 0

def get_recent_items(limit: int = 50, allowed_codes: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        if allowed_codes is not None:
            if not allowed_codes:
                return []
            placeholders = ','.join('?' for _ in allowed_codes)
            cursor.execute(f"""
                SELECT * FROM items
                WHERE code IN ({placeholders})
                ORDER BY id DESC
                LIMIT ?
            """, (*allowed_codes, limit))
        else:
            cursor.execute("""
                SELECT * FROM items
                ORDER BY id DESC
                LIMIT ?
            """, (limit,))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]

def get_expired_items() -> List[Dict[str, Any]]:
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM items
            WHERE expires_at IS NOT NULL AND expires_at <= ?
        """, (now_iso,))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]

def update_sync_status(code: str, status: str, error: Optional[str] = None):
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE items 
            SET openlist_sync_status = ?, 
                openlist_sync_time = ?, 
                openlist_sync_error = ?
            WHERE code = ?
        """, (status, now_iso, error, code))
        conn.commit()

# Ensure tables are initialized
init_db()
