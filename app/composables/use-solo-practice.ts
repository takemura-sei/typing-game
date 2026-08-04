import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { resolveAttack } from '../utils/battle/damage'
import { INITIAL_HP } from '../types/game'
import type { Word } from '../types/game'
import { useWords } from './use-words'
import { useTypingEngine } from './use-typing-engine'

/**
 * ソロ練習(サンドバッグ相手の一人打ち)の状態管理。
 * setup内で呼ぶこと(onMounted/onBeforeUnmountを内部で使う)。
 */
export function useSoloPractice() {
  const words = useWords()

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
    await words.loadWords()
    queue.value = words.shuffled()
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

  return {
    wordsSource: words.source,
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
    currentWord: engine.currentWord,
    kana: engine.kana,
    romaji: engine.romaji,
  }
}
