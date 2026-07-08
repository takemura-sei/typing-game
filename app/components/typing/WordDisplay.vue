<script setup lang="ts">
defineProps<{
  display: string
  kana: { done: string; current: string; rest: string }
}>()
</script>

<template>
  <div class="text-center select-none">
    <p class="text-4xl font-bold tracking-wide mb-3">{{ display }}</p>
    <p class="text-xl tracking-widest">
      <span class="text-emerald-400">{{ kana.done }}</span>
      <span class="text-amber-300 underline underline-offset-4">{{ kana.current }}</span>
      <span class="text-slate-400">{{ kana.rest }}</span>
    </p>
  </div>
</template>
