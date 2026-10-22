<script setup lang="ts">
import { Download } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { FACTION_TEXT, ROUND_NAMES } from '../../lib/game'
import { useRoomStore } from '../../stores/room'
import AppButton from '../ui/AppButton.vue'
import BottomBar from '../ui/BottomBar.vue'
import PlayerChip from './PlayerChip.vue'
import ZodiacTile from './ZodiacTile.vue'

const store = useRoomStore()
const game = computed(() => store.game!)
const final = computed(() => game.value.final!)
const result = computed(() => final.value.result!)
const goodWins = computed(() => result.value.winner === 'good')
const showLog = ref(false)

const lines = computed(() => [
  { label: '入選的真品', value: result.value.genuine_selected, note: `${result.value.genuine_selected} 件` },
  {
    label: '找出老朝奉',
    value: result.value.boss_found ? 1 : 0,
    note: result.value.boss_target
      ? `指認 ${store.player(result.value.boss_target)?.name}${result.value.boss_found ? '，正確' : '，錯誤'}`
      : `沒有人得到 ${result.value.boss_required} 票以上的唯一最高票`,
  },
  { label: '許願沒被找到', value: result.value.xu_found ? 0 : 2, note: result.value.xu_found ? '被老朝奉找到了' : '老朝奉沒找到' },
  { label: '方震沒被找到', value: result.value.fang_found ? 0 : 1, note: result.value.fang_found ? '被找到了' : '沒被找到' },
])

function selectedIn(round: number, slot: number): boolean {
  const r = game.value.round_results[round]
  return !!r && (r.first === slot || r.second === slot)
}

function download() {
  const text = [`古董局中局 房號 ${store.view!.code}`, '', ...final.value.log].join('\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `古董局中局-${store.view!.code}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-6 pb-44">
    <section class="rounded-3xl p-6 text-center" :class="goodWins ? 'bg-patina' : 'bg-cinnabar'">
      <p class="text-paper/80">許願陣營 {{ result.score }} 分（需要 {{ store.meta?.good_win_score }} 分）</p>
      <p class="mt-1 font-display text-4xl text-paper">{{ FACTION_TEXT[result.winner] }}獲勝</p>
    </section>

    <section class="rounded-2xl bg-ink-raised p-4">
      <h2 class="font-display text-2xl">計分</h2>
      <dl class="mt-2 divide-y divide-ink-line">
        <div v-for="l in lines" :key="l.label" class="flex items-center justify-between py-2.5">
          <dt>
            <span class="block">{{ l.label }}</span>
            <span class="text-sm text-mist">{{ l.note }}</span>
          </dt>
          <dd class="font-display text-3xl tabular-nums">+{{ l.value }}</dd>
        </div>
      </dl>
    </section>

    <section>
      <h2 class="mb-2 font-display text-2xl">身分揭曉</h2>
      <ul class="divide-y divide-ink-line rounded-2xl bg-ink-raised">
        <li v-for="id in game.seats" :key="id" class="flex min-h-13 items-center justify-between gap-2 px-4">
          <PlayerChip :id="id" />
          <span class="text-sm text-mist">指認 {{ store.player(final.people_votes[id])?.name }}</span>
          <span
            class="font-display text-xl"
            :class="store.meta?.roles[final.roles[id]].faction === 'good' ? 'text-patina-light' : 'text-cinnabar-bright'"
          >
            {{ store.roleName(final.roles[id]) }}
          </span>
        </li>
      </ul>
    </section>

    <section>
      <h2 class="mb-2 font-display text-2xl">十二獸首</h2>
      <div v-for="r in [0, 1, 2]" :key="r" class="mb-3">
        <p class="mb-1.5 text-sm text-mist">第{{ ROUND_NAMES[r] }}回合</p>
        <div class="grid grid-cols-4 gap-2.5">
          <ZodiacTile
            v-for="s in [0, 1, 2, 3]"
            :key="s"
            :label="store.zodiac(r * 4 + s)"
            :caption="selectedIn(r, s) ? '入選' : undefined"
            :selected="selectedIn(r, s)"
            :outcome="final.genuine[r * 4 + s] ? 'genuine' : 'fake'"
          />
        </div>
      </div>
    </section>

    <section class="rounded-2xl bg-ink-raised p-4">
      <button class="flex w-full items-center justify-between" :aria-expanded="showLog" @click="showLog = !showLog">
        <h2 class="font-display text-2xl">完整紀錄</h2>
        <span class="text-sm text-gilt">{{ showLog ? '收起' : '展開' }}</span>
      </button>
      <ol v-if="showLog" class="mt-3 space-y-1 text-sm leading-relaxed text-paper/85">
        <li v-for="(line, i) in final.log" :key="i" :class="line.startsWith('【') ? 'pt-2 font-display text-lg text-gilt' : ''">
          {{ line }}
        </li>
      </ol>
    </section>

    <BottomBar>
      <AppButton v-if="store.isHost" block @click="store.send({ type: 'play_again' })">同一批人再來一局</AppButton>
      <p v-else class="py-2 text-center text-mist">房主可以開始下一局</p>
      <AppButton variant="secondary" block @click="download"><Download :size="18" /> 下載紀錄</AppButton>
    </BottomBar>
  </div>
</template>
