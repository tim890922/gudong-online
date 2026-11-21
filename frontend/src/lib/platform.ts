import { App } from '@capacitor/app'
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'

/** 在 iOS／Android App 裡執行（網頁版是 false） */
export const isNative = Capacitor.isNativePlatform()
export const platform = Capacitor.getPlatform()

// App 版的頁面是從手機本機載入的（capacitor://localhost），API 要連到線上的 Worker；
// 網頁版留空，沿用同一個網域。
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

export function apiUrl(path: string): string {
  return API_BASE + path
}

export function wsUrl(path: string): string {
  const base = API_BASE ? new URL(API_BASE) : location
  const scheme = base.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${base.host}${path}`
}

/** 邀請連結的網域：一定要是網頁版，App 自己的網址（capacitor://localhost）別人打不開 */
export function webOrigin(publicBaseUrl: string): string {
  return publicBaseUrl || API_BASE || location.origin
}

/** App 啟動時的原生設定：整個介面是深色底，狀態列要用淺色字 */
export function initNative(): void {
  if (!isNative) return
  SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {})
}

/** 手機從背景回到前景。網頁靠 visibilitychange；App 另外聽原生的 resume，Android WebView 不一定會觸發前者。 */
export function onForeground(callback: () => void): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') callback()
  })
  if (isNative) App.addListener('resume', callback).catch(() => {})
}
