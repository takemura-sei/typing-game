import type { DifficultyTier, Word } from '../../types/game'

/**
 * コンボ数→難易度層の閾値。数値はここに集約(damage.tsのDAMAGE_CONFIG踏襲)。
 * combo < tier2At → 1, tier2At <= combo < tier3At → 2, combo >= tier3At → 3
 */
export const TIER_THRESHOLDS = {
  tier2At: 5,
  tier3At: 15,
} as const

export function comboToTier(combo: number): DifficultyTier {
  if (combo >= TIER_THRESHOLDS.tier3At) return 3
  if (combo >= TIER_THRESHOLDS.tier2At) return 2
  return 1
}

/**
 * 指定難易度層からランダムに1語選ぶ。
 * - 該当層が空(お題データの偏り)なら pool 全体にフォールバック
 * - excludeId は直前と同じ単語の連続を避けるための任意指定。
 *   ただし「難易度層の正しさ」>「連続回避」: excludeIdの除外で候補が0件になる場合は
 *   除外を諦めて候補をそのまま使う(層をまたいでまで連続回避はしない)
 * - pool自体が空の場合のみ null を返す(loadWords()後は実運用上到達しない防御的分岐)
 */
export function pickWordForTier(
  pool: Word[],
  tier: DifficultyTier,
  excludeId: number | null = null,
): Word | null {
  if (pool.length === 0) return null
  const tierPool = pool.filter((w) => w.difficulty === tier)
  let candidates = tierPool.length > 0 ? tierPool : pool
  if (excludeId !== null && candidates.length > 1) {
    const filtered = candidates.filter((w) => w.id !== excludeId)
    if (filtered.length > 0) candidates = filtered
  }
  return candidates[Math.floor(Math.random() * candidates.length)]!
}
