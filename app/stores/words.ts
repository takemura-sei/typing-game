import { defineStore } from 'pinia'
import { ref } from 'vue'
import { loadWords as loadWordsService } from '../services/words'
import type { Word } from '../types/game'

export type WordsSource = 'db' | 'fallback' | 'loading'

/** お題の取得。wordsテーブルから読み、失敗時はローカルフォールバック */
export const useWordsStore = defineStore('words', () => {
  const words = ref<Word[]>([])
  const source = ref<WordsSource>('loading')

  async function loadWords() {
    if (words.value.length > 0) return
    const result = await loadWordsService()
    words.value = result.words
    source.value = result.source
  }

  /** シャッフルした出題列を返す */
  function shuffled(): Word[] {
    const list = [...words.value]
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[list[i], list[j]] = [list[j]!, list[i]!]
    }
    return list
  }

  return { words, source, loadWords, shuffled }
})
