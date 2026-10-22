import os
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class AppSettings:
    public_base_url: str
    data_dir: Path
    static_dir: Path
    room_ttl_hours: float


def load_settings() -> AppSettings:
    return AppSettings(
        public_base_url=os.getenv("PUBLIC_BASE_URL", "").rstrip("/"),
        data_dir=Path(os.getenv("DATA_DIR", BACKEND_DIR / "data")),
        static_dir=Path(os.getenv("STATIC_DIR", BACKEND_DIR.parent / "frontend" / "dist")),
        room_ttl_hours=float(os.getenv("ROOM_TTL_HOURS", "12")),
    )
