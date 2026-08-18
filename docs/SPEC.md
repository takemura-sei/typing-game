# タイピングバトル 仕様書

最終更新: 2026-08-19(コードベースから自動生成)

## 1. 概要

日本語ローマ字タイピングで対戦するオンライン対戦型タイピングゲーム。
2人1組でリアルタイム対戦し、正しいローマ字入力でお題を打ち切るたびに相手にダメージを与え、
相手のHPを先に0にした方が勝利する。オンライン対戦にはSupabaseアカウント(匿名認証)を要するが、
Supabase未設定でも「ソロ練習」のみはローカルで動作する。

- ソロ練習: サンドバッグ相手に一人で打鍵練習(オフライン可)
- オンライン対戦: 6桁のルームコードで2人1組の部屋を作り、リアルタイム対戦
- 戦績: 対戦結果の履歴と集計(勝率・最大コンボ等)を閲覧

## 2. 技術スタック

| レイヤ | 技術 |
|---|---|
| フレームワーク | Nuxt 4 (SPA, `ssr: false`) |
| UI | Vue 3 (`<script setup>`) + Tailwind CSS 4 |
| 状態管理 | Pinia (Options API形式で統一) |
| バックエンド | Supabase (Auth 匿名認証 / Postgres / Realtime Broadcast+Presence) |
| テスト | Vitest |
| Lint/型 | ESLint (`@nuxt/eslint`) / vue-tsc |

Supabase未設定(`.env`なし)の場合、`useSupabase()` は `null` を返し、アプリはオフラインモードで動作する
(ソロ練習のみ利用可、オンライン対戦・戦績はブロックされる)。

## 3. 画面構成 / ルーティング

| パス | 画面 | 概要 |
|---|---|---|
| `/` | トップ | ソロ練習・部屋作成・コード参加・戦績への導線。認証状態を表示 |
| `/solo` | ソロ練習 | サンドバッグ相手の一人打ち練習 |
| `/room/:code` | 対戦部屋 | ロビー→カウントダウン→対戦→リザルトを1画面内で状態遷移として表示 |
| `/stats` | 戦績 | 自分視点の対戦履歴一覧とサマリー |

`/room/:code` は `?host=1` クエリの有無で自分の役割(`host` / `guest`)を決める。
`host` は部屋作成者(`generateRoomCode()` で発行したコードで遷移)、`guest` はコード入力で参加した側。

## 4. 認証

- アプリ起動時(`app.vue`)に一度だけ `authStore.ensureSignedIn()` を呼ぶ。
- Supabase未設定なら `status: 'unconfigured'` にして即終了(ソロ練習のみ動作)。
- 設定済みなら匿名認証(`signInAnonymously`)。既存セッションがあれば再利用し、
  `profiles` 行を `upsert` で確保する(失敗しても致命傷にしない)。
- `AuthStatus`: `idle | signing_in | signed_in | unconfigured | error`

## 5. ソロ練習

`useSoloPractice()` が状態を一括管理(`/solo` 専用、対戦とは独立)。

- お題は `words` ストアからシャッフル取得し、順番に出題(1周したら再度シャッフルはせず巡回)。
- サンドバッグ(仮想の敵)に`INITIAL_HP`(250)を持たせ、通常攻撃と同じダメージ計算で削る。
  HPが0以下になったら撃破数 (`defeatedCount`) を+1し、HPを全回復して継続。
- 効果音代わりに、`screen_shake` エフェクトが発生した攻撃でページ全体を揺らす演出(0.3秒)。
- 計測指標:
  - **KPM**: `totalHits / 経過分数`(丸め)
  - **正確率**: `totalHits / (totalHits + totalMisses)` を%表示(小数点1桁)
  - 最大コンボ・ミス数・入力単語数
- お題ソースが `fallback`(DB未接続)の場合、画面下部に注記を表示。

## 6. オンライン対戦

### 6.1 部屋とロール

- ルームコードは6桁の数字(`000000`〜`999999`、先頭0許容)。
- `host`: `/` の「部屋を作る」でコードを発行し `/room/:code?host=1` に遷移。
- `guest`: `/` でコードを入力して `/room/:code` に遷移(`host`クエリなし)。
- 1部屋のRealtimeチャンネル名は `room:{code}`。Presence(在室検知)とBroadcast(イベント送受信)を併用。

### 6.2 入室シーケンス(`useBattleRoom`)

通信層はゲーム進行の判断をせず、チャンネル購読・Presence監視・入退室調停のみを担う。

1. 両者が `channel.track()` で自分の `{ userId, name, role }` をPresenceに登録。
2. ゲストはPresence同期(`sync`イベント)でホストの存在を検知したら `join_request` を1回だけ送信。
   - 4秒以内にホストからの応答(`join_ack`/`join_reject`)がなければ `no_room` 扱いで離脱。
   - Presence同期でホストが一度も現れなければ5秒で `no_room`。
3. ホストは `join_request` を受けると:
   - 既に別ゲストと接続済みなら `join_reject(reason: 'full')`
   - `canAcceptGuest()`(対戦中かどうか)が false なら `join_reject(reason: 'in_game')`
   - それ以外は相手を記録し `status: 'connected'` にして `join_ack` を返す(先着1名のみを直列に承認)
4. ホストのPresence重複(同じコードで別ホストが存在)を検知したら `code_taken` として離脱。

`RoomStatus`: `idle | connecting | waiting | connected | no_room | room_full | code_taken | error`

### 6.3 ロビー〜開始

- 双方が `RoomLobby` の「準備完了」を押すと `ready` イベント送信、`myReady`/`oppReady` が揃う。
- ホストのみが開始権限を持つ(`tryStart`)。両者readyになったら:
  - `matchUid`(UUID)と `startAt`(現在時刻 + 3500ms)を生成し `game_start` をブロードキャスト
  - 自分もカウントダウンへ移行。ゲストは受信した `game_start` で同じ `matchUid`/`startAt` を採用する。
  - 出題は共有の出題列ではなく、**各クライアントが自分のコンボ層(`comboToTier`)に応じて`words`ストアから独立に**選ぶ
    (`beginCountdown`/`onWordTyped` 内の `pickForTier`)。そのため両者に出るお題は基本的に一致しない。
- カウントダウン表示は `startAt` までの残り秒数(`CountdownOverlay`)。`startAt` に達したら `phase: 'playing'`。

### 6.4 対戦中のダメージ・同期

- `GamePhase`: `idle → lobby → countdown → playing → finished`
- 1単語を打ち切るたびに:
  1. 自分のコンボ・出題インデックス・入力数を進める
  2. `resolveAttack('normal', ...)` でダメージと演出エフェクトを算出
  3. 自分の `totalDealt`(累積与ダメージ)に加算
  4. 相手表示HPを**楽観的に**その場で減算(送信直後に届く自分のstate_syncで二重減算しないための措置)
  5. `attack` イベント(`seq`, `damage`, `totalDealt`, `combo`, `ts`)を送信
  6. `state_sync` を200msスロットルで送信(自分のHP等の権威情報)
- **HPの権威**: 自分のHPは自分が計算する。相手から届いた `attack`/`state_sync` の
  累積 `totalDealt` を `acceptTotalDealt()` で受理し、`INITIAL_HP - oppTotal` として自分のHPを再計算する。
  - 単調増加のみ受理(過去値以下は無視 = 重複・順序逆転を冪等に吸収)
  - 1回の受理での増分は `MAX_DELTA_PER_ATTACK`(60)でクランプ(異常値対策。完全な不正防止はスコープ外)
- 相手の表示HPは相手からの `state_sync` を正とする。

### 6.5 決着判定

- 自分のHPが0以下になったら `die()`:
  - `game_over(reason: 'hp_zero')` を送信
  - 500ms(`SIMUL_KO_WAIT_MS`)待って、その間に相手の死亡通知が届けば同時KO判定、
    届かなければ自分の敗北(`loss`)で確定。
- 相手の `game_over(hp_zero)` を先に受けた場合も同様に500ms待ち、
  その間に自分も死亡していなければ勝利(`win`)。
- **同時KO裁定**(`judgeSimultaneousKo`): 自分と相手の死亡時刻の差が300ms以内なら `draw`、
  それ以外は後に死んだ方(生存が長い方)が勝ち。
- 対戦中に相手がPresenceから離脱すると10秒(`FORFEIT_GRACE_SEC`)の復帰猶予に入り、
  その間に戻らなければ不戦勝(`win`, `reason: 'forfeit'`)。ロビー中の離脱は単に相手のreadyを解除するのみ。

### 6.6 リザルト・リマッチ

- 決着後、両者が `rematch` を送り合うと成立。ホスト側で `phase: 'lobby'` に戻し、
  両者を自動readyにして即座に次の対戦を開始する(ゲストはホストの `game_start` を待つのみ)。
- 相手が退室済み(Presence不在)の場合はリマッチボタンを無効化。
- 「退室する」でトップページへ戻る(`reset()` でバトルストアを全初期化)。

## 7. ダメージ計算

`utils/battle/damage.ts` に集約。攻撃は `kind` 付きで解決され、未知の `kind` はダメージ0
(将来の必殺技追加への前方互換)。

```
baseDamage = 6 + floor(お題の読み文字数 / 3)
comboMultiplier = 1 + min(コンボ数, 15) * 0.04   // 15コンボで上限1.6倍
damage = round(baseDamage * comboMultiplier)
screen_shake 演出 = コンボ数が10以上で付与
```

数値は `DAMAGE_CONFIG`([damage.ts](../app/utils/battle/damage.ts))に集約。`INITIAL_HP`(250、[types/game.ts](../app/types/game.ts))とあわせて、
1戦(オンライン対戦)がだいたい20〜30秒程度で決着するように調整してある。

- `AttackKind` は現状 `'normal'` のみ。将来 `special_*` を `attackResolvers` に1エントリ追加する形で拡張想定。
- `BattleEffect` は `screen_shake`(画面揺れ)と `cutin`(カットイン、未実装/型のみ定義済み)。

## 8. コンボ

- 1単語を正しく打ち切るたびに+1、ミス(誤入力)で0にリセット。
- `maxCombo` は試合/セッション内の最大値を保持(戦績にも保存)。

## 9. ローマ字入力エンジン

`utils/romaji/` 配下。かな読み文字列を「セグメント」単位に分割し、1キーずつ状態機械で判定する。

### 9.1 テーブル(`table.ts`)

- `KANA_TABLE`: 1文字かな→ローマ字候補配列(表示優先順、ヘボン式優先)。同一かな内で
  一方が他方の真の接頭辞になる組み合わせは禁止(誤って早期確定しないため)。唯一の例外が「ん」。
- `YOUON_TABLE`: 拗音(きゃ等)の直接打ち候補。分解打ち(しゃ = shi+xya 等)は
  `segmenter.ts` が `KANA_TABLE` から自動合成する。

### 9.2 セグメント分割(`segmenter.ts`)

- 2文字先読みで拗音を優先的にマッチさせる貪欲分割。
- 促音「っ」は直後のセグメントとマージして1セグメント化する:
  - 子音始まりの候補は先頭子音を重ねる(`ti → tti`)
  - 加えて `ltu`/`xtu` 等の単独綴り前置版も候補に加える
  - 語末の「っ」や「っん」は安全側として単独セグメント扱い
- 「ん」は独立セグメントとして扱い、単独 `n` で確定できるかは matcher が次セグメントを見て判定する。

### 9.3 マッチャー(`matcher.ts`)

- `processKey(state, key)` が1キー入力ごとに状態を破壊的に更新し、
  `hit | miss | segment_complete | word_complete | ignored` を返す。
- 「ん」の特殊処理: `n` 1打を保留(`pendingN`)し、
  - 次に `n` が来れば `nn` として確定
  - 母音/`y`/`n` 以外かつ次セグメントがそのキーで始まる候補を持つ場合は単独 `n` として確定し、
    そのキーは次セグメントの入力として再帰的に処理
  - それ以外はミス
- 表示用に `displayRomaji`(打った/残りのローマ字)と `displayKana`(確定済み/現在/残りのかな)を提供。
- キー入力は英小文字・数字・`-` の1文字のみ受理(IME変換中・修飾キー付きは無視)。

## 10. Realtime通信プロトコル

`types/events.ts` / `utils/battle/protocol.ts`。

- 全イベント共通: `v`(プロトコルバージョン, 現在1)、`from`(送信者userId)を持つ。
- 受信側は `parseGameEvent()` で `type` が既知集合に含まれるか等の最小限の形式検証を行い、
  不正/未知の形は握りつぶす(将来の拡張で新 `type` が来ても旧クライアントが落ちないための関門)。

| type | 方向 | 概要 |
|---|---|---|
| `join_request` | guest→host | 入室希望(`name`) |
| `join_ack` | host→guest | 入室承認(`to`, `name`) |
| `join_reject` | host→guest | 入室拒否(`to`, `reason: full \| in_game`) |
| `ready` | 双方向 | ロビーで準備完了 |
| `game_start` | host→guest | 対戦開始(`matchUid`, `startAt`)。出題は共有されず各自が独立に選ぶ(6.3参照) |
| `attack` | 双方向 | 攻撃(`seq`, `kind`, `damage`, `totalDealt`, `combo`, `ts`) |
| `state_sync` | 双方向 | 自分の状態(`hp`, `combo`, `wordIndex`, `totalDealt`, `ts`)を200msスロットルで送信 |
| `game_over` | 双方向 | 決着通知(`reason: hp_zero \| forfeit`, `ts`) |
| `rematch` | 双方向 | リマッチ希望 |

設計原則:
- 累積値(`totalDealt`)を都度載せることで、Broadcastのイベント欠落を次のイベントで自己修復する。
- `attack.seq` は送信者ごとの単調増加番号(重複/順序逆転の破棄用、現状は明示的な破棄処理は
  `totalDealt` の単調増加チェックに委ねている)。

## 11. データモデル(Supabase / Postgres)

`supabase/migrations/0001_init.sql`。RLS有効。

### `words`(お題)
| カラム | 型 | 備考 |
|---|---|---|
| id | bigint identity PK | |
| display | text | 表示文(例: 寿司) |
| reading | text | ひらがな読み(ローマ字エンジンの入力) |
| difficulty | smallint | 1=短い/2=中/3=長い |
| is_active | boolean | |

`anon`/`authenticated` 双方に `select` を許可(匿名認証完了前でも出題を取得できるように)。
insert/update/delete のポリシーなし(管理者/サービスロールのみ)。

### `profiles`(匿名ユーザーの表示名)
| カラム | 型 | 備考 |
|---|---|---|
| id | uuid PK | `auth.users.id` 参照 |
| display_name | text | デフォルト `'ゲスト'` |
| created_at | timestamptz | |

`select` は認証済み全員、`insert`/`update` は本人のみ。

### `match_results`(対戦結果。1試合につき各プレイヤーが自分視点の1行をinsert)
| カラム | 型 | 備考 |
|---|---|---|
| id | uuid PK | |
| match_uid | uuid | `game_start` で払い出される試合ID(両者共通) |
| player_id | uuid FK→profiles | |
| opponent_id | uuid FK→profiles, nullable | 相手が既に退室していてもnullで保存可 |
| room_code | text | |
| result | text | `win \| loss \| draw \| forfeit_win \| forfeit_loss` |
| hp_left | smallint | |
| damage_dealt | integer | |
| max_combo | integer | |
| words_typed | integer | |
| miss_count | integer | |
| duration_ms | integer | |
| created_at | timestamptz | |

`unique (match_uid, player_id)` で二重insert防止(アプリ側でも `savedMatchUids` Setで
同一セッション内の重複送信をガード)。`insert` は本人のみ、`select` は自分が当事者の行のみ。
update/deleteポリシーなし(戦績の改ざん不可)。

## 12. 戦績画面

- サマリー: 勝利数・敗北数・勝率(%)・最大コンボ(全履歴中の最大)。
  勝利数には `win`/`forfeit_win`、敗北数には `loss`/`forfeit_loss` を含み、`draw` は別集計。
- 履歴テーブル(最大50件、新しい順): 日時・結果・対戦相手名・与ダメージ・最大コンボ・ミス数・試合時間。
- Supabase未設定 or 未サインインの場合は「戦績はSupabase設定後に記録されます」と案内。

## 13. 状態管理(Pinia、Options API形式に統一)

| ストア | 責務 |
|---|---|
| `auth` | 匿名認証状態(`userId`, `displayName`, `status`) |
| `words` | お題の読み込み(DB優先、失敗時ローカルフォールバック `fallback-words.ts`)とシャッフル |
| `battle` | 対戦の状態遷移・勝敗判定・ダメージ計算適用の唯一の窓口。部屋入室時に `init()`、退室時に `reset()` を呼ぶ規約(ストアはページをまたいで生存するため) |
| `results` | 対戦結果の保存(`saveResult`)と履歴取得(`loadHistory`)、サマリー算出 |

各ストアには対応する `use-*.ts` composable(`useAuth`/`useWords`/`useBattle`/`useResults`)があり、
「ストアへの唯一の入口」として `storeToRefs` で分割代入前提のプレーンオブジェクトを返す規約になっている。

## 14. ディレクトリ構成

```
app/
  components/
    battle/   BattleField, HpBar, ComboMeter(Inline), CountdownOverlay, ResultModal
    room/     RoomLobby
    solo/     Board
    typing/   WordDisplay, RomajiDisplay
  composables/  use-auth, use-battle, use-battle-room, use-results,
                use-solo-practice, use-supabase, use-typing-engine, use-words
  pages/        index, solo, room/[code], stats
  plugins/      supabase.client.ts (Supabaseクライアント生成、.env未設定ならnullをprovide)
  services/     auth, results, words (Supabase呼び出しの実処理)
  stores/       auth, battle, results, words (Pinia Options API)
  types/        battle, events, game, results, room, words
  utils/
    battle/     damage.ts(ダメージ計算), protocol.ts(イベント検証・累積値受理・同時KO裁定)
    romaji/     matcher.ts, segmenter.ts, table.ts
    fallback-words.ts, format.ts, result-label.ts, room-code.ts
supabase/
  migrations/0001_init.sql
  seed/words.sql
tests/          gamemachine, protocol, results, romaji, services の各テスト(Vitest)
```

## 15. 未実装・将来拡張ポイント(コード上の布石)

- `BattleEffect` に `cutin`(必殺技カットイン)の型が定義済みだが未使用。
- `attackResolvers` は `normal` のみ登録。`kind` を増やすだけで必殺技を追加できる設計。
- プロトコルイベントの `type`/`kind` は未知値を無視する前方互換設計のため、
  新イベント種別・新攻撃種別を旧クライアントを壊さずに追加できる。
