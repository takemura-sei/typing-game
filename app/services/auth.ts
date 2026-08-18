import { useSupabase } from '../composables/use-supabase'

export interface SignInResult {
  userId: string | null
  status: 'signed_in' | 'unconfigured' | 'error'
}

/** 匿名サインイン(既存セッションがあれば再利用)し、profiles行を確保する */
export async function signInAnonymously(): Promise<SignInResult> {
  const supabase = useSupabase()
  if (!supabase) return { userId: null, status: 'unconfigured' }

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

    // profiles行を確保(テーブル未作成でも致命傷にしない)
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({ id }, { onConflict: 'id', ignoreDuplicates: true })
    if (upsertError) {
      console.warn('[auth] profiles upsert failed:', upsertError.message)
    }

    return { userId: id, status: 'signed_in' }
  } catch (e) {
    console.error('[auth] anonymous sign-in failed:', e)
    return { userId: null, status: 'error' }
  }
}
