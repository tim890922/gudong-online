from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from .engine.constants import (
    BRANCHES,
    CHIPS_PER_ROUND,
    COLORS,
    GOOD_WIN_SCORE,
    MAX_PLAYERS,
    MAX_POISON,
    MIN_PLAYERS,
    ZODIAC,
)
from .engine.errors import GameError
from .engine.roles import ROLE_INFO
from .rooms import RoomManager, RoomNotFound

router = APIRouter(prefix="/api")


class NameIn(BaseModel):
    name: str = Field(min_length=1, max_length=12)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("暱稱不能是空白")
        return v


class Credentials(BaseModel):
    code: str
    player_id: str
    token: str


def manager(request: Request) -> RoomManager:
    return request.app.state.manager


@router.get("/health")
async def health() -> dict:
    return {"ok": True}


@router.get("/config")
async def config(request: Request) -> dict:
    return {"public_base_url": request.app.state.settings.public_base_url}


@router.get("/meta")
async def meta() -> dict:
    """前端用的靜態資料：生肖、顏色、角色說明。"""
    return {
        "zodiac": ZODIAC,
        "branches": BRANCHES,
        "colors": COLORS,
        "min_players": MIN_PLAYERS,
        "max_players": MAX_PLAYERS,
        "chips_per_round": CHIPS_PER_ROUND,
        "max_poison": MAX_POISON,
        "good_win_score": GOOD_WIN_SCORE,
        "roles": {
            role: {
                "name": info.name,
                "faction": info.faction,
                "description": info.description,
                "fan": info.fan,
                "replaces": info.replaces,
                "skill": info.skill,
                "ident": info.ident,
            }
            for role, info in ROLE_INFO.items()
        },
    }


@router.post("/rooms")
async def create_room(body: NameIn, request: Request) -> Credentials:
    room, player = await manager(request).create_room(body.name)
    return Credentials(code=room.code, player_id=player.id, token=player.token)


@router.get("/rooms/{code}")
async def room_summary(code: str, request: Request) -> dict:
    return manager(request).summary(code)


@router.post("/rooms/{code}/join")
async def join_room(code: str, body: NameIn, request: Request) -> Credentials:
    try:
        room, player = await manager(request).join_room(code, body.name)
    except RoomNotFound:
        raise HTTPException(404, "找不到這個房間，請確認房號") from None
    except GameError as e:
        raise HTTPException(409, str(e)) from None
    return Credentials(code=room.code, player_id=player.id, token=player.token)
