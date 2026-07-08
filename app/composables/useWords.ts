import type { Word } from '../types/game'
import { FALLBACK_WORDS } from '../utils/fallbackWords'

/**
 * お題の取得。wordsテーブルから読み、失敗時はローカルフォールバック。
 * source で どちらから来たかをUIに出せる。
 */
export function useWords() {
  const words = useState<Word[]>('words', () => [])
  const source = useState<'db' | 'fallback' | 'loading'>('words_source', () => 'loading')

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
}
