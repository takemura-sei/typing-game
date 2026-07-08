-- タイピングバトルゲーム 初期スキーマ
-- 対象: Supabaseプロジェクト「TS-database」
-- 実行方法: Supabase MCP経由 または ダッシュボードのSQL Editorに貼り付け

-- ========================================
-- words: タイピングお題
-- ========================================
create table if not exists public.words (
  id         bigint generated always as identity primary key,
  display    text not null,                  -- 表示文 例: '寿司'
  reading    text not null,                  -- かな読み 例: 'すし' (ひらがなのみ)
  difficulty smallint not null default 1,    -- 1=短い 2=中 3=長い
  is_active  boolean not null default true
);

alter table public.words enable row level security;

create policy "words_select_authenticated"
  on public.words for select
  to authenticated
  using (true);

-- wordsは公開データ: 匿名認証完了前でもお題を取得できるようanonにも読み取りを許可
create policy "words_select_anon"
  on public.words for select
  to anon
  using (true);
-- insert/update/deleteポリシーなし = 管理はダッシュボード/サービスロールのみ

-- ========================================
-- profiles: 匿名ユーザーの表示名
-- ========================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'ゲスト',
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ========================================
-- match_results: 対戦結果(1試合につき各プレイヤーが自分視点の1行をinsert)
-- ========================================
create table if not exists public.match_results (
  id           uuid primary key default gen_random_uuid(),
  match_uid    uuid not null,                -- game_startイベントで両者に共有される試合ID
  player_id    uuid not null references public.profiles (id),
  opponent_id  uuid references public.profiles (id),
  room_code    text not null,
  result       text not null check (result in ('win', 'loss', 'draw', 'forfeit_win', 'forfeit_loss')),
  hp_left      smallint not null,
  damage_dealt integer not null,
  max_combo    integer not null,
  words_typed  integer not null,
  miss_count   integer not null,
  duration_ms  integer not null,
  created_at   timestamptz not null default now(),
  unique (match_uid, player_id)              -- 二重insert防止
);

alter table public.match_results enable row level security;

create policy "match_results_insert_own"
  on public.match_results for insert
  to authenticated
  with check (player_id = (select auth.uid()));

create policy "match_results_select_involved"
  on public.match_results for select
  to authenticated
  using (player_id = (select auth.uid()) or opponent_id = (select auth.uid()));
-- update/deleteポリシーなし = 戦績の改ざん不可

create index if not exists match_results_player_created_idx
  on public.match_results (player_id, created_at desc);
