<script setup lang="ts">
import type { PlayerState, Word } from '~/types/game'
import type { BattleEffect } from '~/utils/battle/damage'

const props = defineProps<{
  myName: string
  oppName: string
  my: PlayerState
  opp: PlayerState
  currentWord: Word | null
  kana: { done: string; current: string; rest: string }
  romaji: { typed: string; rest: string }
  attackFx: { damage: number; effects: BattleEffect[]; key: number } | null
  hitFx: { damage: number; key: number } | null
  graceRemaining: number | null
}>()

const shaking = ref(false)
watch(
  () => props.hitFx?.key,
  () => {
    if (!props.hitFx) return
    shaking.value = true
    setTimeout(() => (shaking.value = false), 300)
  },
)
</script>

<template>
  <div class="w-full max-w-3xl flex flex-col gap-6" :class="{ 'animate-[shake_0.3s]': shaking }">
    <!-- 相手 -->
    <section class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <BattleHpBar :hp="opp.hp" :label="oppName" />
      <div class="flex justify-between items-center mt-1 text-xs text-slate-400 h-5">
        <span v-if="opp.combo >= 2" class="text-amber-300 font-bold">{{ opp.combo }} COMBO</span>
        <span v-else />
        <span v-if="attackFx" :key="attackFx.key" class="text-red-400 font-bold animate-pulse">
          -{{ attackFx.damage }}
        </span>
      </div>
    </section>

    <!-- お題 -->
    <section class="flex flex-col gap-5 py-6 min-h-48 justify-center">
      <template v-if="currentWord">
        <TypingWordDisplay :display="currentWord.display" :kana="kana" />
        <TypingRomajiDisplay :typed="romaji.typed" :rest="romaji.rest" :miss-count="my.missCount" />
      </template>
    </section>

    <!-- 自分 -->
    <section class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <BattleHpBar :hp="my.hp" :label="myName" />
      <div class="flex justify-between items-center mt-1 text-xs text-slate-400 h-5">
        <BattleComboMeterInline :combo="my.combo" />
        <span v-if="hitFx" :key="hitFx.key" class="text-red-400 font-bold animate-pulse">
          -{{ hitFx.damage }} 被弾!
        </span>
      </div>
    </section>

    <!-- 切断猶予 -->
    <p v-if="graceRemaining !== null" class="text-center text-amber-300 animate-pulse">
      相手の接続が切れました… 復帰を待っています({{ graceRemaining }}秒)
    </p>
  </div>
</template>

<style>
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  50% { transform: translateX(6px); }
  75% { transform: translateX(-3px); }
}
</style>
