import { defineStore } from 'pinia'
import { signInAnonymously } from '../services/auth'
import { useSupabase } from '../composables/use-supabase'

export type AuthStatus = 'idle' | 'signing_in' | 'signed_in' | 'unconfigured' | 'error'

/**
 * 匿名認証の状態。アプリ起動時に ensureSignedIn() を1回呼ぶ。
 * Supabase未設定(.envなし)なら 'unconfigured' でスキップし、ソロ練習は動かす。
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    userId: null as string | null,
    displayName: 'ゲスト',
    status: 'idle' as AuthStatus,
  }),
  actions: {
    async ensureSignedIn() {
      if (!useSupabase()) {
        this.status = 'unconfigured'
        return
      }
      if (this.status === 'signed_in' || this.status === 'signing_in') return

      this.status = 'signing_in'
      const result = await signInAnonymously()
      this.userId = result.userId
      this.status = result.status
    },
  },
})
