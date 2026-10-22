<script setup lang="ts">
import AppButton from './AppButton.vue'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    confirmText?: string
    cancelText?: string
  }>(),
  { confirmText: '確定', cancelText: '取消' },
)
const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
      @click.self="emit('cancel')"
    >
      <div class="w-full max-w-sm rounded-2xl bg-paper p-6 text-paper-ink shadow-2xl" role="alertdialog" :aria-label="title">
        <h2 class="font-display text-2xl">{{ title }}</h2>
        <div class="mt-3 text-paper-muted">
          <slot />
        </div>
        <div class="mt-6 grid grid-cols-2 gap-3">
          <button
            class="min-h-12 rounded-xl border border-paper-ink/25 text-paper-ink hover:bg-paper-deep"
            @click="emit('cancel')"
          >
            {{ cancelText }}
          </button>
          <AppButton @click="emit('confirm')">{{ confirmText }}</AppButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>
