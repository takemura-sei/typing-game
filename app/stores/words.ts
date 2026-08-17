import { defineStore } from 'pinia'
import { loadWords as loadWordsService } from '../services/words'
import type { DifficultyTier, Word } from '../types/game'
import type { WordsSource } from '../types/words'
import { pickWordForTier } from '../utils/battle/tier'

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

    /** コンボ数に応じた難易度層から1語選ぶ(直前語の連続回避つき) */
    pickForTier(tier: DifficultyTier, excludeId: number | null = null): Word | null {
      return pickWordForTier(this.words, tier, excludeId)
    },
  },
})
