import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { GameEvent } from '../app/types/events'
import type { TypingWordResult, Word } from '../app/types/game'
import { useBattleStore } from '../app/stores/battle'
import { useWordsStore } from '../app/stores/words'

/**
 * 2つのbattleストア(Piniaインスタンス2つ=2プレイヤー)をループバック直結して
 * 模擬対戦する統合テスト。Realtime(通信路)はscripts/realtime-smoke.mjsで別途検証済み。
 */

const WORDS: Word[] = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  display: `お題${i + 1}`,
  reading: 'すし', // base 8 + floor(2/3)=0 → 8ダメージ(コンボ倍率で増加)
  difficulty: 1,
}))

type Battle = ReturnType<typeof useBattleStore>

function makePair(pool: Word[] = WORDS) {
  // プレイヤーごとに独立したPiniaインスタンスを持たせる
  const make = () => {
    setActivePinia(createPinia())
    const words = useWordsStore()
    words.words = pool
    return useBattleStore()
  }
  const host = make()
  // 新設計では各クライアントが自分のプールから独立に出題を選ぶため、
  // guestも本番同様(room/[code].vueで両者が独立にloadWords()する)自前のプールが必要
  const guest = make()

  // 相互接続: 送信は相手のonRemoteEventへ配送(再入はキューで直列化)
  const inbox: { to: Battle; event: GameEvent }[] = []
  let delivering = false
  function deliver(to: Battle, event: GameEvent) {
    inbox.push({ to, event })
    if (delivering) return
    delivering = true
    while (inbox.length > 0) {
      const item = inbox.shift()!
      item.to.onRemoteEvent(item.event)
    }
    delivering = false
  }

  host.init({ role: 'host', userId: 'user-host', send: (e) => deliver(guest, e) })
  guest.init({ role: 'guest', userId: 'user-guest', send: (e) => deliver(host, e) })
  return { host, guest }
}

function typed(word: Word): TypingWordResult {
  return { word, elapsedMs: 1500, keystrokes: 4, misses: 0 }
}

/** 現在のお題を1語打ち切る */
function typeOneWord(battle: Battle) {
  const word = battle.currentWord
  expect(word).not.toBeNull()
  battle.onWordTyped(typed(word!))
}

function startMatch(pair: ReturnType<typeof makePair>) {
  pair.guest.setReady()
  pair.host.setReady()
  vi.advanceTimersByTime(3600) // カウントダウン3.5s
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('開始同期', () => {
  it('両者readyでhostが開始し、同じmatchUidでplayingになる', () => {
    const pair = makePair()
    pair.guest.setReady()
    pair.host.setReady()
    expect(pair.host.phase).toBe('countdown')
    expect(pair.guest.phase).toBe('countdown')
    expect(pair.guest.matchUid).toBe(pair.host.matchUid)
    vi.advanceTimersByTime(3600)
    expect(pair.host.phase).toBe('playing')
    expect(pair.guest.phase).toBe('playing')
    // お題は各自が自分のコンボに応じてローカルに選ぶため、内容の一致は保証しない
    expect(pair.host.currentWord).not.toBeNull()
    expect(pair.guest.currentWord).not.toBeNull()
  })
})

describe('攻撃とHP権威モデル', () => {
  it('攻撃側の与ダメージが防御側の自HPに反映される', () => {
    const pair = makePair()
    startMatch(pair)
    typeOneWord(pair.host)
    expect(pair.guest.my.hp).toBe(100 - pair.host.my.totalDealt)
    // 防御側のstate_syncで攻撃側の相手HP表示も一致する
    expect(pair.host.opp.hp).toBe(pair.guest.my.hp)
  })

  it('コンボでダメージが増え、ミスでリセットされる', () => {
    const pair = makePair()
    startMatch(pair)
    typeOneWord(pair.host)
    const d1 = pair.host.my.totalDealt
    vi.advanceTimersByTime(300) // syncスロットル回避
    typeOneWord(pair.host)
    const d2 = pair.host.my.totalDealt - d1
    expect(d2).toBeGreaterThan(d1) // 2コンボ目の方が痛い
    pair.host.onMiss()
    expect(pair.host.my.combo).toBe(0)
  })

  it('HP0で敗北/勝利が確定する', () => {
    const pair = makePair()
    startMatch(pair)
    for (let i = 0; i < 20 && pair.guest.my.hp > 0; i++) {
      vi.advanceTimersByTime(300)
      typeOneWord(pair.host)
    }
    expect(pair.guest.my.hp).toBe(0)
    vi.advanceTimersByTime(600) // 同時KO猶予経過
    expect(pair.guest.result?.outcome).toBe('loss')
    expect(pair.host.result?.outcome).toBe('win')
    expect(pair.host.phase).toBe('finished')
  })
})

describe('コンボ連動の難易度', () => {
  // difficultyの層ごとに複数語を用意(readingは短く揃え、コンボ倍率だけで
  // 与ダメージが伸びすぎてHP0判定のタイマーに干渉しないようにする)
  const TIERED_WORDS: Word[] = [
    { id: 1, display: 'A', reading: 'あ', difficulty: 1 },
    { id: 2, display: 'B', reading: 'い', difficulty: 1 },
    { id: 3, display: 'C', reading: 'う', difficulty: 1 },
    { id: 4, display: 'D', reading: 'え', difficulty: 2 },
    { id: 5, display: 'E', reading: 'お', difficulty: 2 },
    { id: 6, display: 'F', reading: 'か', difficulty: 2 },
    { id: 7, display: 'G', reading: 'き', difficulty: 3 },
    { id: 8, display: 'H', reading: 'く', difficulty: 3 },
    { id: 9, display: 'I', reading: 'け', difficulty: 3 },
  ]

  it('コンボが伸びるほど出題の難易度が上がり、ミスでtier1に戻る', () => {
    const pair = makePair(TIERED_WORDS)
    startMatch(pair)
    // 時間は進めない: 相手の瀕死/撃破に伴うタイマー(同時KO猶予等)がここでは
    // 不要に発火し、host側のphaseを'finished'にしてonWordTypedを止めてしまうため
    expect(pair.host.currentWord!.difficulty).toBe(1) // 開始直後はtier1(combo=0)

    // combo 1〜4: 閾値(5)未満なのでtier1のまま
    for (let i = 0; i < 4; i++) {
      typeOneWord(pair.host)
      expect(pair.host.currentWord!.difficulty).toBe(1)
    }

    // 5語目でcombo=5に到達 → 次の出題はtier2
    typeOneWord(pair.host)
    expect(pair.host.my.combo).toBe(5)
    expect(pair.host.currentWord!.difficulty).toBe(2)

    // combo 6〜14: 閾値(15)未満なのでtier2のまま
    for (let i = 0; i < 9; i++) {
      typeOneWord(pair.host)
      expect(pair.host.currentWord!.difficulty).toBe(2)
    }
    expect(pair.host.my.combo).toBe(14)

    // 15語目でcombo=15に到達 → 次の出題はtier3
    typeOneWord(pair.host)
    expect(pair.host.my.combo).toBe(15)
    expect(pair.host.currentWord!.difficulty).toBe(3)

    // ミスでコンボが切れても、今出ている(tier3の)お題自体は変わらない。
    // それを打ち切った直後からtier1に戻る
    pair.host.onMiss()
    expect(pair.host.my.combo).toBe(0)
    typeOneWord(pair.host)
    expect(pair.host.my.combo).toBe(1)
    expect(pair.host.currentWord!.difficulty).toBe(1)
  })
})

describe('同時KO', () => {
  it('300ms以内に両者が死んだら引き分け', () => {
    const pair = makePair()
    startMatch(pair)
    // 両者を瀕死にする(相互に大ダメージを受けた状態を注入)
    pair.host.onRemoteEvent({
      v: 1, from: 'user-guest', type: 'attack',
      seq: 1, kind: 'normal', damage: 5, totalDealt: 55, combo: 1, ts: Date.now(),
    })
    pair.guest.onRemoteEvent({
      v: 1, from: 'user-host', type: 'attack',
      seq: 1, kind: 'normal', damage: 5, totalDealt: 55, combo: 1, ts: Date.now(),
    })
    expect(pair.host.my.hp).toBe(45)
    expect(pair.guest.my.hp).toBe(45)
    // ほぼ同時にとどめ(累積60超えクランプに注意: 55+45=100 は +45増分でOK)
    pair.host.onRemoteEvent({
      v: 1, from: 'user-guest', type: 'attack',
      seq: 2, kind: 'normal', damage: 45, totalDealt: 100, combo: 2, ts: Date.now(),
    })
    vi.advanceTimersByTime(100)
    pair.guest.onRemoteEvent({
      v: 1, from: 'user-host', type: 'attack',
      seq: 2, kind: 'normal', damage: 45, totalDealt: 100, combo: 2, ts: Date.now(),
    })
    vi.advanceTimersByTime(600)
    expect(pair.host.result?.outcome).toBe('draw')
    expect(pair.guest.result?.outcome).toBe('draw')
  })
})

describe('切断', () => {
  it('対戦中の相手切断は10秒猶予後に不戦勝', () => {
    const pair = makePair()
    startMatch(pair)
    pair.host.onOpponentLeft()
    expect(pair.host.graceRemaining).toBe(10)
    vi.advanceTimersByTime(10_100)
    expect(pair.host.result).toEqual({ outcome: 'win', reason: 'forfeit' })
  })

  it('ロビー中の切断は相手のreadyを取り消すだけ', () => {
    const pair = makePair()
    pair.guest.setReady() // hostのoppReadyが立つ
    expect(pair.host.oppReady).toBe(true)
    pair.host.onOpponentLeft()
    expect(pair.host.oppReady).toBe(false)
    expect(pair.host.phase).toBe('lobby')
  })
})

describe('リマッチ', () => {
  it('両者がリマッチ希望で新しい試合が始まる', () => {
    const pair = makePair()
    startMatch(pair)
    const firstUid = pair.host.matchUid
    // ホストが押し切って勝つ
    for (let i = 0; i < 20 && pair.guest.my.hp > 0; i++) {
      vi.advanceTimersByTime(300)
      typeOneWord(pair.host)
    }
    vi.advanceTimersByTime(600)
    expect(pair.host.phase).toBe('finished')

    pair.guest.requestRematch()
    pair.host.requestRematch()
    expect(pair.host.phase).toBe('countdown')
    expect(pair.guest.phase).toBe('countdown')
    expect(pair.host.matchUid).not.toBe(firstUid)
    expect(pair.host.my.hp).toBe(100)
    expect(pair.guest.my.hp).toBe(100)
    vi.advanceTimersByTime(3600)
    expect(pair.guest.phase).toBe('playing')
  })
})

describe('ストアのリセット', () => {
  it('reset()でロビー状態に戻る(退室→再入室に相当)', () => {
    const pair = makePair()
    startMatch(pair)
    typeOneWord(pair.host)
    pair.host.reset()
    expect(pair.host.phase).toBe('lobby')
    expect(pair.host.my.hp).toBe(100)
    expect(pair.host.matchUid).toBeNull()
    expect(pair.host.currentWord).toBeNull()
  })
})
