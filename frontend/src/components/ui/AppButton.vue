<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    block?: boolean
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', type: 'button' },
)

const variants = {
  primary: 'bg-cinnabar text-paper hover:bg-cinnabar-bright',
  secondary: 'border border-gilt/60 text-gilt hover:bg-gilt/10',
  ghost: 'text-mist hover:text-paper',
  danger: 'border border-cinnabar-bright/70 text-cinnabar-bright hover:bg-cinnabar/10',
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl px-5 text-base font-medium transition-colors disabled:opacity-40"
    :class="[variants[variant], block && 'w-full']"
  >
    <slot />
  </button>
</template>
