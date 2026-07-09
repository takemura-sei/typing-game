<script setup lang="ts">
import type { Word } from '~/types/game'
import { INITIAL_HP } from '~/types/game'
import { resolveAttack } from '~/utils/battle/damage'

const wordsStore = useWordsStore()

// 出題
const queue = ref<Word[]>([])
const queueIndex = ref(0)

// サンドバッグ(対戦のHPバー/ダメージ感覚をソロで確認する)
const sandbagHp = ref(INITIAL_HP)
const defeatedCount = ref(0)

// スコア
const combo = ref(0)
const maxCombo = ref(0)
const totalHits = ref(0)
const totalMisses = ref(0)
const wordsTyped = ref(0)
const sessionStartedAt = ref(0)
const now = ref(0)
let clockTimer: ReturnType<typeof setInterval> | null = null

// 演出
const lastDamage = ref<{ value: number; key: number } | null>(null)
const shaking = ref(false)

const kpm = computed(() => {
  const minutes = (now.value - sessionStartedAt.value) / 60000
  if (minutes <= 0) return 0
  return Math.round(totalHits.value / minutes)
})
const accuracy = computed(() => {
  const total = totalHits.value + totalMisses.value
  if (total === 0) return 100
  return Math.round((totalHits.value / total) * 1000) / 10
})

const engine = useTypingEngine({
  onHit: () => {
    totalHits.value++
  },
  onMiss: () => {
    totalMisses.value++
    combo.value = 0
  },
  onWordComplete: (result) => {
    wordsTyped.value++
    combo.value++
    maxCombo.value = Math.max(maxCombo.value, combo.value)

    const outcome = resolveAttack('normal', {
      word: result.word,
      combo: combo.value,
      elapsedMs: result.elapsedMs,
    })
    sandbagHp.value -= outcome.damage
    lastDamage.value = { value: outcome.damage, key: Date.now() }
    if (outcome.effects.some((e) => e.type === 'screen_shake')) {
      shaking.value = true
      setTimeout(() => (shaking.value = false), 300)
    }
    if (sandbagHp.value <= 0) {
      defeatedCount.value++
      sandbagHp.value = INITIAL_HP
    }
    nextWord()
  },
})

function nextWord() {
  if (queue.value.length === 0) return
  queueIndex.value = (queueIndex.value + 1) % queue.value.length
  engine.loadWord(queue.value[queueIndex.value]!)
}

onMounted(async () => {
  await wordsStore.loadWords()
  queue.value = wordsStore.shuffled()
  sessionStartedAt.value = performance.now()
  now.value = sessionStartedAt.value
  clockTimer = setInterval(() => (now.value = performance.now()), 1000)
  if (queue.value.length > 0) {
    engine.loadWord(queue.value[0]!)
  }
})
onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
})
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

    <section class="w-full max-w-2xl">
      <BattleHpBar :hp="sandbagHp" label="サンドバッグ" />
      <p v-if="lastDamage" :key="lastDamage.key" class="text-right text-red-400 font-bold mt-1 animate-pulse">
        -{{ lastDamage.value }}
      </p>
    </section>

    <BattleComboMeter :combo="combo" />

    <section v-if="engine.currentWord.value" class="flex flex-col gap-6 mt-4">
      <TypingWordDisplay
        :display="engine.currentWord.value.display"
        :kana="engine.kana.value"
      />
      <TypingRomajiDisplay
        :typed="engine.romaji.value.typed"
        :rest="engine.romaji.value.rest"
        :miss-count="totalMisses"
      />
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
        <span v-if="wordsStore.source === 'fallback'" class="ml-2 text-amber-600">※お題: ローカル(DB未接続)</span>
      </p>
    </footer>
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
