import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { toResultCode, useResultsStore } from '../app/stores/results'
import type { MatchRecord } from '../app/types/results'

describe('toResultCode', () => {
  it('通常勝敗はoutcomeそのまま', () => {
    expect(toResultCode({ outcome: 'win', reason: 'hp_zero' })).toBe('win')
    expect(toResultCode({ outcome: 'loss', reason: 'hp_zero' })).toBe('loss')
    expect(toResultCode({ outcome: 'draw', reason: 'hp_zero' })).toBe('draw')
  })

  it('不戦勝はforfeit_win', () => {
    expect(toResultCode({ outcome: 'win', reason: 'forfeit' })).toBe('forfeit_win')
    expect(toResultCode({ outcome: 'loss', reason: 'forfeit' })).toBe('forfeit_loss')
  })
})

function record(partial: Partial<MatchRecord>): MatchRecord {
  return {
    id: crypto.randomUUID(),
    match_uid: crypto.randomUUID(),
    opponent_id: null,
    room_code: '000000',
    result: 'win',
    hp_left: 50,
    damage_dealt: 100,
    max_combo: 5,
    words_typed: 10,
    miss_count: 2,
    duration_ms: 60000,
    created_at: new Date().toISOString(),
    opponent: null,
    ...partial,
  }
}

describe('summary(戦績集計)', () => {
  it('勝率・最大コンボ・不戦勝の扱いを集計する', () => {
    setActivePinia(createPinia())
    const store = useResultsStore()
    store.history = [
      record({ result: 'win', max_combo: 8 }),
      record({ result: 'forfeit_win', max_combo: 3 }),
      record({ result: 'loss', max_combo: 12 }),
      record({ result: 'draw', max_combo: 1 }),
    ]
    expect(store.summary.total).toBe(4)
    expect(store.summary.wins).toBe(2) // 不戦勝も勝ち
    expect(store.summary.losses).toBe(1)
    expect(store.summary.draws).toBe(1)
    expect(store.summary.winRate).toBe(50)
    expect(store.summary.bestCombo).toBe(12)
  })

  it('0戦のとき勝率0で割り算エラーにならない', () => {
    setActivePinia(createPinia())
    const store = useResultsStore()
    expect(store.summary.winRate).toBe(0)
  })
})
