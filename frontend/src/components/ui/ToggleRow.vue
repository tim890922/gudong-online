<script setup lang="ts">
defineProps<{ label: string; hint?: string; disabled?: boolean }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <label class="flex items-center justify-between gap-4 py-3" :class="disabled && 'opacity-45'">
    <span>
      <span class="block">{{ label }}</span>
      <span v-if="hint" class="mt-0.5 block text-sm text-mist">{{ hint }}</span>
    </span>
    <span class="relative inline-flex shrink-0">
      <input v-model="model" type="checkbox" class="peer sr-only" :disabled="disabled" />
      <span class="h-7 w-12 rounded-full bg-ink-line transition-colors peer-checked:bg-patina peer-focus-visible:outline-2 peer-focus-visible:outline-gilt" />
      <span class="absolute top-1 left-1 size-5 rounded-full bg-paper transition-transform peer-checked:translate-x-5" />
    </span>
  </label>
</template>
