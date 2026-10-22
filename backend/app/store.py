import sqlite3
from pathlib import Path

from .engine.models import Room


class RoomStore:
    """把房間狀態存成 JSON，容器重啟後可以接著玩。"""

    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS rooms ("
            " code TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at REAL NOT NULL)"
        )
        self._db.commit()

    def load(self, code: str) -> Room | None:
        row = self._db.execute("SELECT state FROM rooms WHERE code = ?", (code,)).fetchone()
        return Room.model_validate_json(row[0]) if row else None

    def exists(self, code: str) -> bool:
        row = self._db.execute("SELECT 1 FROM rooms WHERE code = ?", (code,)).fetchone()
        return row is not None

    def save(self, room: Room) -> None:
        self._db.execute(
            "INSERT INTO rooms (code, state, updated_at) VALUES (?, ?, ?)"
            " ON CONFLICT(code) DO UPDATE SET state = excluded.state,"
            " updated_at = excluded.updated_at",
            (room.code, room.model_dump_json(), room.updated_at),
        )
        self._db.commit()

    def delete(self, code: str) -> None:
        self._db.execute("DELETE FROM rooms WHERE code = ?", (code,))
        self._db.commit()

    def expired(self, before: float) -> list[str]:
        rows = self._db.execute("SELECT code FROM rooms WHERE updated_at < ?", (before,))
        return [r[0] for r in rows]

    def close(self) -> None:
        self._db.close()
