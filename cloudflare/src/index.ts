/**
 * Worker 入口：REST API、把 WebSocket 轉給房間的 Durable Object，其餘交給靜態資源（前端）。
 */

import { charLength, isObject } from './engine/actions'
import {
  BRANCHES,
  CHIPS_PER_ROUND,
  COLORS,
  GOOD_WIN_SCORE,
  MAX_PLAYERS,
  MAX_POISON,
  MIN_PLAYERS,
  ZODIAC,
} from './engine/constants'
import { ROLE_INFO } from './engine/roles'
import type { Credentials } from './room'

export { GameRoom } from './room'

// 排除 0/O、1/I 這類容易看錯的字元
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 4
const CODE_PATTERN = new RegExp(`^[${ROOM_ALPHABET}]{${CODE_LENGTH}}$`)
const CLOSE_UNKNOWN = 4004

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/ws/')) return socket(request, env, url.pathname.slice(4))
    if (url.pathname.startsWith('/api/')) return api(request, env, url.pathname.slice(5))
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>

// ---------------------------------------------------------------- REST

async function api(request: Request, env: Env, path: string): Promise<Response> {
  const method = request.method
  const parts = path.split('/')

  if (path === 'health') return only(method, 'GET', () => json({ ok: true }))
  if (path === 'config') {
    return only(method, 'GET', () => json({ public_base_url: env.PUBLIC_BASE_URL.replace(/\/+$/, '') }))
  }
  if (path === 'meta') return only(method, 'GET', () => json(META))
  if (path === 'rooms') return only(method, 'POST', () => createRoom(request, env))
  if (parts[0] === 'rooms' && parts.length === 2) {
    return only(method, 'GET', () => roomSummary(env, parts[1]))
  }
  if (parts[0] === 'rooms' && parts.length === 3 && parts[2] === 'join') {
    return only(method, 'POST', () => joinRoom(request, env, parts[1]))
  }
  return json({ detail: 'Not Found' }, 404)
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  const name = await readName(request)
  if (typeof name !== 'string') return name
  for (let i = 0; i < 20; i++) {
    const code = newCode()
    const cred = await env.ROOMS.getByName(code).create(code, name)
    if (cred) return json(cred satisfies Credentials)
  }
  return json({ detail: '找不到可用的房號' }, 500)
}

async function roomSummary(env: Env, raw: string): Promise<Response> {
  const code = normalizeCode(raw)
  if (!CODE_PATTERN.test(code)) {
    return json({ code, exists: false, started: false, players: 0, joinable: false })
  }
  return json(await env.ROOMS.getByName(code).summary(code))
}

async function joinRoom(request: Request, env: Env, raw: string): Promise<Response> {
  const name = await readName(request)
  if (typeof name !== 'string') return name
  const code = normalizeCode(raw)
  if (!CODE_PATTERN.test(code)) return json({ detail: '找不到這個房間，請確認房號' }, 404)
  const result = await env.ROOMS.getByName(code).join(name)
  if ('status' in result) return json({ detail: result.detail }, result.status)
  return json(result)
}

/** 暱稱：1–12 個字、去掉前後空白後不能是空的；不合格時回傳 422 的回應。 */
async function readName(request: Request): Promise<string | Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return invalidName('請求內容不是 JSON')
  }
  const name = isObject(body) ? body.name : undefined
  if (typeof name !== 'string' || charLength(name) < 1 || charLength(name) > 12) {
    return invalidName('暱稱需要 1–12 個字')
  }
  if (!name.trim()) return invalidName('暱稱不能是空白')
  return name.trim()
}

function invalidName(msg: string): Response {
  return json({ detail: [{ loc: ['body', 'name'], msg }] }, 422)
}

const META = {
  zodiac: ZODIAC,
  branches: BRANCHES,
  colors: COLORS,
  min_players: MIN_PLAYERS,
  max_players: MAX_PLAYERS,
  chips_per_round: CHIPS_PER_ROUND,
  max_poison: MAX_POISON,
  good_win_score: GOOD_WIN_SCORE,
  roles: Object.fromEntries(
    Object.entries(ROLE_INFO).map(([role, info]) => [
      role,
      {
        name: info.name,
        faction: info.faction,
        description: info.description,
        fan: info.fan,
        replaces: info.replaces,
        skill: info.skill,
        ident: info.ident,
      },
    ]),
  ),
}

// ---------------------------------------------------------------- WebSocket

async function socket(request: Request, env: Env, raw: string): Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 })
  }
  const code = normalizeCode(raw)
  if (CODE_PATTERN.test(code)) return env.ROOMS.getByName(code).fetch(request)

  // 不可能存在的房號：不用驚動 Durable Object，直接告訴前端
  const [client, server] = Object.values(new WebSocketPair())
  server.accept()
  server.send(JSON.stringify({ type: 'removed', message: '房間不存在或身分已失效' }))
  server.close(CLOSE_UNKNOWN)
  return new Response(null, { status: 101, webSocket: client })
}

// ---------------------------------------------------------------- 共用

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  // 32 個字元剛好整除 256，不會偏差
  return [...bytes].map((b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('')
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

function only(method: string, allowed: string, handler: () => Promise<Response> | Response) {
  return method === allowed ? handler() : json({ detail: 'Method Not Allowed' }, 405)
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status })
}
