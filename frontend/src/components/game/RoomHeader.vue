<script setup lang="ts">
import { BookOpen, EllipsisVertical, ScrollText, WifiOff } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRoomStore } from '../../stores/room'

const emit = defineEmits<{ records: []; rules: []; abort: []; leave: [] }>()
const store = useRoomStore()
const menu = ref(false)
const inGame = computed(() => !!store.game)

const PHASE_TEXT: Record<string, string> = {
  lobby: '等待開始',
  roles: '確認角色',
  acting: '行動中',
  discussion: '討論中',
  voting: '投票中',
  vote_result: '投票結果',
  people_vote: '鑑人',
  ended: '本局結束',
}
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-ink-line bg-ink/95 backdrop-blur">
    <div class="mx-auto flex h-14 max-w-lg items-center gap-2 px-4">
      <span class="font-display text-2xl tracking-widest text-gilt">{{ store.view?.code }}</span>
      <span class="text-sm text-mist">{{ PHASE_TEXT[store.view?.phase ?? 'lobby'] }}</span>
      <span class="flex-1" />
      <button v-if="inGame && store.me" class="p-2 text-mist hover:text-paper" aria-label="我的紀錄" @click="emit('records')">
        <ScrollText :size="22" />
      </button>
      <button class="p-2 text-mist hover:text-paper" aria-label="規則" @click="emit('rules')">
        <BookOpen :size="22" />
      </button>
      <div class="relative">
        <button class="-mr-2 p-2 text-mist hover:text-paper" aria-label="更多" :aria-expanded="menu" @click="menu = !menu">
          <EllipsisVertical :size="22" />
        </button>
        <div
          v-if="menu"
          class="absolute right-0 mt-1 w-44 overflow-hidden rounded-xl border border-ink-line bg-ink-raised shadow-xl"
          @click="menu = false"
        >
          <button v-if="inGame && store.isHost" class="block w-full px-4 py-3 text-left hover:bg-ink" @click="emit('abort')">
            中止這局
          </button>
          <button v-if="!inGame" class="block w-full px-4 py-3 text-left hover:bg-ink" @click="emit('leave')">離開房間</button>
          <RouterLink to="/" class="block px-4 py-3 hover:bg-ink">回首頁</RouterLink>
        </div>
      </div>
    </div>
    <div
      v-if="store.status === 'reconnecting'"
      class="flex items-center justify-center gap-2 bg-cinnabar/90 py-1.5 text-sm text-paper"
      role="status"
    >
      <WifiOff :size="16" /> 連線中斷，正在重新連線
    </div>
  </header>
</template>
