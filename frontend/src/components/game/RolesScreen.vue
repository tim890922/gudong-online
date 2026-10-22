<script setup lang="ts">
import { computed, ref } from 'vue'
import { FACTION_TEXT } from '../../lib/game'
import type { RoleId } from '../../lib/types'
import { useRoomStore } from '../../stores/room'
import AppButton from '../ui/AppButton.vue'
import BottomBar from '../ui/BottomBar.vue'
import ConfirmModal from '../ui/ConfirmModal.vue'
import HoldToReveal from './HoldToReveal.vue'
import PlayerChip from './PlayerChip.vue'
import RoleCard from './RoleCard.vue'

const store = useRoomStore()
const game = computed(() => store.game!)
const me = computed(() => game.value.me!)
const manual = computed(() => store.view!.settings.role_mode === 'manual')
const ready = computed(() => game.value.ready.includes(store.myId))
const taken = computed(() => new Set(me.value.taken_roles ?? []))
const pending = ref<RoleId | null>(null)

function pick() {
  if (pending.value) store.send({ type: 'pick_role', role: pending.value })
  pending.value = null
}
</script>

<template>
  <div class="space-y-5 pb-40">
    <header>
      <h2 class="font-display text-3xl">{{ manual ? '選擇你的角色卡' : '確認你的角色' }}</h2>
      <p class="mt-1 text-mist">
        {{
          manual
            ? '請選你手上那張實體角色卡。選錯可以重選，所有人按下「準備好了」後開始。'
            : '按住下方卡片查看角色，記住後按「準備好了」。'
        }}
      </p>
    </header>

    <section v-if="manual && !ready" aria-label="角色清單">
      <div class="grid grid-cols-2 gap-2.5">
        <button
          v-for="role in game.role_pool"
          :key="role"
          class="min-h-16 rounded-xl border px-3 text-left transition-colors disabled:opacity-30"
          :class="me.role === role ? 'border-gilt bg-gilt/10' : 'border-ink-line bg-ink-raised hover:border-gilt/50'"
          :disabled="taken.has(role)"
          @click="pending = role"
        >
          <span class="block font-display text-xl">{{ store.roleName(role) }}</span>
          <span class="text-xs text-mist">
            {{ taken.has(role) ? '已有人選' : FACTION_TEXT[store.meta!.roles[role].faction] }}
          </span>
        </button>
      </div>
    </section>

    <HoldToReveal v-if="me.role" label="按住查看你的角色">
      <RoleCard :me="me" />
    </HoldToReveal>

    <section>
      <h3 class="mb-2 text-sm text-mist">已準備 {{ game.ready.length }} / {{ game.seats.length }}</h3>
      <ul class="flex flex-wrap gap-2">
        <li
          v-for="id in game.seats"
          :key="id"
          class="rounded-full border px-3 py-1"
          :class="game.ready.includes(id) ? 'border-patina bg-patina/20' : 'border-dashed border-ink-line text-mist'"
        >
          <PlayerChip :id="id" size="sm" />
        </li>
      </ul>
    </section>

    <BottomBar>
      <AppButton v-if="!ready" block :disabled="!me.role" @click="store.send({ type: 'ready' })">
        {{ me.role ? '準備好了' : '請先選擇角色' }}
      </AppButton>
      <p v-else class="py-3 text-center text-mist">等待其他人準備</p>
    </BottomBar>

    <ConfirmModal :open="!!pending" title="確認角色" confirm-text="就是這張" @confirm="pick" @cancel="pending = null">
      你手上的角色卡是「{{ store.roleName(pending) }}」嗎？
    </ConfirmModal>
  </div>
</template>
