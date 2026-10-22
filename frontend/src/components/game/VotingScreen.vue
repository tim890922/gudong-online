<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { ROUND_NAMES } from '../../lib/game'
import { useRoomStore } from '../../stores/room'
import AppButton from '../ui/AppButton.vue'
import BottomBar from '../ui/BottomBar.vue'
import ConfirmModal from '../ui/ConfirmModal.vue'
import PlayerChip from './PlayerChip.vue'
import SealMark from './SealMark.vue'
import ZodiacTile from './ZodiacTile.vue'

const emit = defineEmits<{ records: [] }>()
const store = useRoomStore()
const game = computed(() => store.game!)
const me = computed(() => game.value.me!)
const chips = computed(() => store.view!.settings.vote_mode === 'chips')
const lastRound = computed(() => game.value.round === 2)
const slots = [0, 1, 2, 3]
const pos = (slot: number) => game.value.round * 4 + slot

const counts = ref([0, 0, 0, 0])
const confirming = ref(false)
// 分開比對兩個值：getter 若回傳新陣列，每次收到狀態廣播都會被當成變化而清掉輸入
watch(
  [() => game.value.stage, () => game.value.round],
  () => {
    counts.value = [0, 0, 0, 0]
    confirming.value = false
  },
)

const total = computed(() => counts.value.reduce((a, b) => a + b, 0))
const balance = computed(() => me.value.chip_balance)
const submitted = computed(() => game.value.chip_submitted.includes(store.myId))
const maxPer = computed(() => (chips.value ? balance.value : 99))
const canAdd = computed(() => total.value < maxPer.value)
const chipsValid = computed(() => (lastRound.value ? total.value === balance.value : total.value <= balance.value))

function change(slot: number, delta: number) {
  const next = counts.value[slot] + delta
  if (next < 0 || (delta > 0 && !canAdd.value)) return
  counts.value[slot] = next
}

function submit() {
  confirming.value = false
  if (chips.value) store.send({ type: 'submit_chips', alloc: counts.value })
  else store.send({ type: 'submit_host_votes', votes: counts.value })
}

const result = computed(() => game.value.round_results[game.value.round])
// 依名次排列：入選的兩件在前，其餘照原本順序
const ranked = computed(() => {
  const r = result.value
  if (!r) return []
  const order = [r.first, r.second, ...slots.filter((s) => s !== r.first && s !== r.second)]
  return order.map((s) => ({ slot: s, votes: r.votes[s] }))
})
const summaryText = computed(() =>
  slots
    .filter((s) => counts.value[s] > 0)
    .map((s) => `${store.zodiac(pos(s))} ${counts.value[s]}`)
    .join('、') || '不投任何獸首',
)
</script>

<template>
  <div class="space-y-5 pb-40">
    <header>
      <h2 class="font-display text-3xl">
        第{{ ROUND_NAMES[game.round] }}回合{{ game.stage === 'discussion' ? '討論' : game.stage === 'voting' ? '投票' : '結果' }}
      </h2>
      <p v-if="game.stage === 'discussion'" class="mt-1 text-mist">
        所有人都行動完了。在桌上討論鑑定結果，討論完由房主開始投票。
      </p>
    </header>

    <!-- 討論中 -->
    <template v-if="game.stage === 'discussion'">
      <div class="grid grid-cols-4 gap-2.5">
        <ZodiacTile v-for="s in slots" :key="s" :label="store.zodiac(pos(s))" :caption="store.meta?.branches[pos(s)]" />
      </div>
      <BottomBar>
        <AppButton v-if="store.isHost" block @click="store.send({ type: 'start_voting' })">開始投票</AppButton>
        <p v-else class="py-2 text-center text-mist">討論完由房主開始投票</p>
        <AppButton variant="secondary" block @click="emit('records')">查看我的紀錄</AppButton>
      </BottomBar>
    </template>

    <!-- 投票中 -->
    <template v-else-if="game.stage === 'voting'">
      <template v-if="chips ? !submitted : store.isHost">
        <p class="text-mist">
          <template v-if="chips">
            你有 {{ balance }} 枚籌碼，已分配 {{ total }} 枚。
            <template v-if="lastRound">最後一回合要全部投完。</template>
            <template v-else>沒投完的會留到下一回合。</template>
          </template>
          <template v-else>依桌上實際的票數，輸入每件獸首得到幾票。</template>
        </p>
        <ul class="space-y-2.5">
          <li v-for="s in slots" :key="s" class="flex items-center gap-4 rounded-2xl bg-ink-raised p-3">
            <ZodiacTile :label="store.zodiac(pos(s))" class="w-16" />
            <div class="ml-auto flex items-center gap-3">
              <button
                class="flex size-12 items-center justify-center rounded-xl border border-ink-line disabled:opacity-30"
                :disabled="counts[s] === 0"
                :aria-label="`${store.zodiac(pos(s))} 減一`"
                @click="change(s, -1)"
              >
                <Minus :size="20" />
              </button>
              <span class="w-10 text-center font-display text-4xl tabular-nums" aria-live="polite">{{ counts[s] }}</span>
              <button
                class="flex size-12 items-center justify-center rounded-xl border border-gilt/60 text-gilt disabled:opacity-30"
                :disabled="!canAdd"
                :aria-label="`${store.zodiac(pos(s))} 加一`"
                @click="change(s, 1)"
              >
                <Plus :size="20" />
              </button>
            </div>
          </li>
        </ul>
        <BottomBar>
          <AppButton block :disabled="chips && !chipsValid" @click="confirming = true">
            {{ chips && lastRound && !chipsValid ? `還有 ${balance - total} 枚要投` : '送出投票' }}
          </AppButton>
        </BottomBar>
      </template>
      <section v-else class="rounded-3xl border border-ink-line bg-ink-raised px-5 py-8 text-center">
        <p class="font-display text-2xl">{{ chips ? '你已經投票了' : '房主正在輸入票數' }}</p>
        <p v-if="chips && me.my_chips" class="mt-2 text-mist">
          你投了：{{ slots.filter((s) => me.my_chips![s]).map((s) => `${store.zodiac(pos(s))} ${me.my_chips![s]}`).join('、') || '沒有投' }}
        </p>
      </section>
      <section v-if="chips">
        <h3 class="mb-2 text-sm text-mist">已投票 {{ game.chip_submitted.length }} / {{ game.seats.length }}</h3>
        <ul class="flex flex-wrap gap-2">
          <li
            v-for="id in game.seats"
            :key="id"
            class="rounded-full border px-3 py-1"
            :class="game.chip_submitted.includes(id) ? 'border-patina bg-patina/20' : 'border-dashed border-ink-line text-mist'"
          >
            <PlayerChip :id="id" size="sm" />
          </li>
        </ul>
      </section>
    </template>

    <!-- 結果 -->
    <template v-else-if="result">
      <ul class="space-y-2.5">
        <li
          v-for="r in ranked"
          :key="r.slot"
          class="flex items-center gap-4 rounded-2xl border p-3"
          :class="r.slot === result.first || r.slot === result.second ? 'border-gilt bg-gilt/10' : 'border-ink-line bg-ink-raised'"
        >
          <ZodiacTile :label="store.zodiac(pos(r.slot))" class="w-16 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="font-display text-3xl tabular-nums">{{ r.votes }} 票</p>
            <p v-if="r.slot === result.first" class="text-sm text-gilt">入選，真假不公開</p>
            <p v-else-if="r.slot === result.second" class="text-sm text-gilt">
              入選，是{{ result.second_genuine ? '真品' : '贗品' }}
            </p>
            <p v-else class="text-sm text-mist">未入選</p>
          </div>
          <SealMark
            v-if="r.slot === result.second"
            :outcome="result.second_genuine ? 'genuine' : 'fake'"
            size="md"
            animate
          />
        </li>
      </ul>

      <section v-if="result.allocations" class="overflow-x-auto rounded-2xl bg-ink-raised p-3">
        <h3 class="mb-2 font-display text-xl">誰投給誰</h3>
        <table class="w-full text-center text-sm">
          <thead>
            <tr class="text-mist">
              <th class="py-1.5 text-left font-normal">玩家</th>
              <th v-for="s in slots" :key="s" class="font-display text-lg font-normal">{{ store.zodiac(pos(s)) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="id in game.seats" :key="id" class="border-t border-ink-line">
              <td class="py-2 text-left"><PlayerChip :id="id" size="sm" /></td>
              <td
                v-for="s in slots"
                :key="s"
                class="tabular-nums"
                :class="result.allocations[id]?.[s] ? 'text-paper' : 'text-mist/40'"
              >
                {{ result.allocations[id]?.[s] ?? 0 }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <BottomBar>
        <AppButton v-if="store.isHost" block @click="store.send({ type: 'next_round' })">
          {{ lastRound ? '進入鑑人' : '開始下一回合' }}
        </AppButton>
        <p v-else class="py-2 text-center text-mist">等待房主繼續</p>
      </BottomBar>
    </template>

    <ConfirmModal :open="confirming" title="送出投票" confirm-text="送出" @confirm="submit" @cancel="confirming = false">
      {{ summaryText }}。送出後不能修改。
    </ConfirmModal>
  </div>
</template>
