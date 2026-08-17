import { useSupabase } from '../composables/use-supabase'
import type { BattleResult } from '../types/battle'
import type { MatchRecord, ResultCode, SaveResultInput } from '../types/results'

export function toResultCode(result: BattleResult): ResultCode {
  if (result.reason === 'forfeit') {
    return result.outcome === 'win' ? 'forfeit_win' : 'forfeit_loss'
  }
  return result.outcome
}

// 同一セッション内の二重保存防止(DB側にも (match_uid, player_id) の一意制約あり)
const savedMatchUids = new Set<string>()

/** 対戦結果を保存する。1試合につき自分視点の1行をinsertする */
export async function saveResult(input: SaveResultInput): Promise<void> {
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

export interface LoadHistoryResult {
  data: MatchRecord[] | null
  error: string | null
}

/** 自分視点の戦績を新しい順に最大50件取得する */
export async function loadHistory(playerId: string): Promise<LoadHistoryResult> {
  const supabase = useSupabase()
  if (!supabase) {
    return { data: null, error: 'Supabase未設定のため戦績を取得できません' }
  }
  const { data, error } = await supabase
    .from('match_results')
    .select('*, opponent:profiles!match_results_opponent_id_fkey(display_name)')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data ?? []) as MatchRecord[], error: null }
}
