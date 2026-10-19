import { createServerFn } from '@tanstack/react-start'

/** 个人中心守卫所需的会话信息（只取页面要用的字段，不回传整个 session）。 */
export interface SessionInfo {
  user: {
    id: string
    name: string
    email: string
    emailVerified: boolean
    /** OAuth 头像地址；邮箱密码注册用户为 `null`，UI 侧回退到首字母。 */
    image: string | null
    /** 角色（`users.role`）；admin 插件据此判定权限，默认 `'user'`。 */
    role: string
  }
  /**
   * 当前会话是否由管理员 impersonate 而来。
   *
   * admin 插件把原管理员 id 写进 `sessions.impersonated_by`。UI 据此显示「停止模拟」
   * 入口——没有这个标志，管理员会误以为自己就是被模拟的用户，也找不到退出路径。
   */
  impersonating: boolean
}

/**
 * 读取当前请求的会话。
 *
 * 为什么必须是 server function：个人中心是**受保护路由**，`beforeLoad` 在 SSR 与客户端
 * 导航两条路径上都会执行。客户端导航时浏览器里既没有 ALS 也没有 env，`getAuth(env)`
 * 无从取得数据库 binding；而会话 cookie 是 httpOnly 的，客户端也读不到。server function
 * 在 SSR 阶段就地执行（无网络往返），客户端导航时自动降级为一次 RPC，两种路径都拿到
 * 真实会话——`src/auth/providers.ts` 出于同样的理由采用了同一写法。
 *
 * 动态 import 让本模块顶层保持「纯函数 + 类型」，不把服务端模块带进任何静态依赖图。
 */
export const fetchSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionInfo | null> => {
    const [{ getServerContext }, { getAuth }, { getRequestHeaders }] = await Promise.all([
      import('@/lib/server-context'),
      import('@/auth/auth'),
      import('@tanstack/react-start/server'),
    ])
    const session = await getAuth(getServerContext().env).api.getSession({
      headers: getRequestHeaders(),
    })
    if (!session) return null
    return {
      user: {
        id: session.user.id,
        name: session.user.name ?? '',
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        image: session.user.image ?? null,
        // admin 插件把 role 声明为可空；数据库侧 `users.role` notNull default 'user'，
        // 但类型上仍需兜底，避免把 `undefined` 传成 `role`。
        role: session.user.role ?? 'user',
      },
      // admin 插件把 `impersonatedBy` 声明在 session 上（sessions.impersonated_by）。
      impersonating: Boolean(
        (session.session as { impersonatedBy?: string | null }).impersonatedBy,
      ),
    }
  },
)
