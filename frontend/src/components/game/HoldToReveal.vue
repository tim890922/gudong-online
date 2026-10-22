<script setup lang="ts">
import { Eye } from 'lucide-vue-next'
import { ref } from 'vue'

withDefaults(defineProps<{ label?: string }>(), { label: '按住查看' })
const shown = ref(false)
const show = () => (shown.value = true)
const hide = () => (shown.value = false)
</script>

<template>
  <div
    class="relative touch-none select-none"
    tabindex="0"
    role="button"
    :aria-label="label"
    @pointerdown.prevent="show"
    @pointerup="hide"
    @pointerleave="hide"
    @pointercancel="hide"
    @contextmenu.prevent
    @keydown.space.prevent="show"
    @keyup.space="hide"
    @blur="hide"
  >
    <div :class="shown ? '' : 'invisible'" :aria-hidden="!shown">
      <slot />
    </div>
    <div
      v-if="!shown"
      class="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gilt/50 bg-ink-raised text-gilt"
    >
      <Eye :size="28" />
      <span>{{ label }}</span>
      <span class="text-xs text-mist">放開就會遮住</span>
    </div>
  </div>
</template>
