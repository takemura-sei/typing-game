<script setup lang="ts">
import { isValidRoomCode } from '~/utils/room-code'
import { useAuth } from '~/composables/use-auth'
import { useWords } from '~/composables/use-words'
import { useBattle } from '~/composables/use-battle'

const route = useRoute()
const router = useRouter()

const code = String(route.params.code ?? '')
const role = route.query.host === '1' ? ('host' as const) : ('guest' as const)

const { userId: authUserId, displayName, status: authStatus, ensureSignedIn } = useAuth()
const { loadWords } = useWords()
const {
  phase,
  startAt,
  my,
  opp,
  myReady,
  oppReady,
  myRematch,
  oppRematch,
  result,
  graceRemaining,
  currentWord,
  attackFx,
  hitFx,
  init,
  reset,
  setReady,
  onWordTyped,
  onMiss,
  onRemoteEvent,
  onOpponentLeft,
  requestRematch,
  trackOpponent,
  autoSaveResult,
} = useBattle()

// お題と認証をsetupで確定させる(script setupのtop-level awaitはSuspenseで処理される)
await loadWords()
await ensureSignedIn()

const setupError = computed(() => {
  if (!isValidRoomCode(code)) return 'ルームコードが不正です(6桁の数字)'
  if (authStatus.value === 'unconfigured')
    return 'オンライン対戦にはSupabaseの設定(.env)が必要です'
  if (authStatus.value === 'error') return 'サインインに失敗しました。再読み込みしてください'
  return null
})

const userId = authUserId.value ?? 'unknown'
const myName = displayName.value || 'ゲスト'

const room = useBattleRoom({
  code,
  role,
  userId,
  name: myName,
  onEvent: onRemoteEvent,
  onPeerLeave: onOpponentLeft,
  canAcceptGuest: () => phase.value === 'lobby',
})

// ストアはページをまたいで生存するため、入室ごとに初期化し退室で確実にリセットする
init({ role, userId, send: room.send })
onBeforeUnmount(() => reset())

const engine = useTypingEngine({
  onMiss,
  onWordComplete: (wordResult) => onWordTyped(wordResult),
})

watch(currentWord, (word) => {
  if (word) engine.loadWord(word)
})

onMounted(() => {
  if (!setupError.value) room.connect()
})

const opponentName = computed(() => room.opponent.value?.name ?? '相手')
const opponentGone = computed(() => room.opponent.value === null)

watch(
  () => room.opponent.value,
  (opponent) => trackOpponent(opponent?.userId ?? null),
)

// 試合が確定したら自分視点の戦績を保存(match_uidでdedupeされるためリマッチごとに1行)
if (authUserId.value) {
  autoSaveResult(authUserId.value, code)
}

const fatalStatus = computed(() => {
  switch (room.status.value) {
    case 'no_room':
      return 'この部屋は存在しません(ホストが不在です)'
    case 'room_full':
      return 'この部屋は満室です'
    case 'code_taken':
      return 'このコードは既に使われています。部屋を作り直してください'
    case 'error':
      return '接続エラーが発生しました。再読み込みしてください'
    default:
      return null
  }
})

function leaveRoom() {
  router.push('/')
}
</script>

<template>
  <main class="min-h-screen flex flex-col items-center p-8 gap-6">
    <header class="w-full max-w-3xl flex items-center justify-between">
      <button class="text-slate-400 hover:text-slate-200 text-sm" @click="leaveRoom">
        ← 退室する
      </button>
      <p class="text-sm text-slate-500 font-mono">ROOM {{ code }}</p>
    </header>

    <!-- エラー系 -->
    <div v-if="setupError || fatalStatus" class="my-auto text-center">
      <p class="text-lg text-red-400 mb-6">{{ setupError ?? fatalStatus }}</p>
      <NuxtLink to="/" class="rounded-xl bg-slate-800 hover:bg-slate-700 px-6 py-3 font-bold">
        ホームに戻る
      </NuxtLink>
    </div>

    <!-- ロビー -->
    <div v-else-if="phase === 'lobby'" class="my-auto">
      <RoomLobby
        :code="code"
        :role="role"
        :status="room.status.value"
        :opponent-name="room.opponent.value?.name ?? null"
        :my-ready="myReady"
        :opp-ready="oppReady"
        @ready="setReady"
      />
    </div>

    <!-- 対戦(カウントダウン/プレイ中/リザルトはバトル画面に重ねる) -->
    <template v-else>
      <BattleField
        :my-name="`${myName}(あなた)`"
        :opp-name="opponentName"
        :my="my"
        :opp="opp"
        :current-word="currentWord"
        :kana="engine.kana.value"
        :romaji="engine.romaji.value"
        :attack-fx="attackFx"
        :hit-fx="hitFx"
        :grace-remaining="graceRemaining"
      />
      <p class="text-xs text-slate-600">IMEはOFF(半角英数)にしてください</p>

      <BattleCountdownOverlay v-if="phase === 'countdown'" :start-at="startAt" />
      <BattleResultModal
        v-if="phase === 'finished' && result"
        :result="result"
        :opponent-name="opponentName"
        :my-rematch="myRematch"
        :opp-rematch="oppRematch"
        :opponent-gone="opponentGone"
        @rematch="requestRematch"
        @leave="leaveRoom"
      />
    </template>
  </main>
</template>
