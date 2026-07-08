<script setup lang="ts">
import { INITIAL_HP } from '~/types/game'

const props = withDefaults(
  defineProps<{
    hp: number
    max?: number
    label?: string
  }>(),
  { max: INITIAL_HP, label: '' },
)

const ratio = computed(() => Math.max(0, Math.min(1, props.hp / props.max)))
const barColor = computed(() => {
  if (ratio.value > 0.5) return 'bg-emerald-500'
  if (ratio.value > 0.25) return 'bg-amber-400'
  return 'bg-red-500'
})
</script>

<template>
  <div class="w-full select-none">
    <div class="flex justify-between text-sm mb-1">
      <span class="font-semibold">{{ label }}</span>
      <span class="tabular-nums">{{ Math.max(0, hp) }} / {{ max }}</span>
    </div>
    <div class="h-4 rounded-full bg-slate-800 overflow-hidden">
      <div
        class="h-full rounded-full transition-all duration-300"
        :class="barColor"
        :style="{ width: `${ratio * 100}%` }"
      />
    </div>
  </div>
</template>
