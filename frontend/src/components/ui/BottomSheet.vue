<script setup lang="ts">
import { X } from 'lucide-vue-next'

defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
      enter-active-class="transition-opacity duration-150"
      leave-active-class="transition-opacity duration-150"
    >
      <div v-if="open" class="fixed inset-0 z-40 flex items-end justify-center bg-black/60" @click.self="emit('close')">
        <section
          class="flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl border-t border-gilt/30 bg-ink-raised pb-safe"
          role="dialog"
          :aria-label="title"
        >
          <header class="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 class="font-display text-xl text-gilt">{{ title }}</h2>
            <button class="-mr-2 p-2 text-mist hover:text-paper" aria-label="關閉" @click="emit('close')">
              <X :size="22" />
            </button>
          </header>
          <div class="overflow-y-auto px-5 pb-4">
            <slot />
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
