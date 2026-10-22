<script setup lang="ts">
import { computed } from 'vue'
import { FACTION_TEXT } from '../../lib/game'
import type { MeView } from '../../lib/types'
import { useRoomStore } from '../../stores/room'
import PlayerChip from './PlayerChip.vue'

const props = defineProps<{ me: MeView }>()
const store = useRoomStore()
const info = computed(() => (props.me.role && store.meta ? store.meta.roles[props.me.role] : null))
</script>

<template>
  <article v-if="info" class="rounded-2xl bg-paper p-5 text-paper-ink">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-sm text-paper-muted">你的角色</p>
        <h3 class="font-display text-5xl leading-tight">{{ info.name }}</h3>
      </div>
      <span
        class="mt-1 rounded-lg px-3 py-1.5 text-sm font-medium text-paper"
        :class="info.faction === 'good' ? 'bg-patina' : 'bg-cinnabar'"
      >
        {{ FACTION_TEXT[info.faction] }}
      </span>
    </div>
    <p class="mt-3 leading-relaxed">{{ info.description }}</p>
    <div v-if="me.known.length" class="mt-4 rounded-xl bg-paper-deep p-3">
      <p class="text-sm text-paper-muted">你知道的身分</p>
      <ul class="mt-2 space-y-1.5">
        <li v-for="k in me.known" :key="k.player_id" class="flex items-center justify-between gap-2">
          <PlayerChip :id="k.player_id" />
          <span class="font-display text-lg">{{ k.label }}</span>
        </li>
      </ul>
    </div>
    <p v-else-if="me.role === 'zheng_guoqu'" class="mt-4 text-sm text-paper-muted">你不知道隊友是誰，隊友也不知道你。</p>
  </article>
</template>
