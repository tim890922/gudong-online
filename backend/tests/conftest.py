import random

import pytest
from pydantic import TypeAdapter

from app.engine.actions import Action
from app.engine.errors import GameError
from app.engine.game import apply_action
from app.engine.models import PlayerInfo, Room, Settings
from app.engine.roles import Role

_ACTION = TypeAdapter(Action)


class Table:
    """測試用：一張已經開局的桌子，可以指定角色與獸首真假。"""

    def __init__(self, n: int = 8, roles: list[Role] | None = None, seed: int = 0, **settings):
        self.rng = random.Random(seed)
        self.room = Room(
            code="TEST",
            host_id="p0",
            players=[PlayerInfo(id=f"p{i}", token=f"t{i}", name=f"P{i}") for i in range(n)],
            settings=Settings(**settings),
            created_at=0,
            updated_at=0,
        )

        self.act("p0", type="start_game")
        if roles is not None:
            self.g.roles = dict(zip(self.g.seats, roles, strict=True))

    @property
    def g(self):
        return self.room.game

    def act(self, pid: str, **action) -> None:
        apply_action(self.room, pid, _ACTION.validate_python(action), self.rng)

    def fails(self, pid: str, **action) -> str:
        with pytest.raises(GameError) as e:
            self.act(pid, **action)
        return str(e.value)

    def who(self, role: Role) -> str:
        pid = self.g.player_with(role)
        assert pid is not None
        return pid

    def start(self, first: str | None = None) -> None:
        if first is not None:
            self.room.settings.first_player_id = first
        for pid in self.g.seats:
            self.act(pid, type="ready")

    def pos(self, slot: int, rnd: int | None = None) -> int:
        return (self.g.round if rnd is None else rnd) * 4 + slot

    def turn_done(self, pid: str, next_pid: str | None, skill: dict | None = None) -> None:
        """從技能步驟開始，完成這一回合並傳給下一位。"""
        self.act(pid, type="advance")
        self.act(pid, type="use_skill", **(skill or {"kind": "none"}))
        self.act(pid, type="pass_to", target=next_pid)

    def last(self, pid: str):
        return self.g.records[pid][-1]


# 8 人標準配置，依座位 p0..p7
STANDARD_8 = [
    Role.XU_YUAN,
    Role.FANG_ZHEN,
    Role.HUANG_YANYAN,
    Role.KIDO_KANA,
    Role.LAO_CHAOFENG,
    Role.YAO_BURAN,
    Role.ZHENG_GUOQU,
    Role.JI_YUNFU,
]
