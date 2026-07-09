import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useSupabase } from '../composables/useSupabase'
import type { BattleResult } from './battle'

/** match_results.result のコード */
export type ResultCode = 'win' | 'loss' | 'draw' | 'forfeit_win' | 'forfeit_loss'

export function toResultCode(result: BattleResult): ResultCode {
  if (result.reason === 'forfeit') {
    return result.outcome === 'win' ? 'forfeit_win' : 'forfeit_loss'
  }
  return result.outcome
}

export interface MatchRecord {
  id: string
  match_uid: string
  opponent_id: string | null
  room_code: string
  result: ResultCode
  hp_left: number
  damage_dealt: number
  max_combo: number
  words_typed: number
  miss_count: number
  duration_ms: number
  created_at: string
  opponent: { display_name: string } | null
}

export interface SaveResultInput {
  matchUid: string
  playerId: string
  opponentId: string | null
  roomCode: string
  result: BattleResult
  hpLeft: number
  damageDealt: number
  maxCombo: number
  wordsTyped: number
  missCount: number
  durationMs: number
}

/** 対戦結果の保存と戦績の取得。1試合につき自分視点の1行をinsertする */
export const useResultsStore = defineStore('results', () => {
  const history = ref<MatchRecord[]>([])
  const loading = ref(false)
  const loadError = ref<string | null>(null)

  // 同一セッション内の二重保存防止(DB側にも (match_uid, player_id) の一意制約あり)
  const savedMatchUids = new Set<string>()

  async function saveResult(input: SaveResultInput) {
    const supabase = useSupabase()
    if (!supabase) return
    if (savedMatchUids.has(input.matchUid)) return
    savedMatchUids.add(input.matchUid)

    const { error } = await supabase.from('match_results').upsert(
      {
        match_uid: input.matchUid,
        player_id: input.playerId,
        opponent_id: input.opponentId,
        room_code: input.roomCode,
        result: toResultCode(input.result),
        hp_left: input.hpLeft,
        damage_dealt: input.damageDealt,
        max_combo: input.maxCombo,
        words_typed: input.wordsTyped,
        miss_count: input.missCount,
        duration_ms: input.durationMs,
      },
      { onConflict: 'match_uid,player_id', ignoreDuplicates: true },
    )
    if (error) {
      console.warn('[results] 戦績の保存に失敗:', error.message)
      savedMatchUids.delete(input.matchUid) // リトライ余地を残す
    }
  }

  async function loadHistory(playerId: string) {
    const supabase = useSupabase()
    if (!supabase) {
      loadError.value = 'Supabase未設定のため戦績を取得できません'
      return
    }
    loading.value = true
    loadError.value = null
    const { data, error } = await supabase
      .from('match_results')
      .select('*, opponent:profiles!match_results_opponent_id_fkey(display_name)')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(50)
    loading.value = false
    if (error) {
      loadError.value = error.message
      return
    }
    history.value = (data ?? []) as MatchRecord[]
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
