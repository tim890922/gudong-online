<script setup lang="ts">
import RulesContent from '../components/game/RulesContent.vue'
</script>

<template>
  <main class="mx-auto max-w-lg px-4 pt-6 pb-12">
    <RouterLink to="/" class="text-sm text-mist hover:text-paper">回首頁</RouterLink>
    <h1 class="mt-3 mb-5 font-display text-4xl">規則速查</h1>
    <RulesContent />
  </main>
</template>
