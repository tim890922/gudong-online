import { GOOD_WIN_SCORE, HEADS_PER_ROUND } from './constants'
import { playerWith, type FinalResult, type GameState } from './models'
import { AMBUSHERS, Role, factionOf } from './roles'

export function computeFinal(g: GameState): FinalResult {
  let genuineSelected = 0
  for (const r of g.round_results) {
    for (const slot of [r.first, r.second]) {
      if (g.genuine[r.round * HEADS_PER_ROUND + slot]) genuineSelected += 1
    }
  }

  // 許願陣營指認老朝奉：得票最多（不能並列）且超過許願陣營人數的一半才算找到
  const goodVoters = g.seats.filter((p) => factionOf(g.roles[p]) === 'good')
  const bossVotes: Record<string, number> = {}
  for (const p of goodVoters) {
    const target = g.people_votes[p]
    if (target !== undefined) bossVotes[target] = (bossVotes[target] ?? 0) + 1
  }
  const required = Math.floor(goodVoters.length / 2) + 1
  let bossTarget: string | null = null
  const counts = Object.values(bossVotes)
  if (counts.length > 0) {
    const top = Math.max(...counts)
    const leaders = Object.keys(bossVotes).filter((p) => bossVotes[p] === top)
    if (leaders.length === 1 && top >= required) bossTarget = leaders[0]
  }
  const bossFound = bossTarget !== null && g.roles[bossTarget] === Role.LAO_CHAOFENG

  const lao = playerWith(g, Role.LAO_CHAOFENG)
  const xu = playerWith(g, Role.XU_YUAN)
  const xuFound = lao !== null && xu !== null && g.people_votes[lao] === xu

  const ambusher = Object.keys(g.roles).find((p) => AMBUSHERS.has(g.roles[p])) ?? null
  const fang = playerWith(g, Role.FANG_ZHEN)
  const fangFound = ambusher !== null && fang !== null && g.people_votes[ambusher] === fang

  const score = genuineSelected + (bossFound ? 1 : 0) + (xuFound ? 0 : 2) + (fangFound ? 0 : 1)
  return {
    genuine_selected: genuineSelected,
    boss_votes: bossVotes,
    boss_required: required,
    boss_target: bossTarget,
    boss_found: bossFound,
    xu_found: xuFound,
    fang_found: fangFound,
    score,
    winner: score >= GOOD_WIN_SCORE ? 'good' : 'bad',
  }
}
