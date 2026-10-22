from collections import Counter

from .constants import GOOD_WIN_SCORE, HEADS_PER_ROUND
from .models import FinalResult, GameState
from .roles import AMBUSHERS, Faction, Role, faction_of


def compute_final(g: GameState) -> FinalResult:
    genuine_selected = sum(
        g.genuine[r.round * HEADS_PER_ROUND + slot]
        for r in g.round_results
        for slot in (r.first, r.second)
    )

    # 許願陣營指認老朝奉：得票最多（不能並列）且超過許願陣營人數的一半才算找到
    good_voters = [p for p in g.seats if faction_of(g.roles[p]) == Faction.GOOD]
    boss_votes = Counter(g.people_votes[p] for p in good_voters if p in g.people_votes)
    required = len(good_voters) // 2 + 1
    boss_target = None
    if boss_votes:
        top = max(boss_votes.values())
        leaders = [p for p, c in boss_votes.items() if c == top]
        if len(leaders) == 1 and top >= required:
            boss_target = leaders[0]
    boss_found = boss_target is not None and g.roles[boss_target] == Role.LAO_CHAOFENG

    lao = g.player_with(Role.LAO_CHAOFENG)
    xu = g.player_with(Role.XU_YUAN)
    xu_found = lao is not None and xu is not None and g.people_votes.get(lao) == xu

    ambusher = next((p for p, r in g.roles.items() if r in AMBUSHERS), None)
    fang = g.player_with(Role.FANG_ZHEN)
    fang_found = (
        ambusher is not None and fang is not None and g.people_votes.get(ambusher) == fang
    )

    score = (
        genuine_selected
        + (1 if boss_found else 0)
        + (0 if xu_found else 2)
        + (0 if fang_found else 1)
    )
    return FinalResult(
        genuine_selected=genuine_selected,
        boss_votes=dict(boss_votes),
        boss_required=required,
        boss_target=boss_target,
        boss_found=boss_found,
        xu_found=xu_found,
        fang_found=fang_found,
        score=score,
        winner=Faction.GOOD if score >= GOOD_WIN_SCORE else Faction.BAD,
    )
