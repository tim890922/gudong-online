import { Haptics } from '@capacitor/haptics'
import { isNative, platform } from '../lib/platform'

/** 震動提醒。pattern 和 navigator.vibrate 相同：[震, 停, 震, …]（毫秒）。 */
export function vibrate(pattern: number | number[]) {
  if (isNative) {
    nativeVibrate(Array.isArray(pattern) ? pattern : [pattern])
    return
  }
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* iOS Safari 不支援震動 */
  }
}

function nativeVibrate(steps: number[]) {
  // iOS 只有系統固定長度的震動，連續送會黏成一下，所以只震一次
  if (platform === 'ios') {
    Haptics.vibrate().catch(() => {})
    return
  }
  let at = 0
  steps.forEach((ms, i) => {
    if (i % 2 === 0 && ms > 0) {
      window.setTimeout(() => Haptics.vibrate({ duration: ms }).catch(() => {}), at)
    }
    at += ms
  })
}
