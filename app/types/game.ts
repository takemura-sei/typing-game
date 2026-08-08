/** ゲーム全体の状態(Phase Bでlobby/matching等が加わる) */
export type GamePhase = 'idle' | 'lobby' | 'countdown' | 'playing' | 'finished'

/** タイピングお題 */
export interface Word {
  id: number
  display: string
  reading: string
  difficulty: number
}

/** プレイヤーの対戦中状態 */
export interface PlayerState {
  hp: number
  combo: number
  maxCombo: number
  /** 与えた累積ダメージ(Realtimeイベント欠落時の自己修復に使う) */
  totalDealt: number
  wordIndex: number
  wordsTyped: number
  missCount: number
}

/** 1単語の入力結果(タイピング完了イベント用) */
export interface TypingWordResult {
  word: Word
  elapsedMs: number
  keystrokes: number
  misses: number
}

export const INITIAL_HP = 100

export function createPlayerState(): PlayerState {
  return {
    hp: INITIAL_HP,
    combo: 0,
    maxCombo: 0,
    totalDealt: 0,
    wordIndex: 0,
    wordsTyped: 0,
    missCount: 0,
  }
}
