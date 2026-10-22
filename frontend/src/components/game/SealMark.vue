<script setup lang="ts">
import { computed } from 'vue'
import type { Outcome } from '../../lib/types'

const props = withDefaults(defineProps<{ outcome: Outcome; size?: 'sm' | 'md' | 'lg'; animate?: boolean }>(), {
  size: 'md',
  animate: false,
})

// 每種結果用不同的字和樣式，不只靠顏色區分
const STYLE: Record<Outcome, { char: string; cls: string }> = {
  genuine: { char: '真', cls: 'bg-cinnabar text-paper' },
  fake: { char: '贗', cls: 'bg-paper-ink text-paper ring-1 ring-paper/40' },
  unknown: { char: '疑', cls: 'border-2 border-dashed border-gilt text-gilt bg-ink/80' },
  ambushed: { char: '襲', cls: 'border-2 border-cinnabar-bright text-cinnabar-bright bg-ink/80' },
  good: { char: '許', cls: 'bg-patina text-paper' },
  bad: { char: '奉', cls: 'bg-cinnabar text-paper' },
}
const SIZE = { sm: 'size-7 text-base rounded-md', md: 'size-11 text-2xl rounded-lg', lg: 'size-20 text-5xl rounded-xl' }
const style = computed(() => STYLE[props.outcome])
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center font-display leading-none [--seal-tilt:-6deg]"
    :class="[style.cls, SIZE[size], animate ? 'animate-stamp' : 'rotate-[-6deg]']"
    aria-hidden="true"
  >
    {{ style.char }}
  </span>
</template>
