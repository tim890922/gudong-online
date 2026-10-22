<script setup lang="ts">
import { computed } from 'vue'
import { OUTCOME_TEXT, ROUND_NAMES } from '../../lib/game'
import type { IdentRecord } from '../../lib/types'
import { useRoomStore } from '../../stores/room'
import PlayerChip from './PlayerChip.vue'
import SealMark from './SealMark.vue'

const props = defineProps<{ records: IdentRecord[]; bigEye?: boolean }>()
const store = useRoomStore()
const byRound = computed(() =>
  [0, 1, 2]
    .map((r) => ({ round: r, items: props.records.filter((x) => x.round === r) }))
    .filter((g) => g.items.length),
)

function headLabel(rec: IdentRecord): string {
  if (rec.pos == null || !store.meta) return '？'
  const zodiac = store.zodiac(rec.pos)
  const branch = store.meta.branches[rec.pos]
  // 大眼賊在獸首公開前只知道位置編號
  return props.bigEye || !zodiac ? `${branch}${zodiac ? `（${zodiac}）` : ''}` : zodiac
}
</script>

<template>
  <p v-if="!records.length" class="py-6 text-center text-mist">還沒有鑑定紀錄。</p>
  <section v-for="g in byRound" :key="g.round" class="mb-4">
    <h3 class="mb-2 text-sm text-mist">第{{ ROUND_NAMES[g.round] }}回合</h3>
    <ul class="space-y-2">
      <li
        v-for="(rec, i) in g.items"
        :key="i"
        class="flex items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3"
      >
        <span v-if="rec.kind === 'head'" class="font-display text-2xl">{{ headLabel(rec) }}</span>
        <PlayerChip v-else :id="rec.target" />
        <span class="flex items-center gap-3">
          <span class="text-sm text-mist">{{ OUTCOME_TEXT[rec.outcome] }}</span>
          <SealMark :outcome="rec.outcome" size="sm" />
        </span>
      </li>
    </ul>
  </section>
</template>
