import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { type AdminUser, buildUserWhere } from './admin-users-query'

/**
 * 管理员用户列表的 server function。
 *
 * 不用 `authClient.admin.listUsers`：插件只支持一组 `filterField` / `filterValue`，
 * 无法同时按邮箱 + 角色 + 封禁状态过滤，故直接查 D1。
 *
 * 权限必须在服务端再校验：server function 是可被直接调用的 HTTP 端点。
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
        // `id` 作 tiebreaker：同一秒注册的用户不少，只按时间排序时翻页会重复或漏项。
        .orderBy(asc(users.createdAt), asc(users.id))
        .limit(data.limit)
        .offset(data.offset),
      db.select({ value: count() }).from(users).where(where),
    ])

    return { users: rows, total: counted[0]?.value ?? 0 }
  })
