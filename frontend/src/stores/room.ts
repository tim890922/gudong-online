import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../lib/api'
import { clearCredentials } from '../lib/credentials'
import type { Credentials, Meta, PlayerView, RoomView } from '../lib/types'

type Status = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'removed'

interface Toast {
  id: number
  text: string
  tone: 'error' | 'info'
}

const PING_MS = 25_000 // Cloudflare 會切斷閒置約 100 秒的 WebSocket
const MAX_RETRY_MS = 10_000

export const useRoomStore = defineStore('room', () => {
  const view = ref<RoomView | null>(null)
  const meta = ref<Meta | null>(null)
  const publicBaseUrl = ref('')
  const status = ref<Status>('idle')
  const removedMessage = ref('')
  const toasts = ref<Toast[]>([])

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
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${scheme}://${location.host}/ws/${cred.code}?token=${encodeURIComponent(cred.token)}`
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
  }

  function send(action: Record<string, unknown>) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast('連線中斷，正在重新連線，請稍後再按一次')
      return
    }
    socket.send(JSON.stringify({ type: 'action', action }))
  }

  // 手機從背景回來時立刻重連，不等退避計時器
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && cred && socket?.readyState !== WebSocket.OPEN) {
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
    loadMeta,
    toast,
    connect,
    disconnect,
    send,
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
