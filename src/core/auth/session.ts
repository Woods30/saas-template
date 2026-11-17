import { createServerFn } from '@tanstack/react-start'
import type { DB } from '@/core/db'

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

/** 登录设备页所需的会话列表与当前会话 token。 */
export interface SessionsOverview {
  sessions: Array<{
    id: string
    token: string
    createdAt: Date | string
    expiresAt: Date | string
    ipAddress?: string | null
    userAgent?: string | null
  }>
  /** 当前请求所属会话的 token；用于把「本机」与其它设备区分开。 */
  currentToken: string | null
}

/** 读取原始 better-auth 会话；调用方自行挑字段。 */
async function readSession() {
  const [{ getServerContext }, { getAuth }, { getRequestHeaders }] = await Promise.all([
    import('@/lib/server-context'),
    import('@/core/auth/auth'),
    import('@tanstack/react-start/server'),
  ])
  return getAuth(getServerContext().env).api.getSession({ headers: getRequestHeaders() })
}

/**
 * 读取当前请求的会话。
 *
 * 必须是 server function：客户端导航时没有 ALS / env，会话 cookie 又是 httpOnly 的，
 * 客户端读不到。动态 import 让本模块顶层不引入服务端依赖。
 */
export const fetchSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionInfo | null> => {
    const session = await readSession()
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

/**
 * 取当前请求的管理员身份与数据库连接。
 *
 * server function 是**可直接调用的 HTTP 端点**：菜单隐藏与路由 `beforeLoad`
 * 都拦不住别人直接打这个端点，所以权限必须在服务端再校验一次。
 *
 * 非管理员一律 403，不回空数据——把「被拒绝」伪装成「没有记录」会让管理员
 * 以为数据丢了。
 *
 * 动态 import：客户端导航时没有 ALS / env，本模块顶层不能引入服务端依赖。
 */
export async function requireAdminDb(): Promise<{ db: DB; adminId: string }> {
  const [{ getServerContext }, { getAuth }, { getRequestHeaders }, { createDbFromEnv }] =
    await Promise.all([
      import('@/lib/server-context'),
      import('@/core/auth/auth'),
      import('@tanstack/react-start/server'),
      import('@/core/db'),
    ])
  const env = getServerContext().env
  const session = await getAuth(env).api.getSession({ headers: getRequestHeaders() })
  if (session?.user.role !== 'admin') throw new Response(null, { status: 403 })
  return { db: createDbFromEnv(env), adminId: session.user.id }
}

/**
 * 一次取回会话列表与当前 token。
 *
 * `listSessions` 不标注哪条是「本机」，必须与 `getSession` 对照，否则用户点「注销」
 * 会把自己踢下线。两者在服务端并行发出：拆成两次客户端请求会让页面多等一个往返。
 */
export const fetchSessionsOverview = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionsOverview> => {
    const [{ getServerContext }, { getAuth }, { getRequestHeaders }] = await Promise.all([
      import('@/lib/server-context'),
      import('@/core/auth/auth'),
      import('@tanstack/react-start/server'),
    ])
    const auth = getAuth(getServerContext().env)
    const headers = getRequestHeaders()
    const [sessions, current] = await Promise.all([
      auth.api.listSessions({ headers }),
      auth.api.getSession({ headers }),
    ])
    return {
      sessions: (sessions ?? []) as SessionsOverview['sessions'],
      currentToken: current?.session.token ?? null,
    }
  },
)
