import { storeToRefs } from 'pinia'
import { useResultsStore } from '../stores/results'

/**
 * resultsストアの唯一の入口。戻り値はプレーンオブジェクトのため、
 * 呼び出し側は分割代入して使うこと(テンプレートでのref自動アンラップを効かせるため)。
 */
export function useResults() {
  const store = useResultsStore()
  const { history, loading, loadError, summary } = storeToRefs(store)

  return {
    history,
    loading,
    loadError,
    summary,
    saveResult: store.saveResult,
    loadHistory: store.loadHistory,
  }
}
