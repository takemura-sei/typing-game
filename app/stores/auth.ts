import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useSupabase } from '../composables/useSupabase'

export type AuthStatus = 'idle' | 'signing_in' | 'signed_in' | 'unconfigured' | 'error'

/**
 * 匿名認証の状態。アプリ起動時に ensureSignedIn() を1回呼ぶ。
 * Supabase未設定(.envなし)なら 'unconfigured' でスキップし、ソロ練習は動かす。
 */
export const useAuthStore = defineStore('auth', () => {
  const userId = ref<string | null>(null)
  const displayName = ref('ゲスト')
  const status = ref<AuthStatus>('idle')

  async function ensureSignedIn() {
    const supabase = useSupabase()
    if (!supabase) {
      status.value = 'unconfigured'
      return
    }
    if (status.value === 'signed_in' || status.value === 'signing_in') return

    status.value = 'signing_in'
    try {
      // 既存セッションがあれば再利用(匿名ユーザーの継続性)
      const { data: sessionData } = await supabase.auth.getSession()
      let id = sessionData.session?.user.id ?? null

      if (!id) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error) throw error
        id = data.user?.id ?? null
      }
      if (!id) throw new Error('no user id after sign-in')

      userId.value = id
      status.value = 'signed_in'

      // profiles行を確保(テーブル未作成でも致命傷にしない)
      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert({ id }, { onConflict: 'id', ignoreDuplicates: true })
      if (upsertError) {
        console.warn('[auth] profiles upsert failed:', upsertError.message)
      }
    } catch (e) {
      console.error('[auth] anonymous sign-in failed:', e)
      status.value = 'error'
    }
  }

  return { userId, displayName, status, ensureSignedIn }
})
