/**
 * 一個房間就是一個 Durable Object：房間狀態 + WebSocket 連線 + 過期清除。
 *
 * Durable Object 一次只處理一個事件，所以不需要鎖。WebSocket 使用 hibernation API，
 * 沒人操作時物件可以休眠，房間狀態存在 Durable Object 的 storage 裡。
 */

import { DurableObject } from 'cloudflare:workers'
import { isObject, parseAction } from './engine/actions'
import { COLORS, MAX_PLAYERS } from './engine/constants'
import { GameError } from './engine/errors'
import { applyAction } from './engine/game'
import { defaultSettings, findPlayer, playerByToken, type PlayerInfo, type Room } from './engine/models'
import { cryptoRng } from './engine/rng'
import { buildView } from './engine/views'

const CLOSE_REMOVED = 4001
const CLOSE_UNKNOWN = 4004
// 前端每 25 秒送一次，由 runtime 直接回覆，不會喚醒物件
const PING = '{"type":"ping"}'
const PONG = '{"type":"pong"}'

export interface Credentials {
  code: string
  player_id: string
  token: string
}

export interface RoomSummary {
  code: string
  exists: boolean
  started: boolean
  players: number
  joinable: boolean
}

export type JoinResult = Credentials | { status: 404 | 409; detail: string }

export class GameRoom extends DurableObject<Env> {
  private room: Room | null = null
  private alarmSet = false
  private readonly ttlMs: number

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ttlMs = Number(env.ROOM_TTL_HOURS || 12) * 3_600_000
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))
    void ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<Room>('room')) ?? null
      this.alarmSet = (await ctx.storage.getAlarm()) !== null
    })
  }

  // ------------------------------------------------------------ 給 Worker 呼叫的 RPC

  /** 房號已被使用時回傳 null，由 Worker 換一個房號再試。 */
  async create(code: string, name: string): Promise<Credentials | null> {
    if (this.current()) return null
    // 同房號的舊房間已過期：把還連著的人請出去
    for (const ws of this.ctx.getWebSockets()) closeWith(ws, '房間已過期', CLOSE_REMOVED)
    const now = Date.now()
    const player = newPlayer(name, null)
    await this.save({
      code,
      host_id: player.id,
      players: [player],
      settings: defaultSettings(),
      game: null,
      created_at: now,
      updated_at: now,
      games_played: 0,
    })
    return { code, player_id: player.id, token: player.token }
  }

  async summary(code: string): Promise<RoomSummary> {
    const room = this.current()
    if (!room) return { code, exists: false, started: false, players: 0, joinable: false }
    const started = room.game !== null
    return {
      code: room.code,
      exists: true,
      started,
      players: room.players.length,
      joinable: !started && room.players.length < MAX_PLAYERS,
    }
  }

  async join(name: string): Promise<JoinResult> {
    const room = this.current()
    if (!room) return { status: 404, detail: '找不到這個房間，請確認房號' }
    if (room.game !== null) return { status: 409, detail: '遊戲已經開始，無法加入' }
    if (room.players.length >= MAX_PLAYERS) {
      return { status: 409, detail: `房間已滿（最多 ${MAX_PLAYERS} 人）` }
    }
    const player = newPlayer(name, room)
    await this.save({ ...room, players: [...room.players, player], updated_at: Date.now() })
    this.broadcast()
    return { code: room.code, player_id: player.id, token: player.token }
  }

  // ------------------------------------------------------------ WebSocket

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }
    const token = new URL(request.url).searchParams.get('token') ?? ''
    const room = this.current()
    const player = room ? playerByToken(room, token) : undefined
    const [client, server] = Object.values(new WebSocketPair())
    if (player) {
      // tag 記錄這條連線屬於哪位玩家，休眠後也查得到
      this.ctx.acceptWebSocket(server, [player.id])
      this.broadcast()
    } else {
      server.accept()
      closeWith(server, '房間不存在或身分已失效', CLOSE_UNKNOWN)
    }
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const pid = this.playerOf(ws)
    if (!pid || typeof message !== 'string') return
    let msg: unknown
    try {
      msg = JSON.parse(message)
    } catch {
      return
    }
    if (!isObject(msg)) return
    if (msg.type === 'ping') {
      ws.send(PONG)
    } else if (msg.type === 'action') {
      const error = await this.handle(pid, msg.action)
      if (error) ws.send(JSON.stringify({ type: 'error', message: error }))
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close()
    } catch {
      // runtime 可能已經自動回覆了關閉
    }
    this.broadcast()
  }

  async webSocketError(): Promise<void> {
    this.broadcast()
  }

  /** 處理一個玩家操作，回傳錯誤訊息（成功則為 null）。 */
  private async handle(pid: string, raw: unknown): Promise<string | null> {
    const action = parseAction(raw)
    if (!action) return '操作格式不正確'
    const room = this.current()
    if (!room || !findPlayer(room, pid)) return '你已經不在這個房間'
    const draft = structuredClone(room)
    try {
      applyAction(draft, pid, action, cryptoRng)
    } catch (e) {
      if (e instanceof GameError) return e.message
      throw e
    }
    draft.updated_at = Date.now()
    if (draft.players.length > 0) await this.save(draft)
    else await this.destroy()
    for (const ws of this.ctx.getWebSockets()) {
      const p = this.playerOf(ws)
      if (p && !findPlayer(draft, p)) closeWith(ws, '你已離開房間', CLOSE_REMOVED)
    }
    this.broadcast()
    return null
  }

  private broadcast(): void {
    const room = this.room
    if (!room) return
    const sockets = this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN)
    const connected = new Set(sockets.map((ws) => this.playerOf(ws)).filter((p) => p !== null))
    const messages = new Map<string, string>()
    for (const ws of sockets) {
      const pid = this.playerOf(ws)
      if (!pid) continue
      let message = messages.get(pid)
      if (message === undefined) {
        message = JSON.stringify({ type: 'state', view: buildView(room, pid, connected) })
        messages.set(pid, message)
      }
      try {
        ws.send(message)
      } catch {
        // 連線可能早就斷了
      }
    }
  }

  private playerOf(ws: WebSocket): string | null {
    return this.ctx.getTags(ws)[0] ?? null
  }

  // ------------------------------------------------------------ 保存與過期

  /** 目前的房間；超過保存期限就當作不存在（alarm 會負責刪除）。 */
  private current(): Room | null {
    const room = this.room
    return room && room.updated_at + this.ttlMs > Date.now() ? room : null
  }

  private async save(room: Room): Promise<void> {
    this.room = room
    await this.ctx.storage.put('room', room)
    if (!this.alarmSet) {
      await this.ctx.storage.setAlarm(room.updated_at + this.ttlMs)
      this.alarmSet = true
    }
  }

  private async destroy(): Promise<void> {
    this.room = null
    this.alarmSet = false
    await this.ctx.storage.deleteAll()
  }

  async alarm(): Promise<void> {
    this.alarmSet = false
    const room = this.room
    if (room && room.updated_at + this.ttlMs > Date.now()) {
      // 有人操作過，延到新的期限
      await this.ctx.storage.setAlarm(room.updated_at + this.ttlMs)
      this.alarmSet = true
      return
    }
    for (const ws of this.ctx.getWebSockets()) closeWith(ws, '房間已過期', CLOSE_REMOVED)
    await this.destroy()
  }
}

function closeWith(ws: WebSocket, message: string, code: number): void {
  try {
    ws.send(JSON.stringify({ type: 'removed', message }))
    ws.close(code)
  } catch {
    // 連線可能早就斷了
  }
}

function newPlayer(name: string, room: Room | null): PlayerInfo {
  const used = new Set(room ? room.players.map((p) => p.color) : [])
  const color = COLORS.findIndex((_, c) => !used.has(c))
  return {
    id: playerId(),
    token: randomToken(18),
    name: name.trim(),
    color: color === -1 ? null : color,
  }
}

/**
 * 8 碼 hex。玩家 ID 會當作物件的 key，全數字的 key 在 JS 會被排到最前面、打亂座位順序，
 * 所以避開全數字的 ID。
 */
function playerId(): string {
  for (;;) {
    const id = [...crypto.getRandomValues(new Uint8Array(4))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    if (!/^\d+$/.test(id)) return id
  }
}

function randomToken(bytes: number): string {
  const raw = String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)))
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
