import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../lib/api'
import { clearCredentials } from '../lib/credentials'
import { onForeground, wsUrl } from '../lib/platform'
import type { ChatMessage, Credentials, Meta, PlayerView, RoomView } from '../lib/types'

type Status = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'removed'

interface Toast {
  id: number
  text: string
  tone: 'error' | 'info'
}

const PING_MS = 25_000 // Cloudflare 會切斷閒置約 100 秒的 WebSocket
const MAX_RETRY_MS = 10_000
const CHAT_KEEP = 100 // 和伺服器保留的則數一樣

export const useRoomStore = defineStore('room', () => {
  const view = ref<RoomView | null>(null)
  const meta = ref<Meta | null>(null)
  const publicBaseUrl = ref('')
  const status = ref<Status>('idle')
  const removedMessage = ref('')
  const toasts = ref<Toast[]>([])
  const chat = ref<ChatMessage[]>([])
  const chatUnread = ref(0)
  /** 聊天室正開著（由房間頁設定）；開著的時候新訊息不算未讀 */
  const chatVisible = ref(false)

  let socket: WebSocket | null = null
  let cred: Credentials | null = null
  let retry = 0
  let retryTimer: number | undefined
  let pingTimer: number | undefined
  let toastId = 0

  async function loadMeta() {
    if (meta.value) return
    const [m, config] = await Promise.all([api.meta(), api.config()])
    meta.value = m
    publicBaseUrl.value = config.public_base_url
  }

  function toast(text: string, tone: Toast['tone'] = 'error') {
    const id = ++toastId
    toasts.value.push({ id, text, tone })
    window.setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, 3500)
  }

  function open() {
    if (!cred) return
    window.clearTimeout(retryTimer)
    const url = wsUrl(`/ws/${cred.code}?token=${encodeURIComponent(cred.token)}`)
    status.value = retry === 0 && !view.value ? 'connecting' : 'reconnecting'
    const ws = new WebSocket(url)
    socket = ws

    ws.onopen = () => {
      retry = 0
      status.value = 'open'
      window.clearInterval(pingTimer)
      pingTimer = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}')
      }, PING_MS)
    }
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'state') view.value = msg.view
      else if (msg.type === 'chat') receiveChat([msg.message])
      else if (msg.type === 'chat_history') receiveChat(msg.messages, true)
      else if (msg.type === 'error') toast(msg.message)
      else if (msg.type === 'removed') {
        status.value = 'removed'
        removedMessage.value = msg.message
        if (cred) clearCredentials(cred.code)
        cred = null
      }
    }
    ws.onclose = () => {
      window.clearInterval(pingTimer)
      if (socket !== ws || status.value === 'removed' || !cred) return
      status.value = 'reconnecting'
      const delay = Math.min(MAX_RETRY_MS, 1000 * 2 ** retry)
      retry += 1
      retryTimer = window.setTimeout(open, delay)
    }
  }

  function connect(credentials: Credentials) {
    if (cred && cred.token === credentials.token && socket && socket.readyState <= WebSocket.OPEN) {
      return
    }
    disconnect()
    cred = credentials
    removedMessage.value = ''
    retry = 0
    open()
  }

  function disconnect() {
    cred = null
    window.clearTimeout(retryTimer)
    window.clearInterval(pingTimer)
    const ws = socket
    socket = null
    ws?.close()
    view.value = null
    status.value = 'idle'
    chat.value = []
    chatUnread.value = 0
  }

  function send(action: Record<string, unknown>) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast('連線中斷，正在重新連線，請稍後再按一次')
      return
    }
    socket.send(JSON.stringify({ type: 'action', action }))
  }

  /**
   * 收到聊天訊息。history 是連線時伺服器補送的完整紀錄：直接取代，
   * 只把斷線期間新增的別人訊息算成未讀（剛打開頁面時不算）。
   */
  function receiveChat(messages: ChatMessage[], history = false) {
    const lastId = chat.value.at(-1)?.id ?? 0
    const fresh = history && lastId === 0 ? [] : messages.filter((m) => m.id > lastId && m.player_id !== myId.value)
    chat.value = history ? messages : [...chat.value, ...messages.filter((m) => m.id > lastId)].slice(-CHAT_KEEP)
    if (!chatVisible.value) chatUnread.value += fresh.length
  }

  /** 送出聊天訊息；連線中斷時回傳 false，讓輸入框保留內容 */
  function sendChat(text: string): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast('連線中斷，正在重新連線，請稍後再送一次')
      return false
    }
    socket.send(JSON.stringify({ type: 'chat', text }))
    return true
  }

  function setChatVisible(visible: boolean) {
    chatVisible.value = visible
    if (visible) chatUnread.value = 0
  }

  // 手機從背景回來時立刻重連，不等退避計時器
  onForeground(() => {
    if (cred && socket?.readyState !== WebSocket.OPEN) {
      retry = 0
      open()
    }
  })

  const game = computed(() => view.value?.game ?? null)
  const me = computed(() => game.value?.me ?? null)
  const myId = computed(() => view.value?.me ?? '')
  const isHost = computed(() => !!view.value && view.value.host_id === view.value.me)
  const playersById = computed<Record<string, PlayerView>>(() =>
    Object.fromEntries((view.value?.players ?? []).map((p) => [p.id, p])),
  )

  function player(id: string | null | undefined): PlayerView | undefined {
    return id ? playersById.value[id] : undefined
  }

  function roleName(role: string | null | undefined): string {
    if (!role || !meta.value) return ''
    return meta.value.roles[role as keyof Meta['roles']]?.name ?? role
  }

  function zodiac(pos: number): string {
    const head = game.value?.heads[pos]
    return head == null || !meta.value ? '' : meta.value.zodiac[head]
  }

  return {
    view,
    meta,
    publicBaseUrl,
    status,
    removedMessage,
    toasts,
    chat,
    chatUnread,
    loadMeta,
    toast,
    connect,
    disconnect,
    send,
    sendChat,
    setChatVisible,
    game,
    me,
    myId,
    isHost,
    playersById,
    player,
    roleName,
    zodiac,
  }
})
