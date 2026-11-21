"""房間管理：記憶體中的房間 + 每房一把鎖 + WebSocket 連線 + SQLite 保存。

只能跑單一 uvicorn worker（房間狀態在這個 process 的記憶體裡）。
"""

import asyncio
import json
import logging
import random
import re
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

CHAT_KEEP = 100  # 每房只保留最近幾則
CHAT_MAX_CHARS = 200
CHAT_BURST = 5  # 每人在 CHAT_WINDOW_SECONDS 內最多幾則
CHAT_WINDOW_SECONDS = 10
# 控制字元，以及會反轉文字方向的字元（防止偽造顯示）
_CHAT_STRIP = re.compile("[\x00-\x1f\x7f‎‏‪-‮⁦-⁩]")

_ACTION = TypeAdapter(Action)


class RoomNotFound(Exception):
    pass


def clean_chat(raw: Any) -> str:
    """聊天只有一行：空白縮成一格，去掉控制字元。"""
    if not isinstance(raw, str):
        return ""
    return _CHAT_STRIP.sub("", re.sub(r"\s+", " ", raw)).strip()


@dataclass
class LiveRoom:
    room: Room
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    sockets: dict[str, set[WebSocket]] = field(default_factory=dict)
    # 聊天只放在記憶體：自架版重啟後聊天紀錄會清空，房間本身不受影響
    chat: list[dict[str, Any]] = field(default_factory=list)
    recent_chats: dict[str, list[float]] = field(default_factory=dict)


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

    # ------------------------------------------------------------ 聊天

    async def post_chat(self, lr: LiveRoom, pid: str, raw: Any) -> str | None:
        """發一則聊天訊息，回傳錯誤訊息（成功則為 None）。"""
        async with lr.lock:
            player = lr.room.player(pid)
            if player is None:
                return "你已經不在這個房間"
            if not lr.room.settings.chat_open():
                return "聊天室沒有開放"
            text = clean_chat(raw)
            if not text:
                return "訊息不能是空白"
            if len(text) > CHAT_MAX_CHARS:
                return f"訊息最多 {CHAT_MAX_CHARS} 個字"
            now = self.clock()
            recent = [t for t in lr.recent_chats.get(pid, []) if now - t < CHAT_WINDOW_SECONDS]
            if len(recent) >= CHAT_BURST:
                return "訊息太頻繁，請稍等一下"
            lr.recent_chats[pid] = [*recent, now]
            message = {
                "id": (lr.chat[-1]["id"] if lr.chat else 0) + 1,
                "player_id": pid,
                "name": player.name,
                "color": player.color,
                "text": text,
                "ts": int(now * 1000),
            }
            lr.chat = [*lr.chat, message][-CHAT_KEEP:]
        await self.send_all(lr, {"type": "chat", "message": message})
        return None

    def chat_history(self, lr: LiveRoom) -> dict[str, Any] | None:
        """遠端房間：連線時補上聊天紀錄。"""
        if not lr.room.settings.remote:
            return None
        return {"type": "chat_history", "messages": lr.chat}

    async def send_all(self, lr: LiveRoom, payload: dict[str, Any]) -> None:
        message = json.dumps(payload, ensure_ascii=False)
        for sockets in list(lr.sockets.values()):
            for ws in list(sockets):
                try:
                    await ws.send_text(message)
                except Exception:  # noqa: BLE001 — 連線可能早就斷了
                    sockets.discard(ws)

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
