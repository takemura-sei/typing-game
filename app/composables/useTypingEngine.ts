import {
  createMatcher,
  displayKana,
  displayRomaji,
  isComplete,
  processKey,
  type KeyResult,
  type MatcherState,
} from '../utils/romaji/matcher'
import type { Word } from '../types/game'

export interface TypingWordResult {
  word: Word
  elapsedMs: number
  keystrokes: number
  misses: number
}

export interface TypingEngineHooks {
  onHit?: () => void
  onMiss?: () => void
  onWordComplete?: (result: TypingWordResult) => void
}

/**
 * ローマ字matcherのreactiveラッパー + キーボード捕捉。
 * コンポーネントのsetup内で呼ぶ(unmount時にリスナーを自動解除)。
 */
export function useTypingEngine(hooks: TypingEngineHooks = {}) {
  // matcherは破壊的更新するのでversionで再計算をトリガーする
  let state: MatcherState | null = null
  const version = ref(0)
  const currentWord = ref<Word | null>(null)
  let wordStartedAt = 0

  const romaji = computed(() => {
    void version.value
    return state ? displayRomaji(state) : { typed: '', rest: '' }
  })
  const kana = computed(() => {
    void version.value
    return state ? displayKana(state) : { done: '', current: '', rest: '' }
  })
  const stats = computed(() => {
    void version.value
    return { keystrokes: state?.keystrokes ?? 0, misses: state?.misses ?? 0 }
  })

  function loadWord(word: Word) {
    currentWord.value = word
    state = createMatcher(word.reading)
    wordStartedAt = performance.now()
    version.value++
  }

  function handleKey(key: string): KeyResult {
    if (!state || !currentWord.value) return 'ignored'
    const result = processKey(state, key)
    version.value++
    if (result === 'miss') {
      hooks.onMiss?.()
    } else if (result === 'hit' || result === 'segment_complete') {
      hooks.onHit?.()
    } else if (result === 'word_complete') {
      hooks.onHit?.()
      hooks.onWordComplete?.({
        word: currentWord.value,
        elapsedMs: performance.now() - wordStartedAt,
        keystrokes: state.keystrokes,
        misses: state.misses,
      })
    }
    return result
  }

  function onKeydown(e: KeyboardEvent) {
    // IME変換中・修飾キー付きは無視
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key.length !== 1) return
    const key = e.key.toLowerCase()
    if (!/^[a-z0-9-]$/.test(key)) return
    e.preventDefault()
    handleKey(key)
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

  return {
    currentWord,
    romaji,
    kana,
    stats,
    loadWord,
    isWordComplete: () => (state ? isComplete(state) : false),
  }
}
