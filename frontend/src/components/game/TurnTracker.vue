<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import { computed } from 'vue'
import { COLOR_HEX } from '../../lib/game'
import { useRoomStore } from '../../stores/room'

const store = useRoomStore()
const game = computed(() => store.game!)
const order = computed(() => game.value.turn_orders[game.value.round] ?? [])
const waiting = computed(() => game.value.seats.filter((s) => !order.value.includes(s)))
const items = computed(() => [
  ...order.value.map((id) => ({ id, state: id === game.value.current ? 'current' : 'done' })),
  ...waiting.value.map((id) => ({ id, state: 'waiting' })),
])
</script>

<template>
  <ol class="flex flex-wrap gap-2" aria-label="本回合行動順序">
    <li
      v-for="item in items"
      :key="item.id"
      class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm"
      :class="{
        'border-gilt bg-gilt/15 text-paper animate-turn': item.state === 'current',
        'border-ink-line text-mist': item.state === 'done',
        'border-dashed border-ink-line text-mist/70': item.state === 'waiting',
      }"
    >
      <span
        class="size-2.5 rounded-full ring-1 ring-paper/50"
        :style="{ background: COLOR_HEX[store.player(item.id)?.color ?? 0] }"
      />
      <span class="max-w-[6em] truncate">{{ store.player(item.id)?.name }}</span>
      <Check v-if="item.state === 'done'" :size="14" />
    </li>
  </ol>
</template>
