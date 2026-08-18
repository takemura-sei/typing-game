import { describe, expect, it } from 'vitest'
import {
  acceptTotalDealt,
  judgeSimultaneousKo,
  parseGameEvent,
} from '../app/utils/battle/protocol'

describe('parseGameEvent', () => {
  const base = { v: 1, from: 'user-a' }

  it('正しいイベントを通す', () => {
    const e = { ...base, type: 'attack', seq: 1, kind: 'normal', damage: 10, totalDealt: 10, combo: 1, ts: 1 }
    expect(parseGameEvent(e)).toEqual(e)
  })

  it('未知typeは無視(null)', () => {
    expect(parseGameEvent({ ...base, type: 'special_new_feature' })).toBeNull()
  })

  it('将来バージョンは無視', () => {
    expect(parseGameEvent({ ...base, v: 2, type: 'ready' })).toBeNull()
  })

  it('from欠落・非オブジェクトは無視', () => {
    expect(parseGameEvent({ v: 1, type: 'ready' })).toBeNull()
    expect(parseGameEvent('attack')).toBeNull()
    expect(parseGameEvent(null)).toBeNull()
  })
})

describe('acceptTotalDealt(累積ダメージの自己修復)', () => {
  it('通常の増加を受け入れる', () => {
    expect(acceptTotalDealt(20, 32)).toBe(32)
  })

  it('イベント欠落後も累積値で追いつく(1発落ちても自己修復)', () => {
    // 10 → (欠落した攻撃で20になっていた) → 次の攻撃で31が届く
    expect(acceptTotalDealt(10, 31)).toBe(31)
  })

  it('重複・順序逆転(過去の値)は据え置き=冪等', () => {
    expect(acceptTotalDealt(32, 32)).toBe(32)
    expect(acceptTotalDealt(32, 20)).toBe(32)
  })

  it('異常なジャンプはクランプ', () => {
    expect(acceptTotalDealt(10, 999)).toBe(70) // 10 + MAX_DELTA(60)
  })

  it('非有限値(NaN/Infinity)は据え置き', () => {
    expect(acceptTotalDealt(10, Number.NaN)).toBe(10)
    expect(acceptTotalDealt(10, Number.POSITIVE_INFINITY)).toBe(10)
  })
})

describe('judgeSimultaneousKo', () => {
  it('300ms以内は引き分け', () => {
    expect(judgeSimultaneousKo(1000, 1200)).toBe('draw')
    expect(judgeSimultaneousKo(1200, 1000)).toBe('draw')
  })

  it('先に死んだ方が負け', () => {
    expect(judgeSimultaneousKo(1000, 2000)).toBe('loss') // 自分が先に死んだ
    expect(judgeSimultaneousKo(2000, 1000)).toBe('win')
  })
})
