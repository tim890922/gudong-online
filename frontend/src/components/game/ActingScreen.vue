<script setup lang="ts">
import { computed, watch } from 'vue'
import { vibrate } from '../../composables/useHaptics'
import { ROUND_NAMES } from '../../lib/game'
import { useRoomStore } from '../../stores/room'
import AppButton from '../ui/AppButton.vue'
import BottomBar from '../ui/BottomBar.vue'
import PlayerChip from './PlayerChip.vue'
import RoundHeads from './RoundHeads.vue'
import TurnPanel from './TurnPanel.vue'
import TurnTracker from './TurnTracker.vue'

const emit = defineEmits<{ records: [] }>()
const store = useRoomStore()
const game = computed(() => store.game!)
const myTurn = computed(() => game.value.current === store.myId)

watch(
  myTurn,
  (now) => {
    if (now) vibrate([180, 80, 180])
  },
  { immediate: true },
)
</script>

<template>
  <div class="space-y-5 pb-40">
    <section>
      <h2 class="mb-3 font-display text-3xl">第{{ ROUND_NAMES[game.round] }}回合</h2>
      <RoundHeads :round="game.round" />
    </section>
    <TurnTracker />

    <TurnPanel v-if="myTurn" />
    <template v-else>
      <section class="rounded-3xl border border-ink-line bg-ink-raised px-5 py-8 text-center">
        <p class="text-mist">現在輪到</p>
        <p class="mt-2"><PlayerChip :id="game.current" size="lg" /></p>
        <p class="mt-4 text-sm text-mist">輪到你時手機會震動。等待時請把注意力放回桌上。</p>
      </section>
      <BottomBar>
        <AppButton variant="secondary" block @click="emit('records')">查看我的紀錄</AppButton>
      </BottomBar>
    </template>
  </div>
</template>
