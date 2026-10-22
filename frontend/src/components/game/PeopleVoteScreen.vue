<script setup lang="ts">
import { computed, ref } from 'vue'
import { GOAL_TEXT } from '../../lib/game'
import { useRoomStore } from '../../stores/room'
import AppButton from '../ui/AppButton.vue'
import BottomBar from '../ui/BottomBar.vue'
import ConfirmModal from '../ui/ConfirmModal.vue'
import HoldToReveal from './HoldToReveal.vue'
import PlayerChip from './PlayerChip.vue'

const emit = defineEmits<{ records: [] }>()
const store = useRoomStore()
const game = computed(() => store.game!)
const me = computed(() => game.value.me!)
const selected = ref<string | null>(null)
const confirming = ref(false)
const others = computed(() => game.value.seats.filter((s) => s !== store.myId))
const goal = computed(() => (me.value.people_vote_goal ? GOAL_TEXT[me.value.people_vote_goal] : null))

function vote() {
  confirming.value = false
  if (selected.value) store.send({ type: 'people_vote', target: selected.value })
}
</script>

<template>
  <div class="space-y-5 pb-44">
    <header>
      <h2 class="font-display text-3xl">鑑人</h2>
      <p class="mt-1 text-mist">每個人同時在自己的手機上指認一位玩家。結果會公開誰投給誰。</p>
    </header>

    <HoldToReveal label="按住查看你要找誰">
      <div class="rounded-2xl bg-paper p-5 text-paper-ink">
        <p class="text-sm text-paper-muted">你是{{ me.role_name }}</p>
        <p class="font-display text-4xl">{{ goal ?? '隨意投一位' }}</p>
        <p v-if="!goal" class="mt-1 text-sm text-paper-muted">鄭國渠的票不計分，但還是要投。</p>
      </div>
    </HoldToReveal>

    <template v-if="!me.people_vote">
      <ul class="grid grid-cols-2 gap-2">
        <li v-for="id in others" :key="id">
          <button
            class="flex min-h-14 w-full items-center justify-between rounded-xl border px-3 text-left disabled:opacity-35"
            :class="selected === id ? 'border-gilt bg-gilt/10' : 'border-ink-line bg-ink-raised'"
            :disabled="me.forbidden_targets.includes(id)"
            @click="selected = id"
          >
            <PlayerChip :id="id" size="sm" />
            <span v-if="me.forbidden_targets.includes(id)" class="text-xs text-mist">隊友</span>
          </button>
        </li>
      </ul>
    </template>
    <section v-else class="rounded-3xl border border-ink-line bg-ink-raised px-5 py-6 text-center">
      <p class="font-display text-2xl">你已經投票了</p>
      <p class="mt-2 text-mist">你指認了 <PlayerChip :id="me.people_vote" size="sm" /></p>
    </section>

    <section>
      <h3 class="mb-2 text-sm text-mist">已投票 {{ game.people_voted.length }} / {{ game.seats.length }}</h3>
      <ul class="flex flex-wrap gap-2">
        <li
          v-for="id in game.seats"
          :key="id"
          class="rounded-full border px-3 py-1"
          :class="game.people_voted.includes(id) ? 'border-patina bg-patina/20' : 'border-dashed border-ink-line text-mist'"
        >
          <PlayerChip :id="id" size="sm" />
        </li>
      </ul>
    </section>

    <BottomBar>
      <AppButton v-if="!me.people_vote" block :disabled="!selected" @click="confirming = true">
        {{ selected ? `指認${store.player(selected)?.name}` : '請選擇一位玩家' }}
      </AppButton>
      <AppButton variant="secondary" block @click="emit('records')">查看我的紀錄</AppButton>
    </BottomBar>

    <ConfirmModal :open="confirming" title="確認指認" confirm-text="送出" @confirm="vote" @cancel="confirming = false">
      要指認{{ store.player(selected)?.name }}嗎？送出後不能修改。
    </ConfirmModal>
  </div>
</template>
