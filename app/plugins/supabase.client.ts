import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const url = config.public.supabaseUrl
  const key = config.public.supabaseAnonKey

  // .env 未設定でもアプリ自体は動かす(ソロ練習はローカルフォールバックで可能)
  const client: SupabaseClient | null =
    url && key ? createClient(url, key) : null

  return {
    provide: {
      supabase: client,
    },
  }
})
