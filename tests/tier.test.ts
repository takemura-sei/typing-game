import { describe, expect, it } from 'vitest'
import { comboToTier, pickWordForTier, TIER_THRESHOLDS } from '../app/utils/battle/tier'
import type { Word } from '../app/types/game'

describe('comboToTier', () => {
  it('tier1: 閾値未満', () => {
    expect(comboToTier(0)).toBe(1)
    expect(comboToTier(TIER_THRESHOLDS.tier2At - 1)).toBe(1) // 4
  })

  it('tier2: tier2At〜tier3At未満', () => {
    expect(comboToTier(TIER_THRESHOLDS.tier2At)).toBe(2) // 5
    expect(comboToTier(TIER_THRESHOLDS.tier3At - 1)).toBe(2) // 14
  })

  it('tier3: tier3At以上', () => {
    expect(comboToTier(TIER_THRESHOLDS.tier3At)).toBe(3) // 15
    expect(comboToTier(100)).toBe(3)
  })
})

describe('pickWordForTier', () => {
  const pool: Word[] = [
    { id: 1, display: 'A', reading: 'あ', difficulty: 1 },
    { id: 2, display: 'B', reading: 'い', difficulty: 2 },
    { id: 3, display: 'C', reading: 'う', difficulty: 3 },
  ]

  it('該当層の語を返す', () => {
    expect(pickWordForTier(pool, 2)!.difficulty).toBe(2)
  })

  it('該当層が空ならpool全体にフォールバックする', () => {
    const onlyTier1: Word[] = [{ id: 1, display: 'A', reading: 'あ', difficulty: 1 }]
    expect(pickWordForTier(onlyTier1, 3)!.difficulty).toBe(1)
  })

  it('excludeIdは候補が2件以上あるとき除外される', () => {
    const twoInTier: Word[] = [
      { id: 1, display: 'A', reading: 'あ', difficulty: 1 },
      { id: 2, display: 'B', reading: 'い', difficulty: 1 },
    ]
    expect(pickWordForTier(twoInTier, 1, 1)!.id).toBe(2)
  })

  it('excludeIdで候補が0件になる場合は除外を諦める(単語1件のみ)', () => {
    const single: Word[] = [{ id: 1, display: 'A', reading: 'あ', difficulty: 1 }]
    expect(pickWordForTier(single, 1, 1)!.id).toBe(1)
  })

  it('該当層が単語1件だけでexcludeId指定でも、層をまたいでまで除外しない', () => {
    const p: Word[] = [
      { id: 1, display: 'A', reading: 'あ', difficulty: 1 }, // 唯一のtier1
      { id: 2, display: 'B', reading: 'い', difficulty: 2 },
    ]
    expect(pickWordForTier(p, 1, 1)!.id).toBe(1) // tier2にフォールバックしない
  })

  it('空のpoolはnull', () => {
    expect(pickWordForTier([], 1)).toBeNull()
  })
})
