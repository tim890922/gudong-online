<script setup lang="ts">
import { Copy, QrCode, Share2 } from 'lucide-vue-next'
import QRCode from 'qrcode'
import { computed, ref, watchEffect } from 'vue'
import { useRoomStore } from '../../stores/room'

const store = useRoomStore()
const showQr = ref(true)
const qr = ref('')
const code = computed(() => store.view?.code ?? '')
const link = computed(() => `${store.publicBaseUrl || location.origin}/r/${code.value}`)
const canShare = typeof navigator.share === 'function'

watchEffect(async () => {
  if (!code.value) return
  qr.value = await QRCode.toDataURL(link.value, {
    margin: 1,
    width: 360,
    color: { dark: '#2b2620', light: '#e8d9c5' },
  })
})

async function share() {
  try {
    await navigator.share({ title: '古董局中局', text: `房號 ${code.value}，一起來鑑寶`, url: link.value })
  } catch {
    /* 使用者取消分享 */
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(link.value)
    store.toast('已複製加入連結', 'info')
  } catch {
    store.toast(`請手動複製：${link.value}`, 'info')
  }
}
</script>

<template>
  <section class="rounded-3xl border border-gilt/30 bg-ink-raised p-5 text-center">
    <p class="text-sm text-mist">房號</p>
    <p class="font-display text-6xl tracking-[0.3em] text-gilt" :aria-label="`房號 ${code.split('').join(' ')}`">
      {{ code }}
    </p>
    <img
      v-if="showQr && qr"
      :src="qr"
      alt="掃描加入房間的 QR code"
      class="mx-auto mt-4 w-48 rounded-xl"
      width="192"
      height="192"
    />
    <div class="mt-4 flex justify-center gap-2">
      <button
        class="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-ink-line px-4 text-sm text-paper hover:border-gilt/60"
        @click="showQr = !showQr"
      >
        <QrCode :size="18" /> {{ showQr ? '收起 QR' : '顯示 QR' }}
      </button>
      <button
        v-if="canShare"
        class="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-ink-line px-4 text-sm text-paper hover:border-gilt/60"
        @click="share"
      >
        <Share2 :size="18" /> 分享
      </button>
      <button
        class="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-ink-line px-4 text-sm text-paper hover:border-gilt/60"
        @click="copy"
      >
        <Copy :size="18" /> 複製連結
      </button>
    </div>
  </section>
</template>
