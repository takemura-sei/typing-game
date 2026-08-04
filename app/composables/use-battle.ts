import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useBattleStore } from '../stores/battle'
import { useResults } from './use-results'

/**
 * battleストアの唯一の入口。戻り値はプレーンオブジェクトのため、
 * 呼び出し側は分割代入して使うこと(テンプレートでのref自動アンラップを効かせるため。
 * `const battle = useBattle()` のように保持すると `battle.phase` はRefのままになる)。
 * 対戦相手の記憶と終局時の戦績保存オーケストレーションもここに集約する。
 */
export function useBattle() {
  const store = useBattleStore()
  const state = storeToRefs(store)
  const results = useResults()

  const lastOpponentId = ref<string | null>(null)

  /** 相手が切断してもopponent_idを保存できるよう最後の相手を覚えておく */
  function trackOpponent(userId: string | null) {
    if (userId) lastOpponentId.value = userId
  }

  /** 試合が確定したら自分視点の戦績を保存する(match_uidでdedupeされるためリマッチごとに1行)。room入室時に一度だけ呼ぶ */
  function autoSaveResult(playerId: string, roomCode: string) {
    watch(
      () => store.phase,
      (phase) => {
        if (phase !== 'finished' || !store.result || !store.matchUid) return
        results.saveResult({
          matchUid: store.matchUid,
          playerId,
          opponentId: lastOpponentId.value,
          roomCode,
          result: store.result,
          hpLeft: store.my.hp,
          damageDealt: store.my.totalDealt,
          maxCombo: store.my.maxCombo,
          wordsTyped: store.my.wordsTyped,
          missCount: store.my.missCount,
          durationMs: store.durationMs,
        })
      },
    )
  }

  return {
    ...state,
    init: store.init,
    reset: store.reset,
    setReady: store.setReady,
    onWordTyped: store.onWordTyped,
    onMiss: store.onMiss,
    onRemoteEvent: store.onRemoteEvent,
    onOpponentLeft: store.onOpponentLeft,
    requestRematch: store.requestRematch,
    trackOpponent,
    autoSaveResult,
  }
}
