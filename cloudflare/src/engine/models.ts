import type { Faction, Role } from './roles'

export type Stage =
  | 'roles' // 看角色／選角色
  | 'acting' // 依序行動
  | 'discussion' // 現場討論
  | 'voting' // 鑑寶投票
  | 'vote_result' // 公布本回合投票結果
  | 'people_vote' // 鑑人
  | 'ended'
export type Outcome = 'genuine' | 'fake' | 'unknown' | 'ambushed' | 'good' | 'bad'

export interface Settings {
  role_mode: 'random' | 'manual'
  vote_mode: 'host' | 'chips'
  fan_big_eye: boolean
  fan_yao_lai: boolean
  fan_director: boolean
  fan_mo_yao: boolean
  first_player_id: string | null
  allow_history: boolean
}

export function defaultSettings(): Settings {
  return {
    role_mode: 'random',
    vote_mode: 'host',
    fan_big_eye: false,
    fan_yao_lai: false,
    fan_director: false,
    fan_mo_yao: false,
    first_player_id: null,
    allow_history: true,
  }
}

export interface PlayerInfo {
  id: string
  token: string
  name: string
  color: number | null
}

/** 一次鑑定的結果。`reason`、`true_value` 只在結算時公開。 */
export interface IdentRecord {
  round: number
  kind: 'head' | 'player'
  pos: number | null // 獸首位置 0..11（回合 * 4 + 欄位）
  target: string | null // 被查驗的玩家
  outcome: Outcome
  reason: string | null
  true_value: boolean | null
}

export interface SkillEvent {
  round: number
  actor: string
  kind: 'ambush' | 'poison' | 'block' | 'swap' | 'none'
  target: string | null
  pos: number | null
  swap: boolean | null
  note: string | null
}

export interface TurnState {
  player_id: string
  step: 'identify' | 'skill' | 'pass'
  used: Record<number, number> // 鑑定的回合 -> 已用次數
  attempted: number[]
  ambushed: boolean
  poisoned: boolean
  ident_done: boolean
}

export interface RoundResult {
  round: number
  votes: number[]
  allocations: Record<string, number[]> | null // 線上籌碼：每人投給各獸首的枚數
  first: number // 欄位 0..3，得票第一（不公開真假）
  second: number // 得票第二（公開真假）
  second_genuine: boolean
}

export interface FinalResult {
  genuine_selected: number
  boss_votes: Record<string, number>
  boss_required: number
  boss_target: string | null
  boss_found: boolean
  xu_found: boolean
  fang_found: boolean
  score: number
  winner: Faction
}

export interface GameState {
  seats: string[]
  role_pool: Role[]
  roles: Record<string, Role>
  ready: string[]

  heads: number[] // 12 個位置對應的生肖
  genuine: boolean[]
  huang_fail_round: number
  kido_fail_round: number
  yao_lai_controlled: boolean
  director_sees: Role

  stage: Stage
  round: number
  turn_orders: string[][]
  turn: TurnState | null

  ambush_pending: Record<string, number>
  poison_pending: Record<string, number>
  poison_used: number
  swap_rounds: boolean[]
  blocked: number[]
  fang_checked: string[]
  records: Record<string, IdentRecord[]>
  skills: SkillEvent[]

  chip_balance: Record<string, number>
  chip_votes: Record<string, number[]>
  round_results: RoundResult[]
  people_votes: Record<string, string>
  final: FinalResult | null
}

export interface Room {
  code: string
  host_id: string
  players: PlayerInfo[]
  settings: Settings
  game: GameState | null
  created_at: number // 毫秒
  updated_at: number
  games_played: number
}

export function playerWith(g: GameState, role: Role): string | null {
  for (const [pid, r] of Object.entries(g.roles)) {
    if (r === role) return pid
  }
  return null
}

export function findPlayer(room: Room, pid: string): PlayerInfo | undefined {
  return room.players.find((p) => p.id === pid)
}

export function playerByToken(room: Room, token: string): PlayerInfo | undefined {
  return room.players.find((p) => p.token === token)
}
