<script setup lang="ts">
const props = defineProps<{
  typed: string
  rest: string
  /** ミス累計。増えた瞬間に赤フラッシュを出す */
  missCount: number
}>()

const flashing = ref(false)
let flashTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.missCount,
  (now, prev) => {
    if (now > prev) {
      flashing.value = true
      if (flashTimer) clearTimeout(flashTimer)
      flashTimer = setTimeout(() => (flashing.value = false), 150)
    }
  },
)
onBeforeUnmount(() => {
  if (flashTimer) clearTimeout(flashTimer)
})
</script>

<template>
  <p class="text-center font-mono text-2xl tracking-wider select-none">
    <span class="text-emerald-400">{{ typed }}</span
    ><span
      class="border-b-2"
      :class="flashing ? 'text-red-400 border-red-400' : 'text-slate-200 border-amber-300'"
      >{{ rest.charAt(0) }}</span
    ><span class="text-slate-500">{{ rest.slice(1) }}</span>
  </p>
</template>
