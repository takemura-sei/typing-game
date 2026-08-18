import { useSupabase } from '../composables/use-supabase'
import type { Word } from '../types/game'
import { FALLBACK_WORDS } from '../utils/fallback-words'

export interface LoadWordsResult {
  words: Word[]
  source: 'db' | 'fallback'
}

/** wordsテーブルから出題を取得する。失敗時/未設定時はローカルフォールバックを返す */
export async function loadWords(): Promise<LoadWordsResult> {
  const supabase = useSupabase()
  if (supabase) {
    const { data, error } = await supabase
      .from('words')
      .select('id, display, reading, difficulty')
      .eq('is_active', true)
    if (!error && data && data.length > 0) {
      return { words: data, source: 'db' }
    }
    if (error) {
      console.warn('[words] DB取得失敗、フォールバックを使用:', error.message)
    }
  }
  return { words: FALLBACK_WORDS, source: 'fallback' }
}
