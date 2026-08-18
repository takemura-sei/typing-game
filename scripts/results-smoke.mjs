// match_results のDB層検証: 匿名2ユーザーで同一試合の行をそれぞれinsertし、
// RLS(自分の行のみinsert/自分が関与した行のみselect)・一意制約・profiles埋め込みを確認する。
// 注意: テスト行はDBに残る(delete不可がRLS仕様のため)が、他ユーザーの戦績には表示されない。
import { createClient } from '@supabase/supabase-js'

const URL = 'https://cpfctxfaymcconsytnpr.supabase.co'
const KEY = 'sb_publishable_kkZf2m8pDjNoXQt3Ga3coQ_5HiqgXkj'

const results = []
const check = (name, ok, extra = '') => {
  results.push([name, ok])
  console.log(ok ? '  ✓' : '  ✗', name, extra)
}

async function makeUser(name) {
  const client = createClient(URL, KEY)
  const { data, error } = await client.auth.signInAnonymously()
  if (error) throw new Error(error.message)
  const id = data.user.id
  await client.from('profiles').upsert({ id, display_name: name }, { onConflict: 'id' })
  return { client, id }
}

const a = await makeUser('スモークA')
const b = await makeUser('スモークB')
const matchUid = crypto.randomUUID()

const row = (me, opp, result) => ({
  match_uid: matchUid,
  player_id: me,
  opponent_id: opp,
  room_code: '999999',
  result,
  hp_left: result === 'win' ? 34 : 0,
  damage_dealt: result === 'win' ? 100 : 66,
  max_combo: 7,
  words_typed: 11,
  miss_count: 3,
  duration_ms: 72000,
})

// 両者が自分視点の行をinsert
const { error: e1 } = await a.client.from('match_results').insert(row(a.id, b.id, 'win'))
check('Aの行insert', !e1, e1?.message ?? '')
const { error: e2 } = await b.client.from('match_results').insert(row(b.id, a.id, 'loss'))
check('Bの行insert', !e2, e2?.message ?? '')

// 二重insertは一意制約でブロック → upsert ignoreDuplicatesなら黙って無視
const { error: e3 } = await a.client
  .from('match_results')
  .upsert(row(a.id, b.id, 'win'), { onConflict: 'match_uid,player_id', ignoreDuplicates: true })
check('二重保存がupsertで無視される', !e3, e3?.message ?? '')

// 他人になりすましたinsertはRLSで拒否される
const { error: e4 } = await a.client.from('match_results').insert(row(b.id, a.id, 'win'))
check('なりすましinsertはRLSで拒否', !!e4)

// select: 自分の行 + profiles埋め込み
const { data: mine, error: e5 } = await a.client
  .from('match_results')
  .select('result, opponent:profiles!match_results_opponent_id_fkey(display_name)')
  .eq('player_id', a.id)
  .eq('match_uid', matchUid)
check('自分の行をselectできる', !e5 && mine?.length === 1 && mine[0].result === 'win')
check('相手の表示名が埋め込みで取れる', mine?.[0]?.opponent?.display_name === 'スモークB')

// 無関係ユーザーには見えない
const c = await makeUser('スモークC')
const { data: others } = await c.client
  .from('match_results')
  .select('id')
  .eq('match_uid', matchUid)
check('無関係ユーザーからは見えない(RLS)', (others ?? []).length === 0)

const failed = results.filter(([, ok]) => !ok)
console.log(failed.length === 0 ? '\nALL PASS' : `\n${failed.length} FAILED`)
process.exit(failed.length === 0 ? 0 : 1)
