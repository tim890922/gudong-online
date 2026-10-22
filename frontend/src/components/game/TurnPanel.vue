<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { OUTCOME_TEXT, ROUND_NAMES } from '../../lib/game'
import type { HeadTarget, IdentRecord } from '../../lib/types'
import { useRoomStore } from '../../stores/room'
import AppButton from '../ui/AppButton.vue'
import BottomBar from '../ui/BottomBar.vue'
import ConfirmModal from '../ui/ConfirmModal.vue'
import PlayerChip from './PlayerChip.vue'
import SealMark from './SealMark.vue'
import ZodiacTile from './ZodiacTile.vue'

const store = useRoomStore()
const game = computed(() => store.game!)
const me = computed(() => game.value.me!)
const turn = computed(() => me.value.turn!)
const bigEye = computed(() => turn.value.ident_kind === 'big_eye')

const selectedPos = ref<number | null>(null)
const selectedPlayer = ref<string | null>(null)
const swapChoice = ref<boolean | null>(null)
const confirming = ref(false)
const freshPos = ref<number | null>(null)

watch(
  () => turn.value.step,
  () => {
    selectedPos.value = null
    selectedPlayer.value = null
    swapChoice.value = null
    confirming.value = false
  },
)

const steps = [
  { key: 'identify', label: '鑑定' },
  { key: 'skill', label: '技能' },
  { key: 'pass', label: '交棒' },
] as const
const stepIndex = computed(() => steps.findIndex((s) => s.key === turn.value.step))

// ---------------------------------------------------------------- 鑑定

const groups = computed(() => {
  const targets = turn.value.head_targets ?? []
  const rounds = [...new Set(targets.map((t) => t.round))]
  return rounds.map((r) => ({ round: r, tiles: targets.filter((t) => t.round === r) }))
})

function resultFor(pos: number): IdentRecord | undefined {
  return turn.value.results.find((r) => r.kind === 'head' && r.pos === pos)
}

function roundFull(round: number): boolean {
  return (turn.value.used?.[String(round)] ?? 0) >= (turn.value.uses[String(round)] ?? 0)
}

function tileDisabled(t: HeadTarget): boolean {
  return turn.value.ident_done || turn.value.attempted.includes(t.pos) || roundFull(t.round)
}

const usesLeft = computed(() => {
  const total = Object.values(turn.value.uses).reduce((a, b) => a + b, 0)
  const used = Object.values(turn.value.used ?? {}).reduce((a, b) => a + b, 0)
  return total - used
})

const selectedLabel = computed(
  () => turn.value.head_targets?.find((t) => t.pos === selectedPos.value)?.label ?? '',
)
const latest = computed(() => turn.value.results.at(-1))

function labelFor(rec: IdentRecord): string {
  if (rec.kind === 'player') return store.player(rec.target)?.name ?? ''
  return turn.value.head_targets?.find((t) => t.pos === rec.pos)?.label ?? ''
}

function identify() {
  if (selectedPos.value == null) return
  freshPos.value = selectedPos.value
  store.send({ type: 'identify_head', pos: selectedPos.value })
  selectedPos.value = null
}

function checkPlayer() {
  if (!selectedPlayer.value) return
  store.send({ type: 'identify_player', target: selectedPlayer.value })
  selectedPlayer.value = null
}

const others = computed(() => game.value.seats.filter((s) => s !== store.myId))
const checkedResult = (id: string) =>
  me.value.records.find((r) => r.kind === 'player' && r.target === id && r.outcome !== 'ambushed')

// ---------------------------------------------------------------- 技能

const skill = computed(() => turn.value.skill)
const skillTargets = computed(() => turn.value.skill_targets ?? [])
const teammate = computed(() => me.value.known.some((k) => k.player_id === selectedPlayer.value))

const noSkillText = computed(() => {
  if (turn.value.ambushed) return '你被偷襲了，這回合不能使用技能。'
  if (turn.value.poison_left === 0) return '毒藥已經用完了。'
  return '你沒有要在這時使用的技能。'
})

const skillVerb = computed(() => {
  if (skill.value === 'ambush') return `偷襲${store.player(selectedPlayer.value)?.name ?? ''}`
  if (skill.value === 'poison') return `對${store.player(selectedPlayer.value)?.name ?? ''}下毒`
  if (skill.value === 'block') return `封鎖${store.zodiac(selectedPos.value ?? -1)}`
  if (skill.value === 'swap') return swapChoice.value ? '發動能力' : '不發動'
  return ''
})

const skillReady = computed(() => {
  if (skill.value === 'ambush' || skill.value === 'poison') return !!selectedPlayer.value
  if (skill.value === 'block') return selectedPos.value != null
  if (skill.value === 'swap') return swapChoice.value != null
  return true
})

function useSkill() {
  confirming.value = false
  if (skill.value === 'ambush' || skill.value === 'poison') {
    store.send({ type: 'use_skill', kind: skill.value, target: selectedPlayer.value })
  } else if (skill.value === 'block') {
    store.send({ type: 'use_skill', kind: 'block', pos: selectedPos.value })
  } else if (skill.value === 'swap') {
    store.send({ type: 'use_skill', kind: 'swap', swap: swapChoice.value })
  }
}

function skipSkill() {
  store.send({ type: 'use_skill', kind: 'none' })
}

// ---------------------------------------------------------------- 交棒

const remaining = computed(() => turn.value.remaining ?? [])

function passTo() {
  confirming.value = false
  store.send({ type: 'pass_to', target: remaining.value.length ? selectedPlayer.value : null })
}
</script>

<template>
  <section class="rounded-3xl bg-paper p-5 text-paper-ink">
    <ol class="mb-4 flex items-center gap-2 text-sm" aria-label="行動步驟">
      <li
        v-for="(s, i) in steps"
        :key="s.key"
        class="flex items-center gap-1.5"
        :class="i === stepIndex ? 'font-medium text-paper-ink' : 'text-paper-muted'"
        :aria-current="i === stepIndex ? 'step' : undefined"
      >
        <span
          class="flex size-6 items-center justify-center rounded-full text-xs"
          :class="i === stepIndex ? 'bg-cinnabar text-paper' : i < stepIndex ? 'bg-paper-ink/80 text-paper' : 'border border-paper-ink/30'"
        >
          {{ i + 1 }}
        </span>
        {{ s.label }}
        <span v-if="i < steps.length - 1" class="mx-1 h-px w-5 bg-paper-ink/25" />
      </li>
    </ol>

    <!-- 鑑定獸首 -->
    <template v-if="turn.step === 'identify' && turn.ident_kind !== 'player'">
      <h2 class="font-display text-3xl">鑑定獸首</h2>
      <p class="mt-1 text-paper-muted">
        <template v-if="turn.ident_done">本回合的鑑定已完成。</template>
        <template v-else-if="bigEye">你只看得到位置編號。每一列各鑑定 1 件。</template>
        <template v-else>選一件獸首，還可以鑑定 {{ usesLeft }} 件。</template>
      </p>
      <div v-for="g in groups" :key="g.round" class="mt-4">
        <p v-if="bigEye" class="mb-2 text-sm text-paper-muted">第{{ ROUND_NAMES[g.round] }}回合</p>
        <div class="grid grid-cols-4 gap-2.5">
          <ZodiacTile
            v-for="t in g.tiles"
            :key="t.pos"
            :label="t.label"
            interactive
            :selected="selectedPos === t.pos"
            :disabled="tileDisabled(t)"
            :outcome="resultFor(t.pos)?.outcome"
            :animate="freshPos === t.pos"
            @select="selectedPos = t.pos"
          />
        </div>
      </div>
    </template>

    <!-- 方震查驗玩家 -->
    <template v-else-if="turn.step === 'identify'">
      <h2 class="font-display text-3xl">查驗玩家</h2>
      <p class="mt-1 text-paper-muted">
        {{ turn.ident_done ? '本回合的查驗已完成。' : '選一位玩家查看他的陣營，同一人只能查一次。' }}
      </p>
      <ul class="mt-4 grid grid-cols-2 gap-2">
        <li v-for="id in others" :key="id">
          <button
            class="flex min-h-14 w-full items-center justify-between gap-2 rounded-xl border px-3 text-left disabled:opacity-60"
            :class="selectedPlayer === id ? 'border-cinnabar bg-cinnabar/10' : 'border-paper-ink/20'"
            :disabled="turn.ident_done || !turn.player_targets?.includes(id)"
            @click="selectedPlayer = id"
          >
            <PlayerChip :id="id" size="sm" :show-you="false" />
            <SealMark v-if="checkedResult(id)" :outcome="checkedResult(id)!.outcome" size="sm" />
          </button>
        </li>
      </ul>
    </template>

    <!-- 本回合結果 -->
    <div v-if="turn.step === 'identify' && latest" class="mt-5 flex items-center gap-4 rounded-2xl bg-paper-deep p-4">
      <SealMark :key="turn.results.length" :outcome="latest.outcome" size="lg" animate />
      <div>
        <p class="font-display text-2xl leading-snug">
          <template v-if="latest.outcome === 'ambushed'">你被偷襲了</template>
          <template v-else-if="latest.outcome === 'unknown'">{{ labelFor(latest) }}無法辨別真偽</template>
          <template v-else>{{ labelFor(latest) }}是{{ OUTCOME_TEXT[latest.outcome] }}</template>
        </p>
        <p v-if="latest.outcome === 'ambushed'" class="mt-1 text-sm text-paper-muted">
          這回合無法鑑定，也不能使用技能。
        </p>
      </div>
    </div>

    <!-- 技能 -->
    <template v-if="turn.step === 'skill'">
      <h2 class="font-display text-3xl">使用技能</h2>
      <p v-if="!skill" class="mt-3 text-lg">{{ noSkillText }}</p>

      <template v-else-if="skill === 'ambush' || skill === 'poison'">
        <p class="mt-1 text-paper-muted">
          {{ skill === 'ambush' ? '被偷襲的人下一次鑑定會失敗。' : `被下毒的人下一次鑑定結果會顛倒，剩 ${turn.poison_left} 次。` }}
          還沒行動的人這回合就會受影響。
        </p>
        <div v-for="acted in [false, true]" :key="String(acted)" class="mt-4">
          <p class="mb-2 text-sm text-paper-muted">{{ acted ? '已經行動' : '還沒行動' }}</p>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="t in skillTargets.filter((x) => x.acted === acted)"
              :key="t.player_id"
              class="min-h-13 rounded-xl border px-3 text-left"
              :class="selectedPlayer === t.player_id ? 'border-cinnabar bg-cinnabar/10' : 'border-paper-ink/20'"
              @click="selectedPlayer = t.player_id"
            >
              <PlayerChip :id="t.player_id" size="sm" :show-you="false" />
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="skill === 'block'">
        <p class="mt-1 text-paper-muted">封鎖一件獸首，之後鑑定它的人都無法辨別真偽。</p>
        <div class="mt-4 grid grid-cols-4 gap-2.5">
          <ZodiacTile
            v-for="t in turn.block_targets"
            :key="t.pos"
            :label="t.label"
            interactive
            :selected="selectedPos === t.pos"
            @select="selectedPos = t.pos"
          />
        </div>
      </template>

      <template v-else-if="skill === 'swap'">
        <p class="mt-1 text-paper-muted">
          發動後，這回合在你之後行動的許願、黃煙煙、木戶加奈、劉局會看到相反的鑑定結果。
        </p>
        <div class="mt-4 grid grid-cols-2 gap-3">
          <button
            v-for="opt in [true, false]"
            :key="String(opt)"
            class="min-h-20 rounded-2xl border-2 font-display text-2xl"
            :class="swapChoice === opt ? 'border-cinnabar bg-cinnabar/10' : 'border-paper-ink/20'"
            @click="swapChoice = opt"
          >
            {{ opt ? '發動' : '不發動' }}
          </button>
        </div>
      </template>
    </template>

    <!-- 交棒 -->
    <template v-if="turn.step === 'pass'">
      <h2 class="font-display text-3xl">{{ remaining.length ? '交給下一位' : '你是本回合最後一位' }}</h2>
      <p class="mt-1 text-paper-muted">
        {{ remaining.length ? '選擇下一位行動的玩家，記得把首家標記交給他。' : '結束後大家開始討論，再由房主開始投票。你會是下一回合的首家。' }}
      </p>
      <div v-if="remaining.length" class="mt-4 grid grid-cols-2 gap-2">
        <button
          v-for="id in remaining"
          :key="id"
          class="min-h-13 rounded-xl border px-3 text-left"
          :class="selectedPlayer === id ? 'border-cinnabar bg-cinnabar/10' : 'border-paper-ink/20'"
          @click="selectedPlayer = id"
        >
          <PlayerChip :id="id" size="sm" :show-you="false" />
        </button>
      </div>
    </template>
  </section>

  <BottomBar>
    <template v-if="turn.step === 'identify'">
      <AppButton v-if="turn.ident_done" block @click="store.send({ type: 'advance' })">下一步</AppButton>
      <AppButton v-else-if="turn.ident_kind === 'player'" block :disabled="!selectedPlayer" @click="checkPlayer">
        {{ selectedPlayer ? `查驗${store.player(selectedPlayer)?.name}` : '請選擇玩家' }}
      </AppButton>
      <AppButton v-else block :disabled="selectedPos == null" @click="identify">
        {{ selectedPos != null ? `鑑定${selectedLabel}` : '請選擇獸首' }}
      </AppButton>
    </template>
    <template v-else-if="turn.step === 'skill'">
      <AppButton v-if="!skill" block @click="skipSkill">繼續</AppButton>
      <template v-else>
        <AppButton block :disabled="!skillReady" @click="confirming = true">{{ skillReady ? skillVerb : '請先選擇' }}</AppButton>
        <AppButton v-if="skill !== 'swap'" variant="ghost" block @click="skipSkill">這回合不使用</AppButton>
      </template>
    </template>
    <template v-else>
      <AppButton block :disabled="remaining.length > 0 && !selectedPlayer" @click="remaining.length ? (confirming = true) : passTo()">
        <template v-if="!remaining.length">結束行動，開始討論</template>
        <template v-else-if="selectedPlayer">交給{{ store.player(selectedPlayer)?.name }}</template>
        <template v-else>請選擇下一位</template>
      </AppButton>
    </template>
  </BottomBar>

  <ConfirmModal
    :open="confirming && turn.step === 'skill'"
    :title="skillVerb"
    confirm-text="確定"
    @confirm="useSkill"
    @cancel="confirming = false"
  >
    <template v-if="teammate">{{ store.player(selectedPlayer)?.name }}是你的隊友，確定嗎？</template>
    <template v-else>確定之後就不能更改。</template>
  </ConfirmModal>
  <ConfirmModal
    :open="confirming && turn.step === 'pass'"
    :title="`交給${store.player(selectedPlayer)?.name ?? ''}`"
    confirm-text="交棒"
    @confirm="passTo"
    @cancel="confirming = false"
  >
    交棒後輪到他行動，你這回合就結束了。
  </ConfirmModal>
</template>
