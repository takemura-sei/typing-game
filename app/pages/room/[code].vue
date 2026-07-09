<script setup lang="ts">
import { isValidRoomCode } from '~/utils/roomCode'

const route = useRoute()
const router = useRouter()

const code = String(route.params.code ?? '')
const role = route.query.host === '1' ? ('host' as const) : ('guest' as const)

const { auth, ensureSignedIn } = useAuth()
const { loadWords, shuffled } = useWords()

// お題と認証をsetupで確定させる(script setupのtop-level awaitはSuspenseで処理される)
await loadWords()
await ensureSignedIn()

const setupError = computed(() => {
  if (!isValidRoomCode(code)) return 'ルームコードが不正です(6桁の数字)'
  if (auth.value.status === 'unconfigured')
    return 'オンライン対戦にはSupabaseの設定(.env)が必要です'
  if (auth.value.status === 'error') return 'サインインに失敗しました。再読み込みしてください'
  return null
})

const userId = auth.value.userId ?? 'unknown'
const myName = auth.value.displayName || 'ゲスト'

const machine = useGameMachine({
  role,
  userId,
  send: (event) => room.send(event),
  getWordPool: () => shuffled(),
})

const room = useBattleRoom({
  code,
  role,
  userId,
  name: myName,
  onEvent: machine.onRemoteEvent,
  onPeerLeave: machine.onOpponentLeft,
  canAcceptGuest: () => machine.phase.value === 'lobby',
})

const engine = useTypingEngine({
  onMiss: machine.onMiss,
  onWordComplete: (result) => machine.onWordTyped(result),
})

watch(machine.currentWord, (word) => {
  if (word) engine.loadWord(word)
})

onMounted(() => {
  if (!setupError.value) room.connect()
})

const opponentName = computed(() => room.opponent.value?.name ?? '相手')
const opponentGone = computed(() => room.opponent.value === null)

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
    <div v-else-if="machine.phase.value === 'lobby'" class="my-auto">
      <RoomLobby
        :code="code"
        :role="role"
        :status="room.status.value"
        :opponent-name="room.opponent.value?.name ?? null"
        :my-ready="machine.myReady.value"
        :opp-ready="machine.oppReady.value"
        @ready="machine.setReady"
      />
    </div>

    <!-- 対戦(カウントダウン/プレイ中/リザルトはバトル画面に重ねる) -->
    <template v-else>
      <BattleField
        :my-name="`${myName}(あなた)`"
        :opp-name="opponentName"
        :my="machine.my"
        :opp="machine.opp"
        :current-word="machine.currentWord.value"
        :kana="engine.kana.value"
        :romaji="engine.romaji.value"
        :attack-fx="machine.attackFx.value"
        :hit-fx="machine.hitFx.value"
        :grace-remaining="machine.graceRemaining.value"
      />
      <p class="text-xs text-slate-600">IMEはOFF(半角英数)にしてください</p>

      <BattleCountdownOverlay
        v-if="machine.phase.value === 'countdown'"
        :start-at="machine.startAt.value"
      />
      <BattleResultModal
        v-if="machine.phase.value === 'finished' && machine.result.value"
        :result="machine.result.value"
        :opponent-name="opponentName"
        :my-rematch="machine.myRematch.value"
        :opp-rematch="machine.oppRematch.value"
        :opponent-gone="opponentGone"
        @rematch="machine.requestRematch"
        @leave="leaveRoom"
      />
    </template>
  </main>
</template>
