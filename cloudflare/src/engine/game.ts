/**
 * 所有玩家操作的處理：大廳設定、角色、行動、投票、鑑人。
 *
 * `applyAction` 直接修改傳入的 Room；呼叫端（GameRoom）會先複製一份，失敗時丟棄。
 */

import type { Action, ActionType } from './actions'
import {
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
} from './constants'
import { GameError } from './errors'
import {
  findPlayer,
  playerWith,
  type GameState,
  type IdentRecord,
  type Room,
  type SkillEvent,
  type Stage,
  type TurnState,
} from './models'
import { choice, randrange, range, shuffle, type Rng } from './rng'
import { AMBUSHERS, ROLE_INFO, Role, SWAP_AFFECTED, factionOf, rolePool, type SkillKind } from './roles'
import { computeFinal } from './scoring'

type Handler<K extends ActionType> = (
  room: Room,
  pid: string,
  a: Extract<Action, { type: K }>,
  rng: Rng,
) => void

export function applyAction(room: Room, pid: string, action: Action, rng: Rng): void {
  if (findPlayer(room, pid) === undefined) throw new GameError('你不在這個房間')
  ;(HANDLERS[action.type] as Handler<ActionType>)(room, pid, action, rng)
}

// ---------------------------------------------------------------- 共用檢查

function requireHost(room: Room, pid: string): void {
  if (room.host_id !== pid) throw new GameError('只有房主可以這麼做')
}

function requireLobby(room: Room): void {
  if (room.game !== null) throw new GameError('遊戲進行中，無法變更')
}

function requireGame(room: Room, ...stages: Stage[]): GameState {
  const g = room.game
  if (g === null || (stages.length > 0 && !stages.includes(g.stage))) {
    throw new GameError('現在不能這麼做')
  }
  return g
}

function requireSeat(g: GameState, pid: string): void {
  if (!g.seats.includes(pid)) throw new GameError('你不是本局玩家')
}

function requireActor(g: GameState, pid: string, step: TurnState['step']): TurnState {
  const t = g.turn
  if (t === null || t.player_id !== pid) throw new GameError('現在不是你的回合')
  if (t.step !== step) throw new GameError('請依照步驟操作')
  return t
}

function requireTarget(g: GameState, pid: string, target: string | null): string {
  if (target === null || !g.seats.includes(target) || target === pid) {
    throw new GameError('請選擇其他玩家')
  }
  return target
}

// ---------------------------------------------------------------- 大廳

const setProfile: Handler<'set_profile'> = (room, pid, a) => {
  requireLobby(room)
  const player = findPlayer(room, pid)!
  if (a.name !== null) {
    const name = a.name.trim()
    if (!name) throw new GameError('暱稱不能是空白')
    player.name = name
  }
  if (a.color !== null) {
    if (!(a.color >= 0 && a.color < COLORS.length)) throw new GameError('沒有這個顏色')
    if (room.players.some((p) => p.color === a.color && p.id !== pid)) {
      throw new GameError('這個顏色已經有人選了')
    }
    player.color = a.color
  }
}

const updateSettings: Handler<'update_settings'> = (room, pid, a) => {
  requireHost(room, pid)
  requireLobby(room)
  const s = a.settings
  if (s.fan_big_eye && s.fan_yao_lai) throw new GameError('大眼賊和藥來只能擇一')
  if (s.first_player_id !== null && findPlayer(room, s.first_player_id) === undefined) {
    s.first_player_id = null
  }
  room.settings = s
}

const kick: Handler<'kick'> = (room, pid, a) => {
  requireHost(room, pid)
  requireLobby(room)
  if (a.player_id === pid || findPlayer(room, a.player_id) === undefined) {
    throw new GameError('無法移除這位玩家')
  }
  removePlayer(room, a.player_id)
}

const transferHost: Handler<'transfer_host'> = (room, pid, a) => {
  requireHost(room, pid)
  if (findPlayer(room, a.player_id) === undefined) throw new GameError('找不到這位玩家')
  room.host_id = a.player_id
}

const leave: Handler<'leave'> = (room, pid) => {
  if (room.game !== null) throw new GameError('遊戲進行中無法離開，請房主先中止遊戲')
  removePlayer(room, pid)
}

function removePlayer(room: Room, pid: string): void {
  room.players = room.players.filter((p) => p.id !== pid)
  if (room.settings.first_player_id === pid) room.settings.first_player_id = null
  if (room.host_id === pid && room.players.length > 0) room.host_id = room.players[0].id
}

const startGame: Handler<'start_game'> = (room, pid, _a, rng) => {
  requireHost(room, pid)
  requireLobby(room)
  const n = room.players.length
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
    throw new GameError(`需要 ${MIN_PLAYERS}–${MAX_PLAYERS} 位玩家才能開始（目前 ${n} 位）`)
  }

  const used = new Set(room.players.flatMap((p) => (p.color === null ? [] : [p.color])))
  for (const p of room.players) {
    if (p.color === null) {
      p.color = range(COLORS.length).find((c) => !used.has(c))!
      used.add(p.color)
    }
  }
  const seats = [...room.players].sort((a, b) => a.color! - b.color!).map((p) => p.id)

  const s = room.settings
  const pool = rolePool(n, {
    bigEye: s.fan_big_eye,
    yaoLai: s.fan_yao_lai,
    director: s.fan_director,
    moYao: s.fan_mo_yao,
  })

  const order = range(ZODIAC.length)
  shuffle(rng, order)
  const heads: number[] = []
  const genuine: boolean[] = []
  for (let r = 0; r < ROUNDS; r++) {
    heads.push(...order.slice(r * HEADS_PER_ROUND, (r + 1) * HEADS_PER_ROUND).sort((a, b) => a - b))
    const row = [true, true, false, false]
    shuffle(rng, row)
    genuine.push(...row)
  }

  const g: GameState = {
    seats,
    role_pool: pool,
    roles: {},
    ready: [],
    heads,
    genuine,
    huang_fail_round: randrange(rng, ROUNDS),
    kido_fail_round: randrange(rng, ROUNDS),
    yao_lai_controlled: rng.random() < 0.5,
    director_sees: choice(rng, [Role.XU_YUAN, Role.FANG_ZHEN]),
    stage: 'roles',
    round: 0,
    turn_orders: [[]],
    turn: null,
    ambush_pending: {},
    poison_pending: {},
    poison_used: 0,
    swap_rounds: [false, false, false],
    blocked: [],
    fang_checked: [],
    records: Object.fromEntries(seats.map((p) => [p, []])),
    skills: [],
    chip_balance: Object.fromEntries(seats.map((p) => [p, 0])),
    chip_votes: {},
    round_results: [],
    people_votes: {},
    final: null,
  }
  if (s.role_mode === 'random') {
    const shuffled = [...pool]
    shuffle(rng, shuffled)
    g.roles = Object.fromEntries(seats.map((p, i) => [p, shuffled[i]]))
  }
  room.game = g
}

// ---------------------------------------------------------------- 角色階段

const pickRole: Handler<'pick_role'> = (room, pid, a) => {
  const g = requireGame(room, 'roles')
  requireSeat(g, pid)
  if (room.settings.role_mode !== 'manual') throw new GameError('本局由系統分配角色')
  if (!g.role_pool.includes(a.role)) throw new GameError('本局沒有這個角色')
  if (Object.entries(g.roles).some(([p, r]) => r === a.role && p !== pid)) {
    throw new GameError('這個角色已經有人選了，請再確認一次你的角色卡')
  }
  g.roles[pid] = a.role
  g.ready = g.ready.filter((p) => p !== pid)
}

const ready: Handler<'ready'> = (room, pid, _a, rng) => {
  const g = requireGame(room, 'roles')
  requireSeat(g, pid)
  if (g.roles[pid] === undefined) throw new GameError('請先選擇你的角色')
  if (!g.ready.includes(pid)) g.ready.push(pid)
  if (g.ready.length === g.seats.length) {
    let first = room.settings.first_player_id
    if (first === null || !g.seats.includes(first)) first = choice(rng, g.seats)
    g.stage = 'acting'
    startTurn(g, first)
  }
}

// ---------------------------------------------------------------- 行動

function startTurn(g: GameState, pid: string): void {
  g.turn_orders[g.round].push(pid)
  const t: TurnState = {
    player_id: pid,
    step: 'identify',
    used: {},
    attempted: [],
    ambushed: false,
    poisoned: false,
    ident_done: false,
  }
  // 毒在「下一次鑑定獸首」時生效；方震查驗的是人，不受影響
  if (ROLE_INFO[g.roles[pid]].ident !== 'player' && (g.poison_pending[pid] ?? 0) > 0) {
    g.poison_pending[pid] -= 1
    t.poisoned = true
  }
  g.turn = t
}

/** 可鑑定的回合 -> 次數 */
export function headTargets(g: GameState, role: Role): Map<number, number> {
  if (ROLE_INFO[role].ident === 'big_eye') {
    return new Map([g.round - 1, g.round + 1].filter((r) => r >= 0 && r < ROUNDS).map((r) => [r, 1]))
  }
  return new Map([[g.round, role === Role.XU_YUAN ? 2 : 1]])
}

const identifyHead: Handler<'identify_head'> = (room, pid, a) => {
  const g = requireGame(room, 'acting')
  const t = requireActor(g, pid, 'identify')
  const role = g.roles[pid]
  if (ROLE_INFO[role].ident === 'player') throw new GameError('你要查驗的是玩家')
  if (t.ident_done) throw new GameError('本回合的鑑定已經用完了')
  if (!(a.pos >= 0 && a.pos < ROUNDS * HEADS_PER_ROUND) || t.attempted.includes(a.pos)) {
    throw new GameError('不能鑑定這一件')
  }
  const targetRound = Math.floor(a.pos / HEADS_PER_ROUND)
  const allowed = headTargets(g, role)
  if ((t.used[targetRound] ?? 0) >= (allowed.get(targetRound) ?? 0)) {
    throw new GameError('不能鑑定這一件')
  }

  t.attempted.push(a.pos)
  t.used[targetRound] = (t.used[targetRound] ?? 0) + 1
  const rec = resolveHead(g, pid, role, a.pos, t)
  g.records[pid].push(rec)
  if (rec.outcome === 'ambushed') {
    t.ambushed = true
    t.ident_done = true
  } else if ([...allowed].every(([r, n]) => (t.used[r] ?? 0) >= n)) {
    t.ident_done = true
  }
}

function resolveHead(g: GameState, pid: string, role: Role, pos: number, t: TurnState): IdentRecord {
  const record = (
    outcome: IdentRecord['outcome'],
    reason: string | null,
    trueValue: boolean | null,
  ): IdentRecord => ({
    round: g.round,
    kind: 'head',
    pos,
    target: null,
    outcome,
    reason,
    true_value: trueValue,
  })

  if ((g.ambush_pending[pid] ?? 0) > 0) {
    g.ambush_pending[pid] -= 1
    return record('ambushed', 'ambushed', null)
  }

  const trueValue = g.genuine[pos]
  const sealed =
    (role === Role.HUANG_YANYAN && g.round === g.huang_fail_round) ||
    (role === Role.KIDO_KANA && g.round === g.kido_fail_round) ||
    (role === Role.DIRECTOR_LIU && g.round > 0)
  if (sealed) return record('unknown', 'sealed', trueValue)
  if (g.blocked.includes(pos)) return record('unknown', 'blocked', trueValue)

  let result = trueValue
  const mods: string[] = []
  if (role === Role.YAO_LAI) {
    if (g.yao_lai_controlled) {
      result = !result
      mods.push('controlled')
    }
  } else {
    if (SWAP_AFFECTED.has(role) && g.swap_rounds[g.round]) {
      result = !result
      mods.push('swapped')
    }
    if (t.poisoned) {
      result = !result
      mods.push('poisoned')
    }
  }
  return record(result ? 'genuine' : 'fake', mods.join(',') || null, trueValue)
}

const identifyPlayer: Handler<'identify_player'> = (room, pid, a) => {
  const g = requireGame(room, 'acting')
  const t = requireActor(g, pid, 'identify')
  if (ROLE_INFO[g.roles[pid]].ident !== 'player') throw new GameError('你要鑑定的是獸首')
  if (t.ident_done) throw new GameError('本回合的查驗已經用完了')
  const target = requireTarget(g, pid, a.target)
  if (g.fang_checked.includes(target)) throw new GameError('已經查驗過這位玩家')

  const record = (outcome: IdentRecord['outcome'], reason: string | null): IdentRecord => ({
    round: g.round,
    kind: 'player',
    pos: null,
    target,
    outcome,
    reason,
    true_value: null,
  })
  t.ident_done = true
  if ((g.ambush_pending[pid] ?? 0) > 0) {
    g.ambush_pending[pid] -= 1
    t.ambushed = true
    g.records[pid].push(record('ambushed', 'ambushed'))
    return
  }

  g.fang_checked.push(target)
  const targetRole = g.roles[target]
  let reason: string | null = null
  if (targetRole === Role.BIG_EYE) {
    add(g.ambush_pending, target, 1)
    reason = 'big_eye_ambushed'
  }
  g.records[pid].push(record(factionOf(targetRole) === 'bad' ? 'bad' : 'good', reason))
}

const advance: Handler<'advance'> = (room, pid) => {
  const g = requireGame(room, 'acting')
  const t = requireActor(g, pid, 'identify')
  if (!t.ident_done) throw new GameError('請先完成鑑定')
  t.step = 'skill'
}

export function availableSkill(g: GameState, pid: string): SkillKind | null {
  const t = g.turn
  const skill = ROLE_INFO[g.roles[pid]].skill
  if (t === null || t.ambushed || skill === null) return null
  if (skill === 'poison' && g.poison_used >= MAX_POISON) return null
  return skill
}

const useSkill: Handler<'use_skill'> = (room, pid, a) => {
  const g = requireGame(room, 'acting')
  const t = requireActor(g, pid, 'skill')
  const skill = availableSkill(g, pid)
  if (a.kind !== 'none' && a.kind !== skill) throw new GameError('你不能使用這個技能')

  const event: SkillEvent = {
    round: g.round,
    actor: pid,
    kind: a.kind,
    target: null,
    pos: null,
    swap: null,
    note: null,
  }
  const xu = playerWith(g, Role.XU_YUAN)
  if (a.kind === 'ambush') {
    const target = requireTarget(g, pid, a.target)
    const amount = g.roles[target] === Role.JI_YUNFU ? PERMANENT_AMBUSH : 1
    add(g.ambush_pending, target, amount)
    if (g.roles[target] === Role.FANG_ZHEN && xu) {
      add(g.ambush_pending, xu, amount)
      event.note = 'xu_also'
    }
    event.target = target
  } else if (a.kind === 'poison') {
    const target = requireTarget(g, pid, a.target)
    if (g.roles[target] === Role.JI_YUNFU) {
      add(g.ambush_pending, target, PERMANENT_AMBUSH)
      event.note = 'ji_ambushed'
    } else {
      add(g.poison_pending, target, 1)
      if (g.roles[target] === Role.FANG_ZHEN && xu) {
        add(g.poison_pending, xu, 1)
        event.note = 'xu_also'
      }
    }
    g.poison_used += 1
    event.target = target
  } else if (a.kind === 'block') {
    const first = g.round * HEADS_PER_ROUND
    if (a.pos === null || !(a.pos >= first && a.pos < first + HEADS_PER_ROUND)) {
      throw new GameError('只能封鎖本回合的獸首')
    }
    g.blocked.push(a.pos)
    event.pos = a.pos
  } else if (a.kind === 'swap') {
    if (a.swap === null) throw new GameError('請選擇是否發動')
    g.swap_rounds[g.round] = a.swap
    event.swap = a.swap
  }
  g.skills.push(event)
  t.step = 'pass'
}

function add(d: Record<string, number>, key: string, amount: number): void {
  d[key] = (d[key] ?? 0) + amount
}

export function remainingPlayers(g: GameState): string[] {
  const acted = g.turn_orders[g.round]
  return g.seats.filter((s) => !acted.includes(s))
}

const passTo: Handler<'pass_to'> = (room, pid, a) => {
  const g = requireGame(room, 'acting')
  requireActor(g, pid, 'pass')
  const remaining = remainingPlayers(g)
  if (remaining.length > 0) {
    if (a.target === null || !remaining.includes(a.target)) {
      throw new GameError('請選擇本回合還沒行動的玩家')
    }
    startTurn(g, a.target)
  } else {
    if (a.target !== null) throw new GameError('所有人都行動過了')
    g.turn = null
    g.stage = 'discussion'
  }
}

// ---------------------------------------------------------------- 鑑寶投票

const startVoting: Handler<'start_voting'> = (room, pid) => {
  requireHost(room, pid)
  const g = requireGame(room, 'discussion')
  g.stage = 'voting'
  g.chip_votes = {}
  if (room.settings.vote_mode === 'chips') {
    for (const s of g.seats) add(g.chip_balance, s, CHIPS_PER_ROUND)
  }
}

const submitHostVotes: Handler<'submit_host_votes'> = (room, pid, a) => {
  requireHost(room, pid)
  const g = requireGame(room, 'voting')
  if (room.settings.vote_mode !== 'host') throw new GameError('本局使用線上投票')
  if (a.votes.length !== HEADS_PER_ROUND || a.votes.some((v) => !(v >= 0 && v <= MAX_HOST_VOTES))) {
    throw new GameError('票數不正確')
  }
  finishRound(g, [...a.votes], null)
}

const submitChips: Handler<'submit_chips'> = (room, pid, a) => {
  const g = requireGame(room, 'voting')
  requireSeat(g, pid)
  if (room.settings.vote_mode !== 'chips') throw new GameError('本局由房主統計票數')
  if (g.chip_votes[pid] !== undefined) throw new GameError('你已經投過票了')
  if (a.alloc.length !== HEADS_PER_ROUND || a.alloc.some((v) => v < 0)) {
    throw new GameError('籌碼分配不正確')
  }
  const total = a.alloc.reduce((x, y) => x + y, 0)
  const balance = g.chip_balance[pid] ?? 0
  if (total > balance) throw new GameError(`你只有 ${balance} 枚籌碼`)
  if (g.round === ROUNDS - 1 && total !== balance) {
    throw new GameError(`最後一回合必須把 ${balance} 枚籌碼全部投出`)
  }
  g.chip_balance[pid] = balance - total
  g.chip_votes[pid] = [...a.alloc]
  if (Object.keys(g.chip_votes).length === g.seats.length) {
    const votes = Object.values(g.chip_votes)
    const totals = range(HEADS_PER_ROUND).map((i) => votes.reduce((sum, v) => sum + v[i], 0))
    const allocations = Object.fromEntries(g.seats.map((s) => [s, g.chip_votes[s]]))
    finishRound(g, totals, allocations)
  }
}

function finishRound(g: GameState, votes: number[], allocations: Record<string, number[]> | null): void {
  const base = g.round * HEADS_PER_ROUND
  // 同票時依十二生肖順序排名
  const ranking = range(HEADS_PER_ROUND).sort(
    (i, j) => votes[j] - votes[i] || g.heads[base + i] - g.heads[base + j],
  )
  const [first, second] = ranking
  g.round_results.push({
    round: g.round,
    votes,
    allocations,
    first,
    second,
    second_genuine: g.genuine[base + second],
  })
  g.stage = 'vote_result'
}

const nextRound: Handler<'next_round'> = (room, pid) => {
  requireHost(room, pid)
  const g = requireGame(room, 'vote_result')
  if (g.round < ROUNDS - 1) {
    const last = g.turn_orders[g.round].at(-1)! // 上一回合最後一位成為新首家
    g.round += 1
    g.turn_orders.push([])
    g.stage = 'acting'
    startTurn(g, last)
  } else {
    g.stage = 'people_vote'
  }
}

// ---------------------------------------------------------------- 鑑人

/** 這個角色在鑑人階段要找誰；null 表示投票不計分（鄭國渠）。 */
export function peopleVoteGoal(role: Role): Role | null {
  if (role === Role.LAO_CHAOFENG) return Role.XU_YUAN
  if (AMBUSHERS.has(role)) return Role.FANG_ZHEN
  if (factionOf(role) === 'good') return Role.LAO_CHAOFENG
  return null
}

/** 已知的隊友不能投。 */
export function forbiddenTargets(g: GameState, pid: string): string[] {
  const role = g.roles[pid]
  if (role === Role.LAO_CHAOFENG) {
    return Object.entries(g.roles)
      .filter(([, r]) => AMBUSHERS.has(r))
      .map(([p]) => p)
  }
  if (role !== undefined && AMBUSHERS.has(role)) {
    const lao = playerWith(g, Role.LAO_CHAOFENG)
    return lao ? [lao] : []
  }
  if (role === Role.DIRECTOR_LIU) {
    const known = playerWith(g, g.director_sees)
    return known ? [known] : []
  }
  return []
}

const peopleVote: Handler<'people_vote'> = (room, pid, a) => {
  const g = requireGame(room, 'people_vote')
  requireSeat(g, pid)
  if (g.people_votes[pid] !== undefined) throw new GameError('你已經投過票了')
  const target = requireTarget(g, pid, a.target)
  if (forbiddenTargets(g, pid).includes(target)) throw new GameError('不能投給你的隊友')
  g.people_votes[pid] = target
  if (Object.keys(g.people_votes).length === g.seats.length) {
    g.final = computeFinal(g)
    g.stage = 'ended'
  }
}

// ---------------------------------------------------------------- 結束

const playAgain: Handler<'play_again'> = (room, pid) => {
  requireHost(room, pid)
  requireGame(room, 'ended')
  room.game = null
  room.games_played += 1
}

const abortGame: Handler<'abort_game'> = (room, pid) => {
  requireHost(room, pid)
  requireGame(room)
  room.game = null
}

const HANDLERS: { [K in ActionType]: Handler<K> } = {
  set_profile: setProfile,
  update_settings: updateSettings,
  kick,
  transfer_host: transferHost,
  leave,
  start_game: startGame,
  pick_role: pickRole,
  ready,
  identify_head: identifyHead,
  identify_player: identifyPlayer,
  advance,
  use_skill: useSkill,
  pass_to: passTo,
  start_voting: startVoting,
  submit_host_votes: submitHostVotes,
  submit_chips: submitChips,
  next_round: nextRound,
  people_vote: peopleVote,
  play_again: playAgain,
  abort_game: abortGame,
}
