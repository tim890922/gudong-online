<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppButton from '../components/ui/AppButton.vue'
import { api } from '../lib/api'
import { lastRoom, savedName, saveCredentials } from '../lib/credentials'
import { useRoomStore } from '../stores/room'

const router = useRouter()
const store = useRoomStore()
const name = ref(savedName.get())
const code = ref('')
const busy = ref(false)
const resume = ref<string | null>(null)
const nameOk = computed(() => name.value.trim().length > 0)
const codeOk = computed(() => code.value.length === 4)

onMounted(() => {
  resume.value = lastRoom()
})

function normalize(e: Event) {
  const input = e.target as HTMLInputElement
  code.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
  input.value = code.value
}

async function create() {
  if (!nameOk.value) return store.toast('請先輸入暱稱')
  busy.value = true
  try {
    const cred = await api.createRoom(name.value.trim())
    savedName.set(name.value.trim())
    saveCredentials(cred)
    router.push(`/r/${cred.code}`)
  } catch (e) {
    store.toast((e as Error).message)
  } finally {
    busy.value = false
  }
}

function join() {
  if (!codeOk.value) return store.toast('房號是 4 個字')
  if (nameOk.value) savedName.set(name.value.trim())
  router.push(`/r/${code.value}`)
}

// 首頁的主角是十二件獸首本身
const ZODIAC = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬']
</script>

<template>
  <main class="mx-auto max-w-lg px-4 pt-8 pb-12">
    <div class="grid grid-cols-6 gap-1.5" aria-hidden="true">
      <span
        v-for="(z, i) in ZODIAC"
        :key="z"
        class="flex aspect-square items-center justify-center rounded-lg border font-display text-2xl"
        :class="i === 4 ? 'border-cinnabar bg-cinnabar text-paper' : 'border-gilt/20 bg-bronze text-paper/80'"
      >
        {{ z }}
      </span>
    </div>
    <h1 class="mt-6 font-display text-5xl leading-tight">古董局中局</h1>
    <p class="mt-2 text-lg text-mist">面對面玩桌遊，每人用自己的手機鑑寶、發技能、投票。不用註冊。</p>

    <RouterLink
      v-if="resume"
      :to="`/r/${resume}`"
      class="mt-6 flex min-h-13 items-center justify-between rounded-xl border border-gilt/60 px-4 text-gilt"
    >
      <span>回到房間</span>
      <span class="font-display text-2xl tracking-widest">{{ resume }}</span>
    </RouterLink>

    <label class="mt-8 block">
      <span class="mb-2 block text-sm text-mist">你的暱稱</span>
      <input
        v-model="name"
        maxlength="12"
        autocomplete="nickname"
        placeholder="例如：阿明"
        class="min-h-13 w-full rounded-xl border border-ink-line bg-ink-raised px-4 text-lg text-paper placeholder:text-mist/50"
      />
    </label>

    <section class="mt-6 rounded-2xl bg-ink-raised p-5">
      <h2 class="font-display text-2xl">開一個房間</h2>
      <p class="mt-1 text-sm text-mist">你會成為房主，把房號或 QR code 給大家掃。</p>
      <AppButton class="mt-4" block :disabled="busy" @click="create">建立房間</AppButton>
    </section>

    <section class="mt-4 rounded-2xl bg-ink-raised p-5">
      <h2 class="font-display text-2xl">加入朋友的房間</h2>
      <label class="mt-3 block">
        <span class="sr-only">房號</span>
        <input
          :value="code"
          inputmode="text"
          autocapitalize="characters"
          autocomplete="off"
          placeholder="房號"
          class="min-h-14 w-full rounded-xl border border-ink-line bg-ink px-4 text-center font-display text-4xl tracking-[0.4em] text-gilt uppercase placeholder:text-2xl placeholder:tracking-normal placeholder:text-mist/50"
          @input="normalize"
          @keydown.enter="join"
        />
      </label>
      <AppButton class="mt-3" variant="secondary" block :disabled="!codeOk" @click="join">加入房間</AppButton>
    </section>

    <RouterLink to="/rules" class="mt-8 block text-center text-gilt underline-offset-4 hover:underline">規則速查</RouterLink>
    <p class="mt-6 text-center text-xs text-mist/70">
      粉絲製作的桌遊輔助工具，與官方無關。規則參考自
      <a class="underline" href="https://github.com/pride829/gudong" target="_blank" rel="noopener">pride829/gudong</a>。
    </p>
  </main>
</template>
