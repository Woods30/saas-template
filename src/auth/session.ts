import { createServerFn } from '@tanstack/react-start'

/** 个人中心守卫所需的会话信息（只取页面要用的字段，不回传整个 session）。 */
export interface SessionInfo {
  user: {
    id: string
    name: string
    email: string
    emailVerified: boolean
  }
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
      },
    }
  },
)
