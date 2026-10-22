"""所有玩家操作的處理：大廳設定、角色、行動、投票、鑑人。

`apply_action` 直接修改傳入的 Room；呼叫端（RoomManager）會先複製一份，失敗時丟棄。
"""

import random
from collections.abc import Callable
from typing import Any

from . import actions as A
from .constants import (
    CHIPS_PER_ROUND,
    COLORS,
    HEADS_PER_ROUND,
    MAX_HOST_VOTES,
    MAX_PLAYERS,
    MAX_POISON,
    MIN_PLAYERS,
    PERMANENT_AMBUSH,
    ROUNDS,
    ZODIAC,
)
from .errors import GameError
from .models import GameState, IdentRecord, Room, RoundResult, SkillEvent, TurnState
from .roles import (
    AMBUSHERS,
    ROLE_INFO,
    SWAP_AFFECTED,
    Faction,
    Role,
    faction_of,
    role_pool,
)
from .scoring import compute_final

Handler = Callable[[Room, str, Any, random.Random], None]


def apply_action(room: Room, pid: str, action: Any, rng: random.Random) -> None:
    if room.player(pid) is None:
        raise GameError("你不在這個房間")
    HANDLERS[type(action)](room, pid, action, rng)


# ---------------------------------------------------------------- 共用檢查


def _require_host(room: Room, pid: str) -> None:
    if room.host_id != pid:
        raise GameError("只有房主可以這麼做")


def _require_lobby(room: Room) -> None:
    if room.game is not None:
        raise GameError("遊戲進行中，無法變更")


def _require_game(room: Room, *stages: str) -> GameState:
    g = room.game
    if g is None or (stages and g.stage not in stages):
        raise GameError("現在不能這麼做")
    return g


def _require_seat(g: GameState, pid: str) -> None:
    if pid not in g.seats:
        raise GameError("你不是本局玩家")


def _require_actor(g: GameState, pid: str, step: str) -> TurnState:
    t = g.turn
    if t is None or t.player_id != pid:
        raise GameError("現在不是你的回合")
    if t.step != step:
        raise GameError("請依照步驟操作")
    return t


def _require_target(g: GameState, pid: str, target: str | None) -> str:
    if target is None or target not in g.seats or target == pid:
        raise GameError("請選擇其他玩家")
    return target


# ---------------------------------------------------------------- 大廳


def _set_profile(room: Room, pid: str, a: A.SetProfile, rng: random.Random) -> None:
    _require_lobby(room)
    player = room.player(pid)
    assert player is not None
    if a.name is not None:
        name = a.name.strip()
        if not name:
            raise GameError("暱稱不能是空白")
        player.name = name
    if a.color is not None:
        if not 0 <= a.color < len(COLORS):
            raise GameError("沒有這個顏色")
        if any(p.color == a.color and p.id != pid for p in room.players):
            raise GameError("這個顏色已經有人選了")
        player.color = a.color


def _update_settings(room: Room, pid: str, a: A.UpdateSettings, rng: random.Random) -> None:
    _require_host(room, pid)
    _require_lobby(room)
    s = a.settings
    if s.fan_big_eye and s.fan_yao_lai:
        raise GameError("大眼賊和藥來只能擇一")
    if s.first_player_id is not None and room.player(s.first_player_id) is None:
        s.first_player_id = None
    room.settings = s


def _kick(room: Room, pid: str, a: A.Kick, rng: random.Random) -> None:
    _require_host(room, pid)
    _require_lobby(room)
    if a.player_id == pid or room.player(a.player_id) is None:
        raise GameError("無法移除這位玩家")
    _remove_player(room, a.player_id)


def _transfer_host(room: Room, pid: str, a: A.TransferHost, rng: random.Random) -> None:
    _require_host(room, pid)
    if room.player(a.player_id) is None:
        raise GameError("找不到這位玩家")
    room.host_id = a.player_id


def _leave(room: Room, pid: str, a: A.Leave, rng: random.Random) -> None:
    if room.game is not None:
        raise GameError("遊戲進行中無法離開，請房主先中止遊戲")
    _remove_player(room, pid)


def _remove_player(room: Room, pid: str) -> None:
    room.players = [p for p in room.players if p.id != pid]
    if room.settings.first_player_id == pid:
        room.settings.first_player_id = None
    if room.host_id == pid and room.players:
        room.host_id = room.players[0].id


def _start_game(room: Room, pid: str, a: A.StartGame, rng: random.Random) -> None:
    _require_host(room, pid)
    _require_lobby(room)
    n = len(room.players)
    if not MIN_PLAYERS <= n <= MAX_PLAYERS:
        raise GameError(f"需要 {MIN_PLAYERS}–{MAX_PLAYERS} 位玩家才能開始（目前 {n} 位）")

    used = {p.color for p in room.players if p.color is not None}
    for p in room.players:
        if p.color is None:
            p.color = next(c for c in range(len(COLORS)) if c not in used)
            used.add(p.color)
    seats = [p.id for p in sorted(room.players, key=lambda p: p.color)]

    s = room.settings
    pool = role_pool(n, big_eye=s.fan_big_eye, yao_lai=s.fan_yao_lai,
                     director=s.fan_director, mo_yao=s.fan_mo_yao)

    order = list(range(len(ZODIAC)))
    rng.shuffle(order)
    heads: list[int] = []
    genuine: list[bool] = []
    for r in range(ROUNDS):
        heads += sorted(order[r * HEADS_PER_ROUND:(r + 1) * HEADS_PER_ROUND])
        row = [True, True, False, False]
        rng.shuffle(row)
        genuine += row

    g = GameState(
        seats=seats,
        role_pool=pool,
        heads=heads,
        genuine=genuine,
        huang_fail_round=rng.randrange(ROUNDS),
        kido_fail_round=rng.randrange(ROUNDS),
        yao_lai_controlled=rng.random() < 0.5,
        director_sees=rng.choice([Role.XU_YUAN, Role.FANG_ZHEN]),
        chip_balance={p: 0 for p in seats},
        records={p: [] for p in seats},
    )
    if s.role_mode == "random":
        shuffled = pool[:]
        rng.shuffle(shuffled)
        g.roles = dict(zip(seats, shuffled, strict=True))
    room.game = g


# ---------------------------------------------------------------- 角色階段


def _pick_role(room: Room, pid: str, a: A.PickRole, rng: random.Random) -> None:
    g = _require_game(room, "roles")
    _require_seat(g, pid)
    if room.settings.role_mode != "manual":
        raise GameError("本局由系統分配角色")
    if a.role not in g.role_pool:
        raise GameError("本局沒有這個角色")
    if any(r == a.role and p != pid for p, r in g.roles.items()):
        raise GameError("這個角色已經有人選了，請再確認一次你的角色卡")
    g.roles[pid] = a.role
    if pid in g.ready:
        g.ready.remove(pid)


def _ready(room: Room, pid: str, a: A.Ready, rng: random.Random) -> None:
    g = _require_game(room, "roles")
    _require_seat(g, pid)
    if pid not in g.roles:
        raise GameError("請先選擇你的角色")
    if pid not in g.ready:
        g.ready.append(pid)
    if len(g.ready) == len(g.seats):
        first = room.settings.first_player_id
        if first not in g.seats:
            first = rng.choice(g.seats)
        g.stage = "acting"
        _start_turn(g, first)


# ---------------------------------------------------------------- 行動


def _start_turn(g: GameState, pid: str) -> None:
    g.turn_orders[g.round].append(pid)
    t = TurnState(player_id=pid)
    # 毒在「下一次鑑定獸首」時生效；方震查驗的是人，不受影響
    if ROLE_INFO[g.roles[pid]].ident != "player" and g.poison_pending.get(pid, 0) > 0:
        g.poison_pending[pid] -= 1
        t.poisoned = True
    g.turn = t


def head_targets(g: GameState, role: Role) -> dict[int, int]:
    """可鑑定的回合 -> 次數。"""
    if ROLE_INFO[role].ident == "big_eye":
        return {r: 1 for r in (g.round - 1, g.round + 1) if 0 <= r < ROUNDS}
    return {g.round: 2 if role == Role.XU_YUAN else 1}


def _identify_head(room: Room, pid: str, a: A.IdentifyHead, rng: random.Random) -> None:
    g = _require_game(room, "acting")
    t = _require_actor(g, pid, "identify")
    role = g.roles[pid]
    if ROLE_INFO[role].ident == "player":
        raise GameError("你要查驗的是玩家")
    if t.ident_done:
        raise GameError("本回合的鑑定已經用完了")
    if not 0 <= a.pos < ROUNDS * HEADS_PER_ROUND or a.pos in t.attempted:
        raise GameError("不能鑑定這一件")
    target_round = a.pos // HEADS_PER_ROUND
    allowed = head_targets(g, role)
    if t.used.get(target_round, 0) >= allowed.get(target_round, 0):
        raise GameError("不能鑑定這一件")

    t.attempted.append(a.pos)
    t.used[target_round] = t.used.get(target_round, 0) + 1
    rec = _resolve_head(g, pid, role, a.pos, t)
    g.records[pid].append(rec)
    if rec.outcome == "ambushed":
        t.ambushed = True
        t.ident_done = True
    elif all(t.used.get(r, 0) >= n for r, n in allowed.items()):
        t.ident_done = True


def _resolve_head(g: GameState, pid: str, role: Role, pos: int, t: TurnState) -> IdentRecord:
    base = {"round": g.round, "kind": "head", "pos": pos}
    if g.ambush_pending.get(pid, 0) > 0:
        g.ambush_pending[pid] -= 1
        return IdentRecord(**base, outcome="ambushed", reason="ambushed")

    true_value = g.genuine[pos]
    sealed = (
        (role == Role.HUANG_YANYAN and g.round == g.huang_fail_round)
        or (role == Role.KIDO_KANA and g.round == g.kido_fail_round)
        or (role == Role.DIRECTOR_LIU and g.round > 0)
    )
    if sealed:
        return IdentRecord(**base, outcome="unknown", reason="sealed", true_value=true_value)
    if pos in g.blocked:
        return IdentRecord(**base, outcome="unknown", reason="blocked", true_value=true_value)

    result = true_value
    mods: list[str] = []
    if role == Role.YAO_LAI:
        if g.yao_lai_controlled:
            result = not result
            mods.append("controlled")
    else:
        if role in SWAP_AFFECTED and g.swap_rounds[g.round]:
            result = not result
            mods.append("swapped")
        if t.poisoned:
            result = not result
            mods.append("poisoned")
    return IdentRecord(
        **base,
        outcome="genuine" if result else "fake",
        reason=",".join(mods) or None,
        true_value=true_value,
    )


def _identify_player(room: Room, pid: str, a: A.IdentifyPlayer, rng: random.Random) -> None:
    g = _require_game(room, "acting")
    t = _require_actor(g, pid, "identify")
    if ROLE_INFO[g.roles[pid]].ident != "player":
        raise GameError("你要鑑定的是獸首")
    if t.ident_done:
        raise GameError("本回合的查驗已經用完了")
    target = _require_target(g, pid, a.target)
    if target in g.fang_checked:
        raise GameError("已經查驗過這位玩家")

    t.ident_done = True
    if g.ambush_pending.get(pid, 0) > 0:
        g.ambush_pending[pid] -= 1
        t.ambushed = True
        g.records[pid].append(IdentRecord(
            round=g.round, kind="player", target=target, outcome="ambushed", reason="ambushed",
        ))
        return

    g.fang_checked.append(target)
    target_role = g.roles[target]
    reason = None
    if target_role == Role.BIG_EYE:
        g.ambush_pending[target] = g.ambush_pending.get(target, 0) + 1
        reason = "big_eye_ambushed"
    g.records[pid].append(IdentRecord(
        round=g.round,
        kind="player",
        target=target,
        outcome="bad" if faction_of(target_role) == Faction.BAD else "good",
        reason=reason,
    ))


def _advance(room: Room, pid: str, a: A.Advance, rng: random.Random) -> None:
    g = _require_game(room, "acting")
    t = _require_actor(g, pid, "identify")
    if not t.ident_done:
        raise GameError("請先完成鑑定")
    t.step = "skill"


def available_skill(g: GameState, pid: str) -> str | None:
    t = g.turn
    skill = ROLE_INFO[g.roles[pid]].skill
    if t is None or t.ambushed or skill is None:
        return None
    if skill == "poison" and g.poison_used >= MAX_POISON:
        return None
    return skill


def _use_skill(room: Room, pid: str, a: A.UseSkill, rng: random.Random) -> None:
    g = _require_game(room, "acting")
    t = _require_actor(g, pid, "skill")
    skill = available_skill(g, pid)
    if a.kind != "none" and a.kind != skill:
        raise GameError("你不能使用這個技能")

    event = SkillEvent(round=g.round, actor=pid, kind=a.kind)
    xu = g.player_with(Role.XU_YUAN)
    if a.kind == "ambush":
        target = _require_target(g, pid, a.target)
        amount = PERMANENT_AMBUSH if g.roles[target] == Role.JI_YUNFU else 1
        _add(g.ambush_pending, target, amount)
        if g.roles[target] == Role.FANG_ZHEN and xu:
            _add(g.ambush_pending, xu, amount)
            event.note = "xu_also"
        event.target = target
    elif a.kind == "poison":
        target = _require_target(g, pid, a.target)
        if g.roles[target] == Role.JI_YUNFU:
            _add(g.ambush_pending, target, PERMANENT_AMBUSH)
            event.note = "ji_ambushed"
        else:
            _add(g.poison_pending, target, 1)
            if g.roles[target] == Role.FANG_ZHEN and xu:
                _add(g.poison_pending, xu, 1)
                event.note = "xu_also"
        g.poison_used += 1
        event.target = target
    elif a.kind == "block":
        first = g.round * HEADS_PER_ROUND
        if a.pos is None or not first <= a.pos < first + HEADS_PER_ROUND:
            raise GameError("只能封鎖本回合的獸首")
        g.blocked.append(a.pos)
        event.pos = a.pos
    elif a.kind == "swap":
        if a.swap is None:
            raise GameError("請選擇是否發動")
        g.swap_rounds[g.round] = a.swap
        event.swap = a.swap
    g.skills.append(event)
    t.step = "pass"


def _add(d: dict[str, int], key: str, amount: int) -> None:
    d[key] = d.get(key, 0) + amount


def remaining_players(g: GameState) -> list[str]:
    acted = g.turn_orders[g.round]
    return [s for s in g.seats if s not in acted]


def _pass_to(room: Room, pid: str, a: A.PassTo, rng: random.Random) -> None:
    g = _require_game(room, "acting")
    _require_actor(g, pid, "pass")
    remaining = remaining_players(g)
    if remaining:
        if a.target not in remaining:
            raise GameError("請選擇本回合還沒行動的玩家")
        _start_turn(g, a.target)
    else:
        if a.target is not None:
            raise GameError("所有人都行動過了")
        g.turn = None
        g.stage = "discussion"


# ---------------------------------------------------------------- 鑑寶投票


def _start_voting(room: Room, pid: str, a: A.StartVoting, rng: random.Random) -> None:
    _require_host(room, pid)
    g = _require_game(room, "discussion")
    g.stage = "voting"
    g.chip_votes = {}
    if room.settings.vote_mode == "chips":
        for s in g.seats:
            _add(g.chip_balance, s, CHIPS_PER_ROUND)


def _submit_host_votes(room: Room, pid: str, a: A.SubmitHostVotes, rng: random.Random) -> None:
    _require_host(room, pid)
    g = _require_game(room, "voting")
    if room.settings.vote_mode != "host":
        raise GameError("本局使用線上投票")
    if len(a.votes) != HEADS_PER_ROUND or any(not 0 <= v <= MAX_HOST_VOTES for v in a.votes):
        raise GameError("票數不正確")
    _finish_round(g, list(a.votes), None)


def _submit_chips(room: Room, pid: str, a: A.SubmitChips, rng: random.Random) -> None:
    g = _require_game(room, "voting")
    _require_seat(g, pid)
    if room.settings.vote_mode != "chips":
        raise GameError("本局由房主統計票數")
    if pid in g.chip_votes:
        raise GameError("你已經投過票了")
    if len(a.alloc) != HEADS_PER_ROUND or any(v < 0 for v in a.alloc):
        raise GameError("籌碼分配不正確")
    total, balance = sum(a.alloc), g.chip_balance.get(pid, 0)
    if total > balance:
        raise GameError(f"你只有 {balance} 枚籌碼")
    if g.round == ROUNDS - 1 and total != balance:
        raise GameError(f"最後一回合必須把 {balance} 枚籌碼全部投出")
    g.chip_balance[pid] = balance - total
    g.chip_votes[pid] = list(a.alloc)
    if len(g.chip_votes) == len(g.seats):
        totals = [sum(v[i] for v in g.chip_votes.values()) for i in range(HEADS_PER_ROUND)]
        allocations = {s: g.chip_votes[s] for s in g.seats}
        _finish_round(g, totals, allocations)


def _finish_round(g: GameState, votes: list[int], allocations: dict[str, list[int]] | None) -> None:
    base = g.round * HEADS_PER_ROUND
    # 同票時依十二生肖順序排名
    ranking = sorted(range(HEADS_PER_ROUND), key=lambda i: (-votes[i], g.heads[base + i]))
    first, second = ranking[0], ranking[1]
    g.round_results.append(RoundResult(
        round=g.round,
        votes=votes,
        allocations=allocations,
        first=first,
        second=second,
        second_genuine=g.genuine[base + second],
    ))
    g.stage = "vote_result"


def _next_round(room: Room, pid: str, a: A.NextRound, rng: random.Random) -> None:
    _require_host(room, pid)
    g = _require_game(room, "vote_result")
    if g.round < ROUNDS - 1:
        last = g.turn_orders[g.round][-1]  # 上一回合最後一位成為新首家
        g.round += 1
        g.turn_orders.append([])
        g.stage = "acting"
        _start_turn(g, last)
    else:
        g.stage = "people_vote"


# ---------------------------------------------------------------- 鑑人


def people_vote_goal(role: Role) -> Role | None:
    """這個角色在鑑人階段要找誰；None 表示投票不計分（鄭國渠）。"""
    if role == Role.LAO_CHAOFENG:
        return Role.XU_YUAN
    if role in AMBUSHERS:
        return Role.FANG_ZHEN
    if faction_of(role) == Faction.GOOD:
        return Role.LAO_CHAOFENG
    return None


def forbidden_targets(g: GameState, pid: str) -> list[str]:
    """已知的隊友不能投。"""
    role = g.roles.get(pid)
    if role == Role.LAO_CHAOFENG:
        return [p for p, r in g.roles.items() if r in AMBUSHERS]
    if role in AMBUSHERS:
        lao = g.player_with(Role.LAO_CHAOFENG)
        return [lao] if lao else []
    if role == Role.DIRECTOR_LIU:
        known = g.player_with(g.director_sees)
        return [known] if known else []
    return []


def _people_vote(room: Room, pid: str, a: A.PeopleVote, rng: random.Random) -> None:
    g = _require_game(room, "people_vote")
    _require_seat(g, pid)
    if pid in g.people_votes:
        raise GameError("你已經投過票了")
    target = _require_target(g, pid, a.target)
    if target in forbidden_targets(g, pid):
        raise GameError("不能投給你的隊友")
    g.people_votes[pid] = target
    if len(g.people_votes) == len(g.seats):
        g.final = compute_final(g)
        g.stage = "ended"


# ---------------------------------------------------------------- 結束


def _play_again(room: Room, pid: str, a: A.PlayAgain, rng: random.Random) -> None:
    _require_host(room, pid)
    _require_game(room, "ended")
    room.game = None
    room.games_played += 1


def _abort_game(room: Room, pid: str, a: A.AbortGame, rng: random.Random) -> None:
    _require_host(room, pid)
    _require_game(room)
    room.game = None


HANDLERS: dict[type, Handler] = {
    A.SetProfile: _set_profile,
    A.UpdateSettings: _update_settings,
    A.Kick: _kick,
    A.TransferHost: _transfer_host,
    A.Leave: _leave,
    A.StartGame: _start_game,
    A.PickRole: _pick_role,
    A.Ready: _ready,
    A.IdentifyHead: _identify_head,
    A.IdentifyPlayer: _identify_player,
    A.Advance: _advance,
    A.UseSkill: _use_skill,
    A.PassTo: _pass_to,
    A.StartVoting: _start_voting,
    A.SubmitHostVotes: _submit_host_votes,
    A.SubmitChips: _submit_chips,
    A.NextRound: _next_round,
    A.PeopleVote: _people_vote,
    A.PlayAgain: _play_again,
    A.AbortGame: _abort_game,
}
