import { describe, expect, test } from 'vitest'
import { BRANCHES, ZODIAC } from '../src/engine/constants'
import { forbiddenTargets } from '../src/engine/game'
import { Role as R, rolePool } from '../src/engine/roles'
import { buildView, knownPlayers } from '../src/engine/views'
import { STANDARD_8, Table } from './table'

const NO_FANS = { bigEye: false, yaoLai: false, director: false, moYao: false }

// ---------------------------------------------------------------- 開局

describe('開局', () => {
  test.each([
    [6, STANDARD_8.slice(0, 6)],
    [7, STANDARD_8.slice(0, 7)],
    [8, STANDARD_8],
  ])('%i 人的角色池', (n, expected) => {
    expect(rolePool(n, NO_FANS)).toEqual(expected)
  })

  test('粉絲角色替換', () => {
    const pool = rolePool(8, { bigEye: true, yaoLai: false, director: true, moYao: true })
    expect(pool).toContain(R.BIG_EYE)
    expect(pool).not.toContain(R.JI_YUNFU)
    expect(pool).toContain(R.DIRECTOR_LIU)
    expect(pool).not.toContain(R.HUANG_YANYAN)
    expect(pool).toContain(R.MO_YAO_BURAN)
    expect(pool).not.toContain(R.YAO_BURAN)
    // 6 人局本來就沒有姬雲浮，大眼賊自然不會出現
    expect(rolePool(6, { ...NO_FANS, bigEye: true })).not.toContain(R.BIG_EYE)
  })

  test('發獸首與角色', () => {
    const t = new Table(8, null, { seed: 3 })
    const g = t.g
    expect([...g.heads].sort((a, b) => a - b)).toEqual([...Array(12).keys()])
    for (let r = 0; r < 3; r++) {
      const row = g.heads.slice(r * 4, (r + 1) * 4)
      expect(row).toEqual([...row].sort((a, b) => a - b))
      expect(g.genuine.slice(r * 4, (r + 1) * 4).filter(Boolean)).toHaveLength(2)
    }
    expect(Object.values(g.roles).sort()).toEqual([...g.role_pool].sort())
    expect(g.stage).toBe('roles')
  })

  test('至少要 6 人', () => {
    const t = new Table(6)
    t.room.game = null
    t.room.players = t.room.players.slice(0, 5)
    expect(t.fails('p0', { type: 'start_game' })).toContain('6–8')
  })

  test('只有房主可以開始', () => {
    const t = new Table(8)
    t.room.game = null
    expect(t.fails('p1', { type: 'start_game' })).toContain('房主')
  })

  test('輸入實體卡：不能重複選，全員準備後開始', () => {
    const t = new Table(6, null, { role_mode: 'manual' })
    expect(t.g.roles).toEqual({})
    t.act('p0', { type: 'pick_role', role: 'xu_yuan' })
    expect(t.fails('p1', { type: 'pick_role', role: 'xu_yuan' })).toContain('已經有人選')
    expect(t.fails('p1', { type: 'ready' })).toContain('請先選擇')
    t.g.seats.slice(1).forEach((pid, i) => t.act(pid, { type: 'pick_role', role: STANDARD_8[i + 1] }))
    for (const pid of t.g.seats) t.act(pid, { type: 'ready' })
    expect(t.g.stage).toBe('acting')
    expect(t.g.turn).not.toBeNull()
  })
})

// ---------------------------------------------------------------- 鑑定

describe('鑑定', () => {
  test('許願鑑定兩件', () => {
    const t = new Table(8, STANDARD_8)
    const xu = t.who(R.XU_YUAN)
    t.start(xu)
    t.act(xu, { type: 'identify_head', pos: 0 })
    expect(t.g.turn!.ident_done).toBe(false)
    expect(t.fails(xu, { type: 'identify_head', pos: 0 })).toContain('不能鑑定') // 同一件不能鑑兩次
    t.act(xu, { type: 'identify_head', pos: 1 })
    expect(t.g.turn!.ident_done).toBe(true)
    const outcomes = t.g.records[xu].map((r) => r.outcome)
    expect(outcomes).toEqual([0, 1].map((i) => (t.g.genuine[i] ? 'genuine' : 'fake')))
    expect(t.fails(xu, { type: 'identify_head', pos: 2 })).toContain('用完')
  })

  test('其他人鑑定一件，不能碰別的回合', () => {
    const t = new Table(8, STANDARD_8)
    const huang = t.who(R.HUANG_YANYAN)
    t.g.huang_fail_round = 2
    t.start(huang)
    expect(t.fails(huang, { type: 'identify_head', pos: 5 })).toContain('不能鑑定')
    t.act(huang, { type: 'identify_head', pos: 3 })
    expect(t.g.turn!.ident_done).toBe(true)
  })

  test('老朝奉只影響之後行動、而且會被影響的角色', () => {
    const t = new Table(8, STANDARD_8)
    const [xu, lao, ji, huang] = [R.XU_YUAN, R.LAO_CHAOFENG, R.JI_YUNFU, R.HUANG_YANYAN].map((r) => t.who(r))
    t.g.huang_fail_round = 2
    t.start(huang)
    t.act(huang, { type: 'identify_head', pos: 0 }) // 老朝奉之前：結果正確
    expect(t.last(huang).outcome).toBe(t.g.genuine[0] ? 'genuine' : 'fake')
    t.turnDone(huang, lao)

    t.act(lao, { type: 'identify_head', pos: 1 })
    t.turnDone(lao, xu, { kind: 'swap', swap: true })

    t.act(xu, { type: 'identify_head', pos: 0 })
    t.act(xu, { type: 'identify_head', pos: 1 })
    for (const rec of t.g.records[xu]) {
      expect(rec.outcome).toBe(t.g.genuine[rec.pos!] ? 'fake' : 'genuine')
      expect(rec.reason).toBe('swapped')
    }
    t.turnDone(xu, ji)

    t.act(ji, { type: 'identify_head', pos: 2 }) // 姬雲浮不受影響
    expect(t.last(ji).outcome).toBe(t.g.genuine[2] ? 'genuine' : 'fake')
  })

  test('老朝奉的效果只在當回合', () => {
    const t = new Table(8, STANDARD_8)
    const xu = t.who(R.XU_YUAN)
    t.g.swap_rounds = [true, false, false]
    t.g.round = 1
    t.g.turn_orders = [[], []]
    t.start(xu)
    t.act(xu, { type: 'identify_head', pos: t.pos(0) })
    expect(t.last(xu).outcome).toBe(t.g.genuine[t.pos(0)] ? 'genuine' : 'fake')
  })

  test('偷襲讓下一次鑑定失敗，當回合不能用技能', () => {
    const t = new Table(8, STANDARD_8)
    const [yao, zheng] = [t.who(R.YAO_BURAN), t.who(R.ZHENG_GUOQU)]
    t.start(yao)
    t.act(yao, { type: 'identify_head', pos: 0 })
    t.turnDone(yao, zheng, { kind: 'ambush', target: zheng })

    t.act(zheng, { type: 'identify_head', pos: 1 })
    expect(t.last(zheng).outcome).toBe('ambushed')
    expect(t.g.turn!.ambushed && t.g.turn!.ident_done).toBe(true)
    t.act(zheng, { type: 'advance' })
    expect(t.fails(zheng, { type: 'use_skill', kind: 'block', pos: 2 })).toContain('不能使用')
    t.act(zheng, { type: 'use_skill', kind: 'none' })
    expect(t.g.ambush_pending[zheng]).toBe(0)
  })

  test('偷襲方震時許願也被偷襲', () => {
    const t = new Table(8, STANDARD_8)
    const [yao, fang, xu] = [t.who(R.YAO_BURAN), t.who(R.FANG_ZHEN), t.who(R.XU_YUAN)]
    t.start(yao)
    t.act(yao, { type: 'identify_head', pos: 0 })
    t.turnDone(yao, fang, { kind: 'ambush', target: fang })
    expect(t.g.ambush_pending[xu]).toBe(1)

    t.act(fang, { type: 'identify_player', target: xu })
    expect(t.last(fang).outcome).toBe('ambushed')
    expect(t.g.fang_checked).not.toContain(xu) // 被偷襲的查驗不算查過
    t.turnDone(fang, xu)
    t.act(xu, { type: 'identify_head', pos: 0 })
    expect(t.last(xu).outcome).toBe('ambushed')
    expect(t.g.turn!.ident_done).toBe(true) // 許願被偷襲後第二次也不能鑑
  })

  test('姬雲浮被偷襲後永久無法鑑定', () => {
    const t = new Table(8, STANDARD_8)
    const [yao, ji] = [t.who(R.YAO_BURAN), t.who(R.JI_YUNFU)]
    t.start(yao)
    t.act(yao, { type: 'identify_head', pos: 0 })
    t.turnDone(yao, ji, { kind: 'ambush', target: ji })
    t.act(ji, { type: 'identify_head', pos: 1 })
    expect(t.last(ji).outcome).toBe('ambushed')
    expect(t.g.ambush_pending[ji]).toBeGreaterThan(50)
  })

  test('封鎖讓之後的人無法辨別', () => {
    const t = new Table(8, STANDARD_8)
    const [zheng, xu] = [t.who(R.ZHENG_GUOQU), t.who(R.XU_YUAN)]
    t.start(zheng)
    t.act(zheng, { type: 'identify_head', pos: 0 })
    t.turnDone(zheng, xu, { kind: 'block', pos: 2 })
    t.act(xu, { type: 'identify_head', pos: 2 })
    t.act(xu, { type: 'identify_head', pos: 3 })
    expect(t.g.records[xu][0].outcome).toBe('unknown')
    expect(['genuine', 'fake']).toContain(t.g.records[xu][1].outcome)
  })

  test('只能封鎖本回合', () => {
    const t = new Table(8, STANDARD_8)
    const zheng = t.who(R.ZHENG_GUOQU)
    t.start(zheng)
    t.act(zheng, { type: 'identify_head', pos: 0 })
    t.act(zheng, { type: 'advance' })
    expect(t.fails(zheng, { type: 'use_skill', kind: 'block', pos: 7 })).toContain('本回合')
  })

  test('黃煙煙、木戶加奈的無法鑑定回合', () => {
    const t = new Table(8, STANDARD_8)
    const huang = t.who(R.HUANG_YANYAN)
    t.g.huang_fail_round = 0
    t.start(huang)
    t.act(huang, { type: 'identify_head', pos: 0 })
    expect(t.last(huang).outcome).toBe('unknown')
    expect(t.last(huang).reason).toBe('sealed')
  })

  test('劉局只有第一回合能鑑定，並知道一個人', () => {
    const roles = [...STANDARD_8]
    roles[2] = R.DIRECTOR_LIU
    const t = new Table(8, roles)
    const liu = t.who(R.DIRECTOR_LIU)
    const known = knownPlayers(t.g, liu)
    expect(known).toHaveLength(1)
    expect(known[0].player_id).toBe(t.who(t.g.director_sees))
    expect(known[0].label).toBe('許願或方震')
    t.g.round = 1
    t.g.turn_orders = [[], []]
    t.start(liu)
    t.act(liu, { type: 'identify_head', pos: t.pos(0) })
    expect(t.last(liu).reason).toBe('sealed')
  })

  test('毒會顛倒，並和老朝奉疊加', () => {
    const roles = [...STANDARD_8]
    roles[5] = R.MO_YAO_BURAN
    const t = new Table(8, roles)
    const [mo, lao, xu] = [t.who(R.MO_YAO_BURAN), t.who(R.LAO_CHAOFENG), t.who(R.XU_YUAN)]
    t.start(mo)
    t.act(mo, { type: 'identify_head', pos: 0 })
    t.turnDone(mo, lao, { kind: 'poison', target: xu })
    t.act(lao, { type: 'identify_head', pos: 0 })
    t.turnDone(lao, xu, { kind: 'swap', swap: true })
    t.act(xu, { type: 'identify_head', pos: 0 })
    t.act(xu, { type: 'identify_head', pos: 1 })
    for (const rec of t.g.records[xu]) {
      // 老朝奉 + 毒：負負得正
      expect(rec.outcome).toBe(t.g.genuine[rec.pos!] ? 'genuine' : 'fake')
      expect(rec.reason).toBe('swapped,poisoned')
    }
    expect(t.g.poison_used).toBe(1)
  })

  test('毒的次數上限與特殊對象', () => {
    const roles = [...STANDARD_8]
    roles[5] = R.MO_YAO_BURAN
    const t = new Table(8, roles)
    const [mo, fang, ji, xu] = [R.MO_YAO_BURAN, R.FANG_ZHEN, R.JI_YUNFU, R.XU_YUAN].map((r) => t.who(r))
    t.start(mo)
    t.act(mo, { type: 'identify_head', pos: 0 })
    t.act(mo, { type: 'advance' })
    t.act(mo, { type: 'use_skill', kind: 'poison', target: fang })
    expect(t.g.poison_pending[xu]).toBe(1)
    t.g.turn!.step = 'skill'
    t.act(mo, { type: 'use_skill', kind: 'poison', target: ji })
    expect(t.g.ambush_pending[ji]).toBeGreaterThan(50)
    expect(t.g.poison_pending).not.toHaveProperty(ji)
    t.g.turn!.step = 'skill'
    expect(t.fails(mo, { type: 'use_skill', kind: 'poison', target: xu })).toContain('不能使用')
  })

  test('大眼賊看到前後回合的位置編號', () => {
    const roles = [...STANDARD_8]
    roles[7] = R.BIG_EYE
    const t = new Table(8, roles)
    const eye = t.who(R.BIG_EYE)
    t.start(eye)
    const turn = turnOf(t, eye)
    const labels = (turn.head_targets as { label: string }[]).map((h) => h.label)
    expect(labels).toEqual(BRANCHES.slice(4, 8)) // 第一回合鑑定第二回合（辰巳午未）
    expect(t.fails(eye, { type: 'identify_head', pos: 0 })).toContain('不能鑑定')
    t.act(eye, { type: 'identify_head', pos: 5 })
    expect(t.g.turn!.ident_done).toBe(true)
    expect(t.last(eye).outcome).toBe(t.g.genuine[5] ? 'genuine' : 'fake')
  })

  test('大眼賊在中間回合鑑定兩件，不受老朝奉影響', () => {
    const roles = [...STANDARD_8]
    roles[7] = R.BIG_EYE
    const t = new Table(8, roles)
    const eye = t.who(R.BIG_EYE)
    t.g.round = 1
    t.g.turn_orders = [[], []]
    t.g.swap_rounds = [true, true, true]
    t.start(eye)
    t.act(eye, { type: 'identify_head', pos: 1 })
    expect(t.g.turn!.ident_done).toBe(false)
    expect(t.fails(eye, { type: 'identify_head', pos: 2 })).toContain('不能鑑定')
    t.act(eye, { type: 'identify_head', pos: 10 })
    expect(t.g.turn!.ident_done).toBe(true)
    for (const rec of t.g.records[eye]) {
      expect(rec.outcome).toBe(t.g.genuine[rec.pos!] ? 'genuine' : 'fake')
    }
  })

  test('方震查驗陣營；查驗大眼賊視同偷襲', () => {
    const roles = [...STANDARD_8]
    roles[7] = R.BIG_EYE
    const t = new Table(8, roles)
    const [fang, eye, lao] = [t.who(R.FANG_ZHEN), t.who(R.BIG_EYE), t.who(R.LAO_CHAOFENG)]
    t.start(fang)
    expect(t.fails(fang, { type: 'identify_player', target: fang })).toContain('其他玩家')
    t.act(fang, { type: 'identify_player', target: eye })
    expect(t.last(fang).outcome).toBe('good')
    expect(t.g.ambush_pending[eye]).toBe(1)
    t.turnDone(fang, lao)
    t.act(lao, { type: 'identify_head', pos: 0 })
    t.turnDone(lao, eye)
    t.act(eye, { type: 'identify_head', pos: 4 })
    expect(t.last(eye).outcome).toBe('ambushed')
  })

  test('方震不能重複查驗同一人', () => {
    const t = new Table(8, STANDARD_8)
    const [fang, lao] = [t.who(R.FANG_ZHEN), t.who(R.LAO_CHAOFENG)]
    t.g.fang_checked = [lao]
    t.start(fang)
    expect(t.fails(fang, { type: 'identify_player', target: lao })).toContain('查驗過')
  })

  test('藥來被控制時一定錯，而且不受其他效果影響', () => {
    const roles = [...STANDARD_8]
    roles[7] = R.YAO_LAI
    const t = new Table(8, roles)
    const lai = t.who(R.YAO_LAI)
    t.g.yao_lai_controlled = true
    t.g.swap_rounds = [true, true, true]
    t.g.poison_pending[lai] = 1
    t.start(lai)
    t.act(lai, { type: 'identify_head', pos: 0 })
    expect(t.last(lai).outcome).toBe(t.g.genuine[0] ? 'fake' : 'genuine')
    expect(t.last(lai).reason).toBe('controlled')
  })
})

// ---------------------------------------------------------------- 行動順序

function turnOf(t: Table, pid: string): Record<string, unknown> {
  const view = buildView(t.room, pid) as { game: { me: { turn: Record<string, unknown> } } }
  return view.game.me.turn
}

function playRoundQuickly(t: Table, order: string[]): void {
  order.forEach((pid, i) => {
    expect(t.g.turn!.player_id).toBe(pid)
    if (t.g.roles[pid] === R.FANG_ZHEN) {
      const target = t.g.seats.find((p) => p !== pid && !t.g.fang_checked.includes(p))
      t.act(pid, { type: 'identify_player', target })
    } else {
      const tv = turnOf(t, pid) as {
        head_targets: { pos: number; round: number }[]
        uses: Record<string, number>
      }
      while (!t.g.turn!.ident_done) {
        const turn = t.g.turn!
        const pos = tv.head_targets.find(
          (h) => !turn.attempted.includes(h.pos) && (turn.used[h.round] ?? 0) < tv.uses[String(h.round)],
        )!.pos
        t.act(pid, { type: 'identify_head', pos })
      }
    }
    t.turnDone(pid, order[i + 1] ?? null)
  })
}

describe('行動順序', () => {
  test('依指定順序傳遞，最後一位成為下回合首家', () => {
    const t = new Table(6, STANDARD_8.slice(0, 6))
    t.start('p2')
    playRoundQuickly(t, ['p2', 'p0', 'p5', 'p1', 'p4', 'p3'])
    expect(t.g.stage).toBe('discussion')
    t.act('p0', { type: 'start_voting' })
    t.act('p0', { type: 'submit_host_votes', votes: [3, 1, 1, 0] })
    t.act('p0', { type: 'next_round' })
    expect(t.g.round).toBe(1)
    expect(t.g.turn!.player_id).toBe('p3')
  })

  test('不能傳給已經行動過的人', () => {
    const t = new Table(6, STANDARD_8.slice(0, 6))
    t.start('p0')
    t.act('p0', { type: 'identify_head', pos: 0 })
    t.act('p0', { type: 'identify_head', pos: 1 })
    t.act('p0', { type: 'advance' })
    t.act('p0', { type: 'use_skill', kind: 'none' })
    expect(t.fails('p0', { type: 'pass_to', target: 'p0' })).toContain('還沒行動')
  })
})

// ---------------------------------------------------------------- 投票

function finishActing(t: Table, first = 'p0'): void {
  playRoundQuickly(t, [first, ...t.g.seats.filter((p) => p !== first)])
}

describe('投票', () => {
  test('房主輸入票數，同票依生肖順序', () => {
    const t = new Table(6, STANDARD_8.slice(0, 6))
    t.start('p0')
    finishActing(t)
    expect(t.fails('p1', { type: 'start_voting' })).toContain('房主')
    t.act('p0', { type: 'start_voting' })
    t.act('p0', { type: 'submit_host_votes', votes: [1, 3, 3, 0] })
    const res = t.g.round_results[0]
    expect([res.first, res.second]).toEqual([1, 2]) // 同票時生肖順序靠前者優先
    expect(res.second_genuine).toBe(t.g.genuine[2])
    expect(t.g.stage).toBe('vote_result')
  })

  test('線上籌碼會累積，投完後公開分配', () => {
    const t = new Table(6, STANDARD_8.slice(0, 6), { vote_mode: 'chips' })
    t.start('p0')
    finishActing(t)
    t.act('p0', { type: 'start_voting' })
    expect(t.fails('p1', { type: 'submit_chips', alloc: [3, 0, 0, 0] })).toContain('只有 2 枚')
    t.act('p1', { type: 'submit_chips', alloc: [0, 0, 0, 0] }) // 保留到下回合
    const view = (buildView(t.room, 'p2') as { game: Record<string, unknown> }).game
    expect(view.chip_submitted).toEqual(['p1'])
    expect(view.round_results).toEqual([]) // 還沒全部投完，不公開
    for (const p of t.g.seats) {
      if (p !== 'p1') t.act(p, { type: 'submit_chips', alloc: [1, 1, 0, 0] })
    }
    const res = t.g.round_results[0]
    expect(res.votes).toEqual([5, 5, 0, 0])
    expect(res.allocations!.p1).toEqual([0, 0, 0, 0])
    expect(t.g.chip_balance.p1).toBe(2)
    t.act('p0', { type: 'next_round' })
    finishActing(t, t.g.turn!.player_id)
    t.act('p0', { type: 'start_voting' })
    expect(t.g.chip_balance.p1).toBe(4)
  })

  test('最後一回合必須投完', () => {
    const t = new Table(6, STANDARD_8.slice(0, 6), { vote_mode: 'chips' })
    t.g.round = 2
    t.g.turn_orders = [[], [], []]
    t.start('p0')
    finishActing(t)
    t.act('p0', { type: 'start_voting' })
    expect(t.fails('p1', { type: 'submit_chips', alloc: [1, 0, 0, 0] })).toContain('全部投出')
    t.act('p1', { type: 'submit_chips', alloc: [1, 1, 0, 0] })
  })
})

// ---------------------------------------------------------------- 鑑人與計分

function toPeopleVote(t: Table): void {
  t.start('p0')
  for (let i = 0; i < 3; i++) {
    finishActing(t, t.g.turn!.player_id)
    t.act('p0', { type: 'start_voting' })
    t.act('p0', { type: 'submit_host_votes', votes: [0, 0, 0, 0] })
    t.act('p0', { type: 'next_round' })
  }
  expect(t.g.stage).toBe('people_vote')
}

describe('鑑人與計分', () => {
  test('隊友不能互投', () => {
    const t = new Table(8, STANDARD_8)
    toPeopleVote(t)
    const [lao, yao] = [t.who(R.LAO_CHAOFENG), t.who(R.YAO_BURAN)]
    expect(t.fails(lao, { type: 'people_vote', target: yao })).toContain('隊友')
    expect(t.fails(yao, { type: 'people_vote', target: lao })).toContain('隊友')
  })

  test('許願陣營獲勝的計分', () => {
    const t = new Table(8, STANDARD_8)
    toPeopleVote(t)
    const g = t.g
    const [lao, yao, xu, fang, zheng] = [R.LAO_CHAOFENG, R.YAO_BURAN, R.XU_YUAN, R.FANG_ZHEN, R.ZHENG_GUOQU].map(
      (r) => t.who(r),
    )
    for (const p of g.seats) {
      if (p === lao) t.act(p, { type: 'people_vote', target: fang }) // 沒找到許願
      else if (p === yao) t.act(p, { type: 'people_vote', target: xu }) // 沒找到方震
      else if (p === zheng) t.act(p, { type: 'people_vote', target: xu })
      else t.act(p, { type: 'people_vote', target: lao })
    }
    const f = g.final!
    expect(g.stage).toBe('ended')
    expect(f.boss_found && !f.xu_found && !f.fang_found).toBe(true)
    expect(f.boss_votes).toEqual({ [lao]: 5 })
    expect(f.score).toBe(f.genuine_selected + 1 + 2 + 1)
    expect(f.winner).toBe(f.score >= 6 ? 'good' : 'bad')
  })

  test('找老朝奉需要唯一最高票且過半', () => {
    const t = new Table(6, STANDARD_8.slice(0, 6))
    toPeopleVote(t)
    const g = t.g
    const [lao, yao] = [t.who(R.LAO_CHAOFENG), t.who(R.YAO_BURAN)]
    const good = g.seats.filter((p) => p !== lao && p !== yao) // 4 位好人，需要 3 票
    const votes: Record<string, string> = { [good[0]]: lao, [good[1]]: lao, [good[2]]: yao, [good[3]]: yao }
    for (const p of g.seats) t.act(p, { type: 'people_vote', target: votes[p] ?? good[0] })
    expect(g.final!.boss_required).toBe(3)
    expect(g.final!.boss_target).toBeNull()
    expect(g.final!.boss_found).toBe(false)
  })

  test('再來一局回到大廳', () => {
    const t = new Table(6, STANDARD_8.slice(0, 6))
    toPeopleVote(t)
    for (const p of t.g.seats) {
      const target = t.g.seats.find((x) => x !== p && !forbiddenTargets(t.g, p).includes(x))
      t.act(p, { type: 'people_vote', target })
    }
    t.act('p0', { type: 'play_again' })
    expect(t.room.game).toBeNull()
    expect(t.room.games_played).toBe(1)
  })
})

test('生肖與地支各 12 個', () => {
  expect(ZODIAC).toHaveLength(12)
  expect(BRANCHES).toHaveLength(12)
})
