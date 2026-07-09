// Realtime結合テスト: 2クライアントで入室調停→ready→game_start→attack→game_overを模擬
import { createClient } from '@supabase/supabase-js'

const URL = 'https://cpfctxfaymcconsytnpr.supabase.co'
const KEY = 'sb_publishable_kkZf2m8pDjNoXQt3Ga3coQ_5HiqgXkj'
const CODE = String(Math.floor(Math.random() * 1e6)).padStart(6, '0')

const log = (who, ...a) => console.log(`[${who}]`, ...a)
const results = []
const check = (name, ok) => {
  results.push([name, ok])
  console.log(ok ? '  ✓' : '  ✗', name)
}

function makePeer(who, role) {
  const client = createClient(URL, KEY)
  return { who, role, client, userId: null, channel: null, received: [] }
}

async function connect(peer, handlers) {
  const { data, error } = await peer.client.auth.signInAnonymously()
  if (error) throw new Error(`${peer.who} sign-in failed: ${error.message}`)
  peer.userId = data.user.id
  peer.channel = peer.client.channel(`room:${CODE}`, {
    config: { broadcast: { self: false }, presence: { key: peer.userId, enabled: true } },
  })
  peer.channel.on('broadcast', { event: 'game' }, ({ payload }) => {
    peer.received.push(payload)
    handlers?.(payload)
  })
  // 注意: presenceリスナーはsubscribe前に登録しないとpresence自体が無効になる
  peer.leftKeys = []
  peer.channel.on('presence', { event: 'leave' }, ({ key }) => peer.leftKeys.push(key))
  peer.channel.on('presence', { event: 'sync' }, () =>
    log(peer.who, 'presence sync:', JSON.stringify(peer.channel.presenceState())),
  )
  peer.channel.on('presence', { event: 'join' }, ({ key }) => log(peer.who, 'presence join:', key?.slice(0, 8)))
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${peer.who} subscribe timeout`)), 8000)
    peer.channel.subscribe(async (state) => {
      if (state === 'SUBSCRIBED') {
        await peer.channel.track({ userId: peer.userId, name: peer.who, role: peer.role })
        clearTimeout(t)
        resolve()
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        clearTimeout(t)
        reject(new Error(`${peer.who} channel state: ${state}`))
      }
    })
  })
  log(peer.who, 'subscribed as', peer.role, peer.userId.slice(0, 8))
}

const send = (peer, ev) =>
  peer.channel.send({ type: 'broadcast', event: 'game', payload: { v: 1, from: peer.userId, ...ev } })

const waitFor = (peer, type, timeout = 5000) =>
  new Promise((resolve, reject) => {
    const found = peer.received.find((e) => e.type === type)
    if (found) return resolve(found)
    const started = Date.now()
    const iv = setInterval(() => {
      const f = peer.received.find((e) => e.type === type)
      if (f) { clearInterval(iv); resolve(f) }
      else if (Date.now() - started > timeout) { clearInterval(iv); reject(new Error(`${peer.who}: ${type} timeout`)) }
    }, 50)
  })

const host = makePeer('host', 'host')
const guest = makePeer('guest', 'guest')

console.log('room code:', CODE)
await connect(host, (e) => {
  // ホスト調停: join_requestにjoin_ackを返す
  if (e.type === 'join_request') {
    send(host, { type: 'join_ack', to: e.from, name: 'host' })
  }
})
await connect(guest)

// presence確認(ゲストからホストが見えるか)
await new Promise((r) => setTimeout(r, 1200))
const metas = Object.values(guest.channel.presenceState()).flat()
check('presence: ゲストからホストが見える', metas.some((m) => m.role === 'host'))

// 入室フロー
await send(guest, { type: 'join_request', name: 'guest' })
const ack = await waitFor(guest, 'join_ack')
check('join_request → join_ack 受信', ack.to === guest.userId)

// ready → game_start
await send(guest, { type: 'ready' })
await waitFor(host, 'ready')
check('ready がホストに届く', true)

const words = [{ id: 1, display: '寿司', reading: 'すし', difficulty: 1 }]
await send(host, { type: 'game_start', matchUid: 'test-uid', words, startAt: Date.now() + 3500 })
const gs = await waitFor(guest, 'game_start')
check('game_start がゲストに届く(お題同梱)', gs.words?.[0]?.reading === 'すし')

// attack(累積値) → 相手側で受信
await send(guest, { type: 'attack', seq: 1, kind: 'normal', damage: 10, totalDealt: 10, combo: 1, ts: Date.now() })
await send(guest, { type: 'attack', seq: 2, kind: 'normal', damage: 12, totalDealt: 22, combo: 2, ts: Date.now() })
await new Promise((r) => setTimeout(r, 1000))
const attacks = host.received.filter((e) => e.type === 'attack')
check('attack がホストに届く(2発)', attacks.length === 2 && attacks[1].totalDealt === 22)

// game_over
await send(host, { type: 'game_over', reason: 'hp_zero', ts: Date.now() })
await waitFor(guest, 'game_over')
check('game_over がゲストに届く', true)

// presence leave 検知
await guest.client.removeChannel(guest.channel)
await new Promise((r) => setTimeout(r, 2500))
check('presence leave をホストが検知', host.leftKeys.includes(guest.userId))

await host.client.removeChannel(host.channel)
const failed = results.filter(([, ok]) => !ok)
console.log(failed.length === 0 ? '\nALL PASS' : `\n${failed.length} FAILED`)
process.exit(failed.length === 0 ? 0 : 1)
