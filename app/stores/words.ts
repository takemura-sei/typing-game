import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useSupabase } from '../composables/useSupabase'
import type { Word } from '../types/game'
import { FALLBACK_WORDS } from '../utils/fallbackWords'

export type WordsSource = 'db' | 'fallback' | 'loading'

/** お題の取得。wordsテーブルから読み、失敗時はローカルフォールバック */
export const useWordsStore = defineStore('words', () => {
  const words = ref<Word[]>([])
  const source = ref<WordsSource>('loading')

  async function loadWords() {
    if (words.value.length > 0) return
    const supabase = useSupabase()
    if (supabase) {
      const { data, error } = await supabase
        .from('words')
        .select('id, display, reading, difficulty')
        .eq('is_active', true)
      if (!error && data && data.length > 0) {
        words.value = data
        source.value = 'db'
        return
      }
      if (error) {
        console.warn('[words] DB取得失敗、フォールバックを使用:', error.message)
      }
    }
    words.value = FALLBACK_WORDS
    source.value = 'fallback'
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
