<script setup lang="ts">
import { computed } from 'vue'
import { FACTION_TEXT } from '../../lib/game'
import type { RoleId } from '../../lib/types'
import { useRoomStore } from '../../stores/room'

const store = useRoomStore()
const roles = computed(() => {
  const meta = store.meta
  if (!meta) return []
  return (Object.keys(meta.roles) as RoleId[]).map((id) => ({ id, ...meta.roles[id] }))
})
const base = computed(() => roles.value.filter((r) => !r.fan))
const fans = computed(() => roles.value.filter((r) => r.fan))
</script>

<template>
  <div class="space-y-6 leading-relaxed">
    <section>
      <h3 class="font-display text-xl text-gilt">一局怎麼進行</h3>
      <ol class="mt-2 list-decimal space-y-1.5 pl-5 text-paper/90">
        <li>每人拿到角色。許願陣營要找出真品，老朝奉陣營要混淆視聽。</li>
        <li>共三回合，每回合公開 4 件獸首（2 真 2 假）。</li>
        <li>輪到你時，在手機上鑑定、使用技能，再指定下一位。最後一位行動完就進入討論。</li>
        <li>討論後投票：得票第一的獸首入選但不公開真假，第二名入選並公開真假。</li>
        <li>三回合後鑑人：許願陣營找老朝奉，老朝奉找許願，藥不然找方震。</li>
      </ol>
    </section>
    <section>
      <h3 class="font-display text-xl text-gilt">計分</h3>
      <ul class="mt-2 space-y-1 text-paper/90">
        <li>入選的真品每件 +1</li>
        <li>找出老朝奉 +1（得票最多且超過許願陣營人數一半）</li>
        <li>許願沒被老朝奉找到 +2</li>
        <li>方震沒被藥不然找到 +1</li>
        <li>許願陣營總分達 {{ store.meta?.good_win_score ?? 6 }} 分獲勝，否則老朝奉陣營獲勝。</li>
      </ul>
    </section>
    <section>
      <h3 class="font-display text-xl text-gilt">角色</h3>
      <dl class="mt-2 space-y-3">
        <div v-for="r in base" :key="r.id" class="rounded-xl bg-ink p-3">
          <dt class="flex items-baseline justify-between">
            <span class="font-display text-xl">{{ r.name }}</span>
            <span class="text-sm" :class="r.faction === 'good' ? 'text-patina-light' : 'text-cinnabar-bright'">
              {{ FACTION_TEXT[r.faction] }}
            </span>
          </dt>
          <dd class="mt-1 text-sm text-paper/85">{{ r.description }}</dd>
        </div>
      </dl>
      <p class="mt-3 text-sm text-mist">6 人局沒有鄭國渠和姬雲浮，7 人局沒有姬雲浮。</p>
    </section>
    <section>
      <h3 class="font-display text-xl text-gilt">粉絲角色（房主可選用）</h3>
      <dl class="mt-2 space-y-3">
        <div v-for="r in fans" :key="r.id" class="rounded-xl bg-ink p-3">
          <dt class="flex items-baseline justify-between">
            <span class="font-display text-xl">{{ r.name }}</span>
            <span class="text-sm text-mist">取代{{ r.replaces ? store.roleName(r.replaces) : '' }}</span>
          </dt>
          <dd class="mt-1 text-sm text-paper/85">{{ r.description }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>
