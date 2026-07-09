<script setup lang="ts">
import { generateRoomCode, isValidRoomCode } from '~/utils/roomCode'

const router = useRouter()
const authStore = useAuthStore()

const joinCode = ref('')
const joinError = ref('')

const onlineAvailable = computed(() => authStore.status === 'signed_in')

const authLabel = computed(() => {
  switch (authStore.status) {
    case 'signed_in':
      return `匿名ログイン中 (${authStore.userId?.slice(0, 8)}…)`
    case 'unconfigured':
      return 'Supabase未設定(オフラインモード: ソロ練習のみ)'
    case 'signing_in':
      return 'サインイン中…'
    case 'error':
      return 'サインイン失敗(オンライン対戦は利用できません)'
    default:
      return ''
  }
})

function createRoom() {
  router.push(`/room/${generateRoomCode()}?host=1`)
}

function joinRoom() {
  const code = joinCode.value.trim()
  if (!isValidRoomCode(code)) {
    joinError.value = '6桁の数字を入力してください'
    return
  }
  joinError.value = ''
  router.push(`/room/${code}`)
}
</script>

<template>
  <main class="min-h-screen flex flex-col items-center justify-center gap-10 p-8">
    <div class="text-center">
      <h1 class="text-5xl font-black tracking-tight mb-3">
        タイピング<span class="text-amber-400">バトル</span>
      </h1>
      <p class="text-slate-400">日本語ローマ字タイピングで対戦するオンラインバトル</p>
    </div>

    <nav class="flex flex-col gap-4 w-72">
      <NuxtLink
        to="/solo"
        class="rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors px-6 py-4 text-center text-lg font-bold"
      >
        ソロ練習
      </NuxtLink>

      <button
        class="rounded-xl px-6 py-4 text-lg font-bold transition-colors"
        :class="
          onlineAvailable
            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
        "
        :disabled="!onlineAvailable"
        @click="createRoom"
      >
        部屋を作る
      </button>

      <div class="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <p class="text-sm text-slate-400 mb-2">コードで参加</p>
        <div class="flex gap-2">
          <input
            v-model="joinCode"
            type="text"
            inputmode="numeric"
            maxlength="6"
            placeholder="123456"
            class="flex-1 min-w-0 rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 font-mono text-lg tracking-widest text-center focus:outline-none focus:border-amber-400"
            :disabled="!onlineAvailable"
            @keydown.enter="joinRoom"
          />
          <button
            class="rounded-lg px-4 py-2 font-bold transition-colors"
            :class="
              onlineAvailable
                ? 'bg-slate-700 hover:bg-slate-600'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            "
            :disabled="!onlineAvailable"
            @click="joinRoom"
          >
            参加
          </button>
        </div>
        <p v-if="joinError" class="text-xs text-red-400 mt-2">{{ joinError }}</p>
      </div>

      <NuxtLink
        to="/stats"
        class="rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors px-6 py-3 text-center font-bold text-slate-300"
      >
        戦績
      </NuxtLink>
    </nav>

    <p class="text-xs text-slate-500">{{ authLabel }}</p>
  </main>
</template>
