import { onBeforeUnmount, onMounted } from 'vue'

/** 遊戲中保持螢幕常亮。需要 HTTPS（或 localhost）；不支援時安靜略過。 */
export function useWakeLock() {
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
