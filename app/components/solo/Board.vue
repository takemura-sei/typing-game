<script setup lang="ts">
import type { Word } from '~/types/game'
import type { WordsSource } from '~/types/words'

defineProps<{
  sandbagHp: number
  lastDamage: { value: number; key: number } | null
  combo: number
  maxCombo: number
  currentWord: Word | null
  kana: { done: string; current: string; rest: string }
  romaji: { typed: string; rest: string }
  missCount: number
  kpm: number
  accuracy: number
  wordsTyped: number
  wordsSource: WordsSource
}>()
</script>

<template>
  <section class="w-full max-w-2xl">
    <BattleHpBar :hp="sandbagHp" label="サンドバッグ" />
    <p v-if="lastDamage" :key="lastDamage.key" class="text-right text-red-400 font-bold mt-1 animate-pulse">
      -{{ lastDamage.value }}
    </p>
  </section>

  <BattleComboMeter :combo="combo" />

  <section v-if="currentWord" class="flex flex-col gap-6 mt-4">
    <TypingWordDisplay :display="currentWord.display" :kana="kana" />
    <TypingRomajiDisplay :typed="romaji.typed" :rest="romaji.rest" :miss-count="missCount" />
  </section>
  <p v-else class="text-slate-400">お題を読み込み中…</p>

  <footer class="mt-auto w-full max-w-2xl">
    <div class="flex justify-center gap-8 text-sm text-slate-400 tabular-nums">
      <span>KPM <span class="text-slate-100 font-bold">{{ kpm }}</span></span>
      <span>正確率 <span class="text-slate-100 font-bold">{{ accuracy }}%</span></span>
      <span>最大コンボ <span class="text-slate-100 font-bold">{{ maxCombo }}</span></span>
      <span>単語数 <span class="text-slate-100 font-bold">{{ wordsTyped }}</span></span>
    </div>
    <p class="text-center text-xs text-slate-600 mt-3">
      IMEはOFF(半角英数)にしてください
      <span v-if="wordsSource === 'fallback'" class="ml-2 text-amber-600">※お題: ローカル(DB未接続)</span>
    </p>
  </footer>
</template>
