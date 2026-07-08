interface AuthState {
  userId: string | null
  displayName: string
  status: 'idle' | 'signing_in' | 'signed_in' | 'unconfigured' | 'error'
}

/**
 * 匿名認証。アプリ起動時に ensureSignedIn() を1回呼ぶ。
 * Supabase未設定(.envなし)なら 'unconfigured' でスキップし、ゲーム自体は動かす。
 */
export function useAuth() {
  const state = useState<AuthState>('auth', () => ({
    userId: null,
    displayName: 'ゲスト',
    status: 'idle',
  }))

  async function ensureSignedIn() {
    const supabase = useSupabase()
    if (!supabase) {
      state.value.status = 'unconfigured'
      return
    }
    if (state.value.status === 'signed_in' || state.value.status === 'signing_in') return

    state.value.status = 'signing_in'
    try {
      // 既存セッションがあれば再利用(匿名ユーザーの継続性)
      const { data: sessionData } = await supabase.auth.getSession()
      let userId = sessionData.session?.user.id ?? null

      if (!userId) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error) throw error
        userId = data.user?.id ?? null
      }
      if (!userId) throw new Error('no user id after sign-in')

      state.value.userId = userId
      state.value.status = 'signed_in'

      // profiles行を確保(テーブル未作成でも致命傷にしない)
      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })
      if (upsertError) {
        console.warn('[auth] profiles upsert failed (テーブル未作成?):', upsertError.message)
      }
    } catch (e) {
      console.error('[auth] anonymous sign-in failed:', e)
      state.value.status = 'error'
    }
  }

  return { auth: state, ensureSignedIn }
}
