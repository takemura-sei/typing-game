import type { Word } from '../types/game'

/**
 * Supabase未設定/テーブル未作成でもソロ練習が動くためのフォールバックお題。
 * 本番のお題は supabase/seed/words.sql で words テーブルに投入する。
 */
export const FALLBACK_WORDS: Word[] = [
  { id: -1, display: '寿司', reading: 'すし', difficulty: 1 },
  { id: -2, display: '猫', reading: 'ねこ', difficulty: 1 },
  { id: -3, display: '切手', reading: 'きって', difficulty: 1 },
  { id: -4, display: '抹茶', reading: 'まっちゃ', difficulty: 1 },
  { id: -5, display: '新聞', reading: 'しんぶん', difficulty: 1 },
  { id: -6, display: '写真', reading: 'しゃしん', difficulty: 1 },
  { id: -7, display: '電車', reading: 'でんしゃ', difficulty: 1 },
  { id: -8, display: '学校', reading: 'がっこう', difficulty: 1 },
  { id: -9, display: '野球', reading: 'やきゅう', difficulty: 1 },
  { id: -10, display: '特急列車', reading: 'とっきゅうれっしゃ', difficulty: 2 },
  { id: -11, display: '豚骨ラーメン', reading: 'とんこつらーめん', difficulty: 2 },
  { id: -12, display: '自転車', reading: 'じてんしゃ', difficulty: 2 },
  { id: -13, display: '新幹線', reading: 'しんかんせん', difficulty: 2 },
  { id: -14, display: '救急車', reading: 'きゅうきゅうしゃ', difficulty: 2 },
  { id: -15, display: '花火大会', reading: 'はなびたいかい', difficulty: 2 },
  { id: -16, display: '百発百中の必殺技', reading: 'ひゃっぱつひゃくちゅうのひっさつわざ', difficulty: 3 },
  { id: -17, display: '電光石火の早業', reading: 'でんこうせっかのはやわざ', difficulty: 3 },
  { id: -18, display: '絶体絶命のピンチ', reading: 'ぜったいぜつめいのぴんち', difficulty: 3 },
  { id: -19, display: '究極のタイピング勝負', reading: 'きゅうきょくのたいぴんぐしょうぶ', difficulty: 3 },
  { id: -20, display: '起死回生のホームラン', reading: 'きしかいせいのほーむらん', difficulty: 3 },
]
