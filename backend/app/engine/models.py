from typing import Literal

from pydantic import BaseModel, Field

from .roles import Faction, Role

Stage = Literal[
    "roles",  # 看角色／選角色
    "acting",  # 依序行動
    "discussion",  # 現場討論
    "voting",  # 鑑寶投票
    "vote_result",  # 公布本回合投票結果
    "people_vote",  # 鑑人
    "ended",
]
Outcome = Literal["genuine", "fake", "unknown", "ambushed", "good", "bad"]


class Settings(BaseModel):
    role_mode: Literal["random", "manual"] = "random"
    vote_mode: Literal["host", "chips"] = "host"
    fan_big_eye: bool = False
    fan_yao_lai: bool = False
    fan_director: bool = False
    fan_mo_yao: bool = False
    first_player_id: str | None = None
    allow_history: bool = True


class PlayerInfo(BaseModel):
    id: str
    token: str
    name: str
    color: int | None = None


class IdentRecord(BaseModel):
    """一次鑑定的結果。`reason`、`true_value` 只在結算時公開。"""

    round: int
    kind: Literal["head", "player"]
    pos: int | None = None  # 獸首位置 0..11（回合 * 4 + 欄位）
    target: str | None = None  # 被查驗的玩家
    outcome: Outcome
    reason: str | None = None
    true_value: bool | None = None


class SkillEvent(BaseModel):
    round: int
    actor: str
    kind: Literal["ambush", "poison", "block", "swap", "none"]
    target: str | None = None
    pos: int | None = None
    swap: bool | None = None
    note: str | None = None


class TurnState(BaseModel):
    player_id: str
    step: Literal["identify", "skill", "pass"] = "identify"
    used: dict[int, int] = Field(default_factory=dict)  # 鑑定的回合 -> 已用次數
    attempted: list[int] = Field(default_factory=list)
    ambushed: bool = False
    poisoned: bool = False
    ident_done: bool = False


class RoundResult(BaseModel):
    round: int
    votes: list[int]
    allocations: dict[str, list[int]] | None = None  # 線上籌碼：每人投給各獸首的枚數
    first: int  # 欄位 0..3，得票第一（不公開真假）
    second: int  # 得票第二（公開真假）
    second_genuine: bool


class FinalResult(BaseModel):
    genuine_selected: int
    boss_votes: dict[str, int]
    boss_required: int
    boss_target: str | None
    boss_found: bool
    xu_found: bool
    fang_found: bool
    score: int
    winner: Faction


class GameState(BaseModel):
    seats: list[str]
    role_pool: list[Role]
    roles: dict[str, Role] = Field(default_factory=dict)
    ready: list[str] = Field(default_factory=list)

    heads: list[int]  # 12 個位置對應的生肖
    genuine: list[bool]
    huang_fail_round: int
    kido_fail_round: int
    yao_lai_controlled: bool
    director_sees: Role

    stage: Stage = "roles"
    round: int = 0
    turn_orders: list[list[str]] = Field(default_factory=lambda: [[]])
    turn: TurnState | None = None

    ambush_pending: dict[str, int] = Field(default_factory=dict)
    poison_pending: dict[str, int] = Field(default_factory=dict)
    poison_used: int = 0
    swap_rounds: list[bool] = Field(default_factory=lambda: [False, False, False])
    blocked: list[int] = Field(default_factory=list)
    fang_checked: list[str] = Field(default_factory=list)
    records: dict[str, list[IdentRecord]] = Field(default_factory=dict)
    skills: list[SkillEvent] = Field(default_factory=list)

    chip_balance: dict[str, int] = Field(default_factory=dict)
    chip_votes: dict[str, list[int]] = Field(default_factory=dict)
    round_results: list[RoundResult] = Field(default_factory=list)
    people_votes: dict[str, str] = Field(default_factory=dict)
    final: FinalResult | None = None

    def player_with(self, role: Role) -> str | None:
        for pid, r in self.roles.items():
            if r == role:
                return pid
        return None


class Room(BaseModel):
    code: str
    host_id: str
    players: list[PlayerInfo]
    settings: Settings = Field(default_factory=Settings)
    game: GameState | None = None
    created_at: float
    updated_at: float
    games_played: int = 0

    def player(self, pid: str) -> PlayerInfo | None:
        return next((p for p in self.players if p.id == pid), None)

    def by_token(self, token: str) -> PlayerInfo | None:
        return next((p for p in self.players if p.token == token), None)
