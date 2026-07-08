<script setup lang="ts">
const { auth } = useAuth()

const authLabel = computed(() => {
  switch (auth.value.status) {
    case 'signed_in':
      return `匿名ログイン中 (${auth.value.userId?.slice(0, 8)}…)`
    case 'unconfigured':
      return 'Supabase未設定(オフラインモード)'
    case 'signing_in':
      return 'サインイン中…'
    case 'error':
      return 'サインイン失敗'
    default:
      return ''
  }
})
</script>

<template>
  <main class="min-h-screen flex flex-col items-center justify-center gap-10 p-8">
    <div class="text-center">
      <h1 class="text-5xl font-black tracking-tight mb-3">
        タイピング<span class="text-amber-400">バトル</span>
      </h1>
      <p class="text-slate-400">日本語ローマ字タイピングで対戦するオンラインバトル</p>
    </div>

    <nav class="flex flex-col gap-4 w-64">
      <NuxtLink
        to="/solo"
        class="rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors px-6 py-4 text-center text-lg font-bold"
      >
        ソロ練習
      </NuxtLink>
      <button
        disabled
        class="rounded-xl bg-slate-800 text-slate-500 px-6 py-4 text-lg font-bold cursor-not-allowed"
      >
        オンライン対戦(準備中)
      </button>
    </nav>

    <p class="text-xs text-slate-500">{{ authLabel }}</p>
  </main>
</template>
