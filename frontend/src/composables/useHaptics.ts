export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* iOS Safari 不支援震動 */
  }
}
