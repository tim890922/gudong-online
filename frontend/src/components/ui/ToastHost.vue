<script setup lang="ts">
import { useRoomStore } from '../../stores/room'

const store = useRoomStore()
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
    <TransitionGroup
      enter-from-class="-translate-y-2 opacity-0"
      leave-to-class="opacity-0"
      enter-active-class="transition duration-200"
      leave-active-class="transition duration-200"
    >
      <div
        v-for="t in store.toasts"
        :key="t.id"
        class="max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg"
        :class="t.tone === 'error' ? 'bg-cinnabar text-paper' : 'bg-paper text-paper-ink'"
      >
        {{ t.text }}
      </div>
    </TransitionGroup>
  </div>
</template>
