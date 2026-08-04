import type { SupabaseClient } from '@supabase/supabase-js'

/** Supabaseクライアントを返す。.env未設定・Nuxt外(vitest)の場合は null */
export function useSupabase(): SupabaseClient | null {
  try {
    const { $supabase } = useNuxtApp()
    return $supabase as SupabaseClient | null
  } catch {
    return null
  }
}
