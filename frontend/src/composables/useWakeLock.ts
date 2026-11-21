import { KeepAwake } from '@capacitor-community/keep-awake'
import { onBeforeUnmount, onMounted } from 'vue'
import { isNative } from '../lib/platform'

/** 遊戲中保持螢幕常亮。網頁版需要 HTTPS（或 localhost）；不支援時安靜略過。 */
export function useWakeLock() {
  if (isNative) {
    onMounted(() => KeepAwake.keepAwake().catch(() => {}))
    onBeforeUnmount(() => KeepAwake.allowSleep().catch(() => {}))
    return
  }

  let lock: WakeLockSentinel | null = null

  async function acquire() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return
    try {
      lock = await navigator.wakeLock.request('screen')
    } catch {
      lock = null
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible') acquire()
  }

  onMounted(() => {
    acquire()
    document.addEventListener('visibilitychange', onVisible)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisible)
    lock?.release().catch(() => {})
  })
}
