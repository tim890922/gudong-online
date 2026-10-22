from dataclasses import dataclass
from enum import StrEnum
from typing import Literal


class Role(StrEnum):
    XU_YUAN = "xu_yuan"
    FANG_ZHEN = "fang_zhen"
    HUANG_YANYAN = "huang_yanyan"
    KIDO_KANA = "kido_kana"
    LAO_CHAOFENG = "lao_chaofeng"
    YAO_BURAN = "yao_buran"
    ZHENG_GUOQU = "zheng_guoqu"
    JI_YUNFU = "ji_yunfu"
    # 粉絲角色
    BIG_EYE = "big_eye"
    YAO_LAI = "yao_lai"
    DIRECTOR_LIU = "director_liu"
    MO_YAO_BURAN = "mo_yao_buran"


class Faction(StrEnum):
    GOOD = "good"
    BAD = "bad"


IdentKind = Literal["head", "player", "big_eye"]
SkillKind = Literal["ambush", "poison", "block", "swap"]


@dataclass(frozen=True)
class RoleInfo:
    name: str
    faction: Faction
    ident: IdentKind
    skill: SkillKind | None
    description: str
    fan: bool = False
    replaces: Role | None = None


ROLE_INFO: dict[Role, RoleInfo] = {
    Role.XU_YUAN: RoleInfo(
        "許願", Faction.GOOD, "head", None,
        "每回合可以鑑定 2 件獸首，會受老朝奉的能力影響。鑑人階段若沒被老朝奉找到，許願陣營 +2 分。",
    ),
    Role.FANG_ZHEN: RoleInfo(
        "方震", Faction.GOOD, "player", None,
        "不鑑定獸首，改為每回合查驗一名玩家的陣營（同一人不能重複查驗）。"
        "方震被偷襲時，許願也會一起被偷襲。鑑人階段若沒被藥不然找到，許願陣營 +1 分。",
    ),
    Role.HUANG_YANYAN: RoleInfo(
        "黃煙煙", Faction.GOOD, "head", None,
        "每回合可以鑑定 1 件獸首，但有一個隨機回合會無法鑑定。會受老朝奉的能力影響。",
    ),
    Role.KIDO_KANA: RoleInfo(
        "木戶加奈", Faction.GOOD, "head", None,
        "每回合可以鑑定 1 件獸首，但有一個隨機回合會無法鑑定。會受老朝奉的能力影響。",
    ),
    Role.LAO_CHAOFENG: RoleInfo(
        "老朝奉", Faction.BAD, "head", "swap",
        "每回合可以決定是否讓「在你之後行動」的許願、黃煙煙、木戶加奈、劉局看到相反的鑑定結果。"
        "和藥不然互相認識。鑑人階段要找出許願。",
    ),
    Role.YAO_BURAN: RoleInfo(
        "藥不然", Faction.BAD, "head", "ambush",
        "每回合可以偷襲一名玩家：對方下一次鑑定會失敗，而且當回合不能使用技能。"
        "和老朝奉互相認識。鑑人階段要找出方震。",
    ),
    Role.ZHENG_GUOQU: RoleInfo(
        "鄭國渠", Faction.BAD, "head", "block",
        "每回合可以封鎖一件本回合的獸首，之後鑑定它的人都無法辨別真偽。不和隊友相認，鑑人投票不計分。",
    ),
    Role.JI_YUNFU: RoleInfo(
        "姬雲浮", Faction.GOOD, "head", None,
        "每回合可以鑑定 1 件獸首，不受老朝奉影響；但只要被偷襲一次，之後就再也無法鑑定。",
    ),
    Role.BIG_EYE: RoleInfo(
        "大眼賊", Faction.GOOD, "big_eye", None,
        "不鑑定當回合的獸首，改為鑑定上一回合和下一回合各 1 件，而且只看得到位置編號（子丑寅卯…）。"
        "不受老朝奉影響，但會被鄭國渠封鎖、會被偷襲；被方震查驗也視同被偷襲。",
        fan=True, replaces=Role.JI_YUNFU,
    ),
    Role.YAO_LAI: RoleInfo(
        "藥來", Faction.GOOD, "head", None,
        "開局時有一半機率被老朝奉控制，本人不知道。被控制時鑑定結果一定是錯的，否則一定是對的；"
        "不受老朝奉能力和毒藥影響。",
        fan=True, replaces=Role.JI_YUNFU,
    ),
    Role.DIRECTOR_LIU: RoleInfo(
        "劉局", Faction.GOOD, "head", None,
        "只有第一回合能鑑定獸首。開局時會知道許願或方震其中一人是誰，但不知道是哪一個。",
        fan=True, replaces=Role.HUANG_YANYAN,
    ),
    Role.MO_YAO_BURAN: RoleInfo(
        "魔藥不然", Faction.BAD, "head", "poison",
        "不偷襲，改為投毒，整局最多 2 次。"
        "中毒的人下一次鑑定結果會顛倒（本人不知道），可以和老朝奉的效果疊加。"
        "毒方震時改由許願中毒；毒姬雲浮視同偷襲。和老朝奉互相認識。鑑人階段要找出方震。",
        fan=True, replaces=Role.YAO_BURAN,
    ),
}

# 依人數取前 N 個：6 人沒有鄭國渠和姬雲浮，7 人沒有姬雲浮
BASE_ROLES = [
    Role.XU_YUAN,
    Role.FANG_ZHEN,
    Role.HUANG_YANYAN,
    Role.KIDO_KANA,
    Role.LAO_CHAOFENG,
    Role.YAO_BURAN,
    Role.ZHENG_GUOQU,
    Role.JI_YUNFU,
]

# 會被老朝奉換真假影響的角色
SWAP_AFFECTED = {Role.XU_YUAN, Role.HUANG_YANYAN, Role.KIDO_KANA, Role.DIRECTOR_LIU}
AMBUSHERS = {Role.YAO_BURAN, Role.MO_YAO_BURAN}


def faction_of(role: Role) -> Faction:
    return ROLE_INFO[role].faction


def role_pool(player_count: int, *, big_eye: bool, yao_lai: bool, director: bool,
              mo_yao: bool) -> list[Role]:
    replacements: dict[Role, Role] = {}
    if big_eye:
        replacements[Role.JI_YUNFU] = Role.BIG_EYE
    elif yao_lai:
        replacements[Role.JI_YUNFU] = Role.YAO_LAI
    if director:
        replacements[Role.HUANG_YANYAN] = Role.DIRECTOR_LIU
    if mo_yao:
        replacements[Role.YAO_BURAN] = Role.MO_YAO_BURAN
    return [replacements.get(r, r) for r in BASE_ROLES[:player_count]]
