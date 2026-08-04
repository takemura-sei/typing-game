import { defineStore } from 'pinia'
import { loadWords as loadWordsService } from '../services/words'
import type { Word } from '../types/game'

export type WordsSource = 'db' | 'fallback' | 'loading'

/** お題の取得。wordsテーブルから読み、失敗時はローカルフォールバック */
export const useWordsStore = defineStore('words', {
  state: () => ({
    words: [] as Word[],
    source: 'loading' as WordsSource,
  }),
  actions: {
    async loadWords() {
      if (this.words.length > 0) return
      const result = await loadWordsService()
      this.words = result.words
      this.source = result.source
    },

    /** シャッフルした出題列を返す */
    shuffled(): Word[] {
      const list = [...this.words]
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[list[i], list[j]] = [list[j]!, list[i]!]
      }
      return list
    },
  },
})
