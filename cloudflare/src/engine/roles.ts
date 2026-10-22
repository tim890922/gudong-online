export const Role = {
  XU_YUAN: 'xu_yuan',
  FANG_ZHEN: 'fang_zhen',
  HUANG_YANYAN: 'huang_yanyan',
  KIDO_KANA: 'kido_kana',
  LAO_CHAOFENG: 'lao_chaofeng',
  YAO_BURAN: 'yao_buran',
  ZHENG_GUOQU: 'zheng_guoqu',
  JI_YUNFU: 'ji_yunfu',
  // 粉絲角色
  BIG_EYE: 'big_eye',
  YAO_LAI: 'yao_lai',
  DIRECTOR_LIU: 'director_liu',
  MO_YAO_BURAN: 'mo_yao_buran',
} as const
export type Role = (typeof Role)[keyof typeof Role]

export type Faction = 'good' | 'bad'
export type IdentKind = 'head' | 'player' | 'big_eye'
export type SkillKind = 'ambush' | 'poison' | 'block' | 'swap'

export interface RoleInfo {
  name: string
  faction: Faction
  ident: IdentKind
  skill: SkillKind | null
  description: string
  fan: boolean
  replaces: Role | null
}

function info(
  name: string,
  faction: Faction,
  ident: IdentKind,
  skill: SkillKind | null,
  description: string,
  fan: { replaces: Role } | null = null,
): RoleInfo {
  return { name, faction, ident, skill, description, fan: fan !== null, replaces: fan?.replaces ?? null }
}

export const ROLE_INFO: Record<Role, RoleInfo> = {
  [Role.XU_YUAN]: info(
    '許願', 'good', 'head', null,
    '每回合可以鑑定 2 件獸首，會受老朝奉的能力影響。鑑人階段若沒被老朝奉找到，許願陣營 +2 分。',
  ),
  [Role.FANG_ZHEN]: info(
    '方震', 'good', 'player', null,
    '不鑑定獸首，改為每回合查驗一名玩家的陣營（同一人不能重複查驗）。' +
      '方震被偷襲時，許願也會一起被偷襲。鑑人階段若沒被藥不然找到，許願陣營 +1 分。',
  ),
  [Role.HUANG_YANYAN]: info(
    '黃煙煙', 'good', 'head', null,
    '每回合可以鑑定 1 件獸首，但有一個隨機回合會無法鑑定。會受老朝奉的能力影響。',
  ),
  [Role.KIDO_KANA]: info(
    '木戶加奈', 'good', 'head', null,
    '每回合可以鑑定 1 件獸首，但有一個隨機回合會無法鑑定。會受老朝奉的能力影響。',
  ),
  [Role.LAO_CHAOFENG]: info(
    '老朝奉', 'bad', 'head', 'swap',
    '每回合可以決定是否讓「在你之後行動」的許願、黃煙煙、木戶加奈、劉局看到相反的鑑定結果。' +
      '和藥不然互相認識。鑑人階段要找出許願。',
  ),
  [Role.YAO_BURAN]: info(
    '藥不然', 'bad', 'head', 'ambush',
    '每回合可以偷襲一名玩家：對方下一次鑑定會失敗，而且當回合不能使用技能。' +
      '和老朝奉互相認識。鑑人階段要找出方震。',
  ),
  [Role.ZHENG_GUOQU]: info(
    '鄭國渠', 'bad', 'head', 'block',
    '每回合可以封鎖一件本回合的獸首，之後鑑定它的人都無法辨別真偽。不和隊友相認，鑑人投票不計分。',
  ),
  [Role.JI_YUNFU]: info(
    '姬雲浮', 'good', 'head', null,
    '每回合可以鑑定 1 件獸首，不受老朝奉影響；但只要被偷襲一次，之後就再也無法鑑定。',
  ),
  [Role.BIG_EYE]: info(
    '大眼賊', 'good', 'big_eye', null,
    '不鑑定當回合的獸首，改為鑑定上一回合和下一回合各 1 件，而且只看得到位置編號（子丑寅卯…）。' +
      '不受老朝奉影響，但會被鄭國渠封鎖、會被偷襲；被方震查驗也視同被偷襲。',
    { replaces: Role.JI_YUNFU },
  ),
  [Role.YAO_LAI]: info(
    '藥來', 'good', 'head', null,
    '開局時有一半機率被老朝奉控制，本人不知道。被控制時鑑定結果一定是錯的，否則一定是對的；' +
      '不受老朝奉能力和毒藥影響。',
    { replaces: Role.JI_YUNFU },
  ),
  [Role.DIRECTOR_LIU]: info(
    '劉局', 'good', 'head', null,
    '只有第一回合能鑑定獸首。開局時會知道許願或方震其中一人是誰，但不知道是哪一個。',
    { replaces: Role.HUANG_YANYAN },
  ),
  [Role.MO_YAO_BURAN]: info(
    '魔藥不然', 'bad', 'head', 'poison',
    '不偷襲，改為投毒，整局最多 2 次。' +
      '中毒的人下一次鑑定結果會顛倒（本人不知道），可以和老朝奉的效果疊加。' +
      '毒方震時改由許願中毒；毒姬雲浮視同偷襲。和老朝奉互相認識。鑑人階段要找出方震。',
    { replaces: Role.YAO_BURAN },
  ),
}

export const ALL_ROLES = Object.keys(ROLE_INFO) as Role[]

// 依人數取前 N 個：6 人沒有鄭國渠和姬雲浮，7 人沒有姬雲浮
export const BASE_ROLES: Role[] = [
  Role.XU_YUAN,
  Role.FANG_ZHEN,
  Role.HUANG_YANYAN,
  Role.KIDO_KANA,
  Role.LAO_CHAOFENG,
  Role.YAO_BURAN,
  Role.ZHENG_GUOQU,
  Role.JI_YUNFU,
]

// 會被老朝奉換真假影響的角色
export const SWAP_AFFECTED = new Set<Role>([
  Role.XU_YUAN,
  Role.HUANG_YANYAN,
  Role.KIDO_KANA,
  Role.DIRECTOR_LIU,
])
export const AMBUSHERS = new Set<Role>([Role.YAO_BURAN, Role.MO_YAO_BURAN])

export function factionOf(role: Role): Faction {
  return ROLE_INFO[role].faction
}

export function rolePool(
  playerCount: number,
  fans: { bigEye: boolean; yaoLai: boolean; director: boolean; moYao: boolean },
): Role[] {
  const replacements = new Map<Role, Role>()
  if (fans.bigEye) replacements.set(Role.JI_YUNFU, Role.BIG_EYE)
  else if (fans.yaoLai) replacements.set(Role.JI_YUNFU, Role.YAO_LAI)
  if (fans.director) replacements.set(Role.HUANG_YANYAN, Role.DIRECTOR_LIU)
  if (fans.moYao) replacements.set(Role.YAO_BURAN, Role.MO_YAO_BURAN)
  return BASE_ROLES.slice(0, playerCount).map((r) => replacements.get(r) ?? r)
}
