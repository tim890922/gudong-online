/** 亂數來源：正式環境用 crypto，測試可以換成固定種子。 */
export interface Rng {
  /** 回傳 [0, 1) 之間的數 */
  random(): number
}

export const cryptoRng: Rng = {
  random: () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32,
}

export function randrange(rng: Rng, n: number): number {
  return Math.floor(rng.random() * n)
}

export function choice<T>(rng: Rng, items: readonly T[]): T {
  return items[randrange(rng, items.length)]
}

/** 原地洗牌（Fisher–Yates） */
export function shuffle<T>(rng: Rng, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randrange(rng, i + 1)
    ;[items[i], items[j]] = [items[j], items[i]]
  }
}

export function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}
