import type { SupabaseClient } from '@supabase/supabase-js'

/** Supabaseクライアントを返す。.env未設定の場合は null */
export function useSupabase(): SupabaseClient | null {
  const { $supabase } = useNuxtApp()
  return $supabase as SupabaseClient | null
}
