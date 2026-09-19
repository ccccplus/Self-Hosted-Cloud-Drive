import os
from pathlib import Path
from typing import Optional

def load_dotenv(env_path: Path):
    if env_path.exists():
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("'\"")
                        if k not in os.environ:
                            os.environ[k] = v
        except Exception:
            pass

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

class Settings:
    def __init__(self):
        self.APP_NAME: str = os.getenv("APP_NAME", "QR-Relay")
        self.HOST: str = os.getenv("HOST", "0.0.0.0")
        self.PORT: int = int(os.getenv("PORT", "8080"))
        self.BASE_URL: str = os.getenv("BASE_URL", "http://localhost:8080")
        self.MAX_FILE_SIZE_MB: int = int(os.getenv("MAX_FILE_SIZE_MB", "100"))
        self.UPLOAD_PASSWORD: Optional[str] = os.getenv("UPLOAD_PASSWORD") or None
        self.ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "admin123")
        self.AUTO_CLEANUP_INTERVAL_SECONDS: int = int(os.getenv("AUTO_CLEANUP_INTERVAL_SECONDS", "60"))

        # Paths
        self.BASE_DIR: Path = BASE_DIR
        self.DATA_DIR: Path = BASE_DIR / "data"
        self.UPLOAD_DIR: Path = BASE_DIR / "data" / "uploads"
        self.DB_PATH: Path = BASE_DIR / "data" / "relay.db"

        # OpenList (WebDAV) Integration
        self.OPENLIST_WEBDAV_URL: Optional[str] = os.getenv("OPENLIST_WEBDAV_URL") or None
        self.OPENLIST_USERNAME: Optional[str] = os.getenv("OPENLIST_USERNAME") or None
        self.OPENLIST_PASSWORD: Optional[str] = os.getenv("OPENLIST_PASSWORD") or None
        self.OPENLIST_BACKUP_PATH: str = os.getenv("OPENLIST_BACKUP_PATH", "/QR-Relay-Backup")
        self.OPENLIST_AUTO_SYNC: bool = os.getenv("OPENLIST_AUTO_SYNC", "True").lower() in ["true", "1", "yes"]

        # Ensure directories exist
        self.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

settings = Settings()
