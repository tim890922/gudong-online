<script setup lang="ts">
import { onMounted } from 'vue'
import ToastHost from './components/ui/ToastHost.vue'
import { useRoomStore } from './stores/room'

const store = useRoomStore()
onMounted(() => store.loadMeta().catch(() => {}))
</script>

<template>
  <RouterView />
  <ToastHost />
</template>
