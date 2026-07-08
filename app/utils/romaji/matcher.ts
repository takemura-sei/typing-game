import { VOWELS } from './table'
import { segmentReading, type Segment } from './segmenter'

export interface MatcherState {
  reading: string
  segments: Segment[]
  /** 現在打っているセグメントのindex */
  segIndex: number
  /** 現セグメントに対して打たれ受理された文字列 */
  buffer: string
  /** 確定済みローマ字(表示用) */
  confirmedRomaji: string
  /** 「ん」を 'n' 1打で保留中 */
  pendingN: boolean
  /** 総打鍵数(ミス含む) */
  keystrokes: number
  /** ミス数 */
  misses: number
}

export type KeyResult = 'hit' | 'miss' | 'segment_complete' | 'word_complete' | 'ignored'

const KEY_RE = /^[a-z0-9-]$/

export function createMatcher(reading: string): MatcherState {
  return {
    reading,
    segments: segmentReading(reading),
    segIndex: 0,
    buffer: '',
    confirmedRomaji: '',
    pendingN: false,
    keystrokes: 0,
    misses: 0,
  }
}

export function isComplete(state: MatcherState): boolean {
  return state.segIndex >= state.segments.length
}

/**
 * 「ん」を単独 'n' で確定できるか。
 * 条件: keyが母音でもy/nでもなく、次セグメントにkeyで始まる候補があること。
 * (んい→nni必須、んや→nnya必須、んか→nka可、語末ん→nn必須 を満たす)
 */
function singleNAccepts(state: MatcherState, key: string): boolean {
  if (VOWELS.has(key) || key === 'y' || key === 'n') return false
  const next = state.segments[state.segIndex + 1]
  if (!next) return false
  return next.candidates.some((c) => c.startsWith(key))
}

function completeSegment(state: MatcherState, romaji: string): KeyResult {
  state.confirmedRomaji += romaji
  state.buffer = ''
  state.pendingN = false
  state.segIndex++
  return isComplete(state) ? 'word_complete' : 'segment_complete'
}

/**
 * キー1打を処理して状態を進める(stateを破壊的に更新)。
 * key は英小文字・数字・'-' の1文字を想定(それ以外は 'ignored')。
 */
export function processKey(state: MatcherState, key: string): KeyResult {
  if (isComplete(state)) return 'ignored'
  if (!KEY_RE.test(key)) return 'ignored'

  state.keystrokes++
  const seg = state.segments[state.segIndex]!

  // --- 「ん」の 'n' 1打保留中 ---
  if (state.pendingN) {
    if (key === 'n') {
      return completeSegment(state, 'nn')
    }
    if (singleNAccepts(state, key)) {
      // ん を 'n' で確定し、このキーは次セグメントに流す
      state.confirmedRomaji += 'n'
      state.buffer = ''
      state.pendingN = false
      state.segIndex++
      state.keystrokes-- // 再帰側で加算されるため二重計上を防ぐ
      return processKey(state, key)
    }
    state.misses++
    return 'miss'
  }

  // --- 「ん」の最初の 'n' は確定を保留する ---
  if (seg.kana === 'ん' && state.buffer === '' && key === 'n') {
    state.buffer = 'n'
    state.pendingN = true
    return 'hit'
  }

  // --- 通常処理: 前方一致で候補を絞る ---
  const next = state.buffer + key
  const matched = seg.candidates.filter((c) => c.startsWith(next))
  if (matched.length === 0) {
    state.misses++
    return 'miss'
  }
  state.buffer = next
  if (matched.includes(next)) {
    return completeSegment(state, next)
  }
  return 'hit'
}

/**
 * 表示用ローマ字。typed=入力済み、rest=残り。
 * ユーザーの打ち方(si/shi等)に追従して毎キー再計算される。
 */
export function displayRomaji(state: MatcherState): { typed: string; rest: string } {
  const typed = state.confirmedRomaji + state.buffer
  let rest = ''
  const seg = state.segments[state.segIndex]
  if (seg) {
    const pick = seg.candidates.find((c) => c.startsWith(state.buffer)) ?? seg.candidates[0]!
    rest += pick.slice(state.buffer.length)
  }
  for (let i = state.segIndex + 1; i < state.segments.length; i++) {
    rest += state.segments[i]!.candidates[0]!
  }
  return { typed, rest }
}

/** かな表示のハイライト用: 確定済みかな / 現在のセグメントかな / 未入力かな */
export function displayKana(state: MatcherState): { done: string; current: string; rest: string } {
  const done = state.segments.slice(0, state.segIndex).map((s) => s.kana).join('')
  const current = state.segments[state.segIndex]?.kana ?? ''
  const rest = state.segments.slice(state.segIndex + 1).map((s) => s.kana).join('')
  return { done, current, rest }
}
