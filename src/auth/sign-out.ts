import { signOut } from '@/auth/client'

/**
 * 登出并在成功后整页跳转到站点根路径。
 *
 * 从 `UserMenu` 与个人中心用户卡片两处相同实现抽出：语义必须一致，否则用户在一个
 * 入口登出成功后没有反馈、在另一个入口失败后却以为已登出。
 *
 * **失败时留在原地**：整页跳转（`window.location.assign`）会让用户以为已经登出，
 * 而会话其实还在。因此只在 `signOut()` 解析出无错误时才跳转；否则 `console.warn`
 * 留痕，由调用方自行决定是否提示。
 *
 * `window` 只在函数体内引用——本模块被客户端组件导入，SSR 期不会执行到跳转那一行。
 */
export async function signOutAndRedirect(): Promise<void> {
  const { error } = await signOut()
  if (error) {
    console.warn(`[auth] 登出失败: ${error.message ?? 'unknown'}`)
    return
  }
  window.location.assign('/')
}
