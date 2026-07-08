import { describe, expect, it } from 'vitest'
import {
  createMatcher,
  displayKana,
  displayRomaji,
  isComplete,
  processKey,
  type KeyResult,
  type MatcherState,
} from '../app/utils/romaji/matcher'
import { segmentReading } from '../app/utils/romaji/segmenter'

function typeKeys(state: MatcherState, keys: string): KeyResult[] {
  return [...keys].map((k) => processKey(state, k))
}

/** ミスなしで最後まで打ち切れるか */
function completesCleanly(reading: string, keys: string): boolean {
  const state = createMatcher(reading)
  const results = typeKeys(state, keys)
  return (
    results.every((r) => r !== 'miss' && r !== 'ignored') &&
    results[results.length - 1] === 'word_complete' &&
    isComplete(state)
  )
}

describe('segmentReading', () => {
  it('拗音を1セグメントにまとめる', () => {
    expect(segmentReading('しゃしん').map((s) => s.kana)).toEqual(['しゃ', 'し', 'ん'])
  })

  it('っを次のかなとマージする', () => {
    expect(segmentReading('まっちゃ').map((s) => s.kana)).toEqual(['ま', 'っちゃ'])
  })

  it('語末のっは単独セグメント', () => {
    expect(segmentReading('あっ').map((s) => s.kana)).toEqual(['あ', 'っ'])
  })
})

describe('基本入力', () => {
  it('すし: sushi / susi の両対応', () => {
    expect(completesCleanly('すし', 'sushi')).toBe(true)
    expect(completesCleanly('すし', 'susi')).toBe(true)
    expect(completesCleanly('すし', 'suci')).toBe(true)
  })

  it('ふじさん: fu / hu 両対応', () => {
    expect(completesCleanly('ふじさん', 'fujisann')).toBe(true)
    expect(completesCleanly('ふじさん', 'huzisann')).toBe(true)
  })

  it('らーめん: 長音符', () => {
    expect(completesCleanly('らーめん', 'ra-menn')).toBe(true)
  })
})

describe('ん の処理', () => {
  it('しんぶんし: 語中のんは単独n可', () => {
    expect(completesCleanly('しんぶんし', 'shinbunshi')).toBe(true)
    expect(completesCleanly('しんぶんし', 'sinnbunnsi')).toBe(true)
    expect(completesCleanly('しんぶんし', 'shinnbunnshi')).toBe(true)
  })

  it('語末のんは nn 必須(n 1打では完了しない)', () => {
    const state = createMatcher('しんぶん')
    typeKeys(state, 'shinbun')
    expect(isComplete(state)).toBe(false)
    expect(processKey(state, 'n')).toBe('word_complete')
  })

  it('語末のんは xn でも打てる', () => {
    expect(completesCleanly('しんぶん', 'shinbuxn')).toBe(true)
  })

  it('かんい: 母音の前のんは nn 必須(kani はミス)', () => {
    const state = createMatcher('かんい')
    const results = typeKeys(state, 'kani')
    expect(results).toContain('miss')
    expect(completesCleanly('かんい', 'kanni')).toBe(true)
  })

  it('かに: kani で打てる(かんい と区別)', () => {
    expect(completesCleanly('かに', 'kani')).toBe(true)
  })

  it('んや行の前は nn 必須', () => {
    const state = createMatcher('ほんや')
    const results = typeKeys(state, 'honya') // ほ+にゃ…ではなく ほんや なので honnya が正
    expect(results).toContain('miss')
    expect(completesCleanly('ほんや', 'honnya')).toBe(true)
  })

  it('んな行の前は nn 必須(nnna)', () => {
    expect(completesCleanly('おんな', 'onnna')).toBe(true)
    const state = createMatcher('おんな')
    const results = typeKeys(state, 'onna') // nn=ん確定後、'a' が な に対しミス
    expect(results).toContain('miss')
  })
})

describe('っ(促音)の処理', () => {
  it('きって: 子音重ね / xtu / ltu', () => {
    expect(completesCleanly('きって', 'kitte')).toBe(true)
    expect(completesCleanly('きって', 'kixtute')).toBe(true)
    expect(completesCleanly('きって', 'kiltute')).toBe(true)
    expect(completesCleanly('きって', 'kixtsute')).toBe(true)
  })

  it('まっちゃ: cchi系 / ttya系 / xtu系すべて対応', () => {
    expect(completesCleanly('まっちゃ', 'maccha')).toBe(true)
    expect(completesCleanly('まっちゃ', 'mattya')).toBe(true)
    expect(completesCleanly('まっちゃ', 'maccya')).toBe(true)
    expect(completesCleanly('まっちゃ', 'maxtucha')).toBe(true)
    expect(completesCleanly('まっちゃ', 'mattixya')).toBe(true) // 分解打ち+子音重ね
  })

  it('とっきゅう: 拗音との組み合わせ', () => {
    expect(completesCleanly('とっきゅう', 'tokkyuu')).toBe(true)
    expect(completesCleanly('とっきゅう', 'toxtukyuu')).toBe(true)
    expect(completesCleanly('とっきゅう', 'tokkixyuu')).toBe(true)
  })

  it('t で重ねたら chi 系は打てない(依存関係が閉じている)', () => {
    const state = createMatcher('まっちゃ')
    typeKeys(state, 'mat') // t で子音重ねを選択
    expect(processKey(state, 'c')).toBe('miss') // tcha は無効
    expect(typeKeys(state, 'tya')).toEqual(['hit', 'hit', 'word_complete'])
  })

  it('がっこう', () => {
    expect(completesCleanly('がっこう', 'gakkou')).toBe(true)
    expect(completesCleanly('がっこう', 'gaxtukou')).toBe(true)
  })
})

describe('拗音・外来語音', () => {
  it('しゃしん: sha / sya / 分解打ち', () => {
    expect(completesCleanly('しゃしん', 'shashinn')).toBe(true)
    expect(completesCleanly('しゃしん', 'syasinn')).toBe(true)
    expect(completesCleanly('しゃしん', 'shixyashinn')).toBe(true)
    expect(completesCleanly('しゃしん', 'silyasinn')).toBe(true)
  })

  it('ばってぃんぐ: thi / 分解打ち', () => {
    expect(completesCleanly('ばってぃんぐ', 'batthingu')).toBe(true)
    expect(completesCleanly('ばってぃんぐ', 'battexinngu')).toBe(true)
  })

  it('じゃ: ja / zya / jya', () => {
    expect(completesCleanly('じてんしゃ', 'jitensha')).toBe(true)
    expect(completesCleanly('じてんしゃ', 'zitennsya')).toBe(true)
  })
})

describe('ミス処理', () => {
  it('ミスしてもbufferは保持され、続けて正しく打てる', () => {
    const state = createMatcher('すし')
    expect(processKey(state, 's')).toBe('hit')
    expect(processKey(state, 'k')).toBe('miss')
    expect(state.misses).toBe(1)
    expect(processKey(state, 'u')).toBe('segment_complete')
    expect(typeKeys(state, 'shi')).toEqual(['hit', 'hit', 'word_complete'])
    expect(state.keystrokes).toBe(6) // s,k,u,s,h,i
  })

  it('完了後のキーはignored', () => {
    const state = createMatcher('ねこ')
    typeKeys(state, 'neko')
    expect(processKey(state, 'a')).toBe('ignored')
  })
})

describe('表示', () => {
  it('displayRomaji: 打ち方(si系)に追従して表示が切り替わる', () => {
    const state = createMatcher('しんぶんし')
    expect(displayRomaji(state).rest).toBe('shinnbunnshi') // 初期表示は第1候補
    typeKeys(state, 'si')
    const d = displayRomaji(state)
    expect(d.typed).toBe('si')
    expect(d.rest).toBe('nnbunnshi')
  })

  it('displayRomaji: 促音の途中でも正しい残りを出す', () => {
    const state = createMatcher('きって')
    typeKeys(state, 'kit')
    const d = displayRomaji(state)
    expect(d.typed).toBe('kit')
    expect(d.rest).toBe('te')
  })

  it('displayKana: 現在セグメントを区別する', () => {
    const state = createMatcher('まっちゃ')
    typeKeys(state, 'ma')
    expect(displayKana(state)).toEqual({ done: 'ま', current: 'っちゃ', rest: '' })
  })
})
