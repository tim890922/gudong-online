<script setup lang="ts">
import { computed } from 'vue'
import { COLOR_HEX } from '../../lib/game'
import { useRoomStore } from '../../stores/room'

const props = withDefaults(defineProps<{ id: string | null | undefined; size?: 'sm' | 'md' | 'lg'; showYou?: boolean }>(), {
  size: 'md',
  showYou: true,
})
const store = useRoomStore()
const player = computed(() => store.player(props.id))
const color = computed(() => (player.value?.color != null ? COLOR_HEX[player.value.color] : '#555'))
const DOT = { sm: 'size-3', md: 'size-4', lg: 'size-6' }
const TEXT = { sm: 'text-sm', md: 'text-base', lg: 'text-2xl font-display' }
</script>

<template>
  <span class="inline-flex min-w-0 items-center gap-2" :class="TEXT[size]">
    <span class="shrink-0 rounded-full ring-1 ring-paper/50" :class="DOT[size]" :style="{ background: color }" />
    <span class="truncate">{{ player?.name ?? '？' }}</span>
    <span v-if="showYou && id === store.myId" class="shrink-0 text-xs text-mist">（你）</span>
  </span>
</template>
