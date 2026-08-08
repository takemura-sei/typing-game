import { defineStore } from 'pinia'
import type { AttackEvent, GameEvent, GameStartEvent, StateSyncEvent } from '../types/events'
import { PROTOCOL_VERSION } from '../types/events'
import type { BattleEffect, BattleOutcome, BattleResult } from '../types/battle'
import type { GamePhase, PlayerState, TypingWordResult, Word } from '../types/game'
import { createPlayerState, INITIAL_HP } from '../types/game'
import type { RoomRole } from '../types/room'
import { resolveAttack } from '../utils/battle/damage'
import { acceptTotalDealt, judgeSimultaneousKo } from '../utils/battle/protocol'
import { useWordsStore } from './words'

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

interface BattleState {
  phase: GamePhase
  matchUid: string | null
  matchWords: Word[]
  startAt: number
  my: PlayerState
  opp: PlayerState
  myReady: boolean
  oppReady: boolean
  myRematch: boolean
  oppRematch: boolean
  result: BattleResult | null
  /** 試合終了時刻(epoch ms)。戦績のduration計算用 */
  finishedAt: number
  /** 切断猶予の残り秒(表示用)。null=猶予中でない */
  graceRemaining: number | null
  /** UI演出用: 自分の攻撃(key更新で発火) */
  attackFx: { damage: number; effects: BattleEffect[]; key: number } | null
  /** UI演出用: 被弾 */
  hitFx: { damage: number; key: number } | null

  // ---- 以下、非reactiveな内部実装状態(公開APIではない) ----
  role: RoomRole
  userId: string
  sender: (event: GameEvent) => void
  seq: number
  /** 受け入れ済みの相手の累積与ダメージ */
  oppTotal: number
  myDeathTs: number | null
  oppDeathTs: number | null
  lastSyncAt: number
  countdownTimer: ReturnType<typeof setTimeout> | null
  deathTimer: ReturnType<typeof setTimeout> | null
  oppWinTimer: ReturnType<typeof setTimeout> | null
  graceTimer: ReturnType<typeof setInterval> | null
}

/**
 * 対戦の状態遷移と勝敗判定の唯一の窓口。
 * - 自分のHPは自分が権威: 受信attack/state_syncの累積totalDealtから my.hp を再計算
 * - 相手のHP表示は相手のstate_syncが正、自attack時は楽観減算のみ
 * 部屋の入室時に init()、退室時に reset() を呼ぶこと(ストアは画面をまたいで生存するため)。
 */
export const useBattleStore = defineStore('battle', {
  state: (): BattleState => ({
    phase: 'lobby',
    matchUid: null,
    matchWords: [],
    startAt: 0,
    my: createPlayerState(),
    opp: createPlayerState(),
    myReady: false,
    oppReady: false,
    myRematch: false,
    oppRematch: false,
    result: null,
    finishedAt: 0,
    graceRemaining: null,
    attackFx: null,
    hitFx: null,

    role: 'host',
    userId: '',
    sender: () => {},
    seq: 0,
    oppTotal: 0,
    myDeathTs: null,
    oppDeathTs: null,
    lastSyncAt: 0,
    countdownTimer: null,
    deathTimer: null,
    oppWinTimer: null,
    graceTimer: null,
  }),

  getters: {
    /** 現在出題中のお題。playing以外はnull */
    currentWord(state): Word | null {
      return state.phase === 'playing' && state.matchWords.length > 0
        ? state.matchWords[state.my.wordIndex % state.matchWords.length]!
        : null
    },

    /** 試合時間(ms)。開始前に終了(カウントダウン中の不戦勝等)は0 */
    durationMs(state): number {
      return state.finishedAt > 0 ? Math.max(0, state.finishedAt - state.startAt) : 0
    },
  },

  actions: {
    base() {
      return { v: PROTOCOL_VERSION, from: this.userId }
    },

    clearTimers() {
      if (this.countdownTimer) clearTimeout(this.countdownTimer)
      if (this.deathTimer) clearTimeout(this.deathTimer)
      if (this.oppWinTimer) clearTimeout(this.oppWinTimer)
      if (this.graceTimer) clearInterval(this.graceTimer)
      this.countdownTimer = this.deathTimer = this.oppWinTimer = null
      this.graceTimer = null
      this.graceRemaining = null
    },

    resetMatchState() {
      this.my = createPlayerState()
      this.opp = createPlayerState()
      this.seq = 0
      this.oppTotal = 0
      this.myDeathTs = null
      this.oppDeathTs = null
      this.lastSyncAt = 0
      this.result = null
      this.myReady = false
      this.oppReady = false
      this.myRematch = false
      this.oppRematch = false
      this.attackFx = null
      this.hitFx = null
      this.finishedAt = 0
    },

    /** 部屋入室時に呼ぶ(送信関数と自分の情報を注入し、全状態を初期化) */
    init(options: BattleInitOptions) {
      this.role = options.role
      this.userId = options.userId
      this.sender = options.send
      this.reset()
    },

    /** 退室時に呼ぶ(ストアはページをまたいで生存するため明示リセットが必要) */
    reset() {
      this.clearTimers()
      this.resetMatchState()
      this.phase = 'lobby'
      this.matchUid = null
      this.matchWords = []
      this.startAt = 0
    },

    // ---------- ローカル入力 ----------

    setReady() {
      if (this.phase !== 'lobby' || this.myReady) return
      this.myReady = true
      this.sender({ ...this.base(), type: 'ready' })
      this.tryStart()
    },

    tryStart() {
      if (this.role !== 'host') return
      if (this.phase !== 'lobby' || !this.myReady || !this.oppReady) return
      const wordsStore = useWordsStore()
      const pool = wordsStore.shuffled()
      if (pool.length === 0) return
      const words = pool.slice(0, MATCH_WORD_COUNT)
      const uid = crypto.randomUUID()
      const at = Date.now() + COUNTDOWN_MS
      this.sender({ ...this.base(), type: 'game_start', matchUid: uid, words, startAt: at })
      this.beginCountdown(uid, words, at)
    },

    beginCountdown(uid: string, words: Word[], at: number) {
      this.clearTimers()
      this.resetMatchState()
      this.matchUid = uid
      this.matchWords = words
      this.startAt = at
      this.phase = 'countdown'
      this.countdownTimer = setTimeout(() => {
        if (this.phase === 'countdown') this.phase = 'playing'
      }, Math.max(0, at - Date.now()))
    },

    onWordTyped(typing: TypingWordResult) {
      if (this.phase !== 'playing' || this.myDeathTs !== null) return
      this.my.combo++
      this.my.maxCombo = Math.max(this.my.maxCombo, this.my.combo)
      this.my.wordsTyped++
      this.my.wordIndex++

      const outcome = resolveAttack('normal', {
        word: typing.word,
        combo: this.my.combo,
        elapsedMs: typing.elapsedMs,
      })
      this.my.totalDealt += outcome.damage
      // 楽観減算は送信より前に行う(送信直後に返ってくるstate_syncを上書きして二重減算しないため)
      this.opp.hp = Math.max(0, this.opp.hp - outcome.damage)
      this.attackFx = { damage: outcome.damage, effects: outcome.effects, key: Date.now() }
      this.sender({
        ...this.base(),
        type: 'attack',
        seq: ++this.seq,
        kind: 'normal',
        damage: outcome.damage,
        totalDealt: this.my.totalDealt,
        combo: this.my.combo,
        ts: Date.now(),
      })
      this.sync()
    },

    onMiss() {
      if (this.phase !== 'playing') return
      this.my.combo = 0
      this.my.missCount++
    },

    requestRematch() {
      if (this.phase !== 'finished' || this.myRematch) return
      this.myRematch = true
      this.sender({ ...this.base(), type: 'rematch' })
      this.tryRematch()
    },

    tryRematch() {
      if (!this.myRematch || !this.oppRematch) return
      if (this.role === 'host') {
        this.phase = 'lobby'
        this.myReady = true
        this.oppReady = true
        this.tryStart()
      }
      // ゲストはホストのgame_startを待つ
    },

    // ---------- 受信イベント ----------

    onRemoteEvent(event: GameEvent) {
      switch (event.type) {
        case 'ready':
          this.oppReady = true
          this.tryStart()
          break
        case 'game_start':
          if (this.role === 'guest') {
            const e = event as GameStartEvent
            this.beginCountdown(e.matchUid, e.words, e.startAt)
          }
          break
        case 'attack':
          this.applyOpponentDealt((event as AttackEvent).totalDealt, event as AttackEvent)
          break
        case 'state_sync': {
          const e = event as StateSyncEvent
          this.opp.hp = Math.max(0, Math.min(INITIAL_HP, e.hp))
          this.opp.combo = e.combo
          this.opp.wordIndex = e.wordIndex
          this.applyOpponentDealt(e.totalDealt, null)
          break
        }
        case 'game_over':
          if (event.reason === 'hp_zero') {
            this.oppDeathTs = event.ts
            this.opp.hp = 0
            if (this.myDeathTs !== null) {
              this.finish(judgeSimultaneousKo(this.myDeathTs, this.oppDeathTs), 'hp_zero')
            } else {
              // 即勝利にせず少し待つ: 相手のとどめの攻撃が飛行中で自分も直後に死ぬ(同時KO)可能性がある
              this.oppWinTimer = setTimeout(() => {
                if (!this.result && this.myDeathTs === null) this.finish('win', 'hp_zero')
              }, SIMUL_KO_WAIT_MS)
            }
          }
          break
        case 'rematch':
          this.oppRematch = true
          this.tryRematch()
          break
        // join系はuseBattleRoomが処理済み。未知typeはparse段階で破棄済み
      }
    },

    /** 相手の累積与ダメージを受け入れて自分のHPを再計算(イベント欠落の自己修復点) */
    applyOpponentDealt(incomingTotal: number, attack: AttackEvent | null) {
      if (this.phase !== 'playing' && this.phase !== 'finished') return
      const prev = this.oppTotal
      this.oppTotal = acceptTotalDealt(this.oppTotal, incomingTotal)
      if (this.oppTotal === prev) return

      this.my.hp = Math.max(0, INITIAL_HP - this.oppTotal)
      this.hitFx = { damage: this.oppTotal - prev, key: Date.now() }
      if (attack) this.opp.combo = attack.combo
      this.sync(true)
      if (this.my.hp <= 0) this.die()
    },

    die() {
      if (this.myDeathTs !== null || this.result) return
      this.myDeathTs = Date.now()
      this.my.hp = 0
      this.sender({ ...this.base(), type: 'game_over', reason: 'hp_zero', ts: this.myDeathTs })
      // 相手もほぼ同時に死んでいる可能性があるため、少し待ってから確定(同時KO裁定)
      this.deathTimer = setTimeout(() => {
        if (this.result) return
        if (this.oppDeathTs !== null) {
          this.finish(judgeSimultaneousKo(this.myDeathTs!, this.oppDeathTs), 'hp_zero')
        } else {
          this.finish('loss', 'hp_zero')
        }
      }, SIMUL_KO_WAIT_MS)
    },

    sync(force = false) {
      if (this.phase !== 'playing') return
      const now = Date.now()
      if (!force && now - this.lastSyncAt < SYNC_THROTTLE_MS) return
      this.lastSyncAt = now
      this.sender({
        ...this.base(),
        type: 'state_sync',
        hp: this.my.hp,
        combo: this.my.combo,
        wordIndex: this.my.wordIndex,
        totalDealt: this.my.totalDealt,
        ts: now,
      })
    },

    finish(outcome: BattleOutcome, reason: BattleResult['reason']) {
      if (this.result) return
      this.clearTimers()
      this.result = { outcome, reason }
      this.finishedAt = Date.now()
      this.phase = 'finished'
    },

    // ---------- 切断処理 ----------

    onOpponentLeft() {
      if (this.phase === 'lobby') {
        this.oppReady = false
        return
      }
      if (this.phase === 'finished') {
        this.oppRematch = false
        return
      }
      // countdown / playing: 10秒の復帰猶予 → 不戦勝
      this.graceRemaining = FORFEIT_GRACE_SEC
      this.graceTimer = setInterval(() => {
        if (this.graceRemaining === null) return
        this.graceRemaining--
        if (this.graceRemaining <= 0) {
          this.finish('win', 'forfeit')
        }
      }, 1000)
    },
  },
})
