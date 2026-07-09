<script setup lang="ts">
import { isValidRoomCode } from '~/utils/roomCode'

const route = useRoute()
const router = useRouter()

const code = String(route.params.code ?? '')
const role = route.query.host === '1' ? ('host' as const) : ('guest' as const)

const authStore = useAuthStore()
const wordsStore = useWordsStore()
const battle = useBattleStore()
const resultsStore = useResultsStore()

// お題と認証をsetupで確定させる(script setupのtop-level awaitはSuspenseで処理される)
await wordsStore.loadWords()
await authStore.ensureSignedIn()

const setupError = computed(() => {
  if (!isValidRoomCode(code)) return 'ルームコードが不正です(6桁の数字)'
  if (authStore.status === 'unconfigured')
    return 'オンライン対戦にはSupabaseの設定(.env)が必要です'
  if (authStore.status === 'error') return 'サインインに失敗しました。再読み込みしてください'
  return null
})

const userId = authStore.userId ?? 'unknown'
const myName = authStore.displayName || 'ゲスト'

const room = useBattleRoom({
  code,
  role,
  userId,
  name: myName,
  onEvent: battle.onRemoteEvent,
  onPeerLeave: battle.onOpponentLeft,
  canAcceptGuest: () => battle.phase === 'lobby',
})

// ストアはページをまたいで生存するため、入室ごとに初期化し退室で確実にリセットする
battle.init({ role, userId, send: room.send })
onBeforeUnmount(() => battle.reset())

const engine = useTypingEngine({
  onMiss: battle.onMiss,
  onWordComplete: (result) => battle.onWordTyped(result),
})

watch(
  () => battle.currentWord,
  (word) => {
    if (word) engine.loadWord(word)
  },
)

onMounted(() => {
  if (!setupError.value) room.connect()
})

const opponentName = computed(() => room.opponent.value?.name ?? '相手')
const opponentGone = computed(() => room.opponent.value === null)

// 相手が切断してもopponent_idを保存できるよう最後の相手を覚えておく
const lastOpponentId = ref<string | null>(null)
watch(
  () => room.opponent.value,
  (opponent) => {
    if (opponent) lastOpponentId.value = opponent.userId
  },
)

// 試合が確定したら自分視点の戦績を保存(match_uidでdedupeされるためリマッチごとに1行)
watch(
  () => battle.phase,
  (phase) => {
    if (phase !== 'finished' || !battle.result || !battle.matchUid || !authStore.userId) return
    resultsStore.saveResult({
      matchUid: battle.matchUid,
      playerId: authStore.userId,
      opponentId: lastOpponentId.value,
      roomCode: code,
      result: battle.result,
      hpLeft: battle.my.hp,
      damageDealt: battle.my.totalDealt,
      maxCombo: battle.my.maxCombo,
      wordsTyped: battle.my.wordsTyped,
      missCount: battle.my.missCount,
      durationMs: battle.durationMs,
    })
  },
)

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
    <div v-else-if="battle.phase === 'lobby'" class="my-auto">
      <RoomLobby
        :code="code"
        :role="role"
        :status="room.status.value"
        :opponent-name="room.opponent.value?.name ?? null"
        :my-ready="battle.myReady"
        :opp-ready="battle.oppReady"
        @ready="battle.setReady"
      />
    </div>

    <!-- 対戦(カウントダウン/プレイ中/リザルトはバトル画面に重ねる) -->
    <template v-else>
      <BattleField
        :my-name="`${myName}(あなた)`"
        :opp-name="opponentName"
        :my="battle.my"
        :opp="battle.opp"
        :current-word="battle.currentWord"
        :kana="engine.kana.value"
        :romaji="engine.romaji.value"
        :attack-fx="battle.attackFx"
        :hit-fx="battle.hitFx"
        :grace-remaining="battle.graceRemaining"
      />
      <p class="text-xs text-slate-600">IMEはOFF(半角英数)にしてください</p>

      <BattleCountdownOverlay v-if="battle.phase === 'countdown'" :start-at="battle.startAt" />
      <BattleResultModal
        v-if="battle.phase === 'finished' && battle.result"
        :result="battle.result"
        :opponent-name="opponentName"
        :my-rematch="battle.myRematch"
        :opp-rematch="battle.oppRematch"
        :opponent-gone="opponentGone"
        @rematch="battle.requestRematch"
        @leave="leaveRoom"
      />
    </template>
  </main>
</template>
