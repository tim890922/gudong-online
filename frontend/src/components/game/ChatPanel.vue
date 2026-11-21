<script setup lang="ts">
import { Send } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { COLOR_HEX } from '../../lib/game'
import { useRoomStore } from '../../stores/room'
import ToggleRow from '../ui/ToggleRow.vue'

const MAX_CHARS = 200 // 和伺服器的上限一樣

const store = useRoomStore()
const draft = ref('')
const list = ref<HTMLElement | null>(null)
const open = computed(() => store.view?.settings.chat !== false)
const chatEnabled = computed({
  get: () => open.value,
  set: (enabled: boolean) => store.send({ type: 'set_chat', enabled }),
})

function send() {
  const text = draft.value.trim()
  if (text && store.sendChat(text)) draft.value = ''
}

function scrollToEnd() {
  nextTick(() => {
    if (list.value) list.value.scrollTop = list.value.scrollHeight
  })
}
watch(() => store.chat.at(-1)?.id, scrollToEnd)
onMounted(scrollToEnd)

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
}
</script>

<template>
  <div class="flex h-[60dvh] flex-col">
    <ToggleRow
      v-if="store.isHost"
      v-model="chatEnabled"
      class="border-b border-ink-line"
      label="開放聊天室"
      hint="關閉後大家都不能發言，已經送出的訊息還看得到"
    />
    <ol ref="list" class="flex-1 space-y-3 overflow-y-auto py-3">
      <li v-if="!store.chat.length" class="pt-10 text-center text-mist">還沒有人說話</li>
      <li v-for="m in store.chat" :key="m.id" :class="m.player_id === store.myId && 'text-right'">
        <p class="text-xs text-mist">
          <span
            v-if="m.color !== null"
            class="mr-1 inline-block size-2 rounded-full align-middle ring-1 ring-paper/40"
            :style="{ background: COLOR_HEX[m.color] }"
          />
          {{ m.name }} · {{ time(m.ts) }}
        </p>
        <p
          class="mt-1 inline-block max-w-[85%] rounded-2xl px-3 py-2 text-left break-words"
          :class="m.player_id === store.myId ? 'bg-patina text-paper' : 'bg-ink text-paper'"
        >
          {{ m.text }}
        </p>
      </li>
    </ol>
    <form v-if="open" class="flex gap-2 pt-2" @submit.prevent="send">
      <input
        v-model="draft"
        :maxlength="MAX_CHARS"
        enterkeyhint="send"
        autocomplete="off"
        placeholder="說點什麼…"
        aria-label="聊天訊息"
        class="min-h-12 flex-1 rounded-xl border border-ink-line bg-ink px-3 text-paper placeholder:text-mist/50"
      />
      <button
        type="submit"
        class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-cinnabar text-paper disabled:opacity-40"
        :disabled="!draft.trim()"
        aria-label="送出"
      >
        <Send :size="20" />
      </button>
    </form>
    <p v-else class="py-3 text-center text-sm text-mist">房主已關閉聊天室</p>
  </div>
</template>
