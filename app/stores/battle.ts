import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import type { AttackEvent, GameEvent, GameStartEvent, StateSyncEvent } from '../types/events'
import { PROTOCOL_VERSION } from '../types/events'
import type { GamePhase, Word } from '../types/game'
import { createPlayerState, INITIAL_HP } from '../types/game'
import { resolveAttack, type BattleEffect } from '../utils/battle/damage'
import { acceptTotalDealt, judgeSimultaneousKo } from '../utils/battle/protocol'
import type { RoomRole } from '../composables/useBattleRoom'
import type { TypingWordResult } from '../composables/useTypingEngine'
import { useWordsStore } from './words'

export type BattleOutcome = 'win' | 'loss' | 'draw'
export interface BattleResult {
  outcome: BattleOutcome
  reason: 'hp_zero' | 'forfeit'
}

export interface BattleInitOptions {
  role: RoomRole
  userId: string
  /** イベント送信(useBattleRoomのsend)。部屋入室時にinitで注入する */
  send: (event: GameEvent) => void
}

const COUNTDOWN_MS = 3500
const MATCH_WORD_COUNT = 40
const SYNC_THROTTLE_MS = 200
const SIMUL_KO_WAIT_MS = 500
const FORFEIT_GRACE_SEC = 10

/**
 * 対戦の状態遷移と勝敗判定の唯一の窓口。
 * - 自分のHPは自分が権威: 受信attack/state_syncの累積totalDealtから my.hp を再計算
 * - 相手のHP表示は相手のstate_syncが正、自attack時は楽観減算のみ
 * 部屋の入室時に init()、退室時に reset() を呼ぶこと(ストアは画面をまたいで生存するため)。
 */
export const useBattleStore = defineStore('battle', () => {
  const wordsStore = useWordsStore()

  const phase = ref<GamePhase>('lobby')
  const matchUid = ref<string | null>(null)
  const matchWords = ref<Word[]>([])
  const startAt = ref(0)
  const my = reactive(createPlayerState())
  const opp = reactive(createPlayerState())
  const myReady = ref(false)
  const oppReady = ref(false)
  const myRematch = ref(false)
  const oppRematch = ref(false)
  const result = ref<BattleResult | null>(null)
  /** 切断猶予の残り秒(表示用)。null=猶予中でない */
  const graceRemaining = ref<number | null>(null)

  /** UI演出用: 自分の攻撃(key更新で発火) */
  const attackFx = ref<{ damage: number; effects: BattleEffect[]; key: number } | null>(null)
  /** UI演出用: 被弾 */
  const hitFx = ref<{ damage: number; key: number } | null>(null)

  // 非リアクティブな内部状態
  let role: RoomRole = 'host'
  let userId = ''
  let sender: (event: GameEvent) => void = () => {}
  let seq = 0
  let oppTotal = 0 // 受け入れ済みの相手の累積与ダメージ
  let myDeathTs: number | null = null
  let oppDeathTs: number | null = null
  let lastSyncAt = 0
  let countdownTimer: ReturnType<typeof setTimeout> | null = null
  let deathTimer: ReturnType<typeof setTimeout> | null = null
  let oppWinTimer: ReturnType<typeof setTimeout> | null = null
  let graceTimer: ReturnType<typeof setInterval> | null = null

  const currentWord = computed<Word | null>(() =>
    phase.value === 'playing' && matchWords.value.length > 0
      ? matchWords.value[my.wordIndex % matchWords.value.length]!
      : null,
  )

  function base() {
    return { v: PROTOCOL_VERSION, from: userId }
  }

  function clearTimers() {
    if (countdownTimer) clearTimeout(countdownTimer)
    if (deathTimer) clearTimeout(deathTimer)
    if (oppWinTimer) clearTimeout(oppWinTimer)
    if (graceTimer) clearInterval(graceTimer)
    countdownTimer = deathTimer = oppWinTimer = null
    graceTimer = null
    graceRemaining.value = null
  }

  function resetMatchState() {
    Object.assign(my, createPlayerState())
    Object.assign(opp, createPlayerState())
    seq = 0
    oppTotal = 0
    myDeathTs = null
    oppDeathTs = null
    lastSyncAt = 0
    result.value = null
    myReady.value = false
    oppReady.value = false
    myRematch.value = false
    oppRematch.value = false
    attackFx.value = null
    hitFx.value = null
  }

  /** 部屋入室時に呼ぶ(送信関数と自分の情報を注入し、全状態を初期化) */
  function init(options: BattleInitOptions) {
    role = options.role
    userId = options.userId
    sender = options.send
    reset()
  }

  /** 退室時に呼ぶ(ストアはページをまたいで生存するため明示リセットが必要) */
  function reset() {
    clearTimers()
    resetMatchState()
    phase.value = 'lobby'
    matchUid.value = null
    matchWords.value = []
    startAt.value = 0
  }

  // ---------- ローカル入力 ----------

  function setReady() {
    if (phase.value !== 'lobby' || myReady.value) return
    myReady.value = true
    sender({ ...base(), type: 'ready' })
    tryStart()
  }

  function tryStart() {
    if (role !== 'host') return
    if (phase.value !== 'lobby' || !myReady.value || !oppReady.value) return
    const pool = wordsStore.shuffled()
    if (pool.length === 0) return
    const words = pool.slice(0, MATCH_WORD_COUNT)
    const uid = crypto.randomUUID()
    const at = Date.now() + COUNTDOWN_MS
    sender({ ...base(), type: 'game_start', matchUid: uid, words, startAt: at })
    beginCountdown(uid, words, at)
  }

  function beginCountdown(uid: string, words: Word[], at: number) {
    clearTimers()
    resetMatchState()
    matchUid.value = uid
    matchWords.value = words
    startAt.value = at
    phase.value = 'countdown'
    countdownTimer = setTimeout(() => {
      if (phase.value === 'countdown') phase.value = 'playing'
    }, Math.max(0, at - Date.now()))
  }

  function onWordTyped(typing: TypingWordResult) {
    if (phase.value !== 'playing' || myDeathTs !== null) return
    my.combo++
    my.maxCombo = Math.max(my.maxCombo, my.combo)
    my.wordsTyped++
    my.wordIndex++

    const outcome = resolveAttack('normal', {
      word: typing.word,
      combo: my.combo,
      elapsedMs: typing.elapsedMs,
    })
    my.totalDealt += outcome.damage
    // 楽観減算は送信より前に行う(送信直後に返ってくるstate_syncを上書きして二重減算しないため)
    opp.hp = Math.max(0, opp.hp - outcome.damage)
    attackFx.value = { damage: outcome.damage, effects: outcome.effects, key: Date.now() }
    sender({
      ...base(),
      type: 'attack',
      seq: ++seq,
      kind: 'normal',
      damage: outcome.damage,
      totalDealt: my.totalDealt,
      combo: my.combo,
      ts: Date.now(),
    })
    sync()
  }

  function onMiss() {
    if (phase.value !== 'playing') return
    my.combo = 0
    my.missCount++
  }

  function requestRematch() {
    if (phase.value !== 'finished' || myRematch.value) return
    myRematch.value = true
    sender({ ...base(), type: 'rematch' })
    tryRematch()
  }

  function tryRematch() {
    if (!myRematch.value || !oppRematch.value) return
    if (role === 'host') {
      phase.value = 'lobby'
      myReady.value = true
      oppReady.value = true
      tryStart()
    }
    // ゲストはホストのgame_startを待つ
  }

  // ---------- 受信イベント ----------

  function onRemoteEvent(event: GameEvent) {
    switch (event.type) {
      case 'ready':
        oppReady.value = true
        tryStart()
        break
      case 'game_start':
        if (role === 'guest') {
          const e = event as GameStartEvent
          beginCountdown(e.matchUid, e.words, e.startAt)
        }
        break
      case 'attack':
        applyOpponentDealt((event as AttackEvent).totalDealt, event as AttackEvent)
        break
      case 'state_sync': {
        const e = event as StateSyncEvent
        opp.hp = Math.max(0, Math.min(INITIAL_HP, e.hp))
        opp.combo = e.combo
        opp.wordIndex = e.wordIndex
        applyOpponentDealt(e.totalDealt, null)
        break
      }
      case 'game_over':
        if (event.reason === 'hp_zero') {
          oppDeathTs = event.ts
          opp.hp = 0
          if (myDeathTs !== null) {
            finish(judgeSimultaneousKo(myDeathTs, oppDeathTs), 'hp_zero')
          } else {
            // 即勝利にせず少し待つ: 相手のとどめの攻撃が飛行中で自分も直後に死ぬ(同時KO)可能性がある
            oppWinTimer = setTimeout(() => {
              if (!result.value && myDeathTs === null) finish('win', 'hp_zero')
            }, SIMUL_KO_WAIT_MS)
          }
        }
        break
      case 'rematch':
        oppRematch.value = true
        tryRematch()
        break
      // join系はuseBattleRoomが処理済み。未知typeはparse段階で破棄済み
    }
  }

  /** 相手の累積与ダメージを受け入れて自分のHPを再計算(イベント欠落の自己修復点) */
  function applyOpponentDealt(incomingTotal: number, attack: AttackEvent | null) {
    if (phase.value !== 'playing' && phase.value !== 'finished') return
    const prev = oppTotal
    oppTotal = acceptTotalDealt(oppTotal, incomingTotal)
    if (oppTotal === prev) return

    my.hp = Math.max(0, INITIAL_HP - oppTotal)
    hitFx.value = { damage: oppTotal - prev, key: Date.now() }
    if (attack) opp.combo = attack.combo
    sync(true)
    if (my.hp <= 0) die()
  }

  function die() {
    if (myDeathTs !== null || result.value) return
    myDeathTs = Date.now()
    my.hp = 0
    sender({ ...base(), type: 'game_over', reason: 'hp_zero', ts: myDeathTs })
    // 相手もほぼ同時に死んでいる可能性があるため、少し待ってから確定(同時KO裁定)
    deathTimer = setTimeout(() => {
      if (result.value) return
      if (oppDeathTs !== null) {
        finish(judgeSimultaneousKo(myDeathTs!, oppDeathTs), 'hp_zero')
      } else {
        finish('loss', 'hp_zero')
      }
    }, SIMUL_KO_WAIT_MS)
  }

  function sync(force = false) {
    if (phase.value !== 'playing') return
    const now = Date.now()
    if (!force && now - lastSyncAt < SYNC_THROTTLE_MS) return
    lastSyncAt = now
    sender({
      ...base(),
      type: 'state_sync',
      hp: my.hp,
      combo: my.combo,
      wordIndex: my.wordIndex,
      totalDealt: my.totalDealt,
      ts: now,
    })
  }

  function finish(outcome: BattleOutcome, reason: BattleResult['reason']) {
    if (result.value) return
    clearTimers()
    result.value = { outcome, reason }
    phase.value = 'finished'
  }

  // ---------- 切断処理 ----------

  function onOpponentLeft() {
    if (phase.value === 'lobby') {
      oppReady.value = false
      return
    }
    if (phase.value === 'finished') {
      oppRematch.value = false
      return
    }
    // countdown / playing: 10秒の復帰猶予 → 不戦勝
    graceRemaining.value = FORFEIT_GRACE_SEC
    graceTimer = setInterval(() => {
      if (graceRemaining.value === null) return
      graceRemaining.value--
      if (graceRemaining.value <= 0) {
        finish('win', 'forfeit')
      }
    }, 1000)
  }

  return {
    phase,
    matchUid,
    matchWords,
    startAt,
    my,
    opp,
    myReady,
    oppReady,
    myRematch,
    oppRematch,
    result,
    graceRemaining,
    currentWord,
    attackFx,
    hitFx,
    init,
    reset,
    setReady,
    onWordTyped,
    onMiss,
    onRemoteEvent,
    onOpponentLeft,
    requestRematch,
  }
})
