import { createFileRoute } from '@tanstack/react-router'
import { websiteConfig } from '@/config/website'
import { getServerContext } from '@/lib/server-context'

/**
 * Better Auth API 路由。
 *
 * 功能开关必须在进入 handler 前拦下（返回 404），否则用户能绕过 UI 直接调用插件端点。
 * 认证没有模块总闸：是否开放由三个登录方法开关决定，且只影响 UI 与服务端注册，
 * 不应把整个 API 变成 404。
 *
 * 管理插件（`/api/auth/admin/*`）的授权见 `gateAdmin`：它自己按 `users.role` 判定，
 * 而 `users.role` 被 RBAC 同步成「是否持有任意 admin.* 权限」的粗粒度标记——
 * 只读的 `viewer` 也会是 `admin`。因此这里在进 handler 之前按**具体权限点**再拦一道，
 * 否则只读账号就能改角色 / 封禁 / 模拟登录。
 */
export function gate(request: Request): Response | undefined {
  const path = new URL(request.url).pathname
  const gated = [{ prefix: '/api/auth/api-key', enabled: websiteConfig.userFeatures.apiKeys }]
  if (gated.some(({ prefix, enabled }) => path.startsWith(prefix) && !enabled)) {
    return Response.json({ error: 'MODULE_DISABLED' }, { status: 404 })
  }
  return undefined
}

/**
 * 管理插件端点 → 所需权限点。
 *
 * 未列出的端点（`create-user` / `set-role` / `ban-user` / `remove-user` /
 * `impersonate-user` / `revoke-user-session(s)` / `set-user-password` / `update-user`）
 * 一律按写权限处理——新增端点默认收紧，而不是默认放行。
 */
const ADMIN_ENDPOINT_PERMISSIONS: Record<string, string> = {
  'list-users': 'admin.users.read',
  'get-user': 'admin.users.read',
  'list-user-sessions': 'admin.users.read',
  'user-has-permission': 'admin.users.read',
}

const ADMIN_PREFIX = '/api/auth/admin/'

/**
 * 管理插件端点的权限点门禁。
 *
 * `stop-impersonating` 不设权限点：调用者是**被模拟的用户**，它要能自己退出模拟；
 * 插件会校验该会话确实带着 `impersonatedBy`，非模拟会话调用无效。
 */
export async function gateAdmin(request: Request): Promise<Response | undefined> {
  const path = new URL(request.url).pathname
  if (!path.startsWith(ADMIN_PREFIX)) return undefined

  const endpoint = path.slice(ADMIN_PREFIX.length).split('/')[0] ?? ''
  if (endpoint === 'stop-impersonating') return undefined

  const required = ADMIN_ENDPOINT_PERMISSIONS[endpoint] ?? 'admin.users.write'
  const [{ getAuth }, { createDbFromEnv }, rbac] = await Promise.all([
    import('@/core/auth/auth'),
    import('@/core/db'),
    import('@/core/auth/rbac'),
  ])

  const env = getServerContext().env
  const session = await (await getAuth(env)).api.getSession({ headers: request.headers })
  const userId = session?.user.id
  if (!userId) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const db = await createDbFromEnv(env)
  const held = await rbac.loadUserPermissions(db, userId)
  if (!rbac.matchPermission(required, held)) {
    return Response.json({ error: 'FORBIDDEN' }, { status: 403 })
  }
  return undefined
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const blocked = gate(request)
        if (blocked) return blocked
        const adminBlocked = await gateAdmin(request)
        if (adminBlocked) return adminBlocked
        const { getAuth } = await import('@/core/auth/auth')
        const env = getServerContext().env
        return (await getAuth(env)).handler(request)
      },
      POST: async ({ request }) => {
        const blocked = gate(request)
        if (blocked) return blocked
        const adminBlocked = await gateAdmin(request)
        if (adminBlocked) return adminBlocked
        const { getAuth } = await import('@/core/auth/auth')
        const env = getServerContext().env
        return (await getAuth(env)).handler(request)
      },
    },
  },
})
