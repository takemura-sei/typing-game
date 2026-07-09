<script setup lang="ts">
import type { BattleResult } from '~/composables/useGameMachine'

const props = defineProps<{
  result: BattleResult
  opponentName: string
  myRematch: boolean
  oppRematch: boolean
  /** 相手が退室済みでリマッチ不可 */
  opponentGone: boolean
}>()

defineEmits<{ rematch: []; leave: [] }>()

const title = computed(() => {
  switch (props.result.outcome) {
    case 'win':
      return props.result.reason === 'forfeit' ? '不戦勝!' : '勝利!'
    case 'loss':
      return '敗北…'
    default:
      return '引き分け'
  }
})
const titleClass = computed(() => {
  switch (props.result.outcome) {
    case 'win':
      return 'text-amber-300'
    case 'loss':
      return 'text-slate-400'
    default:
      return 'text-sky-300'
  }
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80">
    <div class="rounded-2xl bg-slate-900 border border-slate-700 p-10 text-center w-80">
      <p class="text-5xl font-black mb-2" :class="titleClass">{{ title }}</p>
      <p v-if="result.reason === 'forfeit'" class="text-sm text-slate-400 mb-6">
        {{ opponentName }} が切断しました
      </p>
      <p v-else class="text-sm text-slate-400 mb-6">vs {{ opponentName }}</p>

      <div class="flex flex-col gap-3">
        <button
          class="rounded-xl px-6 py-3 font-bold transition-colors"
          :class="
            opponentGone
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : myRematch
                ? 'bg-slate-700 text-slate-300 cursor-wait'
                : 'bg-emerald-600 hover:bg-emerald-500'
          "
          :disabled="opponentGone || myRematch"
          @click="$emit('rematch')"
        >
          <template v-if="opponentGone">相手が退室しました</template>
          <template v-else-if="myRematch">相手の応答待ち…</template>
          <template v-else-if="oppRematch">リマッチ(相手が希望中!)</template>
          <template v-else>リマッチ</template>
        </button>
        <button
          class="rounded-xl bg-slate-800 hover:bg-slate-700 px-6 py-3 font-bold transition-colors"
          @click="$emit('leave')"
        >
          退室する
        </button>
      </div>
    </div>
  </div>
</template>
