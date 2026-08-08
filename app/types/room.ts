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
