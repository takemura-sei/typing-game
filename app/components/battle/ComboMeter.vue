<script setup lang="ts">
import { comboMultiplier } from '~/utils/battle/damage'

const props = defineProps<{ combo: number }>()

const multiplier = computed(() => comboMultiplier(props.combo).toFixed(2))
const scale = computed(() => 1 + Math.min(props.combo, 20) * 0.02)
</script>

<template>
  <div class="text-center select-none h-16">
    <template v-if="combo >= 2">
      <p
        class="text-3xl font-black text-amber-300 transition-transform duration-100"
        :style="{ transform: `scale(${scale})` }"
      >
        {{ combo }} <span class="text-lg">COMBO</span>
      </p>
      <p class="text-xs text-slate-400">ダメージ x{{ multiplier }}</p>
    </template>
  </div>
</template>
