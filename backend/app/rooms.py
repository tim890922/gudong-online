"""房間管理：記憶體中的房間 + 每房一把鎖 + WebSocket 連線 + SQLite 保存。

只能跑單一 uvicorn worker（房間狀態在這個 process 的記憶體裡）。
"""

import asyncio
import json
import logging
import random
import secrets
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket
from pydantic import TypeAdapter, ValidationError

from .engine.actions import Action
from .engine.constants import COLORS, MAX_PLAYERS
from .engine.errors import GameError
from .engine.game import apply_action
from .engine.models import PlayerInfo, Room
from .engine.views import build_view
from .store import RoomStore

log = logging.getLogger(__name__)

# 排除 0/O、1/I 這類容易看錯的字元
ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 4
CLOSE_REMOVED = 4001
CLOSE_UNKNOWN = 4004

_ACTION = TypeAdapter(Action)


class RoomNotFound(Exception):
    pass


@dataclass
class LiveRoom:
    room: Room
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    sockets: dict[str, set[WebSocket]] = field(default_factory=dict)


class RoomManager:
    def __init__(self, store: RoomStore, ttl_hours: float = 12,
                 rng: random.Random | None = None, clock: Callable[[], float] = time.time):
        self.store = store
        self.ttl_seconds = ttl_hours * 3600
        self.rng = rng or random.SystemRandom()
        self.clock = clock
        self.live: dict[str, LiveRoom] = {}

    # ------------------------------------------------------------ 查詢

    def get(self, code: str) -> LiveRoom | None:
        code = code.strip().upper()
        if code in self.live:
            return self.live[code]
        room = self.store.load(code)
        if room is None:
            return None
        self.live[code] = LiveRoom(room)
        return self.live[code]

    def summary(self, code: str) -> dict[str, Any]:
        lr = self.get(code)
        if lr is None:
            return {"code": code.upper(), "exists": False, "started": False, "players": 0,
                    "joinable": False}
        room = lr.room
        started = room.game is not None
        return {
            "code": room.code,
            "exists": True,
            "started": started,
            "players": len(room.players),
            "joinable": not started and len(room.players) < MAX_PLAYERS,
        }

    # ------------------------------------------------------------ 建立／加入

    def _new_code(self) -> str:
        for _ in range(1000):
            code = "".join(self.rng.choice(ROOM_ALPHABET) for _ in range(CODE_LENGTH))
            if code not in self.live and not self.store.exists(code):
                return code
        raise RuntimeError("找不到可用的房號")

    def _new_player(self, name: str, room: Room | None = None) -> PlayerInfo:
        used = {p.color for p in room.players} if room else set()
        color = next((c for c in range(len(COLORS)) if c not in used), None)
        return PlayerInfo(
            id=secrets.token_hex(4),
            token=secrets.token_urlsafe(18),
            name=name.strip(),
            color=color,
        )

    async def create_room(self, name: str) -> tuple[Room, PlayerInfo]:
        now = self.clock()
        player = self._new_player(name)
        room = Room(code=self._new_code(), host_id=player.id, players=[player],
                    created_at=now, updated_at=now)
        self.live[room.code] = LiveRoom(room)
        self.store.save(room)
        return room, player

    async def join_room(self, code: str, name: str) -> tuple[Room, PlayerInfo]:
        lr = self.get(code)
        if lr is None:
            raise RoomNotFound
        async with lr.lock:
            room = lr.room
            if room.game is not None:
                raise GameError("遊戲已經開始，無法加入")
            if len(room.players) >= MAX_PLAYERS:
                raise GameError(f"房間已滿（最多 {MAX_PLAYERS} 人）")
            player = self._new_player(name, room)
            room.players.append(player)
            room.updated_at = self.clock()
            self.store.save(room)
        await self.broadcast(lr)
        return room, player

    # ------------------------------------------------------------ 連線

    def connect(self, code: str, token: str, ws: WebSocket) -> tuple[LiveRoom, str] | None:
        lr = self.get(code)
        if lr is None:
            return None
        player = lr.room.by_token(token)
        if player is None:
            return None
        lr.sockets.setdefault(player.id, set()).add(ws)
        return lr, player.id

    async def disconnect(self, lr: LiveRoom, pid: str, ws: WebSocket) -> None:
        sockets = lr.sockets.get(pid)
        if sockets is not None:
            sockets.discard(ws)
            if not sockets:
                del lr.sockets[pid]
        await self.broadcast(lr)

    async def handle(self, lr: LiveRoom, pid: str, raw: Any) -> str | None:
        """處理一個玩家操作，回傳錯誤訊息（成功則為 None）。"""
        try:
            action = _ACTION.validate_python(raw)
        except ValidationError:
            return "操作格式不正確"
        async with lr.lock:
            if lr.room.player(pid) is None:
                return "你已經不在這個房間"
            draft = lr.room.model_copy(deep=True)
            try:
                apply_action(draft, pid, action, self.rng)
            except GameError as e:
                return str(e)
            draft.updated_at = self.clock()
            lr.room = draft
            if draft.players:
                self.store.save(draft)
            else:
                self.store.delete(draft.code)
                self.live.pop(draft.code, None)
            removed = [p for p in lr.sockets if draft.player(p) is None]
        for p in removed:
            await self._close_player(lr, p, "你已離開房間")
        await self.broadcast(lr)
        return None

    async def _close_player(self, lr: LiveRoom, pid: str, reason: str) -> None:
        for ws in list(lr.sockets.pop(pid, set())):
            try:
                await ws.send_text(json.dumps({"type": "removed", "message": reason},
                                              ensure_ascii=False))
                await ws.close(code=CLOSE_REMOVED)
            except Exception:  # noqa: BLE001 — 連線可能早就斷了
                pass

    async def broadcast(self, lr: LiveRoom) -> None:
        connected = {pid for pid, sockets in lr.sockets.items() if sockets}
        for pid, sockets in list(lr.sockets.items()):
            message = json.dumps(
                {"type": "state", "view": build_view(lr.room, pid, connected)},
                ensure_ascii=False,
            )
            for ws in list(sockets):
                try:
                    await ws.send_text(message)
                except Exception:  # noqa: BLE001
                    sockets.discard(ws)

    # ------------------------------------------------------------ 清房

    async def cleanup(self) -> int:
        cutoff = self.clock() - self.ttl_seconds
        expired = set(self.store.expired(cutoff))
        expired |= {c for c, lr in self.live.items() if lr.room.updated_at < cutoff}
        for code in expired:
            self.store.delete(code)
            lr = self.live.pop(code, None)
            if lr:
                for pid in list(lr.sockets):
                    await self._close_player(lr, pid, "房間已過期")
        if expired:
            log.info("清除 %d 個過期房間", len(expired))
        return len(expired)
