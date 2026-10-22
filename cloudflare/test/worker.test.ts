/**
 * 在本機 workerd 跑整個 Worker（含 Durable Object 與前端靜態檔），用真的 HTTP 和 WebSocket 測。
 * 需要先 build 前端（cd ../frontend && npm run build）。
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { unstable_startWorker } from 'wrangler'

type Json = any
type Worker = Awaited<ReturnType<typeof unstable_startWorker>>

const persistDir = mkdtempSync(join(tmpdir(), 'gudong-test-'))
let worker: Worker
let base: URL

async function start(): Promise<void> {
  worker = await unstable_startWorker({
    config: 'wrangler.jsonc',
    bindings: { PUBLIC_BASE_URL: { type: 'plain_text', value: 'https://game.example.com/' } },
    dev: { server: { port: 0 }, inspector: false, persist: persistDir, logLevel: 'warn' },
  })
  base = await worker.url
}

beforeAll(start, 60_000)
afterAll(async () => {
  await worker.dispose()
  rmSync(persistDir, { recursive: true, force: true })
})

function get(path: string): Promise<Response> {
  return fetch(new URL(path, base))
}

function post(path: string, body: unknown): Promise<Response> {
  return fetch(new URL(path, base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function create(name = '房主'): Promise<Json> {
  const r = await post('/api/rooms', { name })
  expect(r.status).toBe(200)
  return r.json()
}

function join_(code: string, name: string): Promise<Response> {
  return post(`/api/rooms/${code}/join`, { name })
}

/** 測試用的手機：收訊息、等待特定訊息、送操作。 */
interface Phone {
  ws: WebSocket
  closed: Promise<number>
  next(pred?: (m: Json) => boolean): Promise<Json>
  state(pred?: (view: Json) => boolean): Promise<Json>
  act(action: Json): void
}

async function phone(code: string, token: string): Promise<Phone> {
  const url = new URL(`/ws/${code}?token=${encodeURIComponent(token)}`, base)
  url.protocol = 'ws:'
  const ws = new WebSocket(url)
  const inbox: Json[] = []
  ws.addEventListener('message', (e) => inbox.push(JSON.parse(String(e.data))))
  const closed = new Promise<number>((resolve) => ws.addEventListener('close', (e) => resolve(e.code)))
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })

  async function next(pred: (m: Json) => boolean = () => true): Promise<Json> {
    const deadline = Date.now() + 5000
    for (;;) {
      const i = inbox.findIndex(pred)
      if (i >= 0) return inbox.splice(0, i + 1)[i]
      if (Date.now() > deadline) throw new Error(`等不到訊息，目前收到：${JSON.stringify(inbox)}`)
      await new Promise((r) => setTimeout(r, 20))
    }
  }
  return {
    ws,
    closed,
    next,
    state: async (pred = () => true) => (await next((m) => m.type === 'state' && pred(m.view))).view,
    act: (action) => ws.send(JSON.stringify({ type: 'action', action })),
  }
}

describe('REST', () => {
  test('health、config', async () => {
    expect(await (await get('/api/health')).json()).toEqual({ ok: true })
    expect((await (await get('/api/config')).json()).public_base_url).toBe('https://game.example.com')
  })

  test('meta', async () => {
    const meta = await (await get('/api/meta')).json()
    expect(meta.zodiac[0]).toBe('鼠')
    expect(meta.roles.xu_yuan.name).toBe('許願')
    expect(meta.roles.big_eye.replaces).toBe('ji_yunfu')
    expect(Object.keys(meta.roles)).toHaveLength(12)
  })

  test('建房與加入', async () => {
    const host = await create()
    const code = host.code
    expect(code).toMatch(/^[A-Z2-9]{4}$/)
    const summary = await (await get(`/api/rooms/${code.toLowerCase()}`)).json()
    expect(summary).toMatchObject({ exists: true, joinable: true, players: 1 })
    expect((await join_(code, '  阿明 ')).status).toBe(200)
    expect((await (await get('/api/rooms/ZZZZ')).json()).exists).toBe(false)
    expect((await (await get('/api/rooms/nope!')).json()).exists).toBe(false)
    expect((await join_('ZZZZ', 'x')).status).toBe(404)
    expect((await join_(code, '   ')).status).toBe(422)
    expect((await join_(code, '一二三四五六七八九十一二三')).status).toBe(422)
    expect((await post('/api/rooms', { nick: 'x' })).status).toBe(422)
  })

  test('房間滿了', async () => {
    const { code } = await create()
    for (let i = 0; i < 7; i++) expect((await join_(code, `p${i}`)).status).toBe(200)
    const r = await join_(code, '第九人')
    expect(r.status).toBe(409)
    expect((await r.json()).detail).toContain('已滿')
  })

  test('未知的 API 與方法', async () => {
    expect((await get('/api/nothing')).status).toBe(404)
    expect((await get('/api/rooms')).status).toBe(405)
  })
})

describe('WebSocket', () => {
  test('流程與私密 view', async () => {
    const host = await create()
    const code = host.code
    const others = await Promise.all([0, 1, 2, 3, 4].map(async (i) => (await join_(code, `玩家${i}`)).json()))
    const hws = await phone(code, host.token)
    const view = await hws.state()
    expect(view.phase).toBe('lobby')
    expect(view.me).toBe(host.player_id)
    const phones = await Promise.all(others.map((c: Json) => phone(code, c.token)))
    await hws.state((v) => v.players.filter((p: Json) => p.connected).length === 6)

    hws.ws.send('{"type":"ping"}') // runtime 自動回覆
    expect((await hws.next((m) => m.type === 'pong')).type).toBe('pong')
    hws.ws.send('{"type": "ping"}') // 格式不同時由物件自己回覆
    expect((await hws.next((m) => m.type === 'pong')).type).toBe('pong')

    // 非房主不能開始
    phones[0].act({ type: 'start_game' })
    const err = await phones[0].next((m) => m.type === 'error')
    expect(err.message).toContain('房主')
    phones[0].act({ type: 'identify_head', pos: 'x' })
    expect((await phones[0].next((m) => m.type === 'error')).message).toBe('操作格式不正確')

    hws.act({ type: 'start_game' })
    const started = await hws.state((v) => v.phase === 'roles')
    expect(started.game.me.role).not.toBeNull()
    const raw = JSON.stringify(started)
    expect(raw).not.toContain('genuine')
    expect(raw).not.toContain('token')
    // 每個人只看得到自己的角色
    const roles = await Promise.all(phones.map(async (p) => (await p.state((v) => v.phase === 'roles')).game.me.role))
    expect(new Set([started.game.me.role, ...roles]).size).toBe(6)
    for (const p of [hws, ...phones]) p.ws.close()
  })

  test('錯誤的 token 會被拒絕', async () => {
    const { code } = await create()
    const p = await phone(code, 'nope')
    expect((await p.next()).type).toBe('removed')
    expect(await p.closed).toBe(4004)
    const q = await phone('nope!', 'x')
    expect((await q.next()).type).toBe('removed')
  })

  // 由伺服器關閉 hibernation 的 WebSocket 時，本機 workerd 要約 10 秒才完成關閉握手；
  // 前端看的是 removed 訊息，不受影響
  test('被踢的人收到通知，其他人看到名單更新', { timeout: 20_000 }, async () => {
    const host = await create()
    const guest = await (await join_(host.code, '路人')).json()
    const hws = await phone(host.code, host.token)
    const gws = await phone(host.code, guest.token)
    await hws.state((v) => v.players.length === 2 && v.players.every((p: Json) => p.connected))
    hws.act({ type: 'kick', player_id: guest.player_id })
    expect((await gws.next((m) => m.type === 'removed')).message).toBe('你已離開房間')
    await hws.state((v) => v.players.length === 1)
    expect(await gws.closed).toBe(4001)
    hws.ws.close()
  })

  test('斷線會廣播給其他人', async () => {
    const host = await create()
    const guest = await (await join_(host.code, '路人')).json()
    const hws = await phone(host.code, host.token)
    const gws = await phone(host.code, guest.token)
    await hws.state((v) => v.players.every((p: Json) => p.connected))
    gws.ws.close()
    const view = await hws.state((v) => v.players.some((p: Json) => !p.connected))
    expect(view.players.find((p: Json) => p.id === guest.player_id).connected).toBe(false)
    hws.ws.close()
  })

  test('最後一個人離開，房間就消失', async () => {
    const host = await create()
    const hws = await phone(host.code, host.token)
    await hws.state()
    hws.act({ type: 'leave' })
    expect((await hws.next((m) => m.type === 'removed')).type).toBe('removed')
    expect((await (await get(`/api/rooms/${host.code}`)).json()).exists).toBe(false)
  })
})

test('重新啟動後房間還在', async () => {
  const host = await create()
  await join_(host.code, '第二人')
  await worker.dispose()
  await start()
  const summary = await (await get(`/api/rooms/${host.code}`)).json()
  expect(summary).toMatchObject({ exists: true, players: 2 })
  const p = await phone(host.code, host.token)
  expect((await p.state()).me).toBe(host.player_id)
  p.ws.close()
}, 60_000)

test('前端 SPA', async () => {
  const index = await (await get('/')).text()
  expect(index).toContain('<div id="app">')
  const js = index.match(/src="(\/assets\/[^"]+\.js)"/)![1]
  expect((await get(js)).headers.get('content-type')).toContain('javascript')
  expect(await (await get('/r/ABCD')).text()).toBe(index)
  expect(await (await get('/rules')).text()).toBe(index)
})
