"""运行期配置：路径与版本号，全部可被环境变量覆盖。"""

from __future__ import annotations

import os
from pathlib import Path

APP_VERSION = "0.1.0"
BASE_DIR = Path(__file__).resolve().parent.parent


def _env_path(key: str, default: Path) -> Path:
    raw = os.getenv(key)
    return Path(raw).expanduser() if raw else default


DATA_DIR = _env_path("DATA_DIR", BASE_DIR / "data")
DB_PATH = _env_path("QUOTE_DB_PATH", DATA_DIR / "quotes.db")
CLIPS_DIR = _env_path("CLIPS_DIR", DATA_DIR / "clips")
STATIC_DIR = BASE_DIR / "app" / "static"
