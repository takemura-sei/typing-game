import { KANA_TABLE, YOUON_TABLE, SMALL_KANA, SOKUON_STANDALONE, VOWELS } from './table'

export interface Segment {
  /** このセグメントが表すかな(例: 'しゃ', 'っち', 'ん') */
  kana: string
  /** このセグメントを打ち切れるローマ字綴りの全候補(優先順) */
  candidates: string[]
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)]
}

/**
 * 促音「っ」を候補群にマージする。
 * - 子音始まりの候補: 先頭子音を重ねる(ti → tti, chi → cchi)
 * - 全候補: っ単独綴り(xtu等)を前置(xtuti 等)
 * 「t で重ねたら次は ti 系のみ有効」という依存関係が候補列挙の中に閉じる。
 */
function mergeSokuon(candidates: string[]): string[] {
  const result: string[] = []
  for (const c of candidates) {
    const head = c[0]!
    // 母音・n 始まりは子音重ねできない(っあ/っん は日本語に現れないが安全側)
    if (!VOWELS.has(head) && head !== 'n' && head !== '-') {
      result.push(head + c)
    }
  }
  for (const s of SOKUON_STANDALONE) {
    for (const c of candidates) {
      result.push(s + c)
    }
  }
  return dedupe(result)
}

/** reading[i] から1セグメント読み取る(っ の処理は segment() 側)。戻り値: [セグメント, 消費文字数] */
function readOne(reading: string, i: number): [Segment, number] {
  const two = reading.slice(i, i + 2)
  if (two.length === 2) {
    const second = two[1]!
    const direct = YOUON_TABLE[two]
    if (direct || SMALL_KANA.has(second)) {
      const candidates: string[] = [...(direct ?? [])]
      // 分解打ち: し+ゃ → shixya, silya, ...
      const first = KANA_TABLE[two[0]!]
      const smallCands = KANA_TABLE[second]
      if (SMALL_KANA.has(second) && first && smallCands) {
        for (const a of first) {
          for (const b of smallCands) {
            candidates.push(a + b)
          }
        }
      }
      if (candidates.length > 0) {
        return [{ kana: two, candidates: dedupe(candidates) }, 2]
      }
    }
  }

  const one = reading[i]!
  const cands = KANA_TABLE[one]
  if (cands) {
    return [{ kana: one, candidates: cands }, 1]
  }
  // 未知文字(英数字等)はそのまま1打とする
  return [{ kana: one, candidates: [one.toLowerCase()] }, 1]
}

/**
 * かな読み文字列 → Segment[]
 * - 拗音(2文字)優先の貪欲分割
 * - 「っ」は直後のセグメントとマージして1セグメントにする(語末っ は単独綴りのみ)
 * - 「ん」は独立セグメント(単独nの判定はmatcherが次セグメントを見て行う)
 */
export function segmentReading(reading: string): Segment[] {
  const segments: Segment[] = []
  let i = 0
  while (i < reading.length) {
    if (reading[i] === 'っ') {
      let j = i
      while (j < reading.length && reading[j] === 'っ') j++
      const sokuonCount = j - i
      if (j >= reading.length) {
        // 語末の っ: 単独綴りのみ
        for (let k = 0; k < sokuonCount; k++) {
          segments.push({ kana: 'っ', candidates: [...SOKUON_STANDALONE] })
        }
        i = j
        continue
      }
      if (reading[j] === 'ん') {
        // っん は日本語に現れないが、安全側: っを単独セグメント化
        for (let k = 0; k < sokuonCount; k++) {
          segments.push({ kana: 'っ', candidates: [...SOKUON_STANDALONE] })
        }
        i = j
        continue
      }
      const [next, consumed] = readOne(reading, j)
      let candidates = next.candidates
      for (let k = 0; k < sokuonCount; k++) {
        candidates = mergeSokuon(candidates)
      }
      segments.push({ kana: 'っ'.repeat(sokuonCount) + next.kana, candidates })
      i = j + consumed
      continue
    }

    const [seg, consumed] = readOne(reading, i)
    segments.push(seg)
    i += consumed
  }
  return segments
}
