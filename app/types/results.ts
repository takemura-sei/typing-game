import type { BattleResult } from './battle'

/** match_results.result のコード */
export type ResultCode = 'win' | 'loss' | 'draw' | 'forfeit_win' | 'forfeit_loss'

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
