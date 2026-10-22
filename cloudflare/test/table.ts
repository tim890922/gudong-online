import { parseAction } from '../src/engine/actions'
import { GameError } from '../src/engine/errors'
import { applyAction } from '../src/engine/game'
import { defaultSettings, playerWith, type GameState, type IdentRecord, type Room, type Settings } from '../src/engine/models'
import type { Rng } from '../src/engine/rng'
import { Role } from '../src/engine/roles'

/** 固定種子的亂數（mulberry32），讓測試可以重現 */
export function seeded(seed: number): Rng {
  let a = seed >>> 0
  return {
    random() {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
    },
  }
}

export type ActionInput = { type: string } & Record<string, unknown>

/** 測試用：一張已經開局的桌子，可以指定角色與獸首真假。 */
export class Table {
  rng: Rng
  room: Room

  constructor(n = 8, roles: Role[] | null = null, opts: { seed?: number } & Partial<Settings> = {}) {
    const { seed = 0, ...settings } = opts
    this.rng = seeded(seed)
    this.room = {
      code: 'TEST',
      host_id: 'p0',
      players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, token: `t${i}`, name: `P${i}`, color: null })),
      settings: { ...defaultSettings(), ...settings },
      game: null,
      created_at: 0,
      updated_at: 0,
      games_played: 0,
    }
    this.act('p0', { type: 'start_game' })
    if (roles !== null) {
      this.g.roles = Object.fromEntries(this.g.seats.map((p, i) => [p, roles[i]]))
    }
  }

  get g(): GameState {
    return this.room.game!
  }

  act(pid: string, action: ActionInput): void {
    const parsed = parseAction(action)
    if (!parsed) throw new Error(`操作格式不正確：${JSON.stringify(action)}`)
    applyAction(this.room, pid, parsed, this.rng)
  }

  fails(pid: string, action: ActionInput): string {
    try {
      this.act(pid, action)
    } catch (e) {
      if (e instanceof GameError) return e.message
      throw e
    }
    throw new Error(`預期 ${JSON.stringify(action)} 會失敗`)
  }

  who(role: Role): string {
    const pid = playerWith(this.g, role)
    if (pid === null) throw new Error(`沒有 ${role}`)
    return pid
  }

  start(first?: string): void {
    if (first !== undefined) this.room.settings.first_player_id = first
    for (const pid of this.g.seats) this.act(pid, { type: 'ready' })
  }

  pos(slot: number, rnd?: number): number {
    return (rnd ?? this.g.round) * 4 + slot
  }

  /** 從技能步驟開始，完成這一回合並傳給下一位。 */
  turnDone(pid: string, nextPid: string | null, skill: Record<string, unknown> = { kind: 'none' }): void {
    this.act(pid, { type: 'advance' })
    this.act(pid, { type: 'use_skill', ...skill })
    this.act(pid, { type: 'pass_to', target: nextPid })
  }

  last(pid: string): IdentRecord {
    return this.g.records[pid].at(-1)!
  }
}

// 8 人標準配置，依座位 p0..p7
export const STANDARD_8: Role[] = [
  Role.XU_YUAN,
  Role.FANG_ZHEN,
  Role.HUANG_YANYAN,
  Role.KIDO_KANA,
  Role.LAO_CHAOFENG,
  Role.YAO_BURAN,
  Role.ZHENG_GUOQU,
  Role.JI_YUNFU,
]
