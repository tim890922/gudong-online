import type { Credentials, Meta } from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let message = '連線失敗，請稍後再試'
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') message = body.detail
      else if (res.status === 422) message = '請輸入 1–12 個字的暱稱'
    } catch {
      /* 保留預設訊息 */
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export const api = {
  meta: () => request<Meta>('/api/meta'),
  config: () => request<{ public_base_url: string }>('/api/config'),
  createRoom: (name: string) =>
    request<Credentials>('/api/rooms', { method: 'POST', body: JSON.stringify({ name }) }),
  joinRoom: (code: string, name: string) =>
    request<Credentials>(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  roomSummary: (code: string) =>
    request<{ code: string; exists: boolean; started: boolean; players: number; joinable: boolean }>(
      `/api/rooms/${encodeURIComponent(code)}`,
    ),
}
