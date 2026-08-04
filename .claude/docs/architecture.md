# typing-game アーキテクチャ

Nuxt 4 SPA(`ssr: false`)+ Pinia + Supabase(Realtime/Auth/Postgres)によるローマ字タイピング対戦ゲーム。

姉妹プロジェクト `pokemon_apply_v2` の `.claude/docs/architecture.md` にあるレイヤー分離の考え方(pages薄く・composableが唯一の入口・stateは適切な層に置く)を踏襲しているが、**server/api(Nitro)は導入していない**。理由と差分は末尾の「pokemon_apply_v2との差分メモ」を参照。

## 1. ディレクトリ構造

```
app/
├── app.vue
├── assets/css/main.css
├── components/
│   ├── battle/      # 対戦画面のプレゼンテーショナル部品(BattleHpBar, BattleComboMeter, ...)
│   ├── room/        # ロビー画面(RoomLobby)
│   ├── solo/         # ソロ練習画面(SoloBoard)
│   └── typing/       # かな/ローマ字表示(TypingWordDisplay, TypingRomajiDisplay)
├── composables/       # 唯一の入口。use-<feature>.ts
├── stores/            # Pinia。共有・キャッシュ状態のみ
├── services/          # Supabase直叩きの集約(★ server/api は無し)
├── pages/             # 薄い。ルーティング+propsの受け渡しのみ
├── plugins/           # supabase.client.ts が $supabase を提供
├── types/             # クライアント専用の型(★ shared/ は無し)
└── utils/             # 純粋関数
tests/                  # フラット構成、*.test.ts(★ src/ミラーリングではない)
supabase/
├── migrations/         # typing-game自身のテーブル(words, profiles, match_results)のDDL
└── seed/
```

**server/api は無い**(SPA、`ssr: false` のまま)。**shared/ は無い**(server/apiが無いため、型を両側で共有する必要が無い)。

## 2. レイヤーと責務(データが流れる順)

```
Supabase
  ↑
services/*.ts            (Supabase直叩き。HTTPを介さない)
  ↑
stores/*.ts               (Pinia。共有・キャッシュ状態のみ)
  ↑
composables/use-<feature>.ts  (唯一の入口。store+serviceをラップ)
  ↑
components/<feature>/*.vue    (実際の表示/ロジックはここ)
  ↑ props
pages/*.vue                (薄い。ルーティング+propsの受け渡しのみ)
```

**例外: `use-battle-room.ts`(Supabase Realtime)は services を経由せずcomposableのまま。**
理由: fetch型のCRUD(1回リクエスト→1回レスポンス)ではなく、presence/broadcastを持つ状態的なwebsocketチャンネルのライフサイクル管理(接続・入室調停・イベント購読・切断)そのものが実装の本体であり、servicesレイヤーが前提とする「呼べば結果が返る」形に馴染まないため。ゲーム進行の判定(勝敗・HP計算)は行わず、通信層に徹している点は変わらない。

## 3. 各層の設計方針

### services/
Supabaseへの実際の呼び出しをここに集約する。HTTPは介さず、Supabase JS SDKを直接呼ぶ。
- `services/words.ts` — `loadWords()`: wordsテーブル取得、失敗時はローカルフォールバック
- `services/results.ts` — `saveResult()`/`loadHistory()`、および`ResultCode`/`MatchRecord`/`SaveResultInput`の型とマッパー`toResultCode()`
- `services/auth.ts` — `signInAnonymously()`: 匿名サインイン+profiles upsert

### stores/
Pinia。**ページをまたいで共有・キャッシュされるべき状態のみ**を持つ。I/Oの実処理はservicesに委譲する。
- `stores/battle.ts` — 対戦の状態遷移・勝敗判定の唯一の窓口(I/Oなし、通信はcomposable経由で注入されたsend関数を呼ぶのみ)。ページをまたいで対戦状態を保持する必要があるため、そのままPiniaストアとして最も複雑なロジックを持つ
- `stores/{words,results,auth}.ts` — 対応するserviceを呼び、結果をrefに反映するだけの薄い層

### composables/
**コンポーネント/ページがstoreに触れる唯一の入口。** 戻り値はプレーンオブジェクトなので、呼び出し側は分割代入して使うこと(テンプレートでのref自動アンラップを効かせるため。保持したオブジェクト経由の`obj.foo`アクセスは自動アンラップが効かない)。
- `use-{auth,words,results,battle}.ts` — 対応するstoreの`storeToRefs`ラッパー。`use-battle.ts`は加えて「対戦相手の記憶」「終局時の戦績保存」のオーケストレーションも引き取る
- `use-battle-room.ts` — Realtime通信層(上記の例外)
- `use-typing-engine.ts` — ローマ字matcherのreactiveラッパー+キーボード捕捉
- `use-solo-practice.ts` — ソロ練習(サンドバッグ相手の一人打ち)の状態管理。`use-words`と`use-typing-engine`を組み合わせる
- `use-supabase.ts` — Supabaseクライアント取得(.env未設定/Nuxt外では`null`)

### components/
実際の表示・ローカルなUI状態(アニメーションのタイマー等)はここに置く。ディレクトリ名がコンポーネント名のプレフィックスになる(`components/battle/HpBar.vue` → `<BattleHpBar>`)。

### pages/
薄く保つ。composableを呼び、propsとして下に渡すだけ。ウォッチャーの中身やSupabase呼び出しの組み立てなど「業務ロジック」はcomposableに置く。

### utils/
純粋関数のみ(引数→戻り値が決まり、副作用が無いもの)。`utils/battle/damage.ts`(ダメージ計算)、`utils/romaji/*`(ローマ字変換)、`utils/format.ts`、`utils/result-label.ts`、`utils/room-code.ts`、`utils/fallback-words.ts`。

### types/
クライアント専用の型。`shared/`が無いため、server側と共有する必要はない。

## 4. 命名規則

| 対象 | 規則 | 例 |
|---|---|---|
| コンポーネント(.vue) | PascalCase | `HpBar.vue`, `RoomLobby.vue` |
| composables/services/stores/utils(.ts) | kebab-case(複合語のみ) | `use-battle-room.ts`, `room-code.ts` |
| 関数/変数 | camelCase | `loadWords()` |
| エクスポートする関数名(composable) | camelCase、ファイル名と対応 | `use-battle.ts` → `useBattle()` |
| 定数 | SCREAMING_SNAKE_CASE | `MAX_DELTA_PER_ATTACK` |
| ページ(.vue) | Nuxtのルーティング規約に従う | `[code].vue` |

## 5. 新機能を追加する手順

1. 型を `types/` に追加(必要なら)
2. 純粋関数が要るなら `utils/` に追加
3. Supabase呼び出しが要るなら `services/<feature>.ts` に追加
4. ページをまたぐ共有状態が要るときだけ `stores/<feature>.ts` に追加(不要ならcomposable内の`ref`で十分)
5. `composables/use-<feature>.ts` を作り、components/pagesからの唯一の入口にする
6. `components/<feature>/*.vue` に表示・ローカルロジックを実装
7. `pages/*.vue` から呼び出す(薄く保つ)

## 6. テスト方針

`tests/` は既存通り**フラット構成・`*.test.ts`のまま**維持する。pokemon_apply_v2の`*.spec.ts`+`src/`ミラーリング構成とは意図的に異なる(typing-gameは元々この構成でテストが書かれており、変更するメリットがコストに見合わないため)。新しいservices/composablesに対するテストも、`tests/gamemachine.test.ts`や`tests/services.test.ts`のように機能単位でフラットに追加する。

`@nuxt/test-utils`は導入していない(コンポーネントのマウントテストは対象外。UIの動作確認は`npm run dev`での手動/スクリプト経由のスモークテストで行う)。

## 7. lint/型チェック

- `npm run lint` / `npm run lint:fix` — `@nuxt/eslint`(`eslint.config.mjs`)
- `npm run typecheck` — `vue-tsc`(`nuxi typecheck`)。`nuxt.config.ts`の`typescript.tsConfig.include`で`tests/`も対象に含めている(Nuxtが生成する`tsconfig.app.json`のデフォルトには含まれないため)
- 対象は `app/` と `tests/`

## 8. pokemon_apply_v2との差分メモ

- **server/api(Nitro)を導入していない**: typing-gameは`ssr: false`のSPAで、対戦のRealtime通信(Supabase presence/broadcast)がそもそもブラウザから直接Supabaseに繋ぐ必要がある。CRUD部分だけをserver/api経由にすると「Realtimeは直接・CRUDだけ間接」という一貫性のない構成になるため、今回はservicesレイヤーでSupabase直叩きを集約するに留めた
- **shared/ を導入していない**: server側コードが無いため、型を両側で共有する必要がない
- **Realtimeはservicesレイヤーの例外としてcomposableのまま**: 上記「2. レイヤーと責務」参照
- 将来、オンライン対戦のチート対策や集計処理でサーバー側の検証が本格的に必要になった場合は、Nitro導入(server/api層の新設)を別途検討する
