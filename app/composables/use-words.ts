import { storeToRefs } from 'pinia'
import { useWordsStore } from '../stores/words'

/**
 * wordsストアの唯一の入口。戻り値はプレーンオブジェクトのため、
 * 呼び出し側は分割代入して使うこと(テンプレートでのref自動アンラップを効かせるため)。
 */
export function useWords() {
  const store = useWordsStore()
  const { words, source } = storeToRefs(store)

  return {
    words,
    source,
    loadWords: store.loadWords,
    pickForTier: store.pickForTier,
  }
}
