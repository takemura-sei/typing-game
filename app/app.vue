<script setup lang="ts">
const { ensureSignedIn } = useAuth()
onMounted(() => {
  ensureSignedIn()
})
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>
