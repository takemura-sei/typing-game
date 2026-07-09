import type { Word } from './game'

/**
 * Realtime Broadcastで交換するイベントプロトコル。
 * - 全イベントに v(バージョン)と from(送信者userId)を付ける
 * - 受信側は未知の type / kind を無視する(前方互換 = 必殺技等の後付けの布石)
 */
export const PROTOCOL_VERSION = 1

interface BaseEvent {
  v: number
  from: string
}

/** ゲスト→ホスト: 入室希望 */
export interface JoinRequestEvent extends BaseEvent {
  type: 'join_request'
  name: string
}

/** ホスト→ゲスト: 入室承認(同時入室はホストが先着1名のみ承認して直列化) */
export interface JoinAckEvent extends BaseEvent {
  type: 'join_ack'
  to: string
  name: string
}

export interface JoinRejectEvent extends BaseEvent {
  type: 'join_reject'
  to: string
  reason: 'full' | 'in_game'
}

export interface ReadyEvent extends BaseEvent {
  type: 'ready'
}

/** ホスト→ゲスト: 対戦開始。お題列を同梱して両者の出題を一致させる */
export interface GameStartEvent extends BaseEvent {
  type: 'game_start'
  matchUid: string
  words: Word[]
  /** 両者共通の開始時刻(epoch ms)。時計スキューは数百ms許容 */
  startAt: number
}

/** 攻撃。totalDealt(累積値)を載せることでイベント欠落を次のイベントで自己修復する */
export interface AttackEvent extends BaseEvent {
  type: 'attack'
  /** 送信者ごとの単調増加番号(重複・順序逆転の破棄用) */
  seq: number
  /** 'normal' | 将来 'special_*'。未知kindは受信側で無視 */
  kind: string
  damage: number
  /** この試合で与えた累積ダメージ */
  totalDealt: number
  combo: number
  ts: number
}

/** 自分の状態通知(自分のHPは自分が権威)。200msスロットルで送る */
export interface StateSyncEvent extends BaseEvent {
  type: 'state_sync'
  hp: number
  combo: number
  wordIndex: number
  totalDealt: number
  ts: number
}

export interface GameOverEvent extends BaseEvent {
  type: 'game_over'
  reason: 'hp_zero' | 'forfeit'
  ts: number
}

export interface RematchEvent extends BaseEvent {
  type: 'rematch'
}

export type GameEvent =
  | JoinRequestEvent
  | JoinAckEvent
  | JoinRejectEvent
  | ReadyEvent
  | GameStartEvent
  | AttackEvent
  | StateSyncEvent
  | GameOverEvent
  | RematchEvent

export type GameEventType = GameEvent['type']
