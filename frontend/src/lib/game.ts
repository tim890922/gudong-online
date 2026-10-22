import type { Outcome, RoleId } from './types'

// 座位顏色，順序與後端 COLORS（黑紅橘黃綠藍紫白）一致
export const COLOR_HEX = ['#2b2b2b', '#d9443a', '#e8833a', '#e5c341', '#4f9d5d', '#3e7cc4', '#8e5bb5', '#f2eee6']
export const ROUND_NAMES = ['一', '二', '三']

export const OUTCOME_TEXT: Record<Outcome, string> = {
  genuine: '真品',
  fake: '贗品',
  unknown: '無法辨別',
  ambushed: '被偷襲',
  good: '許願陣營',
  bad: '老朝奉陣營',
}

export const GOAL_TEXT: Partial<Record<RoleId, string>> = {
  lao_chaofeng: '找出老朝奉',
  xu_yuan: '找出許願',
  fang_zhen: '找出方震',
}

export const FACTION_TEXT = { good: '許願陣營', bad: '老朝奉陣營' } as const

export function roundOf(pos: number): number {
  return Math.floor(pos / 4)
}
