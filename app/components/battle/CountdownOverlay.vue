<script setup lang="ts">
const props = defineProps<{ startAt: number }>()

const remainingMs = ref(props.startAt - Date.now())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => {
    remainingMs.value = props.startAt - Date.now()
    if (remainingMs.value <= -500 && timer) clearInterval(timer)
  }, 100)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const label = computed(() => {
  if (remainingMs.value <= 0) return 'GO!'
  return String(Math.ceil(remainingMs.value / 1000))
})
</script>

<template>
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 select-none">
    <p class="text-8xl font-black" :class="label === 'GO!' ? 'text-emerald-400' : 'text-amber-300'">
      {{ label }}
    </p>
  </div>
</template>
