import { describe, expect, it } from 'vitest'
import { loadWords } from '../app/services/words'
import { signInAnonymously } from '../app/services/auth'
import { loadHistory, saveResult } from '../app/services/results'
import { FALLBACK_WORDS } from '../app/utils/fallback-words'

/**
 * Nuxtアプリ外(vitest)では useSupabase() が null を返すため、
 * ここでは「Supabase未設定時のフォールバック挙動」のみを検証する。
 * 実DBを介した挙動は scripts/results-smoke.mjs 等の手動スモークテストの対象。
 */

describe('services/words: loadWords', () => {
  it('Supabase未設定時はフォールバック単語を返す', async () => {
    const result = await loadWords()
    expect(result.source).toBe('fallback')
    expect(result.words).toEqual(FALLBACK_WORDS)
  })
})

describe('services/auth: signInAnonymously', () => {
  it('Supabase未設定時はunconfiguredを返す', async () => {
    const result = await signInAnonymously()
    expect(result).toEqual({ userId: null, status: 'unconfigured' })
  })
})

describe('services/results', () => {
  it('saveResult: Supabase未設定時は何もせず正常終了する', async () => {
    await expect(
      saveResult({
        matchUid: crypto.randomUUID(),
        playerId: 'player-1',
        opponentId: null,
        roomCode: '000000',
        result: { outcome: 'win', reason: 'hp_zero' },
        hpLeft: 50,
        damageDealt: 100,
        maxCombo: 5,
        wordsTyped: 10,
        missCount: 2,
        durationMs: 60000,
      }),
    ).resolves.toBeUndefined()
  })

  it('loadHistory: Supabase未設定時はエラーメッセージを返す', async () => {
    const result = await loadHistory('player-1')
    expect(result.data).toBeNull()
    expect(result.error).toBe('Supabase未設定のため戦績を取得できません')
  })
})
