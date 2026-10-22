// 對應後端 app/engine/views.py 的輸出
export type RoleId =
  | 'xu_yuan'
  | 'fang_zhen'
  | 'huang_yanyan'
  | 'kido_kana'
  | 'lao_chaofeng'
  | 'yao_buran'
  | 'zheng_guoqu'
  | 'ji_yunfu'
  | 'big_eye'
  | 'yao_lai'
  | 'director_liu'
  | 'mo_yao_buran'
export type Faction = 'good' | 'bad'
export type Stage = 'roles' | 'acting' | 'discussion' | 'voting' | 'vote_result' | 'people_vote' | 'ended'
export type Phase = 'lobby' | Stage
export type Outcome = 'genuine' | 'fake' | 'unknown' | 'ambushed' | 'good' | 'bad'
export type SkillKind = 'ambush' | 'poison' | 'block' | 'swap'

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

export interface PlayerView {
  id: string
  name: string
  color: number | null
  connected: boolean
}

export interface IdentRecord {
  round: number
  kind: 'head' | 'player'
  pos: number | null
  target: string | null
  outcome: Outcome
}

export interface RoundResult {
  round: number
  votes: number[]
  allocations: Record<string, number[]> | null
  first: number
  second: number
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

export interface HeadTarget {
  pos: number
  round: number
  label: string
}

export interface TurnView {
  step: 'identify' | 'skill' | 'pass'
  ident_kind: 'head' | 'player' | 'big_eye'
  ident_done: boolean
  ambushed: boolean
  attempted: number[]
  results: IdentRecord[]
  uses: Record<string, number>
  used?: Record<string, number>
  head_targets?: HeadTarget[]
  player_targets?: string[]
  skill: SkillKind | null
  skill_targets?: { player_id: string; acted: boolean }[]
  poison_left?: number
  block_targets?: { pos: number; label: string }[]
  remaining?: string[]
}

export interface MeView {
  role: RoleId | null
  role_name: string | null
  faction: Faction | null
  known: { player_id: string; label: string }[]
  records: IdentRecord[]
  chip_balance: number
  my_chips: number[] | null
  people_vote: string | null
  people_vote_goal: RoleId | null
  forbidden_targets: string[]
  taken_roles?: RoleId[]
  turn: TurnView | null
}

export interface FinalView {
  roles: Record<string, RoleId>
  genuine: boolean[]
  people_votes: Record<string, string>
  result: FinalResult | null
  log: string[]
}

export interface GameView {
  stage: Stage
  round: number
  seats: string[]
  role_pool: RoleId[]
  heads: (number | null)[]
  turn_orders: string[][]
  current: string | null
  ready: string[]
  round_results: RoundResult[]
  chip_submitted: string[]
  people_voted: string[]
  me: MeView | null
  final: FinalView | null
}

export interface RoomView {
  code: string
  me: string
  host_id: string
  players: PlayerView[]
  settings: Settings
  phase: Phase
  games_played: number
  game: GameView | null
}

export interface RoleMeta {
  name: string
  faction: Faction
  description: string
  fan: boolean
  replaces: RoleId | null
  skill: SkillKind | null
  ident: 'head' | 'player' | 'big_eye'
}

export interface Meta {
  zodiac: string[]
  branches: string[]
  colors: string[]
  min_players: number
  max_players: number
  chips_per_round: number
  max_poison: number
  good_win_score: number
  roles: Record<RoleId, RoleMeta>
}

export interface Credentials {
  code: string
  player_id: string
  token: string
}
