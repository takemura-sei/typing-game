<script setup lang="ts">
import type { RoomStatus } from '~/types/room'

const props = defineProps<{
  code: string
  role: 'host' | 'guest'
  status: RoomStatus
  opponentName: string | null
  myReady: boolean
  oppReady: boolean
}>()

defineEmits<{ ready: [] }>()

const copied = ref(false)
async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // クリップボード不可の環境は無視(コードは画面に見えている)
  }
}
</script>

<template>
  <div class="flex flex-col items-center gap-8 text-center">
    <div>
      <p class="text-sm text-slate-400 mb-2">ルームコード</p>
      <button
        class="text-5xl font-black tracking-[0.3em] font-mono hover:text-amber-300 transition-colors"
        title="クリックでコピー"
        @click="copyCode"
      >
        {{ code }}
      </button>
      <p class="text-xs text-slate-500 mt-2 h-4">
        {{ copied ? 'コピーしました!' : 'クリックでコピーして相手に共有' }}
      </p>
    </div>

    <div class="w-72 rounded-xl border border-slate-700 bg-slate-900 p-6">
      <template v-if="status === 'connected' && opponentName !== null">
        <p class="text-lg mb-1">
          対戦相手: <span class="font-bold text-emerald-400">{{ opponentName }}</span>
        </p>
        <p class="text-sm text-slate-400 mb-4">
          {{ oppReady ? '相手は準備完了!' : '相手の準備を待っています' }}
        </p>
        <button
          class="w-full rounded-xl px-6 py-3 font-bold transition-colors"
          :class="myReady ? 'bg-slate-700 text-slate-300 cursor-wait' : 'bg-emerald-600 hover:bg-emerald-500'"
          :disabled="myReady"
          @click="$emit('ready')"
        >
          {{ myReady ? '相手を待っています…' : '準備完了!' }}
        </button>
      </template>
      <template v-else>
        <p class="text-lg animate-pulse">
          {{ role === 'host' ? '対戦相手を待っています…' : '入室しています…' }}
        </p>
      </template>
    </div>
  </div>
</template>
