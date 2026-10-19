import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { type AdminUser, buildUserWhere } from './admin-users-query'

/**
 * 管理员用户列表的 server function。
 *
 * 为什么不用 `authClient.admin.listUsers`：该接口的 `filterField` / `filterValue`
 * 只有**一组**，`where` 里最多推入一个过滤条件。用户管理页需要「邮箱关键词 +
 * 角色 + 封禁状态」三者同时生效，插件的查询参数表达不了；客户端过滤又会因为
 * 分页只覆盖当前 20 条而产生错误的总数与漏项。因此这里直接用 drizzle 查 D1。
 *
 * 权限由服务端再校验一次：页面的 `beforeLoad` 只管路由，server function 是
 * 可被直接调用的 HTTP 端点，两者必须各自把关。
 *
 * 筛选条件构造在 `admin-users-query.ts`（只依赖 drizzle，可单测）。
 */

export type {
  AdminUser,
  AdminUserRoleFilter,
  AdminUserStatusFilter,
  AdminUsersQuery,
} from './admin-users-query'

export interface AdminUsersResult {
  users: AdminUser[]
  total: number
}

/** 每页条数上限：防止调用方传入一个巨大的 `limit` 把整张表拉出来。 */
const MAX_LIMIT = 100

const querySchema = z.object({
  // 长度上限只是防御性约束——搜索是子串匹配，超长关键词没有语义。
  search: z.string().trim().max(200).optional(),
  role: z.enum(['all', 'user', 'admin']).default('all'),
  status: z.enum(['all', 'active', 'banned']).default('all'),
  limit: z.number().int().min(1).max(MAX_LIMIT).default(20),
  offset: z.number().int().min(0).default(0),
})

export const fetchAdminUsers = createServerFn({ method: 'GET' })
  .validator((input: unknown) => querySchema.parse(input))
  .handler(async ({ data }): Promise<AdminUsersResult> => {
    const [{ getServerContext }, { getAuth }, { getRequestHeaders }] = await Promise.all([
      import('@/lib/server-context'),
      import('@/auth/auth'),
      import('@tanstack/react-start/server'),
    ])
    const { asc, count } = await import('drizzle-orm')
    const { createDb, schema } = await import('@/db')

    const env = getServerContext().env
    const session = await getAuth(env).api.getSession({ headers: getRequestHeaders() })
    // 非管理员一律 403：不回空列表，避免把「被拒绝」伪装成「没有用户」。
    if (session?.user.role !== 'admin') throw new Response(null, { status: 403 })

    const db = createDb(env.DB)
    const { users } = schema
    const where = buildUserWhere(users, data)

    const [rows, counted] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          image: users.image,
          role: users.role,
          banned: users.banned,
          banExpires: users.banExpires,
          banReason: users.banReason,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(where)
        // 按注册时间升序（与插件默认顺序一致），`id` 作 tiebreaker：同一秒注册的
        // 用户不少，只按时间排序时翻页会出现重复或漏项。
        .orderBy(asc(users.createdAt), asc(users.id))
        .limit(data.limit)
        .offset(data.offset),
      db.select({ value: count() }).from(users).where(where),
    ])

    return { users: rows, total: counted[0]?.value ?? 0 }
  })
