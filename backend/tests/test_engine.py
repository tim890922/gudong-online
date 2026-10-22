import random

import pytest
from conftest import STANDARD_8, Table

from app.engine.constants import BRANCHES, ZODIAC
from app.engine.game import forbidden_targets
from app.engine.roles import Role, role_pool

R = Role


# ---------------------------------------------------------------- 開局


@pytest.mark.parametrize(
    ("n", "expected"),
    [
        (6, STANDARD_8[:6]),
        (7, STANDARD_8[:7]),
        (8, STANDARD_8),
    ],
)
def test_role_pool_by_player_count(n, expected):
    assert role_pool(n, big_eye=False, yao_lai=False, director=False, mo_yao=False) == expected


def test_role_pool_fan_replacements():
    pool = role_pool(8, big_eye=True, yao_lai=False, director=True, mo_yao=True)
    assert R.BIG_EYE in pool and R.JI_YUNFU not in pool
    assert R.DIRECTOR_LIU in pool and R.HUANG_YANYAN not in pool
    assert R.MO_YAO_BURAN in pool and R.YAO_BURAN not in pool
    # 6 人局本來就沒有姬雲浮，大眼賊自然不會出現
    assert R.BIG_EYE not in role_pool(6, big_eye=True, yao_lai=False, director=False, mo_yao=False)


def test_start_game_deals_heads_and_roles():
    t = Table(8, seed=3)
    g = t.g
    assert sorted(g.heads) == list(range(12))
    for r in range(3):
        row = g.heads[r * 4:(r + 1) * 4]
        assert row == sorted(row)
        assert sum(g.genuine[r * 4:(r + 1) * 4]) == 2
    assert sorted(g.roles.values()) == sorted(g.role_pool)
    assert g.stage == "roles"


def test_start_needs_six_players():
    t = Table.__new__(Table)
    t.rng = random.Random(0)
    from app.engine.models import PlayerInfo, Room
    t.room = Room(code="X", host_id="p0", created_at=0, updated_at=0,
                  players=[PlayerInfo(id=f"p{i}", token="t", name="n") for i in range(5)])
    assert "6–8" in t.fails("p0", type="start_game")


def test_only_host_can_start():
    t = Table(8)
    t.room.game = None
    assert "房主" in t.fails("p1", type="start_game")


def test_manual_roles_reject_duplicates_and_start_when_all_ready():
    t = Table(6, role_mode="manual")
    assert t.g.roles == {}
    t.act("p0", type="pick_role", role="xu_yuan")
    assert "已經有人選" in t.fails("p1", type="pick_role", role="xu_yuan")
    assert "請先選擇" in t.fails("p1", type="ready")
    for pid, role in zip(t.g.seats[1:], STANDARD_8[1:6], strict=True):
        t.act(pid, type="pick_role", role=role)
    for pid in t.g.seats:
        t.act(pid, type="ready")
    assert t.g.stage == "acting"
    assert t.g.turn is not None


# ---------------------------------------------------------------- 鑑定


def test_xu_identifies_two_heads():
    t = Table(8, STANDARD_8)
    xu = t.who(R.XU_YUAN)
    t.start(first=xu)
    t.act(xu, type="identify_head", pos=0)
    assert not t.g.turn.ident_done
    assert "不能鑑定" in t.fails(xu, type="identify_head", pos=0)  # 同一件不能鑑兩次
    t.act(xu, type="identify_head", pos=1)
    assert t.g.turn.ident_done
    outcomes = [r.outcome for r in t.g.records[xu]]
    expected = ["genuine" if t.g.genuine[i] else "fake" for i in (0, 1)]
    assert outcomes == expected
    assert "用完" in t.fails(xu, type="identify_head", pos=2)


def test_others_identify_one_and_cannot_touch_other_rounds():
    t = Table(8, STANDARD_8)
    huang = t.who(R.HUANG_YANYAN)
    t.g.huang_fail_round = 2
    t.start(first=huang)
    assert "不能鑑定" in t.fails(huang, type="identify_head", pos=5)
    t.act(huang, type="identify_head", pos=3)
    assert t.g.turn.ident_done


def test_swap_only_affects_later_players_and_vulnerable_roles():
    t = Table(8, STANDARD_8)
    xu, lao, ji, huang = (t.who(r) for r in (R.XU_YUAN, R.LAO_CHAOFENG, R.JI_YUNFU,
                                            R.HUANG_YANYAN))
    t.g.huang_fail_round = 2
    t.start(first=huang)
    t.act(huang, type="identify_head", pos=0)  # 老朝奉之前：結果正確
    assert t.last(huang).outcome == ("genuine" if t.g.genuine[0] else "fake")
    t.turn_done(huang, lao)

    t.act(lao, type="identify_head", pos=1)
    t.turn_done(lao, xu, {"kind": "swap", "swap": True})

    t.act(xu, type="identify_head", pos=0)
    t.act(xu, type="identify_head", pos=1)
    for rec in t.g.records[xu]:
        assert rec.outcome == ("fake" if t.g.genuine[rec.pos] else "genuine")
        assert rec.reason == "swapped"
    t.turn_done(xu, ji)

    t.act(ji, type="identify_head", pos=2)  # 姬雲浮不受影響
    assert t.last(ji).outcome == ("genuine" if t.g.genuine[2] else "fake")


def test_swap_is_per_round():
    t = Table(8, STANDARD_8)
    xu = t.who(R.XU_YUAN)
    t.g.swap_rounds = [True, False, False]
    t.g.round = 1
    t.g.turn_orders = [[], []]
    t.start(first=xu)
    t.act(xu, type="identify_head", pos=t.pos(0))
    assert t.last(xu).outcome == ("genuine" if t.g.genuine[t.pos(0)] else "fake")


def test_ambush_fails_next_identification_and_skips_skill():
    t = Table(8, STANDARD_8)
    yao, zheng = t.who(R.YAO_BURAN), t.who(R.ZHENG_GUOQU)
    t.start(first=yao)
    t.act(yao, type="identify_head", pos=0)
    t.turn_done(yao, zheng, {"kind": "ambush", "target": zheng})

    t.act(zheng, type="identify_head", pos=1)
    assert t.last(zheng).outcome == "ambushed"
    assert t.g.turn.ambushed and t.g.turn.ident_done
    t.act(zheng, type="advance")
    assert "不能使用" in t.fails(zheng, type="use_skill", kind="block", pos=2)
    t.act(zheng, type="use_skill", kind="none")
    assert t.g.ambush_pending[zheng] == 0


def test_ambush_on_fang_also_hits_xu():
    t = Table(8, STANDARD_8)
    yao, fang, xu = t.who(R.YAO_BURAN), t.who(R.FANG_ZHEN), t.who(R.XU_YUAN)
    t.start(first=yao)
    t.act(yao, type="identify_head", pos=0)
    t.turn_done(yao, fang, {"kind": "ambush", "target": fang})
    assert t.g.ambush_pending[xu] == 1

    t.act(fang, type="identify_player", target=xu)
    assert t.last(fang).outcome == "ambushed"
    assert xu not in t.g.fang_checked  # 被偷襲的查驗不算查過
    t.turn_done(fang, xu)
    t.act(xu, type="identify_head", pos=0)
    assert t.last(xu).outcome == "ambushed"
    assert t.g.turn.ident_done  # 許願被偷襲後第二次也不能鑑


def test_ji_yunfu_ambushed_forever():
    t = Table(8, STANDARD_8)
    yao, ji = t.who(R.YAO_BURAN), t.who(R.JI_YUNFU)
    t.start(first=yao)
    t.act(yao, type="identify_head", pos=0)
    t.turn_done(yao, ji, {"kind": "ambush", "target": ji})
    t.act(ji, type="identify_head", pos=1)
    assert t.last(ji).outcome == "ambushed"
    assert t.g.ambush_pending[ji] > 50


def test_block_makes_head_unknown_for_later_players():
    t = Table(8, STANDARD_8)
    zheng, xu = t.who(R.ZHENG_GUOQU), t.who(R.XU_YUAN)
    t.start(first=zheng)
    t.act(zheng, type="identify_head", pos=0)
    t.turn_done(zheng, xu, {"kind": "block", "pos": 2})
    t.act(xu, type="identify_head", pos=2)
    t.act(xu, type="identify_head", pos=3)
    assert t.g.records[xu][0].outcome == "unknown"
    assert t.g.records[xu][1].outcome in ("genuine", "fake")


def test_block_rejects_other_rounds():
    t = Table(8, STANDARD_8)
    zheng = t.who(R.ZHENG_GUOQU)
    t.start(first=zheng)
    t.act(zheng, type="identify_head", pos=0)
    t.act(zheng, type="advance")
    assert "本回合" in t.fails(zheng, type="use_skill", kind="block", pos=7)


def test_huang_and_kido_sealed_round():
    t = Table(8, STANDARD_8)
    huang = t.who(R.HUANG_YANYAN)
    t.g.huang_fail_round = 0
    t.start(first=huang)
    t.act(huang, type="identify_head", pos=0)
    assert t.last(huang).outcome == "unknown"
    assert t.last(huang).reason == "sealed"


def test_director_only_identifies_first_round_and_knows_one():
    roles = STANDARD_8.copy()
    roles[2] = R.DIRECTOR_LIU
    t = Table(8, roles)
    liu = t.who(R.DIRECTOR_LIU)
    from app.engine.views import known_players
    known = known_players(t.g, liu)
    assert len(known) == 1
    assert known[0]["player_id"] == t.who(t.g.director_sees)
    assert known[0]["label"] == "許願或方震"
    t.g.round = 1
    t.g.turn_orders = [[], []]
    t.start(first=liu)
    t.act(liu, type="identify_head", pos=t.pos(0))
    assert t.last(liu).reason == "sealed"


def test_poison_reverses_and_stacks_with_swap():
    roles = STANDARD_8.copy()
    roles[5] = R.MO_YAO_BURAN
    t = Table(8, roles)
    mo, lao, xu = t.who(R.MO_YAO_BURAN), t.who(R.LAO_CHAOFENG), t.who(R.XU_YUAN)
    t.start(first=mo)
    t.act(mo, type="identify_head", pos=0)
    t.turn_done(mo, lao, {"kind": "poison", "target": xu})
    t.act(lao, type="identify_head", pos=0)
    t.turn_done(lao, xu, {"kind": "swap", "swap": True})
    t.act(xu, type="identify_head", pos=0)
    t.act(xu, type="identify_head", pos=1)
    for rec in t.g.records[xu]:  # 老朝奉 + 毒：負負得正
        assert rec.outcome == ("genuine" if t.g.genuine[rec.pos] else "fake")
        assert rec.reason == "swapped,poisoned"
    assert t.g.poison_used == 1


def test_poison_limit_and_special_targets():
    roles = STANDARD_8.copy()
    roles[5] = R.MO_YAO_BURAN
    t = Table(8, roles)
    mo, fang, ji, xu = (t.who(r) for r in (R.MO_YAO_BURAN, R.FANG_ZHEN, R.JI_YUNFU, R.XU_YUAN))
    t.start(first=mo)
    t.act(mo, type="identify_head", pos=0)
    t.act(mo, type="advance")
    t.act(mo, type="use_skill", kind="poison", target=fang)
    assert t.g.poison_pending[xu] == 1
    t.g.turn.step = "skill"
    t.act(mo, type="use_skill", kind="poison", target=ji)
    assert t.g.ambush_pending[ji] > 50 and ji not in t.g.poison_pending
    t.g.turn.step = "skill"
    assert "不能使用" in t.fails(mo, type="use_skill", kind="poison", target=xu)


def test_big_eye_sees_branch_labels_of_neighbor_rounds():
    roles = STANDARD_8.copy()
    roles[7] = R.BIG_EYE
    t = Table(8, roles)
    eye = t.who(R.BIG_EYE)
    t.start(first=eye)
    from app.engine.views import build_view
    turn = build_view(t.room, eye)["game"]["me"]["turn"]
    labels = [h["label"] for h in turn["head_targets"]]
    assert labels == BRANCHES[4:8]  # 第一回合鑑定第二回合（辰巳午未）
    assert "不能鑑定" in t.fails(eye, type="identify_head", pos=0)
    t.act(eye, type="identify_head", pos=5)
    assert t.g.turn.ident_done
    assert t.last(eye).outcome == ("genuine" if t.g.genuine[5] else "fake")


def test_big_eye_middle_round_identifies_two_and_ignores_swap():
    roles = STANDARD_8.copy()
    roles[7] = R.BIG_EYE
    t = Table(8, roles)
    eye = t.who(R.BIG_EYE)
    t.g.round = 1
    t.g.turn_orders = [[], []]
    t.g.swap_rounds = [True, True, True]
    t.start(first=eye)
    t.act(eye, type="identify_head", pos=1)
    assert not t.g.turn.ident_done
    assert "不能鑑定" in t.fails(eye, type="identify_head", pos=2)
    t.act(eye, type="identify_head", pos=10)
    assert t.g.turn.ident_done
    for rec in t.g.records[eye]:
        assert rec.outcome == ("genuine" if t.g.genuine[rec.pos] else "fake")


def test_fang_checks_faction_and_big_eye_counts_as_ambushed():
    roles = STANDARD_8.copy()
    roles[7] = R.BIG_EYE
    t = Table(8, roles)
    fang, eye, lao = t.who(R.FANG_ZHEN), t.who(R.BIG_EYE), t.who(R.LAO_CHAOFENG)
    t.start(first=fang)
    assert "其他玩家" in t.fails(fang, type="identify_player", target=fang)
    t.act(fang, type="identify_player", target=eye)
    assert t.last(fang).outcome == "good"
    assert t.g.ambush_pending[eye] == 1
    t.turn_done(fang, lao)
    t.act(lao, type="identify_head", pos=0)
    t.turn_done(lao, eye)
    t.act(eye, type="identify_head", pos=4)
    assert t.last(eye).outcome == "ambushed"


def test_fang_cannot_recheck_same_player():
    t = Table(8, STANDARD_8)
    fang, lao = t.who(R.FANG_ZHEN), t.who(R.LAO_CHAOFENG)
    t.g.fang_checked = [lao]
    t.start(first=fang)
    assert "查驗過" in t.fails(fang, type="identify_player", target=lao)


def test_yao_lai_controlled_always_wrong_and_immune():
    roles = STANDARD_8.copy()
    roles[7] = R.YAO_LAI
    t = Table(8, roles)
    lai = t.who(R.YAO_LAI)
    t.g.yao_lai_controlled = True
    t.g.swap_rounds = [True, True, True]
    t.g.poison_pending[lai] = 1
    t.start(first=lai)
    t.act(lai, type="identify_head", pos=0)
    assert t.last(lai).outcome == ("fake" if t.g.genuine[0] else "genuine")
    assert t.last(lai).reason == "controlled"


# ---------------------------------------------------------------- 行動順序


def play_round_quickly(t: Table, order: list[str]) -> None:
    for i, pid in enumerate(order):
        turn = t.g.turn
        assert turn.player_id == pid
        role = t.g.roles[pid]
        if role == R.FANG_ZHEN:
            target = next(p for p in t.g.seats if p != pid and p not in t.g.fang_checked)
            t.act(pid, type="identify_player", target=target)
        else:
            from app.engine.views import build_view
            tv = build_view(t.room, pid)["game"]["me"]["turn"]
            while not t.g.turn.ident_done:
                pos = next(h["pos"] for h in tv["head_targets"]
                           if h["pos"] not in t.g.turn.attempted
                           and t.g.turn.used.get(h["round"], 0) < tv["uses"][str(h["round"])])
                t.act(pid, type="identify_head", pos=pos)
        nxt = order[i + 1] if i + 1 < len(order) else None
        t.turn_done(pid, nxt)


def test_pass_order_and_last_player_starts_next_round():
    t = Table(6, STANDARD_8[:6])
    t.start(first="p2")
    order = ["p2", "p0", "p5", "p1", "p4", "p3"]
    play_round_quickly(t, order)
    assert t.g.stage == "discussion"
    t.act("p0", type="start_voting")
    t.act("p0", type="submit_host_votes", votes=[3, 1, 1, 0])
    t.act("p0", type="next_round")
    assert t.g.round == 1
    assert t.g.turn.player_id == "p3"


def test_cannot_pass_to_player_who_already_acted():
    t = Table(6, STANDARD_8[:6])
    t.start(first="p0")
    t.act("p0", type="identify_head", pos=0)
    t.act("p0", type="identify_head", pos=1)
    t.act("p0", type="advance")
    t.act("p0", type="use_skill", kind="none")
    assert "還沒行動" in t.fails("p0", type="pass_to", target="p0")


# ---------------------------------------------------------------- 投票


def finish_acting(t: Table, first: str = "p0") -> None:
    order = [first] + [p for p in t.g.seats if p != first]
    play_round_quickly(t, order)


def test_host_votes_ranking_with_zodiac_tiebreak():
    t = Table(6, STANDARD_8[:6])
    t.start(first="p0")
    finish_acting(t)
    assert "房主" in t.fails("p1", type="start_voting")
    t.act("p0", type="start_voting")
    t.act("p0", type="submit_host_votes", votes=[1, 3, 3, 0])
    res = t.g.round_results[0]
    assert (res.first, res.second) == (1, 2)  # 同票時生肖順序靠前者優先
    assert res.second_genuine == t.g.genuine[2]
    assert t.g.stage == "vote_result"


def test_chip_votes_carry_over_and_reveal_allocations():
    t = Table(6, STANDARD_8[:6], vote_mode="chips")
    t.start(first="p0")
    finish_acting(t)
    t.act("p0", type="start_voting")
    assert "只有 2 枚" in t.fails("p1", type="submit_chips", alloc=[3, 0, 0, 0])
    t.act("p1", type="submit_chips", alloc=[0, 0, 0, 0])  # 保留到下回合
    from app.engine.views import build_view
    view = build_view(t.room, "p2")["game"]
    assert view["chip_submitted"] == ["p1"]
    assert view["round_results"] == []  # 還沒全部投完，不公開
    for p in t.g.seats:
        if p != "p1":
            t.act(p, type="submit_chips", alloc=[1, 1, 0, 0])
    res = t.g.round_results[0]
    assert res.votes == [5, 5, 0, 0]
    assert res.allocations["p1"] == [0, 0, 0, 0]
    assert t.g.chip_balance["p1"] == 2
    t.act("p0", type="next_round")
    play_round_quickly(t, [t.g.turn.player_id] + [p for p in t.g.seats if p != t.g.turn.player_id])
    t.act("p0", type="start_voting")
    assert t.g.chip_balance["p1"] == 4


def test_last_round_must_spend_all_chips():
    t = Table(6, STANDARD_8[:6], vote_mode="chips")
    t.g.round = 2
    t.g.turn_orders = [[], [], []]
    t.start(first="p0")
    finish_acting(t)
    t.act("p0", type="start_voting")
    assert "全部投出" in t.fails("p1", type="submit_chips", alloc=[1, 0, 0, 0])
    t.act("p1", type="submit_chips", alloc=[1, 1, 0, 0])


# ---------------------------------------------------------------- 鑑人與計分


def to_people_vote(t: Table) -> None:
    t.start(first="p0")
    for _ in range(3):
        first = t.g.turn.player_id
        order = [first] + [p for p in t.g.seats if p != first]
        play_round_quickly(t, order)
        t.act("p0", type="start_voting")
        t.act("p0", type="submit_host_votes", votes=[0, 0, 0, 0])
        t.act("p0", type="next_round")
    assert t.g.stage == "people_vote"


def test_teammates_cannot_vote_each_other():
    t = Table(8, STANDARD_8)
    to_people_vote(t)
    lao, yao = t.who(R.LAO_CHAOFENG), t.who(R.YAO_BURAN)
    assert "隊友" in t.fails(lao, type="people_vote", target=yao)
    assert "隊友" in t.fails(yao, type="people_vote", target=lao)


def test_scoring_good_team_wins():
    t = Table(8, STANDARD_8)
    to_people_vote(t)
    g = t.g
    lao, yao, xu, fang, zheng = (t.who(r) for r in (R.LAO_CHAOFENG, R.YAO_BURAN, R.XU_YUAN,
                                                    R.FANG_ZHEN, R.ZHENG_GUOQU))
    for p in g.seats:
        if p == lao:
            t.act(p, type="people_vote", target=fang)  # 沒找到許願
        elif p == yao:
            t.act(p, type="people_vote", target=xu)  # 沒找到方震
        elif p == zheng:
            t.act(p, type="people_vote", target=xu)
        else:
            t.act(p, type="people_vote", target=lao)
    f = g.final
    assert g.stage == "ended"
    assert f.boss_found and not f.xu_found and not f.fang_found
    assert f.boss_votes == {lao: 5}
    assert f.score == f.genuine_selected + 1 + 2 + 1
    assert f.winner == ("good" if f.score >= 6 else "bad")


def test_boss_requires_unique_majority():
    t = Table(6, STANDARD_8[:6])
    to_people_vote(t)
    g = t.g
    lao, yao = t.who(R.LAO_CHAOFENG), t.who(R.YAO_BURAN)
    good = [p for p in g.seats if p not in (lao, yao)]  # 4 位好人，需要 3 票
    votes = {good[0]: lao, good[1]: lao, good[2]: yao, good[3]: yao}
    for p in g.seats:
        if p in votes:
            t.act(p, type="people_vote", target=votes[p])
        else:
            t.act(p, type="people_vote", target=good[0])
    assert g.final.boss_required == 3
    assert g.final.boss_target is None and not g.final.boss_found


def test_play_again_returns_to_lobby():
    t = Table(6, STANDARD_8[:6])
    to_people_vote(t)
    for p in t.g.seats:
        target = next(x for x in t.g.seats if x != p and x not in forbidden_targets(t.g, p))
        t.act(p, type="people_vote", target=target)
    t.act("p0", type="play_again")
    assert t.room.game is None and t.room.games_played == 1


def test_zodiac_constants():
    assert len(ZODIAC) == len(BRANCHES) == 12
