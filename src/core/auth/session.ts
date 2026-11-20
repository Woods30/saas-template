import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
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
    /**
     * 角色（`users.role`）；admin 插件据此判定权限，默认 `'user'`。
     *
     * RBAC 分配角色时会把该列同步成「是否持有任意 `admin.*` 权限」的冗余标记
     * （见 `assignRolesToUser`）。它只用于菜单入口这类提示性判断；真正的门禁
     * 在服务端读 `permissions`。
     */
    role: string
  }
  /**
   * 当前用户生效的 RBAC 权限码集合（`*` 表示通配）。
   *
   * 管理台门禁以此为准：持有任意 `admin.*` 权限即可进入。空数组表示无权限
   * （fail-closed），不是「还没加载」。
   */
  permissions: string[]
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

/** 原始 better-auth 会话的最小形状（`getSession` 的返回值）。 */
export interface RawSession {
  user: {
    id: string
    name?: string | null
    email: string
    emailVerified: boolean
    image?: string | null
    role?: string | null
  }
  session: Record<string, unknown>
}

/** 读取原始 better-auth 会话；调用方自行挑字段。 */
async function readSession(): Promise<RawSession | null> {
  const [{ getServerContext }, { getAuth }, { getRequestHeaders }] = await Promise.all([
    import('@/lib/server-context'),
    import('@/core/auth/auth'),
    import('@tanstack/react-start/server'),
  ])
  return (await getAuth(getServerContext().env)).api.getSession({
    headers: getRequestHeaders(),
  }) as unknown as Promise<RawSession | null>
}

/**
 * 把原始会话压成页面要用的形状。
 *
 * 纯函数，便于测试：权限点由调用方给出，`user.role` 缺失时兜底为 `'user'`
 * （admin 插件把 role 声明为可空，数据库侧是 notNull default 'user'）。
 */
export function toSessionInfo(raw: RawSession, permissions: readonly string[]): SessionInfo {
  return {
    user: {
      id: raw.user.id,
      name: raw.user.name ?? '',
      email: raw.user.email,
      emailVerified: raw.user.emailVerified,
      image: raw.user.image ?? null,
      role: raw.user.role ?? 'user',
    },
    permissions: [...permissions],
    // admin 插件把 `impersonatedBy` 声明在 session 上（sessions.impersonated_by）。
    impersonating: Boolean((raw.session as { impersonatedBy?: string | null }).impersonatedBy),
  }
}

/**
 * 解析用户权限，读取失败时按「无权限」处理。
 *
 * 权限是每个页面的前置依赖，一次数据库抖动不该让全站 500；空权限会自然拦住
 * 管理台入口（fail-closed），其余页面照常渲染。
 */
export async function resolveSessionPermissions(
  userId: string,
  load: (id: string) => Promise<string[]>,
): Promise<string[]> {
  try {
    return await load(userId)
  } catch (error) {
    console.warn('[auth] 读取用户权限失败，按无权限处理：', error)
    return []
  }
}

/**
 * 读取当前请求的会话（含权限点）。
 *
 * 必须是 server function：客户端导航时没有 ALS / env，会话 cookie 又是 httpOnly 的，
 * 客户端读不到。动态 import 让本模块顶层不引入服务端依赖。
 */
export const fetchSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionInfo | null> => {
    const session = await readSession()
    if (!session) return null
    const [{ loadUserPermissions }, { createDbFromEnv }, { getServerContext }] = await Promise.all([
      import('@/core/auth/rbac'),
      import('@/core/db'),
      import('@/lib/server-context'),
    ])
    const db = await createDbFromEnv(getServerContext().env)
    const permissions = await resolveSessionPermissions(session.user.id, (id) =>
      loadUserPermissions(db, id),
    )
    return toSessionInfo(session, permissions)
  },
)

/**
 * 取当前请求的数据库连接与已校验的权限点。
 *
 * 管理台 server function 是**可直接调用的 HTTP 端点**：菜单隐藏与路由 `beforeLoad`
 * 都拦不住别人直接打这个端点，所以权限必须在服务端再校验一次。
 *
 * 未登录或缺权限一律 403，不回空数据——把「被拒绝」伪装成「没有记录」会让管理员
 * 以为数据丢了。
 *
 * 落在 `core` 而不是 `modules/rbac`：`core/config`、`core/auth` 都要用，而 `core`
 * 不得反向依赖业务模块。模块的 `requirePermissionDb` 是这里的再导出。
 *
 * `createServerOnlyFn`：本模块被客户端路由静态 import（取 `fetchSession`），
 * 编译器在客户端构建里会把函数体整个换成「调用即抛错」的桩。函数体里的
 * `import('@tanstack/react-start/server')` 与数据库驱动因此不会进客户端图——
 * 否则浏览器里会抛 `Buffer is not defined`，整站水合失败。
 */
export const requirePermissionDb = createServerOnlyFn(
  async (
    requiredPermission: string,
  ): Promise<{ db: DB; adminId: string; permissions: string[] }> => {
    const [{ getServerContext }, { getAuth }, { getRequestHeaders }, { createDbFromEnv }] =
      await Promise.all([
        import('@/lib/server-context'),
        import('@/core/auth/auth'),
        import('@tanstack/react-start/server'),
        import('@/core/db'),
      ])
    const env = getServerContext().env
    const session = await (await getAuth(env)).api.getSession({ headers: getRequestHeaders() })
    const userId = session?.user.id
    if (!userId) throw new Response(null, { status: 403 })
    const db = await createDbFromEnv(env)
    const { loadUserPermissions, matchPermission } = await import('@/core/auth/rbac')
    const held = await loadUserPermissions(db, userId)
    if (!matchPermission(requiredPermission, held)) {
      throw new Response(null, { status: 403 })
    }
    return { db, adminId: userId, permissions: held }
  },
)

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
    const auth = await getAuth(getServerContext().env)
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
