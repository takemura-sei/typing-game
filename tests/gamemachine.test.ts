import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../app/types/events'
import type { Word } from '../app/types/game'
import { useGameMachine } from '../app/composables/useGameMachine'
import type { TypingWordResult } from '../app/composables/useTypingEngine'

/**
 * 2つのuseGameMachineをループバック直結して模擬対戦する統合テスト。
 * Realtime(通信路)はscripts/realtime-smoke.mjsで別途検証済み。
 */

const WORDS: Word[] = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  display: `お題${i + 1}`,
  reading: 'すし', // base 8 + floor(2/3)=0 → 8ダメージ(コンボ倍率で増加)
  difficulty: 1,
}))

function makePair() {
  // 相互接続: 送信は相手のonRemoteEventへ即時配送
  const inbox: { to: 'host' | 'guest'; event: GameEvent }[] = []
  let delivering = false

  const hostSend = (event: GameEvent) => deliver('guest', event)
  const guestSend = (event: GameEvent) => deliver('host', event)

  const host = useGameMachine({
    role: 'host',
    userId: 'user-host',
    send: hostSend,
    getWordPool: () => WORDS,
  })
  const guest = useGameMachine({
    role: 'guest',
    userId: 'user-guest',
    send: guestSend,
    getWordPool: () => [],
  })

  function deliver(to: 'host' | 'guest', event: GameEvent) {
    inbox.push({ to, event })
    if (delivering) return // 再入時はキューに積むだけ(実配送は外側ループ)
    delivering = true
    while (inbox.length > 0) {
      const { to: dest, event: e } = inbox.shift()!
      ;(dest === 'host' ? host : guest).onRemoteEvent(e)
    }
    delivering = false
  }

  return { host, guest }
}

function typed(word: Word): TypingWordResult {
  return { word, elapsedMs: 1500, keystrokes: 4, misses: 0 }
}

/** 現在のお題を1語打ち切る */
function typeOneWord(machine: ReturnType<typeof useGameMachine>) {
  const word = machine.currentWord.value
  expect(word).not.toBeNull()
  machine.onWordTyped(typed(word!))
}

function startMatch(pair: ReturnType<typeof makePair>) {
  pair.host.onRemoteEvent({ v: 1, from: 'user-guest', type: 'ready' }) // ゲストready相当は直結済みだが順序明示
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
  it('両者readyでhostが開始し、同じお題列・matchUidでplayingになる', () => {
    const pair = makePair()
    pair.guest.setReady()
    pair.host.setReady()
    expect(pair.host.phase.value).toBe('countdown')
    expect(pair.guest.phase.value).toBe('countdown')
    expect(pair.guest.matchUid.value).toBe(pair.host.matchUid.value)
    expect(pair.guest.words.value.map((w) => w.id)).toEqual(
      pair.host.words.value.map((w) => w.id),
    )
    vi.advanceTimersByTime(3600)
    expect(pair.host.phase.value).toBe('playing')
    expect(pair.guest.phase.value).toBe('playing')
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
    expect(pair.guest.result.value?.outcome).toBe('loss')
    expect(pair.host.result.value?.outcome).toBe('win')
    expect(pair.host.phase.value).toBe('finished')
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
    expect(pair.host.result.value?.outcome).toBe('draw')
    expect(pair.guest.result.value?.outcome).toBe('draw')
  })
})

describe('切断', () => {
  it('対戦中の相手切断は10秒猶予後に不戦勝', () => {
    const pair = makePair()
    startMatch(pair)
    pair.host.onOpponentLeft()
    expect(pair.host.graceRemaining.value).toBe(10)
    vi.advanceTimersByTime(10_100)
    expect(pair.host.result.value).toEqual({ outcome: 'win', reason: 'forfeit' })
  })

  it('ロビー中の切断は相手のreadyを取り消すだけ', () => {
    const pair = makePair()
    pair.guest.setReady() // hostのoppReadyが立つ
    expect(pair.host.oppReady.value).toBe(true)
    pair.host.onOpponentLeft()
    expect(pair.host.oppReady.value).toBe(false)
    expect(pair.host.phase.value).toBe('lobby')
  })
})

describe('リマッチ', () => {
  it('両者がリマッチ希望で新しい試合が始まる', () => {
    const pair = makePair()
    startMatch(pair)
    const firstUid = pair.host.matchUid.value
    // ホストが押し切って勝つ
    for (let i = 0; i < 20 && pair.guest.my.hp > 0; i++) {
      vi.advanceTimersByTime(300)
      typeOneWord(pair.host)
    }
    vi.advanceTimersByTime(600)
    expect(pair.host.phase.value).toBe('finished')

    pair.guest.requestRematch()
    pair.host.requestRematch()
    expect(pair.host.phase.value).toBe('countdown')
    expect(pair.guest.phase.value).toBe('countdown')
    expect(pair.host.matchUid.value).not.toBe(firstUid)
    expect(pair.host.my.hp).toBe(100)
    expect(pair.guest.my.hp).toBe(100)
    vi.advanceTimersByTime(3600)
    expect(pair.guest.phase.value).toBe('playing')
  })
})
