<script setup lang="ts">
import { Crown, Info, Pencil, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { COLOR_HEX } from '../../lib/game'
import type { Settings } from '../../lib/types'
import { useRoomStore } from '../../stores/room'
import PlayerChip from '../game/PlayerChip.vue'
import AppButton from '../ui/AppButton.vue'
import BottomBar from '../ui/BottomBar.vue'
import BottomSheet from '../ui/BottomSheet.vue'
import ConfirmModal from '../ui/ConfirmModal.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'
import ToggleRow from '../ui/ToggleRow.vue'
import InvitePanel from './InvitePanel.vue'

const emit = defineEmits<{ leave: [] }>()
const store = useRoomStore()
const view = computed(() => store.view!)
const meta = computed(() => store.meta!)
const me = computed(() => store.player(store.myId))
const count = computed(() => view.value.players.length)
const canStart = computed(() => count.value >= meta.value.min_players && count.value <= meta.value.max_players)

const editing = ref(false)
const nameDraft = ref('')
const confirmKick = ref<string | null>(null)
const confirmHost = ref<string | null>(null)
const roleInfo = ref<string | null>(null)

function openEditor() {
  nameDraft.value = me.value?.name ?? ''
  editing.value = true
}

function saveName() {
  const name = nameDraft.value.trim()
  if (name && name !== me.value?.name) store.send({ type: 'set_profile', name })
  editing.value = false
}

function pickColor(color: number) {
  store.send({ type: 'set_profile', color })
}

function update<K extends keyof Settings>(key: K, value: Settings[K]) {
  const next = { ...view.value.settings, [key]: value }
  // 大眼賊和藥來都取代姬雲浮，只能擇一
  if (key === 'fan_big_eye' && value) next.fan_yao_lai = false
  if (key === 'fan_yao_lai' && value) next.fan_big_eye = false
  store.send({ type: 'update_settings', settings: next })
}

const settings = computed(() => view.value.settings)
const takenColors = computed(() => new Set(view.value.players.filter((p) => p.id !== store.myId).map((p) => p.color)))
const fullTable = computed(() => count.value === meta.value.max_players)

const roleMode = computed({
  get: () => settings.value.role_mode,
  set: (v) => update('role_mode', v),
})
const voteMode = computed({
  get: () => settings.value.vote_mode,
  set: (v) => update('vote_mode', v),
})
const fan = (key: 'fan_big_eye' | 'fan_yao_lai' | 'fan_director' | 'fan_mo_yao') =>
  computed({ get: () => settings.value[key], set: (v: boolean) => update(key, v) })
const bigEye = fan('fan_big_eye')
const yaoLai = fan('fan_yao_lai')
const director = fan('fan_director')
const moYao = fan('fan_mo_yao')
const allowHistory = computed({
  get: () => settings.value.allow_history,
  set: (v: boolean) => update('allow_history', v),
})

const summary = computed(() => {
  const s = settings.value
  const fans = [
    s.fan_big_eye && fullTable.value && '大眼賊',
    s.fan_yao_lai && fullTable.value && '藥來',
    s.fan_director && '劉局',
    s.fan_mo_yao && '魔藥不然',
  ].filter(Boolean)
  return [
    s.role_mode === 'random' ? '系統隨機發角色' : '玩家輸入實體角色卡',
    s.vote_mode === 'host' ? '房主輸入總票數' : '每人線上投籌碼（公開誰投給誰）',
    s.first_player_id ? `首家：${store.player(s.first_player_id)?.name}` : '首家隨機',
    fans.length ? `粉絲角色：${fans.join('、')}` : '不使用粉絲角色',
  ]
})

function doKick() {
  if (confirmKick.value) store.send({ type: 'kick', player_id: confirmKick.value })
  confirmKick.value = null
}

function doTransfer() {
  if (confirmHost.value) store.send({ type: 'transfer_host', player_id: confirmHost.value })
  confirmHost.value = null
}
</script>

<template>
  <div class="space-y-5 pb-44">
    <InvitePanel />

    <section>
      <div class="mb-2 flex items-baseline justify-between">
        <h2 class="font-display text-2xl">玩家</h2>
        <span class="text-sm" :class="canStart ? 'text-patina-light' : 'text-mist'">
          {{ count }} / {{ meta.max_players }} 人<template v-if="!canStart">，至少要 {{ meta.min_players }} 人</template>
        </span>
      </div>
      <ul class="divide-y divide-ink-line rounded-2xl bg-ink-raised">
        <li v-for="p in view.players" :key="p.id" class="flex min-h-14 items-center gap-2 px-4">
          <PlayerChip :id="p.id" class="flex-1" />
          <Crown v-if="p.id === view.host_id" :size="18" class="text-gilt" aria-label="房主" />
          <span v-if="!p.connected" class="text-xs text-mist">離線</span>
          <button v-if="p.id === store.myId" class="p-2 text-mist hover:text-paper" aria-label="修改暱稱和顏色" @click="openEditor">
            <Pencil :size="18" />
          </button>
          <template v-else-if="store.isHost">
            <button class="p-2 text-mist hover:text-gilt" :aria-label="`把房主交給 ${p.name}`" @click="confirmHost = p.id">
              <Crown :size="18" />
            </button>
            <button class="p-2 text-mist hover:text-cinnabar-bright" :aria-label="`移除 ${p.name}`" @click="confirmKick = p.id">
              <X :size="18" />
            </button>
          </template>
        </li>
      </ul>
      <p class="mt-2 text-sm text-mist">顏色請對應桌上的座位指示物。點自己右邊的筆可以改暱稱和顏色。</p>
    </section>

    <section v-if="store.isHost" class="space-y-4 rounded-2xl bg-ink-raised p-4">
      <h2 class="font-display text-2xl">房間設定</h2>
      <div>
        <p class="mb-2 text-sm text-mist">角色分配</p>
        <SegmentedControl
          v-model="roleMode"
          label="角色分配"
          :options="[
            { value: 'random', label: '系統隨機發' },
            { value: 'manual', label: '輸入實體卡' },
          ]"
        />
      </div>
      <div>
        <p class="mb-2 text-sm text-mist">鑑寶投票</p>
        <SegmentedControl
          v-model="voteMode"
          label="鑑寶投票"
          :options="[
            { value: 'host', label: '房主輸入總票數' },
            { value: 'chips', label: '每人線上投' },
          ]"
        />
        <p v-if="voteMode === 'chips'" class="mt-2 text-sm text-mist">
          每人每回合 {{ meta.chips_per_round }} 枚籌碼，沒用完的留到下回合，第三回合要全部投完。結果會公開每個人投給哪件獸首。
        </p>
      </div>
      <label class="block">
        <span class="mb-2 block text-sm text-mist">首家</span>
        <select
          class="min-h-12 w-full rounded-xl border border-ink-line bg-ink px-3 text-paper"
          :value="settings.first_player_id ?? ''"
          @change="update('first_player_id', ($event.target as HTMLSelectElement).value || null)"
        >
          <option value="">隨機決定</option>
          <option v-for="p in view.players" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>
      <div class="divide-y divide-ink-line">
        <div class="flex items-center gap-1">
          <ToggleRow v-model="bigEye" class="flex-1" label="大眼賊" :hint="fullTable ? '取代姬雲浮' : '8 人局才能使用'" :disabled="!fullTable" />
          <button class="p-2 text-mist" aria-label="大眼賊規則" @click="roleInfo = 'big_eye'"><Info :size="18" /></button>
        </div>
        <div class="flex items-center gap-1">
          <ToggleRow v-model="yaoLai" class="flex-1" label="藥來" :hint="fullTable ? '取代姬雲浮' : '8 人局才能使用'" :disabled="!fullTable" />
          <button class="p-2 text-mist" aria-label="藥來規則" @click="roleInfo = 'yao_lai'"><Info :size="18" /></button>
        </div>
        <div class="flex items-center gap-1">
          <ToggleRow v-model="director" class="flex-1" label="劉局" hint="取代黃煙煙" />
          <button class="p-2 text-mist" aria-label="劉局規則" @click="roleInfo = 'director_liu'"><Info :size="18" /></button>
        </div>
        <div class="flex items-center gap-1">
          <ToggleRow v-model="moYao" class="flex-1" label="魔藥不然" hint="取代藥不然" />
          <button class="p-2 text-mist" aria-label="魔藥不然規則" @click="roleInfo = 'mo_yao_buran'"><Info :size="18" /></button>
        </div>
        <ToggleRow v-model="allowHistory" label="可以回看自己的鑑定紀錄" hint="關閉時只看得到本回合的結果" />
      </div>
    </section>
    <section v-else class="rounded-2xl bg-ink-raised p-4">
      <h2 class="font-display text-2xl">房間設定</h2>
      <ul class="mt-2 space-y-1 text-paper/85">
        <li v-for="line in summary" :key="line">{{ line }}</li>
      </ul>
      <p class="mt-2 text-sm text-mist">由房主設定。</p>
    </section>

    <BottomBar>
      <AppButton v-if="store.isHost" block :disabled="!canStart" @click="store.send({ type: 'start_game' })">
        {{ canStart ? `開始遊戲（${count} 人）` : `等待玩家加入（${count} / ${meta.min_players}）` }}
      </AppButton>
      <p v-else class="py-2 text-center text-mist">等待房主開始遊戲</p>
      <AppButton variant="ghost" block @click="emit('leave')">離開房間</AppButton>
    </BottomBar>

    <BottomSheet :open="editing" title="暱稱和顏色" @close="editing = false">
      <label class="block">
        <span class="mb-2 block text-sm text-mist">暱稱</span>
        <input
          v-model="nameDraft"
          maxlength="12"
          class="min-h-12 w-full rounded-xl border border-ink-line bg-ink px-3 text-lg text-paper"
          @keydown.enter="saveName"
        />
      </label>
      <p class="mt-5 mb-2 text-sm text-mist">座位顏色</p>
      <div class="grid grid-cols-4 gap-3">
        <button
          v-for="(name, i) in meta.colors"
          :key="name"
          class="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border text-sm disabled:opacity-30"
          :class="me?.color === i ? 'border-gilt bg-gilt/10' : 'border-ink-line'"
          :disabled="takenColors.has(i)"
          :aria-pressed="me?.color === i"
          @click="pickColor(i)"
        >
          <span class="size-6 rounded-full ring-1 ring-paper/50" :style="{ background: COLOR_HEX[i] }" />
          {{ name }}
        </button>
      </div>
      <AppButton class="mt-5" block @click="saveName">完成</AppButton>
    </BottomSheet>

    <BottomSheet :open="!!roleInfo" :title="roleInfo ? store.roleName(roleInfo) : ''" @close="roleInfo = null">
      <p class="leading-relaxed">{{ roleInfo ? meta.roles[roleInfo as keyof typeof meta.roles].description : '' }}</p>
    </BottomSheet>

    <ConfirmModal :open="!!confirmKick" title="移除玩家" confirm-text="移除" @confirm="doKick" @cancel="confirmKick = null">
      要把 {{ store.player(confirmKick)?.name }} 移出房間嗎？對方可以用房號再加入。
    </ConfirmModal>
    <ConfirmModal :open="!!confirmHost" title="移交房主" confirm-text="移交" @confirm="doTransfer" @cancel="confirmHost = null">
      要把房主交給 {{ store.player(confirmHost)?.name }} 嗎？設定和開始遊戲會改由對方操作。
    </ConfirmModal>
  </div>
</template>
