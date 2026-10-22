/**
 * 用隨機機器人打完整局，每一步都檢查 view 有沒有洩漏資訊。
 *
 * 機器人只看自己的 view 決定下一步，順便驗證 view 提供的資訊足夠完成整局。
 */

import { describe, expect, test } from 'vitest'
import type { Settings } from '../src/engine/models'
import { choice, randrange, type Rng } from '../src/engine/rng'
import { Role } from '../src/engine/roles'
import { buildView } from '../src/engine/views'
import { Table, seeded } from './table'

const SECRET_KEYS = new Set([
  'genuine', 'true_value', 'reason', 'roles', 'ambush_pending', 'poison_pending',
  'swap_rounds', 'blocked', 'director_sees', 'yao_lai_controlled', 'huang_fail_round',
  'kido_fail_round', 'skills', 'chip_votes', 'people_votes', 'fang_checked', 'log', 'token',
])
const KNOWS_TEAMMATES = new Set<Role>([Role.LAO_CHAOFENG, Role.YAO_BURAN, Role.MO_YAO_BURAN, Role.DIRECTOR_LIU])

// 測試裡直接把 view 當成任意 JSON 讀
type Json = any

function allKeys(obj: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(obj)) {
    for (const v of obj) allKeys(v, acc)
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [k, v] of Object.entries(obj)) {
      acc.add(k)
      allKeys(v, acc)
    }
  }
  return acc
}

function viewOf(t: Table, pid: string): Json {
  return JSON.parse(JSON.stringify(buildView(t.room, pid)))
}

function checkNoLeak(t: Table): void {
  const g = t.g
  const publicParts: Json[] = []
  for (const p of g.seats) {
    const view = viewOf(t, p)
    const keys = allKeys(view)
    expect(keys.has('token')).toBe(false)
    if (g.stage === 'ended') continue
    expect([...keys].filter((k) => SECRET_KEYS.has(k))).toEqual([])
    const me = view.game.me
    expect(me.records.length).toBeLessThanOrEqual(g.records[p].length)
    if (!KNOWS_TEAMMATES.has(g.roles[p])) expect(me.known).toEqual([])
    expect(me.turn !== null).toBe(g.turn !== null && g.turn.player_id === p)
    delete view.me
    delete view.game.me
    publicParts.push(view)
  }
  // 公開區塊對每個人都必須一模一樣
  for (const part of publicParts.slice(1)) expect(part).toEqual(publicParts[0])
}

function botStep(t: Table, rng: Rng): void {
  const g = t.g
  const host = t.room.host_id
  const views: Record<string, Json> = Object.fromEntries(g.seats.map((p) => [p, viewOf(t, p).game]))
  switch (g.stage) {
    case 'roles':
      for (const p of g.seats) {
        if (g.ready.includes(p)) continue
        const me = views[p].me
        if (t.room.settings.role_mode === 'manual' && me.role === null) {
          const free = views[p].role_pool.filter((r: string) => !me.taken_roles.includes(r))
          t.act(p, { type: 'pick_role', role: choice(rng, free) })
        }
        t.act(p, { type: 'ready' })
        return
      }
      return
    case 'acting': {
      const p = views[host].current
      const turn = views[p].me.turn
      if (turn.step === 'identify') {
        if (turn.ident_done) {
          t.act(p, { type: 'advance' })
        } else if (turn.ident_kind === 'player') {
          t.act(p, { type: 'identify_player', target: choice(rng, turn.player_targets) })
        } else {
          const options = turn.head_targets
            .filter(
              (h: Json) =>
                !turn.attempted.includes(h.pos) &&
                (turn.used[String(h.round)] ?? 0) < turn.uses[String(h.round)],
            )
            .map((h: Json) => h.pos)
          t.act(p, { type: 'identify_head', pos: choice(rng, options) })
        }
      } else if (turn.step === 'skill') {
        const skill = turn.skill
        if ((skill === 'ambush' || skill === 'poison') && rng.random() < 0.7) {
          const target = choice<Json>(rng, turn.skill_targets).player_id
          t.act(p, { type: 'use_skill', kind: skill, target })
        } else if (skill === 'block' && rng.random() < 0.7) {
          t.act(p, { type: 'use_skill', kind: 'block', pos: choice<Json>(rng, turn.block_targets).pos })
        } else if (skill === 'swap') {
          t.act(p, { type: 'use_skill', kind: 'swap', swap: rng.random() < 0.5 })
        } else {
          t.act(p, { type: 'use_skill', kind: 'none' })
        }
      } else {
        const remaining = turn.remaining
        t.act(p, { type: 'pass_to', target: remaining.length ? choice(rng, remaining) : null })
      }
      return
    }
    case 'discussion':
      t.act(host, { type: 'start_voting' })
      return
    case 'voting':
      if (t.room.settings.vote_mode === 'host') {
        t.act(host, { type: 'submit_host_votes', votes: [0, 1, 2, 3].map(() => randrange(rng, 6)) })
        return
      }
      for (const p of g.seats) {
        if (views[p].chip_submitted.includes(p)) continue
        const balance = views[p].me.chip_balance
        const spend = g.round === 2 ? balance : randrange(rng, balance + 1)
        const alloc = [0, 0, 0, 0]
        for (let i = 0; i < spend; i++) alloc[randrange(rng, 4)] += 1
        t.act(p, { type: 'submit_chips', alloc })
        return
      }
      return
    case 'vote_result':
      t.act(host, { type: 'next_round' })
      return
    case 'people_vote':
      for (const p of g.seats) {
        const me = views[p].me
        if (me.people_vote !== null) continue
        const options = g.seats.filter((x) => x !== p && !me.forbidden_targets.includes(x))
        t.act(p, { type: 'people_vote', target: choice(rng, options) })
        return
      }
      return
  }
}

const CONFIGS: ({ n: number } & Partial<Settings>)[] = [
  { n: 6 },
  { n: 7, vote_mode: 'chips' },
  { n: 8, role_mode: 'manual' },
  { n: 8, fan_big_eye: true, fan_mo_yao: true, vote_mode: 'chips' },
  { n: 8, fan_yao_lai: true, fan_director: true, role_mode: 'manual' },
  { n: 6, fan_director: true, fan_mo_yao: true, allow_history: false },
]

describe('隨機機器人打完整局都不會洩漏資訊', () => {
  for (const { n, ...settings } of CONFIGS) {
    test.each([0, 1, 2, 3, 4, 5, 6, 7])(`${JSON.stringify({ n, ...settings })} seed=%i`, (seed) => {
      const t = new Table(n, null, { seed, ...settings })
      const rng = seeded(seed * 101 + n)
      for (let i = 0; i < 500; i++) {
        checkNoLeak(t)
        if (t.g.stage === 'ended') break
        botStep(t, rng)
      }
      expect(t.g.stage).toBe('ended')
      const final = viewOf(t, 'p0').game.final
      expect(final.result.score).toBe(t.g.final!.score)
      expect(final.log.length).toBeGreaterThan(10)
    })
  }
})
