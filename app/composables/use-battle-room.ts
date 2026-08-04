import { onBeforeUnmount, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { GameEvent, JoinAckEvent, JoinRejectEvent, JoinRequestEvent } from '../types/events'
import { PROTOCOL_VERSION } from '../types/events'
import { parseGameEvent } from '../utils/battle/protocol'

export type RoomRole = 'host' | 'guest'

export type RoomStatus =
  | 'idle'
  | 'connecting' // チャンネル接続中 / ゲスト: join_ack待ち
  | 'waiting' // ホスト: 相手待ち
  | 'connected' // 対戦相手と接続済み
  | 'no_room' // ゲスト: 部屋(ホスト)が見つからない
  | 'room_full' // ゲスト: 満室で拒否された
  | 'code_taken' // ホスト: 同じコードのホストが既にいる
  | 'error'

export interface PeerInfo {
  userId: string
  name: string
  role: RoomRole
}

interface PresenceMeta {
  userId: string
  name: string
  role: RoomRole
}

export interface BattleRoomOptions {
  code: string
  role: RoomRole
  userId: string
  name: string
  /** 対戦相手からのゲームイベント(join系はroom内で処理済み) */
  onEvent: (event: GameEvent) => void
  /** 対戦相手のpresence離脱(切断/退室)。復帰猶予の判断は呼び出し側 */
  onPeerLeave: () => void
  /** ホスト用: 今ゲストを受け入れられるか(対戦中の新規入室を拒否する等)。省略時は常に可 */
  canAcceptGuest?: () => boolean
}

/**
 * Realtimeチャンネルの購読・Presence・イベント送受信を担う通信層。
 * ゲーム進行の判断はしない(battleストアの責務)。
 * - 1ルーム = 1チャンネル `room:{code}`
 * - ロビー調停のみホストが権威: join_requestに対し先着1名だけjoin_ack
 */
export function useBattleRoom(options: BattleRoomOptions) {
  const supabase = useSupabase()
  const status = ref<RoomStatus>('idle')
  const opponent = ref<PeerInfo | null>(null)

  let channel: RealtimeChannel | null = null
  let guestAckTimer: ReturnType<typeof setTimeout> | null = null
  let guestNoRoomTimer: ReturnType<typeof setTimeout> | null = null
  let joinRequested = false

  function base() {
    return { v: PROTOCOL_VERSION, from: options.userId }
  }

  function send(event: GameEvent) {
    channel?.send({ type: 'broadcast', event: 'game', payload: event })
  }

  function presenceMetas(): PresenceMeta[] {
    if (!channel) return []
    return Object.values(channel.presenceState<PresenceMeta>()).flat()
  }

  /** ゲスト: ホストの存在が確認でき次第、一度だけ入室希望を送る */
  function tryJoinRequest() {
    if (options.role !== 'guest' || joinRequested || status.value !== 'connecting') return
    const host = presenceMetas().find((m) => m.role === 'host')
    if (!host) return
    joinRequested = true
    if (guestNoRoomTimer) clearTimeout(guestNoRoomTimer)
    send({ ...base(), type: 'join_request', name: options.name })
    // ホストからackもrejectも来なければ部屋なし扱い
    guestAckTimer = setTimeout(() => {
      if (status.value === 'connecting') {
        status.value = 'no_room'
        leave()
      }
    }, 4000)
  }

  function handleEvent(payload: unknown) {
    const event = parseGameEvent(payload)
    if (!event || event.from === options.userId) return

    // --- 入室調停(通信層で完結させる) ---
    if (event.type === 'join_request') {
      if (options.role !== 'host') return
      const req = event as JoinRequestEvent
      if (opponent.value && opponent.value.userId !== req.from) {
        send({ ...base(), type: 'join_reject', to: req.from, reason: 'full' })
        return
      }
      if (options.canAcceptGuest && !options.canAcceptGuest()) {
        send({ ...base(), type: 'join_reject', to: req.from, reason: 'in_game' })
        return
      }
      opponent.value = { userId: req.from, name: req.name, role: 'guest' }
      status.value = 'connected'
      send({ ...base(), type: 'join_ack', to: req.from, name: options.name })
      return
    }
    if (event.type === 'join_ack') {
      const ack = event as JoinAckEvent
      if (options.role !== 'guest' || ack.to !== options.userId) return
      if (guestAckTimer) clearTimeout(guestAckTimer)
      opponent.value = { userId: ack.from, name: ack.name, role: 'host' }
      status.value = 'connected'
      return
    }
    if (event.type === 'join_reject') {
      const rej = event as JoinRejectEvent
      if (options.role !== 'guest' || rej.to !== options.userId) return
      if (guestAckTimer) clearTimeout(guestAckTimer)
      status.value = 'room_full'
      leave()
      return
    }

    // --- ゲームイベントは対戦相手からのもののみ上へ ---
    if (opponent.value && event.from === opponent.value.userId) {
      options.onEvent(event)
    }
  }

  function handlePresenceLeave(leftKeys: string[]) {
    if (opponent.value && leftKeys.includes(opponent.value.userId)) {
      opponent.value = null
      if (status.value === 'connected') {
        status.value = options.role === 'host' ? 'waiting' : 'connecting'
      }
      options.onPeerLeave()
    }
  }

  async function connect() {
    if (!supabase) {
      status.value = 'error'
      return
    }
    status.value = 'connecting'

    channel = supabase.channel(`room:${options.code}`, {
      config: {
        broadcast: { self: false },
        // enabled明示: リスナー登録によるpresence自動有効化は環境により効かないため必須
        presence: { key: options.userId, enabled: true },
      },
    })

    channel.on('broadcast', { event: 'game' }, ({ payload }) => handleEvent(payload))
    channel.on('presence', { event: 'leave' }, ({ key }) => handlePresenceLeave([key]))
    channel.on('presence', { event: 'sync' }, () => {
      if (options.role === 'host') {
        // ホスト重複検知(コード衝突)
        const otherHost = presenceMetas().find(
          (m) => m.role === 'host' && m.userId !== options.userId,
        )
        if (otherHost) {
          status.value = 'code_taken'
          leave()
        }
      } else {
        // ゲスト: presence同期でホストが見えたら入室希望(同期イベント駆動。
        // 一定時間経ってもホストが現れなければconnect側のタイマーでno_room)
        tryJoinRequest()
      }
    })

    channel.subscribe(async (state) => {
      if (state === 'SUBSCRIBED') {
        await channel?.track({
          userId: options.userId,
          name: options.name,
          role: options.role,
        } satisfies PresenceMeta)

        if (options.role === 'host') {
          if (status.value === 'connecting') status.value = 'waiting'
        } else {
          tryJoinRequest()
          // presence同期でホストが一度も見えないままなら部屋なし
          guestNoRoomTimer = setTimeout(() => {
            if (status.value === 'connecting' && !joinRequested) {
              status.value = 'no_room'
              leave()
            }
          }, 5000)
        }
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        status.value = 'error'
      }
    })
  }

  function leave() {
    if (guestAckTimer) clearTimeout(guestAckTimer)
    if (guestNoRoomTimer) clearTimeout(guestNoRoomTimer)
    if (channel) {
      supabase?.removeChannel(channel)
      channel = null
    }
  }

  onBeforeUnmount(leave)

  return { status, opponent, connect, send, leave }
}
