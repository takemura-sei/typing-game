import type { GameEvent } from '../../types/events'
import { PROTOCOL_VERSION } from '../../types/events'

const KNOWN_TYPES = new Set([
  'join_request',
  'join_ack',
  'join_reject',
  'ready',
  'game_start',
  'attack',
  'state_sync',
  'game_over',
  'rematch',
])

/**
 * 受信ペイロードの検証。未知typeや異常な形は null を返して無視する。
 * (将来のプロトコル拡張で新typeが来ても旧クライアントが落ちないための関門)
 */
export function parseGameEvent(payload: unknown): GameEvent | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  if (typeof p.type !== 'string' || !KNOWN_TYPES.has(p.type)) return null
  if (typeof p.from !== 'string' || p.from.length === 0) return null
  if (typeof p.v !== 'number' || p.v > PROTOCOL_VERSION) return null
  return payload as GameEvent
}

/** 1回のattackで受け入れる累積ダメージ増分の上限(緩いチート対策。完全防御はスコープ外) */
export const MAX_DELTA_PER_ATTACK = 60

/**
 * 受信したtotalDealt(累積値)から採用すべき新しい累積値を返す。
 * - 単調増加: 過去の値以下なら据え置き(重複・順序逆転はここで冪等に吸収される)
 * - 増分クランプ: 1イベントでの異常なジャンプを制限
 */
export function acceptTotalDealt(
  known: number,
  incoming: number,
  maxDelta: number = MAX_DELTA_PER_ATTACK,
): number {
  if (!Number.isFinite(incoming) || incoming <= known) return known
  return Math.min(incoming, known + maxDelta)
}

/**
 * 同時KOの裁定。自分と相手の死亡時刻(epoch ms)から勝敗を返す。
 * 差が threshold 以内なら引き分け。先に死んだ(tsが小さい)方が負け。
 */
export function judgeSimultaneousKo(
  myDeathTs: number,
  oppDeathTs: number,
  threshold = 300,
): 'win' | 'loss' | 'draw' {
  const diff = myDeathTs - oppDeathTs
  if (Math.abs(diff) <= threshold) return 'draw'
  return diff > 0 ? 'win' : 'loss' // 自分の方が後に死んだ=生き残りが長い=勝ち
}
