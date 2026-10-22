<script setup lang="ts">
import { computed } from 'vue'
import { useRoomStore } from '../../stores/room'
import ZodiacTile from './ZodiacTile.vue'

const props = defineProps<{ round: number }>()
const store = useRoomStore()
const tiles = computed(() =>
  [0, 1, 2, 3].map((slot) => {
    const pos = props.round * 4 + slot
    return { pos, label: store.zodiac(pos), caption: store.meta?.branches[pos] }
  }),
)
</script>

<template>
  <div class="grid grid-cols-4 gap-2.5">
    <ZodiacTile v-for="t in tiles" :key="t.pos" :label="t.label" :caption="t.caption">
    </ZodiacTile>
    <slot />
  </div>
</template>
