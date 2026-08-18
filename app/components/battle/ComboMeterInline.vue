<script setup lang="ts">
import { comboMultiplier } from '~/utils/battle/damage'

const props = defineProps<{ combo: number }>()
const multiplier = computed(() => comboMultiplier(props.combo).toFixed(2))
</script>

<template>
  <span v-if="combo >= 2" class="text-amber-300 font-bold">
    {{ combo }} COMBO <span class="text-slate-400 font-normal">x{{ multiplier }}</span>
  </span>
  <span v-else />
</template>
