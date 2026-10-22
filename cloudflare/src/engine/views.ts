/**
 * 把完整狀態投影成「某位玩家可以看到的內容」。
 *
 * 這是防止資訊外洩的唯一關口：別人的角色、獸首真假、技能使用都不能出現在遊戲中的 view 裡，
 * 直到結算（stage === 'ended'）才全部公開。
 */

import { BRANCHES, HEADS_PER_ROUND, MAX_POISON, ROUNDS, ZODIAC } from './constants'
import { availableSkill, forbiddenTargets, headTargets, peopleVoteGoal, remainingPlayers } from './game'
import {
  findPlayer,
  playerWith,
  type GameState,
  type IdentRecord,
  type Room,
  type SkillEvent,
} from './models'
import { range } from './rng'
import { AMBUSHERS, ROLE_INFO, Role, factionOf } from './roles'

type View = Record<string, unknown>

export function buildView(room: Room, pid: string, connected: Set<string> = new Set()): View {
  const g = room.game
  return {
    code: room.code,
    me: pid,
    host_id: room.host_id,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      connected: connected.has(p.id),
    })),
    settings: { ...room.settings },
    phase: g === null ? 'lobby' : g.stage,
    games_played: room.games_played,
    game: g === null ? null : gameView(room, g, pid),
  }
}

function gameView(room: Room, g: GameState, pid: string): View {
  const ended = g.stage === 'ended'
  const visibleRounds = ended ? ROUNDS : g.round + 1
  return {
    stage: g.stage,
    round: g.round,
    seats: g.seats,
    role_pool: g.role_pool,
    // 還沒到的回合不公開是哪些獸首（大眼賊也只看得到位置編號）
    heads: range(ROUNDS * HEADS_PER_ROUND).map((i) =>
      Math.floor(i / HEADS_PER_ROUND) < visibleRounds ? g.heads[i] : null,
    ),
    turn_orders: g.turn_orders,
    current: g.turn ? g.turn.player_id : null,
    ready: g.ready,
    round_results: g.round_results.map((r) => ({ ...r })),
    chip_submitted: Object.keys(g.chip_votes),
    people_voted: Object.keys(g.people_votes),
    me: g.seats.includes(pid) ? myView(room, g, pid) : null,
    final: ended ? finalView(room, g) : null,
  }
}

function publicRecord(r: IdentRecord): View {
  return { round: r.round, kind: r.kind, pos: r.pos, target: r.target, outcome: r.outcome }
}

/** 開局時的陣營資訊。 */
export function knownPlayers(g: GameState, pid: string): { player_id: string; label: string }[] {
  const role = g.roles[pid]
  if (role === Role.LAO_CHAOFENG || (role !== undefined && AMBUSHERS.has(role))) {
    return Object.entries(g.roles)
      .filter(([p, r]) => p !== pid && (r === Role.LAO_CHAOFENG || AMBUSHERS.has(r)))
      .map(([p, r]) => ({ player_id: p, label: ROLE_INFO[r].name }))
  }
  if (role === Role.DIRECTOR_LIU) {
    const known = playerWith(g, g.director_sees)
    return known ? [{ player_id: known, label: '許願或方震' }] : []
  }
  return []
}

function myView(room: Room, g: GameState, pid: string): View {
  const role = g.roles[pid] ?? null
  let records = g.records[pid] ?? []
  if (!room.settings.allow_history && g.stage !== 'ended') {
    records = records.filter((r) => r.round === g.round)
  }
  const me: View = {
    role,
    role_name: role ? ROLE_INFO[role].name : null,
    faction: role ? factionOf(role) : null,
    known: role ? knownPlayers(g, pid) : [],
    records: records.map(publicRecord),
    chip_balance: g.chip_balance[pid] ?? 0,
    my_chips: g.chip_votes[pid] ?? null,
    people_vote: g.people_votes[pid] ?? null,
    people_vote_goal: role ? peopleVoteGoal(role) : null,
    forbidden_targets: role ? forbiddenTargets(g, pid) : [],
    turn: null,
  }
  if (room.settings.role_mode === 'manual' && g.stage === 'roles') {
    me.taken_roles = Object.entries(g.roles)
      .filter(([p]) => p !== pid)
      .map(([, r]) => r)
  }
  if (g.turn && g.turn.player_id === pid) me.turn = turnView(g, pid)
  return me
}

function turnView(g: GameState, pid: string): View {
  const t = g.turn!
  const role = g.roles[pid]
  const info = ROLE_INFO[role]
  const view: View = {
    step: t.step,
    ident_kind: info.ident,
    ident_done: t.ident_done,
    ambushed: t.ambushed,
    attempted: t.attempted,
    results: g.records[pid].filter((r) => r.round === g.round).map(publicRecord),
  }
  if (info.ident === 'player') {
    view.player_targets = g.seats.filter((p) => p !== pid && !g.fang_checked.includes(p))
    view.uses = { [String(g.round)]: 1 }
  } else {
    const allowed = headTargets(g, role)
    view.uses = Object.fromEntries([...allowed].map(([r, n]) => [String(r), n]))
    view.used = { ...t.used }
    view.head_targets = [...allowed.keys()].flatMap((r) =>
      range(HEADS_PER_ROUND).map((i) => ({
        pos: r * HEADS_PER_ROUND + i,
        round: r,
        // 大眼賊只看得到位置編號
        label:
          info.ident === 'big_eye'
            ? BRANCHES[r * HEADS_PER_ROUND + i]
            : ZODIAC[g.heads[r * HEADS_PER_ROUND + i]],
      })),
    )
  }
  const skill = availableSkill(g, pid)
  const acted = g.turn_orders[g.round]
  view.skill = skill
  if (skill === 'ambush' || skill === 'poison') {
    view.skill_targets = g.seats
      .filter((p) => p !== pid)
      .map((p) => ({ player_id: p, acted: acted.includes(p) }))
  }
  if (info.skill === 'poison') view.poison_left = MAX_POISON - g.poison_used
  if (skill === 'block') {
    view.block_targets = range(HEADS_PER_ROUND).map((i) => ({
      pos: g.round * HEADS_PER_ROUND + i,
      label: ZODIAC[g.heads[g.round * HEADS_PER_ROUND + i]],
    }))
  }
  if (t.step === 'pass') view.remaining = remainingPlayers(g)
  return view
}

// ---------------------------------------------------------------- 結算

const REASON_TEXT: Record<string, string> = {
  ambushed: '被偷襲',
  sealed: '角色本回合無法鑑定',
  blocked: '被鄭國渠封鎖',
  swapped: '被老朝奉顛倒',
  poisoned: '中毒顛倒',
  controlled: '藥來被控制',
  big_eye_ambushed: '大眼賊被查驗而視同偷襲',
}
const OUTCOME_TEXT: Record<IdentRecord['outcome'], string> = {
  genuine: '真',
  fake: '假',
  unknown: '無法辨別',
  ambushed: '被偷襲',
  good: '許願陣營',
  bad: '老朝奉陣營',
}

function finalView(room: Room, g: GameState): View {
  return {
    roles: g.roles,
    genuine: g.genuine,
    people_votes: g.people_votes,
    result: g.final ? { ...g.final } : null,
    log: buildLog(room, g),
  }
}

export function buildLog(room: Room, g: GameState): string[] {
  const name = (pid: string | null): string => (pid && findPlayer(room, pid)?.name) || '?'
  const head = (pos: number | null): string =>
    pos === null ? '?' : `${ZODIAC[g.heads[pos]]}（${BRANCHES[pos]}）`
  const roleName = (pid: string): string => ROLE_INFO[g.roles[pid]].name

  const lines = ['【角色】']
  lines.push(...g.seats.map((p) => `${name(p)}：${roleName(p)}`))
  for (let r = 0; r < ROUNDS; r++) {
    if (r >= g.turn_orders.length) break
    lines.push(`【第 ${r + 1} 回合】`)
    const base = r * HEADS_PER_ROUND
    lines.push(
      '獸首：' +
        range(HEADS_PER_ROUND)
          .map((i) => `${ZODIAC[g.heads[base + i]]}${g.genuine[base + i] ? '真' : '假'}`)
          .join('、'),
    )
    for (const pid of g.turn_orders[r]) {
      for (const rec of g.records[pid]) {
        if (rec.round !== r) continue
        const target = rec.kind === 'head' ? head(rec.pos) : name(rec.target)
        let text = `${name(pid)}（${roleName(pid)}）鑑定 ${target} → ${OUTCOME_TEXT[rec.outcome]}`
        if (rec.reason) {
          const reasons = rec.reason
            .split(',')
            .map((x) => REASON_TEXT[x] ?? x)
            .join('、')
          text += `（${reasons}）`
        }
        lines.push(text)
      }
      for (const ev of g.skills) {
        if (ev.round !== r || ev.actor !== pid) continue
        lines.push(skillText(ev, name, head))
      }
    }
    if (r < g.round_results.length) {
      const res = g.round_results[r]
      const votes = res.votes.map((v, i) => `${ZODIAC[g.heads[base + i]]} ${v} 票`).join('、')
      lines.push(`投票：${votes}`)
      if (res.allocations) {
        for (const [p, alloc] of Object.entries(res.allocations)) {
          const detail = alloc
            .flatMap((n, i) => (n ? [`${ZODIAC[g.heads[base + i]]}×${n}`] : []))
            .join('、')
          lines.push(`  ${name(p)}：${detail || '未投'}`)
        }
      }
      lines.push(
        `入選：${ZODIAC[g.heads[base + res.first]]}（真假不公開）、` +
          `${ZODIAC[g.heads[base + res.second]]}（${res.second_genuine ? '真' : '假'}）`,
      )
    }
  }
  if (Object.keys(g.people_votes).length > 0) {
    lines.push('【鑑人】')
    for (const p of g.seats) {
      const target = g.people_votes[p]
      if (target !== undefined) lines.push(`${name(p)}（${roleName(p)}）投給 ${name(target)}`)
    }
  }
  if (g.final) {
    const f = g.final
    lines.push('【結算】')
    lines.push(`鑑寶得分：${f.genuine_selected}`)
    lines.push(`找出老朝奉：${f.boss_found ? '是 +1' : '否 +0'}`)
    lines.push(`許願被找到：${f.xu_found ? '是 +0' : '否 +2'}`)
    lines.push(`方震被找到：${f.fang_found ? '是 +0' : '否 +1'}`)
    const winner = f.winner === 'good' ? '許願陣營' : '老朝奉陣營'
    lines.push(`許願陣營總分 ${f.score}，${winner}獲勝`)
  }
  return lines
}

function skillText(
  ev: SkillEvent,
  name: (pid: string | null) => string,
  head: (pos: number | null) => string,
): string {
  const actor = name(ev.actor)
  if (ev.kind === 'ambush') {
    const extra = ev.note === 'xu_also' ? '（方震被偷襲，許願也一起被偷襲）' : ''
    return `${actor} 偷襲了 ${name(ev.target)}${extra}`
  }
  if (ev.kind === 'poison') {
    const notes: Record<string, string> = {
      xu_also: '（許願連帶中毒）',
      ji_ambushed: '（姬雲浮視同被偷襲）',
    }
    return `${actor} 對 ${name(ev.target)} 下毒${notes[ev.note ?? ''] ?? ''}`
  }
  if (ev.kind === 'block') return `${actor} 封鎖了 ${head(ev.pos)}`
  if (ev.kind === 'swap') return `${actor} ${ev.swap ? '發動' : '沒有發動'}老朝奉的能力`
  return `${actor} 沒有使用技能`
}
