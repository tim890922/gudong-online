/** 玩家送來的操作：先驗證格式，格式不對就整個拒絕。 */

import { defaultSettings, type Settings } from './models'
import { ALL_ROLES, type Role } from './roles'

export type Action =
  | { type: 'set_profile'; name: string | null; color: number | null }
  | { type: 'update_settings'; settings: Settings }
  | { type: 'kick'; player_id: string }
  | { type: 'transfer_host'; player_id: string }
  | { type: 'leave' }
  | { type: 'start_game' }
  | { type: 'pick_role'; role: Role }
  | { type: 'ready' }
  | { type: 'identify_head'; pos: number }
  | { type: 'identify_player'; target: string }
  | { type: 'advance' }
  | {
      type: 'use_skill'
      kind: 'ambush' | 'poison' | 'block' | 'swap' | 'none'
      target: string | null
      pos: number | null
      swap: boolean | null
    }
  | { type: 'pass_to'; target: string | null }
  | { type: 'start_voting' }
  | { type: 'submit_host_votes'; votes: number[] }
  | { type: 'submit_chips'; alloc: number[] }
  | { type: 'next_round' }
  | { type: 'people_vote'; target: string }
  | { type: 'play_again' }
  | { type: 'abort_game' }

export type ActionType = Action['type']

class Invalid extends Error {}

type Obj = Record<string, unknown>

export function isObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(o: Obj, key: string): string {
  const v = o[key]
  if (typeof v !== 'string') throw new Invalid(key)
  return v
}

function optional<T>(o: Obj, key: string, read: (o: Obj, key: string) => T): T | null {
  return o[key] === undefined || o[key] === null ? null : read(o, key)
}

function int(o: Obj, key: string): number {
  const v = o[key]
  if (!Number.isSafeInteger(v)) throw new Invalid(key)
  return v as number
}

function bool(o: Obj, key: string): boolean {
  const v = o[key]
  if (typeof v !== 'boolean') throw new Invalid(key)
  return v
}

function intList(o: Obj, key: string): number[] {
  const v = o[key]
  if (!Array.isArray(v) || !v.every((x) => Number.isSafeInteger(x))) throw new Invalid(key)
  return v as number[]
}

function oneOf<T extends string>(o: Obj, key: string, allowed: readonly T[]): T {
  const v = str(o, key)
  if (!(allowed as readonly string[]).includes(v)) throw new Invalid(key)
  return v as T
}

/** 暱稱長度以字元計算（emoji 算一個字） */
export function charLength(s: string): number {
  return [...s].length
}

function profileName(o: Obj, key: string): string {
  const v = str(o, key)
  if (charLength(v) < 1 || charLength(v) > 12) throw new Invalid(key)
  return v
}

function settings(o: Obj, key: string): Settings {
  const v = o[key]
  if (!isObject(v)) throw new Invalid(key)
  // 沒給的欄位用預設值，多出來的欄位忽略
  const s = defaultSettings()
  const has = (k: string) => v[k] !== undefined
  if (has('role_mode')) s.role_mode = oneOf(v, 'role_mode', ['random', 'manual'])
  if (has('vote_mode')) s.vote_mode = oneOf(v, 'vote_mode', ['host', 'chips'])
  if (has('fan_big_eye')) s.fan_big_eye = bool(v, 'fan_big_eye')
  if (has('fan_yao_lai')) s.fan_yao_lai = bool(v, 'fan_yao_lai')
  if (has('fan_director')) s.fan_director = bool(v, 'fan_director')
  if (has('fan_mo_yao')) s.fan_mo_yao = bool(v, 'fan_mo_yao')
  s.first_player_id = optional(v, 'first_player_id', str)
  if (has('allow_history')) s.allow_history = bool(v, 'allow_history')
  return s
}

const PARSERS: { [K in ActionType]: (o: Obj) => Extract<Action, { type: K }> } = {
  set_profile: (o) => ({
    type: 'set_profile',
    name: optional(o, 'name', profileName),
    color: optional(o, 'color', int),
  }),
  update_settings: (o) => ({ type: 'update_settings', settings: settings(o, 'settings') }),
  kick: (o) => ({ type: 'kick', player_id: str(o, 'player_id') }),
  transfer_host: (o) => ({ type: 'transfer_host', player_id: str(o, 'player_id') }),
  leave: () => ({ type: 'leave' }),
  start_game: () => ({ type: 'start_game' }),
  pick_role: (o) => ({ type: 'pick_role', role: oneOf(o, 'role', ALL_ROLES) }),
  ready: () => ({ type: 'ready' }),
  identify_head: (o) => ({ type: 'identify_head', pos: int(o, 'pos') }),
  identify_player: (o) => ({ type: 'identify_player', target: str(o, 'target') }),
  advance: () => ({ type: 'advance' }),
  use_skill: (o) => ({
    type: 'use_skill',
    kind: oneOf(o, 'kind', ['ambush', 'poison', 'block', 'swap', 'none']),
    target: optional(o, 'target', str),
    pos: optional(o, 'pos', int),
    swap: optional(o, 'swap', bool),
  }),
  pass_to: (o) => ({ type: 'pass_to', target: optional(o, 'target', str) }),
  start_voting: () => ({ type: 'start_voting' }),
  submit_host_votes: (o) => ({ type: 'submit_host_votes', votes: intList(o, 'votes') }),
  submit_chips: (o) => ({ type: 'submit_chips', alloc: intList(o, 'alloc') }),
  next_round: () => ({ type: 'next_round' }),
  people_vote: (o) => ({ type: 'people_vote', target: str(o, 'target') }),
  play_again: () => ({ type: 'play_again' }),
  abort_game: () => ({ type: 'abort_game' }),
}

/** 格式不正確時回傳 null */
export function parseAction(raw: unknown): Action | null {
  if (!isObject(raw) || typeof raw.type !== 'string' || !Object.hasOwn(PARSERS, raw.type)) {
    return null
  }
  try {
    return PARSERS[raw.type as ActionType](raw)
  } catch (e) {
    if (e instanceof Invalid) return null
    throw e
  }
}
