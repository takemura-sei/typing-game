import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  loadHistory as loadHistoryService,
  saveResult as saveResultService,
  toResultCode,
  type MatchRecord,
  type ResultCode,
  type SaveResultInput,
} from '../services/results'

export { toResultCode }
export type { MatchRecord, ResultCode, SaveResultInput }

/** 対戦結果の保存と戦績の取得。1試合につき自分視点の1行をinsertする */
export const useResultsStore = defineStore('results', () => {
  const history = ref<MatchRecord[]>([])
  const loading = ref(false)
  const loadError = ref<string | null>(null)

  async function saveResult(input: SaveResultInput) {
    await saveResultService(input)
  }

  async function loadHistory(playerId: string) {
    loading.value = true
    loadError.value = null
    const result = await loadHistoryService(playerId)
    loading.value = false
    if (result.error) {
      loadError.value = result.error
      return
    }
    history.value = result.data ?? []
  }

  const summary = computed(() => {
    const total = history.value.length
    const wins = history.value.filter((r) => r.result === 'win' || r.result === 'forfeit_win').length
    const losses = history.value.filter(
      (r) => r.result === 'loss' || r.result === 'forfeit_loss',
    ).length
    const draws = history.value.filter((r) => r.result === 'draw').length
    return {
      total,
      wins,
      losses,
      draws,
      winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
      bestCombo: history.value.reduce((max, r) => Math.max(max, r.max_combo), 0),
      totalWords: history.value.reduce((sum, r) => sum + r.words_typed, 0),
    }
  })

  return { history, loading, loadError, summary, saveResult, loadHistory }
})
