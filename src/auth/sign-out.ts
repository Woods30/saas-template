import { signOut } from '@/auth/client'

/**
 * 登出并在成功后整页跳转到站点根路径。
 *
 * **失败时留在原地**：整页跳转会让用户以为已登出而会话仍在，故只在无错误时跳转。
 * `window` 只在函数体内引用，SSR 期不会执行到。
 */
export async function signOutAndRedirect(): Promise<void> {
  const { error } = await signOut()
  if (error) {
    console.warn(`[auth] 登出失败: ${error.message ?? 'unknown'}`)
    return
  }
  window.location.assign('/')
}
