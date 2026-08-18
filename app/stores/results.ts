import { defineStore } from 'pinia'
import {
  loadHistory as loadHistoryService,
  saveResult as saveResultService,
  toResultCode,
} from '../services/results'
import type { MatchRecord, SaveResultInput } from '../types/results'

export { toResultCode }

/** 対戦結果の保存と戦績の取得。1試合につき自分視点の1行をinsertする */
export const useResultsStore = defineStore('results', {
  state: () => ({
    history: [] as MatchRecord[],
    loading: false,
    loadError: null as string | null,
  }),
  getters: {
    summary(state) {
      const total = state.history.length
      const wins = state.history.filter((r) => r.result === 'win' || r.result === 'forfeit_win').length
      const losses = state.history.filter(
        (r) => r.result === 'loss' || r.result === 'forfeit_loss',
      ).length
      const draws = state.history.filter((r) => r.result === 'draw').length
      return {
        total,
        wins,
        losses,
        draws,
        winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
        bestCombo: state.history.reduce((max, r) => Math.max(max, r.max_combo), 0),
        totalWords: state.history.reduce((sum, r) => sum + r.words_typed, 0),
      }
    },
  },
  actions: {
    async saveResult(input: SaveResultInput) {
      await saveResultService(input)
    },

    async loadHistory(playerId: string) {
      this.loading = true
      this.loadError = null
      const result = await loadHistoryService(playerId)
      this.loading = false
      if (result.error) {
        this.loadError = result.error
        return
      }
      this.history = result.data ?? []
    },
  },
})
