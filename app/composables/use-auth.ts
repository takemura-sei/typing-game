import { storeToRefs } from 'pinia'
import { useAuthStore } from '../stores/auth'

/**
 * authストアの唯一の入口。戻り値はプレーンオブジェクトのため、
 * 呼び出し側は分割代入して使うこと(テンプレートでのref自動アンラップを効かせるため)。
 */
export function useAuth() {
  const store = useAuthStore()
  const { userId, displayName, status } = storeToRefs(store)

  return {
    userId,
    displayName,
    status,
    ensureSignedIn: store.ensureSignedIn,
  }
}
