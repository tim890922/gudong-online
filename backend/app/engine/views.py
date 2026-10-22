"""把完整狀態投影成「某位玩家可以看到的內容」。

這是防止資訊外洩的唯一關口：別人的角色、獸首真假、技能使用都不能出現在遊戲中的 view 裡，
直到結算（stage == "ended"）才全部公開。
"""

from typing import Any

from .constants import BRANCHES, HEADS_PER_ROUND, MAX_POISON, ROUNDS, ZODIAC
from .game import (
    available_skill,
    forbidden_targets,
    head_targets,
    people_vote_goal,
    remaining_players,
)
from .models import GameState, IdentRecord, Room
from .roles import AMBUSHERS, ROLE_INFO, Role, faction_of


def build_view(room: Room, pid: str, connected: set[str] | None = None) -> dict[str, Any]:
    connected = connected or set()
    g = room.game
    return {
        "code": room.code,
        "me": pid,
        "host_id": room.host_id,
        "players": [
            {"id": p.id, "name": p.name, "color": p.color, "connected": p.id in connected}
            for p in room.players
        ],
        "settings": room.settings.model_dump(),
        "phase": "lobby" if g is None else g.stage,
        "games_played": room.games_played,
        "game": None if g is None else _game_view(room, g, pid),
    }


def _game_view(room: Room, g: GameState, pid: str) -> dict[str, Any]:
    ended = g.stage == "ended"
    visible_rounds = ROUNDS if ended else g.round + 1
    return {
        "stage": g.stage,
        "round": g.round,
        "seats": g.seats,
        "role_pool": g.role_pool,
        # 還沒到的回合不公開是哪些獸首（大眼賊也只看得到位置編號）
        "heads": [
            g.heads[i] if i // HEADS_PER_ROUND < visible_rounds else None
            for i in range(ROUNDS * HEADS_PER_ROUND)
        ],
        "turn_orders": g.turn_orders,
        "current": g.turn.player_id if g.turn else None,
        "ready": g.ready,
        "round_results": [r.model_dump() for r in g.round_results],
        "chip_submitted": list(g.chip_votes.keys()),
        "people_voted": list(g.people_votes.keys()),
        "me": _my_view(room, g, pid) if pid in g.seats else None,
        "final": _final_view(room, g) if ended else None,
    }


def _public_record(r: IdentRecord) -> dict[str, Any]:
    return r.model_dump(include={"round", "kind", "pos", "target", "outcome"})


def known_players(g: GameState, pid: str) -> list[dict[str, str]]:
    """開局時的陣營資訊。"""
    role = g.roles.get(pid)
    if role == Role.LAO_CHAOFENG or role in AMBUSHERS:
        return [
            {"player_id": p, "label": ROLE_INFO[r].name}
            for p, r in g.roles.items()
            if p != pid and (r == Role.LAO_CHAOFENG or r in AMBUSHERS)
        ]
    if role == Role.DIRECTOR_LIU:
        known = g.player_with(g.director_sees)
        return [{"player_id": known, "label": "許願或方震"}] if known else []
    return []


def _my_view(room: Room, g: GameState, pid: str) -> dict[str, Any]:
    role = g.roles.get(pid)
    records = g.records.get(pid, [])
    if not room.settings.allow_history and g.stage != "ended":
        records = [r for r in records if r.round == g.round]
    me: dict[str, Any] = {
        "role": role,
        "role_name": ROLE_INFO[role].name if role else None,
        "faction": faction_of(role) if role else None,
        "known": known_players(g, pid) if role else [],
        "records": [_public_record(r) for r in records],
        "chip_balance": g.chip_balance.get(pid, 0),
        "my_chips": g.chip_votes.get(pid),
        "people_vote": g.people_votes.get(pid),
        "people_vote_goal": people_vote_goal(role) if role else None,
        "forbidden_targets": forbidden_targets(g, pid) if role else [],
        "turn": None,
    }
    if room.settings.role_mode == "manual" and g.stage == "roles":
        me["taken_roles"] = [r for p, r in g.roles.items() if p != pid]
    if g.turn and g.turn.player_id == pid:
        me["turn"] = _turn_view(g, pid)
    return me


def _turn_view(g: GameState, pid: str) -> dict[str, Any]:
    t = g.turn
    assert t is not None
    role = g.roles[pid]
    info = ROLE_INFO[role]
    view: dict[str, Any] = {
        "step": t.step,
        "ident_kind": info.ident,
        "ident_done": t.ident_done,
        "ambushed": t.ambushed,
        "attempted": t.attempted,
        "results": [_public_record(r) for r in g.records[pid] if r.round == g.round],
    }
    if info.ident == "player":
        view["player_targets"] = [
            p for p in g.seats if p != pid and p not in g.fang_checked
        ]
        view["uses"] = {str(g.round): 1}
    else:
        allowed = head_targets(g, role)
        view["uses"] = {str(r): n for r, n in allowed.items()}
        view["used"] = {str(r): n for r, n in t.used.items()}
        view["head_targets"] = [
            {
                "pos": r * HEADS_PER_ROUND + i,
                "round": r,
                # 大眼賊只看得到位置編號
                "label": BRANCHES[r * HEADS_PER_ROUND + i]
                if info.ident == "big_eye"
                else ZODIAC[g.heads[r * HEADS_PER_ROUND + i]],
            }
            for r in allowed
            for i in range(HEADS_PER_ROUND)
        ]
    skill = available_skill(g, pid)
    acted = g.turn_orders[g.round]
    view["skill"] = skill
    if skill in ("ambush", "poison"):
        view["skill_targets"] = [
            {"player_id": p, "acted": p in acted} for p in g.seats if p != pid
        ]
    if info.skill == "poison":
        view["poison_left"] = MAX_POISON - g.poison_used
    if skill == "block":
        view["block_targets"] = [
            {"pos": g.round * HEADS_PER_ROUND + i,
             "label": ZODIAC[g.heads[g.round * HEADS_PER_ROUND + i]]}
            for i in range(HEADS_PER_ROUND)
        ]
    if t.step == "pass":
        view["remaining"] = remaining_players(g)
    return view


# ---------------------------------------------------------------- 結算


REASON_TEXT = {
    "ambushed": "被偷襲",
    "sealed": "角色本回合無法鑑定",
    "blocked": "被鄭國渠封鎖",
    "swapped": "被老朝奉顛倒",
    "poisoned": "中毒顛倒",
    "controlled": "藥來被控制",
    "big_eye_ambushed": "大眼賊被查驗而視同偷襲",
}
OUTCOME_TEXT = {
    "genuine": "真",
    "fake": "假",
    "unknown": "無法辨別",
    "ambushed": "被偷襲",
    "good": "許願陣營",
    "bad": "老朝奉陣營",
}


def _final_view(room: Room, g: GameState) -> dict[str, Any]:
    return {
        "roles": g.roles,
        "genuine": g.genuine,
        "people_votes": g.people_votes,
        "result": g.final.model_dump() if g.final else None,
        "log": build_log(room, g),
    }


def build_log(room: Room, g: GameState) -> list[str]:
    def name(pid: str | None) -> str:
        p = room.player(pid) if pid else None
        return p.name if p else "?"

    def head(pos: int | None) -> str:
        if pos is None:
            return "?"
        return f"{ZODIAC[g.heads[pos]]}（{BRANCHES[pos]}）"

    def role_name(pid: str) -> str:
        return ROLE_INFO[g.roles[pid]].name

    lines = ["【角色】"]
    lines += [f"{name(p)}：{role_name(p)}" for p in g.seats]
    for r in range(ROUNDS):
        if r >= len(g.turn_orders):
            break
        lines.append(f"【第 {r + 1} 回合】")
        base = r * HEADS_PER_ROUND
        lines.append(
            "獸首：" + "、".join(
                f"{ZODIAC[g.heads[base + i]]}{'真' if g.genuine[base + i] else '假'}"
                for i in range(HEADS_PER_ROUND)
            )
        )
        for pid in g.turn_orders[r]:
            for rec in g.records[pid]:
                if rec.round != r:
                    continue
                target = head(rec.pos) if rec.kind == "head" else name(rec.target)
                text = f"{name(pid)}（{role_name(pid)}）鑑定 {target} → {OUTCOME_TEXT[rec.outcome]}"
                if rec.reason:
                    reasons = "、".join(REASON_TEXT.get(x, x) for x in rec.reason.split(","))
                    text += f"（{reasons}）"
                lines.append(text)
            for ev in g.skills:
                if ev.round != r or ev.actor != pid:
                    continue
                lines.append(_skill_text(ev, name, head))
        if r < len(g.round_results):
            res = g.round_results[r]
            votes = "、".join(
                f"{ZODIAC[g.heads[base + i]]} {v} 票" for i, v in enumerate(res.votes)
            )
            lines.append(f"投票：{votes}")
            if res.allocations:
                for p, alloc in res.allocations.items():
                    detail = "、".join(
                        f"{ZODIAC[g.heads[base + i]]}×{n}" for i, n in enumerate(alloc) if n
                    )
                    lines.append(f"  {name(p)}：{detail or '未投'}")
            lines.append(
                f"入選：{ZODIAC[g.heads[base + res.first]]}（真假不公開）、"
                f"{ZODIAC[g.heads[base + res.second]]}（{'真' if res.second_genuine else '假'}）"
            )
    if g.people_votes:
        lines.append("【鑑人】")
        for p in g.seats:
            if p in g.people_votes:
                lines.append(f"{name(p)}（{role_name(p)}）投給 {name(g.people_votes[p])}")
    if g.final:
        f = g.final
        lines.append("【結算】")
        lines.append(f"鑑寶得分：{f.genuine_selected}")
        lines.append(f"找出老朝奉：{'是 +1' if f.boss_found else '否 +0'}")
        lines.append(f"許願被找到：{'是 +0' if f.xu_found else '否 +2'}")
        lines.append(f"方震被找到：{'是 +0' if f.fang_found else '否 +1'}")
        winner = "許願陣營" if f.winner == "good" else "老朝奉陣營"
        lines.append(f"許願陣營總分 {f.score}，{winner}獲勝")
    return lines


def _skill_text(ev, name, head) -> str:
    actor = name(ev.actor)
    if ev.kind == "ambush":
        extra = "（方震被偷襲，許願也一起被偷襲）" if ev.note == "xu_also" else ""
        return f"{actor} 偷襲了 {name(ev.target)}{extra}"
    if ev.kind == "poison":
        extra = {"xu_also": "（許願連帶中毒）", "ji_ambushed": "（姬雲浮視同被偷襲）"}.get(
            ev.note or "", ""
        )
        return f"{actor} 對 {name(ev.target)} 下毒{extra}"
    if ev.kind == "block":
        return f"{actor} 封鎖了 {head(ev.pos)}"
    if ev.kind == "swap":
        return f"{actor} {'發動' if ev.swap else '沒有發動'}老朝奉的能力"
    return f"{actor} 沒有使用技能"
