<script setup lang="ts">
import { useSoloPractice } from '~/composables/use-solo-practice'

const {
  wordsSource,
  sandbagHp,
  defeatedCount,
  combo,
  maxCombo,
  totalMisses,
  wordsTyped,
  kpm,
  accuracy,
  lastDamage,
  shaking,
  currentWord,
  kana,
  romaji,
} = useSoloPractice()
</script>

<template>
  <main
    class="min-h-screen flex flex-col items-center gap-8 p-8"
    :class="{ 'animate-[shake_0.3s]': shaking }"
  >
    <header class="w-full max-w-2xl flex items-center justify-between">
      <NuxtLink to="/" class="text-slate-400 hover:text-slate-200 text-sm">← ホーム</NuxtLink>
      <p class="text-sm text-slate-400">
        撃破数 <span class="text-amber-300 font-bold">{{ defeatedCount }}</span>
      </p>
    </header>

    <SoloBoard
      :sandbag-hp="sandbagHp"
      :last-damage="lastDamage"
      :combo="combo"
      :max-combo="maxCombo"
      :current-word="currentWord"
      :kana="kana"
      :romaji="romaji"
      :miss-count="totalMisses"
      :kpm="kpm"
      :accuracy="accuracy"
      :words-typed="wordsTyped"
      :words-source="wordsSource"
    />
  </main>
</template>

<style>
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  50% { transform: translateX(6px); }
  75% { transform: translateX(-3px); }
}
</style>
