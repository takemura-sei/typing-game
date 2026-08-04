import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,
  modules: ['@pinia/nuxt', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  runtimeConfig: {
    public: {
      supabaseUrl: '',
      supabaseAnonKey: '',
    },
  },
  typescript: {
    // tests/ は Nuxt が生成する tsconfig.app.json の include に入らないため明示的に追加する。
    // パスは .nuxt/ からの相対。
    tsConfig: {
      include: ['../tests/**/*'],
    },
  },
})
