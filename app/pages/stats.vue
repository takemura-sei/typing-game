<script setup lang="ts">
import { useAuth } from '~/composables/use-auth'
import { useResults } from '~/composables/use-results'
import { formatDate, formatDuration } from '~/utils/format'
import { RESULT_LABEL } from '~/utils/result-label'

const { userId, status, ensureSignedIn } = useAuth()
const { history, loading, loadError, summary, loadHistory } = useResults()

await ensureSignedIn()
if (userId.value) {
  await loadHistory(userId.value)
}
</script>

<template>
  <main class="min-h-screen flex flex-col items-center p-8 gap-8">
    <header class="w-full max-w-2xl flex items-center justify-between">
      <NuxtLink to="/" class="text-slate-400 hover:text-slate-200 text-sm">← ホーム</NuxtLink>
      <h1 class="text-xl font-bold">戦績</h1>
    </header>

    <p v-if="status !== 'signed_in'" class="my-auto text-slate-400">
      オンライン対戦の戦績はSupabase設定後に記録されます
    </p>
    <p v-else-if="loadError" class="my-auto text-red-400">
      {{ loadError }}
    </p>
    <p v-else-if="loading" class="my-auto text-slate-400 animate-pulse">読み込み中…</p>

    <template v-else>
      <!-- サマリー -->
      <section class="w-full max-w-2xl grid grid-cols-4 gap-3 text-center">
        <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p class="text-3xl font-black text-amber-300">{{ summary.wins }}</p>
          <p class="text-xs text-slate-400 mt-1">勝利</p>
        </div>
        <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p class="text-3xl font-black text-slate-300">{{ summary.losses }}</p>
          <p class="text-xs text-slate-400 mt-1">敗北</p>
        </div>
        <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p class="text-3xl font-black">{{ summary.winRate }}<span class="text-lg">%</span></p>
          <p class="text-xs text-slate-400 mt-1">勝率</p>
        </div>
        <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p class="text-3xl font-black text-emerald-400">{{ summary.bestCombo }}</p>
          <p class="text-xs text-slate-400 mt-1">最大コンボ</p>
        </div>
      </section>

      <!-- 履歴 -->
      <section class="w-full max-w-2xl">
        <p v-if="history.length === 0" class="text-center text-slate-500 py-10">
          まだ対戦記録がありません。部屋を作って対戦してみましょう!
        </p>
        <div v-else class="overflow-x-auto rounded-xl border border-slate-800">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-slate-900 text-slate-400 text-left">
                <th class="px-4 py-3 font-normal">日時</th>
                <th class="px-4 py-3 font-normal">結果</th>
                <th class="px-4 py-3 font-normal">対戦相手</th>
                <th class="px-4 py-3 font-normal text-right">与ダメ</th>
                <th class="px-4 py-3 font-normal text-right">最大コンボ</th>
                <th class="px-4 py-3 font-normal text-right">ミス</th>
                <th class="px-4 py-3 font-normal text-right">時間</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="record in history"
                :key="record.id"
                class="border-t border-slate-800 tabular-nums"
              >
                <td class="px-4 py-3 text-slate-400">{{ formatDate(record.created_at) }}</td>
                <td class="px-4 py-3 font-bold" :class="RESULT_LABEL[record.result].class">
                  {{ RESULT_LABEL[record.result].text }}
                </td>
                <td class="px-4 py-3">{{ record.opponent?.display_name ?? '不明' }}</td>
                <td class="px-4 py-3 text-right">{{ record.damage_dealt }}</td>
                <td class="px-4 py-3 text-right">{{ record.max_combo }}</td>
                <td class="px-4 py-3 text-right">{{ record.miss_count }}</td>
                <td class="px-4 py-3 text-right">{{ formatDuration(record.duration_ms) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </main>
</template>
