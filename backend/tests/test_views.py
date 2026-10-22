"""用隨機機器人打完整局，每一步都檢查 view 有沒有洩漏資訊。

機器人只看自己的 view 決定下一步，順便驗證 view 提供的資訊足夠完成整局。
"""

import copy
import json
import random

import pytest
from conftest import Table

from app.engine.roles import Role
from app.engine.views import build_view

SECRET_KEYS = {
    "genuine", "true_value", "reason", "roles", "ambush_pending", "poison_pending",
    "swap_rounds", "blocked", "director_sees", "yao_lai_controlled", "huang_fail_round",
    "kido_fail_round", "skills", "chip_votes", "people_votes", "fang_checked", "log", "token",
}
KNOWS_TEAMMATES = {Role.LAO_CHAOFENG, Role.YAO_BURAN, Role.MO_YAO_BURAN, Role.DIRECTOR_LIU}


def all_keys(obj, acc=None):
    acc = set() if acc is None else acc
    if isinstance(obj, dict):
        for k, v in obj.items():
            acc.add(k)
            all_keys(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            all_keys(v, acc)
    return acc


def check_no_leak(t: Table) -> None:
    g = t.g
    public_parts = []
    for p in g.seats:
        view = json.loads(json.dumps(build_view(t.room, p)))
        assert "token" not in all_keys(view)
        if g.stage == "ended":
            continue
        assert not (all_keys(view) & SECRET_KEYS), all_keys(view) & SECRET_KEYS
        me = view["game"]["me"]
        assert len(me["records"]) <= len(g.records[p])
        if g.roles.get(p) not in KNOWS_TEAMMATES:
            assert me["known"] == []
        assert (me["turn"] is not None) == (g.turn is not None and g.turn.player_id == p)
        public = copy.deepcopy(view)
        public.pop("me")
        public["game"].pop("me")
        public_parts.append(public)
    # 公開區塊對每個人都必須一模一樣
    for part in public_parts[1:]:
        assert part == public_parts[0]


def bot_step(t: Table, rng: random.Random) -> None:
    g = t.g
    host = t.room.host_id
    stage = g.stage
    views = {p: build_view(t.room, p)["game"] for p in g.seats}
    if stage == "roles":
        for p in g.seats:
            if p in g.ready:
                continue
            me = views[p]["me"]
            if t.room.settings.role_mode == "manual" and me["role"] is None:
                taken = me["taken_roles"]
                free = [r for r in views[p]["role_pool"] if r not in taken]
                t.act(p, type="pick_role", role=rng.choice(free))
            t.act(p, type="ready")
            return
    elif stage == "acting":
        p = views[host]["current"]
        turn = views[p]["me"]["turn"]
        if turn["step"] == "identify":
            if turn["ident_done"]:
                t.act(p, type="advance")
            elif turn["ident_kind"] == "player":
                t.act(p, type="identify_player", target=rng.choice(turn["player_targets"]))
            else:
                options = [
                    h["pos"] for h in turn["head_targets"]
                    if h["pos"] not in turn["attempted"]
                    and turn["used"].get(str(h["round"]), 0) < turn["uses"][str(h["round"])]
                ]
                t.act(p, type="identify_head", pos=rng.choice(options))
        elif turn["step"] == "skill":
            skill = turn["skill"]
            if skill in ("ambush", "poison") and rng.random() < 0.7:
                target = rng.choice(turn["skill_targets"])["player_id"]
                t.act(p, type="use_skill", kind=skill, target=target)
            elif skill == "block" and rng.random() < 0.7:
                t.act(p, type="use_skill", kind="block",
                      pos=rng.choice(turn["block_targets"])["pos"])
            elif skill == "swap":
                t.act(p, type="use_skill", kind="swap", swap=rng.random() < 0.5)
            else:
                t.act(p, type="use_skill", kind="none")
        else:
            remaining = turn["remaining"]
            t.act(p, type="pass_to", target=rng.choice(remaining) if remaining else None)
    elif stage == "discussion":
        t.act(host, type="start_voting")
    elif stage == "voting":
        if t.room.settings.vote_mode == "host":
            t.act(host, type="submit_host_votes", votes=[rng.randrange(6) for _ in range(4)])
            return
        for p in g.seats:
            if p in views[p]["chip_submitted"]:
                continue
            balance = views[p]["me"]["chip_balance"]
            spend = balance if g.round == 2 else rng.randrange(balance + 1)
            alloc = [0, 0, 0, 0]
            for _ in range(spend):
                alloc[rng.randrange(4)] += 1
            t.act(p, type="submit_chips", alloc=alloc)
            return
    elif stage == "vote_result":
        t.act(host, type="next_round")
    elif stage == "people_vote":
        for p in g.seats:
            me = views[p]["me"]
            if me["people_vote"] is not None:
                continue
            options = [x for x in g.seats if x != p and x not in me["forbidden_targets"]]
            t.act(p, type="people_vote", target=rng.choice(options))
            return


CONFIGS = [
    {"n": 6},
    {"n": 7, "vote_mode": "chips"},
    {"n": 8, "role_mode": "manual"},
    {"n": 8, "fan_big_eye": True, "fan_mo_yao": True, "vote_mode": "chips"},
    {"n": 8, "fan_yao_lai": True, "fan_director": True, "role_mode": "manual"},
    {"n": 6, "fan_director": True, "fan_mo_yao": True, "allow_history": False},
]


@pytest.mark.parametrize("config", CONFIGS)
@pytest.mark.parametrize("seed", range(8))
def test_random_full_game_never_leaks(config, seed):
    config = dict(config)
    n = config.pop("n")
    t = Table(n, seed=seed, **config)
    rng = random.Random(seed * 101 + n)
    for _ in range(500):
        check_no_leak(t)
        if t.g.stage == "ended":
            break
        bot_step(t, rng)
    assert t.g.stage == "ended"
    final = build_view(t.room, "p0")["game"]["final"]
    assert final["result"]["score"] == t.g.final.score
    assert len(final["log"]) > 10
