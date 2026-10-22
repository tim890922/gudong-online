<script setup lang="ts" generic="T extends string">
defineProps<{ options: { value: T; label: string }[]; disabled?: boolean; label: string }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="grid grid-flow-col gap-1 rounded-xl bg-ink p-1" role="radiogroup" :aria-label="label">
    <button
      v-for="o in options"
      :key="o.value"
      role="radio"
      :aria-checked="model === o.value"
      :disabled="disabled"
      class="min-h-11 rounded-lg px-3 text-sm transition-colors disabled:cursor-default"
      :class="model === o.value ? 'bg-gilt text-ink font-medium' : 'text-mist hover:text-paper'"
      @click="model = o.value"
    >
      {{ o.label }}
    </button>
  </div>
</template>
