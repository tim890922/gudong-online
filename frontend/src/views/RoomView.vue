<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ActingScreen from '../components/game/ActingScreen.vue'
import HoldToReveal from '../components/game/HoldToReveal.vue'
import PeopleVoteScreen from '../components/game/PeopleVoteScreen.vue'
import RecordsList from '../components/game/RecordsList.vue'
import ResultScreen from '../components/game/ResultScreen.vue'
import RoleCard from '../components/game/RoleCard.vue'
import RolesScreen from '../components/game/RolesScreen.vue'
import RoomHeader from '../components/game/RoomHeader.vue'
import RulesContent from '../components/game/RulesContent.vue'
import VotingScreen from '../components/game/VotingScreen.vue'
import LobbyScreen from '../components/lobby/LobbyScreen.vue'
import AppButton from '../components/ui/AppButton.vue'
import BottomSheet from '../components/ui/BottomSheet.vue'
import ConfirmModal from '../components/ui/ConfirmModal.vue'
import { useWakeLock } from '../composables/useWakeLock'
import { api } from '../lib/api'
import { clearCredentials, loadCredentials, savedName, saveCredentials } from '../lib/credentials'
import { useRoomStore } from '../stores/room'

const route = useRoute()
const router = useRouter()
const store = useRoomStore()
useWakeLock()

const code = computed(() => String(route.params.code).toUpperCase())
const needsJoin = ref(false)
const joinError = ref('')
const name = ref(savedName.get())
const busy = ref(false)
const sheet = ref<'records' | 'rules' | null>(null)
const confirmAbort = ref(false)
const confirmLeave = ref(false)

async function enter() {
  needsJoin.value = false
  joinError.value = ''
  try {
    await store.loadMeta()
  } catch {
    joinError.value = '連不上伺服器，請確認網路後重新整理'
    return
  }
  const cred = loadCredentials(code.value)
  if (cred) {
    store.connect(cred)
    return
  }
  const summary = await api.roomSummary(code.value).catch(() => null)
  if (!summary?.exists) joinError.value = `找不到房間 ${code.value}，請確認房號`
  else if (summary.started) joinError.value = '這個房間的遊戲已經開始，無法加入'
  else if (!summary.joinable) joinError.value = '房間已滿'
  else needsJoin.value = true
}

async function join() {
  if (!name.value.trim()) return store.toast('請先輸入暱稱')
  busy.value = true
  try {
    const cred = await api.joinRoom(code.value, name.value.trim())
    savedName.set(name.value.trim())
    saveCredentials(cred)
    needsJoin.value = false
    store.connect(cred)
  } catch (e) {
    store.toast((e as Error).message)
  } finally {
    busy.value = false
  }
}

function leave() {
  confirmLeave.value = false
  store.send({ type: 'leave' })
  clearCredentials(code.value)
  store.disconnect()
  router.push('/')
}

function abort() {
  confirmAbort.value = false
  store.send({ type: 'abort_game' })
}

onMounted(enter)
watch(code, enter)
onBeforeUnmount(() => store.disconnect())

const phase = computed(() => store.view?.phase)
const me = computed(() => store.me)
</script>

<template>
  <div class="min-h-dvh">
    <!-- 無法進入 -->
    <main v-if="joinError" class="mx-auto max-w-lg px-4 pt-16 text-center">
      <p class="font-display text-3xl">{{ joinError }}</p>
      <AppButton class="mt-8" variant="secondary" @click="router.push('/')">回首頁</AppButton>
    </main>

    <!-- 被移出或房間消失 -->
    <main v-else-if="store.status === 'removed'" class="mx-auto max-w-lg px-4 pt-16 text-center">
      <p class="font-display text-3xl">{{ store.removedMessage || '你已離開房間' }}</p>
      <AppButton class="mt-8" variant="secondary" @click="router.push('/')">回首頁</AppButton>
    </main>

    <!-- 第一次進房：輸入暱稱 -->
    <main v-else-if="needsJoin" class="mx-auto max-w-lg px-4 pt-10">
      <p class="text-mist">加入房間</p>
      <p class="font-display text-6xl tracking-[0.3em] text-gilt">{{ code }}</p>
      <label class="mt-8 block">
        <span class="mb-2 block text-sm text-mist">你的暱稱</span>
        <input
          v-model="name"
          maxlength="12"
          autocomplete="nickname"
          placeholder="例如：阿明"
          class="min-h-13 w-full rounded-xl border border-ink-line bg-ink-raised px-4 text-lg text-paper placeholder:text-mist/50"
          @keydown.enter="join"
        />
      </label>
      <AppButton class="mt-4" block :disabled="busy || !name.trim()" @click="join">加入</AppButton>
    </main>

    <!-- 房間內 -->
    <template v-else-if="store.view">
      <RoomHeader
        @records="sheet = 'records'"
        @rules="sheet = 'rules'"
        @abort="confirmAbort = true"
        @leave="confirmLeave = true"
      />
      <main class="mx-auto max-w-lg px-4 pt-5">
        <LobbyScreen v-if="phase === 'lobby'" @leave="confirmLeave = true" />
        <template v-else-if="me">
          <RolesScreen v-if="phase === 'roles'" />
          <ActingScreen v-else-if="phase === 'acting'" @records="sheet = 'records'" />
          <VotingScreen
            v-else-if="phase === 'discussion' || phase === 'voting' || phase === 'vote_result'"
            @records="sheet = 'records'"
          />
          <PeopleVoteScreen v-else-if="phase === 'people_vote'" @records="sheet = 'records'" />
          <ResultScreen v-else-if="phase === 'ended'" />
        </template>
        <p v-else class="pt-10 text-center text-mist">這局開始時你不在房間裡，請等下一局。</p>
      </main>
    </template>

    <main v-else class="flex min-h-dvh items-center justify-center text-mist" role="status">連線中…</main>

    <BottomSheet :open="sheet === 'records'" title="我的紀錄" @close="sheet = null">
      <template v-if="me">
        <HoldToReveal v-if="me.role" label="按住查看你的角色" class="mb-5">
          <RoleCard :me="me" />
        </HoldToReveal>
        <HoldToReveal label="按住查看鑑定紀錄">
          <div class="min-h-40">
            <RecordsList :records="me.records" :big-eye="me.role === 'big_eye'" />
          </div>
        </HoldToReveal>
        <p v-if="!store.view?.settings.allow_history" class="mt-3 text-sm text-mist">房主設定只能看本回合的紀錄。</p>
      </template>
    </BottomSheet>
    <BottomSheet :open="sheet === 'rules'" title="規則速查" @close="sheet = null">
      <RulesContent />
    </BottomSheet>

    <ConfirmModal :open="confirmAbort" title="中止這局" confirm-text="中止" @confirm="abort" @cancel="confirmAbort = false">
      所有人會回到大廳，這局的進度不會保留。
    </ConfirmModal>
    <ConfirmModal :open="confirmLeave" title="離開房間" confirm-text="離開" @confirm="leave" @cancel="confirmLeave = false">
      離開後要重新輸入房號才能再加入。
    </ConfirmModal>
  </div>
</template>
