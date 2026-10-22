<script setup lang="ts">
import type { Outcome } from '../../lib/types'
import SealMark from './SealMark.vue'

withDefaults(
  defineProps<{
    label: string
    caption?: string
    selected?: boolean
    disabled?: boolean
    interactive?: boolean
    outcome?: Outcome | null
    animate?: boolean
    size?: 'md' | 'lg'
  }>(),
  { size: 'md', outcome: null },
)
defineEmits<{ select: [] }>()
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    :disabled="interactive ? disabled : undefined"
    :aria-pressed="interactive ? selected : undefined"
    class="relative flex aspect-square flex-col items-center justify-center rounded-2xl border bg-bronze text-paper shadow-[inset_0_1px_0_rgb(232_217_197/0.12),inset_0_-10px_18px_rgb(0_0_0/0.35)] transition"
    :class="[
      selected ? 'border-gilt ring-2 ring-gilt' : 'border-gilt/25',
      interactive && !disabled ? 'hover:border-gilt/70 active:scale-[0.97]' : '',
      disabled && !outcome ? 'opacity-35' : '',
    ]"
    @click="interactive && !disabled && $emit('select')"
  >
    <span class="font-display leading-none text-paper" :class="size === 'lg' ? 'text-5xl' : 'text-4xl'">{{ label }}</span>
    <span v-if="caption" class="mt-1.5 text-xs text-mist">{{ caption }}</span>
    <SealMark v-if="outcome" :outcome="outcome" size="sm" :animate="animate" class="absolute -top-2 -right-2" />
  </component>
</template>
