import { defineStore } from 'pinia'
import { ref } from 'vue'
import { signInAnonymously } from '../services/auth'
import { useSupabase } from '../composables/use-supabase'

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
    if (!useSupabase()) {
      status.value = 'unconfigured'
      return
    }
    if (status.value === 'signed_in' || status.value === 'signing_in') return

    status.value = 'signing_in'
    const result = await signInAnonymously()
    userId.value = result.userId
    status.value = result.status
  }

  return { userId, displayName, status, ensureSignedIn }
})
