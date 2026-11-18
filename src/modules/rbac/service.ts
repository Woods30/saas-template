import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { asc, count, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import {
  DEFAULT_PERMISSIONS,
  DEFAULT_ROLES,
  findCeilingViolation,
  isAdminPermission,
  matchPermission,
  type PermissionSeed,
  permissionIdOf,
  ROLES,
  type RoleStatus,
  roleIdOf,
  SYSTEM_ROLE_NAMES,
} from '@/core/auth/rbac'
import type { DB } from '@/core/db'
import { permissions, rolePermissions, roles, userRoles, users } from '@/core/db/schema'
import { safeRecordAuditLog } from '@/modules/audit/service'

export {
  type BuiltinRoleSeed,
  DEFAULT_PERMISSIONS,
  DEFAULT_ROLES,
  findCeilingViolation,
  isAdminPermission,
  matchAllPermissions,
  matchAnyPermission,
  matchPermission,
  type PermissionSeed,
  permissionIdOf,
  ROLES,
  roleIdOf,
  SYSTEM_ROLE_NAMES,
} from '@/core/auth/rbac'

export interface RoleWithPermissions {
  id: string
  name: string
  title: string
  description: string | null
  status: RoleStatus
  sortOrder: number
  isSystem: boolean
  permissions: string[]
  userCount: number
}

export interface UserRoleAssignmentInput {
  roleName: string
  expiresAt?: Date | null
}

/** 幂等初始化系统内置权限点与四种默认角色。 */
export async function ensureDefaultRbac(db: DB): Promise<void> {
  const [existingPerms, existingRoles] = await Promise.all([
    db.select({ id: permissions.id, code: permissions.code }).from(permissions),
    db.select({ id: roles.id, name: roles.name }).from(roles),
  ])
  const permIdByCode = new Map(existingPerms.map((p) => [p.code, p.id]))
  const roleIdByName = new Map(existingRoles.map((r) => [r.name, r.id]))

  const missingPerms = DEFAULT_PERMISSIONS.filter((seed) => !permIdByCode.has(seed.code)).map(
    (seed) => {
      const id = permissionIdOf(seed.code)
      permIdByCode.set(seed.code, id)
      return {
        id,
        code: seed.code,
        resource: seed.resource,
        action: seed.action,
        title: seed.title,
        description: seed.description,
      }
    },
  )

  for (let i = 0; i < missingPerms.length; i += 10) {
    await db
      .insert(permissions)
      .values(missingPerms.slice(i, i + 10))
      .onConflictDoNothing()
  }

  const newRoleNames = new Set<string>()
  const missingRoles = DEFAULT_ROLES.filter((seed) => !roleIdByName.has(seed.name)).map((seed) => {
    const id = roleIdOf(seed.name)
    roleIdByName.set(seed.name, id)
    newRoleNames.add(seed.name)
    return {
      id,
      name: seed.name,
      title: seed.title,
      description: seed.description,
      status: 'active' as const,
      sortOrder: seed.sortOrder,
    }
  })

  if (missingRoles.length > 0) {
    await db.insert(roles).values(missingRoles).onConflictDoNothing()
  }

  if (newRoleNames.size === 0) {
    return
  }

  const missingBindings: Array<{ id: string; roleId: string; permissionId: string }> = []
  for (const roleSeed of DEFAULT_ROLES) {
    if (!newRoleNames.has(roleSeed.name)) continue
    const roleId = roleIdByName.get(roleSeed.name)
    if (!roleId) continue
    for (const code of roleSeed.permissions) {
      const permId = permIdByCode.get(code)
      if (!permId) continue
      missingBindings.push({
        id: `rp:${roleSeed.name}:${code}`,
        roleId,
        permissionId: permId,
      })
    }
  }

  for (let i = 0; i < missingBindings.length; i += 15) {
    await db
      .insert(rolePermissions)
      .values(missingBindings.slice(i, i + 15))
      .onConflictDoNothing()
  }
}

/** 列出全部权限点目录。 */
export async function listPermissionsCatalog(db: DB): Promise<PermissionSeed[]> {
  await ensureDefaultRbac(db)
  const rows = await db
    .select({
      code: permissions.code,
      resource: permissions.resource,
      action: permissions.action,
      title: permissions.title,
      description: permissions.description,
    })
    .from(permissions)
    .orderBy(asc(permissions.code))

  return rows.map((row) => ({
    ...row,
    description: row.description ?? '',
  }))
}

/** 列出所有角色及其绑定的权限码与关联用户数。 */
export async function listRolesWithPermissions(db: DB): Promise<RoleWithPermissions[]> {
  await ensureDefaultRbac(db)

  const roleRows = await db.select().from(roles).orderBy(asc(roles.sortOrder), asc(roles.createdAt))

  const bindingRows = await db
    .select({
      roleId: rolePermissions.roleId,
      code: permissions.code,
    })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))

  const countRows = await db
    .select({
      roleId: userRoles.roleId,
      value: count(),
    })
    .from(userRoles)
    .groupBy(userRoles.roleId)

  const permsByRoleId = new Map<string, string[]>()
  for (const row of bindingRows) {
    const list = permsByRoleId.get(row.roleId) ?? []
    list.push(row.code)
    permsByRoleId.set(row.roleId, list)
  }

  const countByRoleId = new Map<string, number>()
  for (const row of countRows) {
    countByRoleId.set(row.roleId, Number(row.value ?? 0))
  }

  return roleRows.map((row) => ({
    id: row.id,
    name: row.name,
    title: row.title,
    description: row.description ?? null,
    status: (row.status === 'disabled' ? 'disabled' : 'active') as RoleStatus,
    sortOrder: row.sortOrder,
    isSystem: SYSTEM_ROLE_NAMES.has(row.name),
    permissions: (permsByRoleId.get(row.id) ?? []).sort(),
    userCount: countByRoleId.get(row.id) ?? 0,
  }))
}

/**
 * 解析指定用户当前生效的权限码集合。
 *
 * - 若该用户在 `user_roles` 中有绑定记录，则汇总所有 `active` 且未过期角色的权限；
 * - 若该用户在 `user_roles` 中尚无记录，则回退检查 `users.role` 字段（`admin` / `super_admin` 映射为 `['*']`），
 *   保证存量管理员账号与单元测试平滑过渡。
 */
export async function getUserPermissions(
  db: DB,
  userId: string,
  now: Date = new Date(),
): Promise<string[]> {
  if (!userId) return []

  const assignedRows = await db
    .select({
      roleId: userRoles.roleId,
      roleStatus: roles.status,
      expiresAt: userRoles.expiresAt,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId))

  if (assignedRows.length > 0) {
    const activeRoleIds = assignedRows
      .filter(
        (row) =>
          row.roleStatus === 'active' &&
          (row.expiresAt === null || row.expiresAt.getTime() > now.getTime()),
      )
      .map((row) => row.roleId)

    if (activeRoleIds.length === 0) {
      return []
    }

    const permRows = await db
      .select({ code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(inArray(rolePermissions.roleId, activeRoleIds))

    return Array.from(new Set(permRows.map((p) => p.code))).sort()
  }

  const userRow = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const legacyRole = userRow[0]?.role
  if (legacyRole === ROLES.ADMIN || legacyRole === ROLES.SUPER_ADMIN) {
    return ['*']
  }

  return []
}

/** 判断指定用户在 `now` 时刻是否具备 `permissionCode` 权限。 */
export async function hasPermission(
  db: DB,
  userId: string,
  permissionCode: string,
  now: Date = new Date(),
): Promise<boolean> {
  const held = await getUserPermissions(db, userId, now)
  return matchPermission(permissionCode, held)
}

/**
 * 为用户分配角色（全量替换该用户的角色绑定），强制执行权限天花板并同步 `users.role`。
 */
export async function assignRolesToUser(
  db: DB,
  input: {
    actorPermissions: readonly string[]
    targetUserId: string
    assignments: readonly UserRoleAssignmentInput[]
  },
): Promise<{ roleNames: string[]; permissions: string[] }> {
  await ensureDefaultRbac(db)

  const requestedNames = Array.from(
    new Set(input.assignments.map((a) => a.roleName.trim()).filter(Boolean)),
  )

  const allRoles = await listRolesWithPermissions(db)
  const roleByName = new Map(allRoles.map((r) => [r.name, r]))

  const targetPermissionCodes = new Set<string>()
  for (const name of requestedNames) {
    const targetRole = roleByName.get(name)
    if (!targetRole) {
      throw new Error(`RBAC_ROLE_NOT_FOUND: ${name}`)
    }
    for (const code of targetRole.permissions) {
      targetPermissionCodes.add(code)
    }
  }

  // 同时校验被移除的旧角色权限是否在操作者天花板内
  const currentPerms = await getUserPermissions(db, input.targetUserId)
  for (const code of currentPerms) {
    targetPermissionCodes.add(code)
  }

  const violation = findCeilingViolation(input.actorPermissions, Array.from(targetPermissionCodes))
  if (violation) {
    throw new Error(`RBAC_CEILING_VIOLATION: ${violation}`)
  }

  await db.delete(userRoles).where(eq(userRoles.userId, input.targetUserId))

  const now = new Date()
  for (const assignment of input.assignments) {
    const targetRole = roleByName.get(assignment.roleName.trim())
    if (!targetRole) continue
    await db.insert(userRoles).values({
      id: crypto.randomUUID(),
      userId: input.targetUserId,
      roleId: targetRole.id,
      expiresAt: assignment.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
  }

  const effectivePerms = await getUserPermissions(db, input.targetUserId, now)
  const hasAnyAdminPerm = effectivePerms.some((code) => isAdminPermission(code))
  await db
    .update(users)
    .set({
      role: hasAnyAdminPerm ? ROLES.ADMIN : 'user',
      updatedAt: now,
    })
    .where(eq(users.id, input.targetUserId))

  return {
    roleNames: requestedNames,
    permissions: effectivePerms,
  }
}

/** 创建或更新角色及其权限绑定，强制校验权限天花板并保护内置 `super_admin`。 */
export async function upsertRoleWithPermissions(
  db: DB,
  input: {
    actorPermissions: readonly string[]
    id?: string
    name: string
    title: string
    description?: string | null
    status?: RoleStatus
    sortOrder?: number
    permissionCodes: readonly string[]
  },
): Promise<RoleWithPermissions> {
  await ensureDefaultRbac(db)

  const normalizedName = input.name.trim().toLowerCase()
  if (!/^[a-z0-9_]{2,40}$/.test(normalizedName)) {
    throw new Error('RBAC_INVALID_ROLE_NAME')
  }

  const normalizedCodes = Array.from(
    new Set(input.permissionCodes.map((c) => c.trim()).filter(Boolean)),
  )
  const violation = findCeilingViolation(input.actorPermissions, normalizedCodes)
  if (violation) {
    throw new Error(`RBAC_CEILING_VIOLATION: ${violation}`)
  }

  if (normalizedName === ROLES.SUPER_ADMIN) {
    if (input.status === 'disabled' || !normalizedCodes.includes('*')) {
      throw new Error('RBAC_SUPER_ADMIN_PROTECTED')
    }
  }

  const existingRows = await db
    .select()
    .from(roles)
    .where(input.id ? eq(roles.id, input.id) : eq(roles.name, normalizedName))
    .limit(1)

  const existing = existingRows[0]
  if (existing) {
    if (existing.name === ROLES.SUPER_ADMIN && normalizedName !== ROLES.SUPER_ADMIN) {
      throw new Error('RBAC_SUPER_ADMIN_PROTECTED')
    }
    const existingRoles = await listRolesWithPermissions(db)
    const currentRole = existingRoles.find((r) => r.id === existing.id)
    if (currentRole) {
      const existingViolation = findCeilingViolation(
        input.actorPermissions,
        currentRole.permissions,
      )
      if (existingViolation) {
        throw new Error(`RBAC_CEILING_VIOLATION: ${existingViolation}`)
      }
    }
  }

  const permCatalog = await db
    .select({ id: permissions.id, code: permissions.code })
    .from(permissions)
  const permIdByCode = new Map(permCatalog.map((p) => [p.code, p.id]))
  for (const code of normalizedCodes) {
    if (!permIdByCode.has(code)) {
      throw new Error(`RBAC_UNKNOWN_PERMISSION: ${code}`)
    }
  }

  const now = new Date()
  const roleId = existing?.id ?? input.id ?? `role_${normalizedName}`

  if (existing) {
    await db
      .update(roles)
      .set({
        name: SYSTEM_ROLE_NAMES.has(existing.name) ? existing.name : normalizedName,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        status: input.status ?? (existing.status as RoleStatus),
        sortOrder: input.sortOrder ?? existing.sortOrder,
        updatedAt: now,
      })
      .where(eq(roles.id, roleId))
  } else {
    await db.insert(roles).values({
      id: roleId,
      name: normalizedName,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status: input.status ?? 'active',
      sortOrder: input.sortOrder ?? 100,
      createdAt: now,
      updatedAt: now,
    })
  }

  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId))
  for (const code of normalizedCodes) {
    const permId = permIdByCode.get(code)
    if (!permId) continue
    await db.insert(rolePermissions).values({
      id: crypto.randomUUID(),
      roleId,
      permissionId: permId,
      createdAt: now,
    })
  }

  const updatedList = await listRolesWithPermissions(db)
  const updated = updatedList.find((r) => r.id === roleId)
  if (!updated) {
    throw new Error('RBAC_ROLE_NOT_FOUND')
  }
  return updated
}

/** 删除自定义角色（系统内置角色受保护不可删除）。 */
export async function deleteRole(
  db: DB,
  input: {
    actorPermissions: readonly string[]
    roleId: string
  },
): Promise<void> {
  await ensureDefaultRbac(db)
  const allRoles = await listRolesWithPermissions(db)
  const target = allRoles.find((r) => r.id === input.roleId)
  if (!target) {
    throw new Error('RBAC_ROLE_NOT_FOUND')
  }
  if (target.isSystem) {
    throw new Error('RBAC_SYSTEM_ROLE_PROTECTED')
  }

  const violation = findCeilingViolation(input.actorPermissions, target.permissions)
  if (violation) {
    throw new Error(`RBAC_CEILING_VIOLATION: ${violation}`)
  }

  await db.delete(roles).where(eq(roles.id, target.id))
}

/**
 * 断言指定用户拥有 `requiredPermission`；未登录或越权时抛出 HTTP 403 Response。
 */
export async function assertUserPermission(
  db: DB,
  userId: string | null | undefined,
  requiredPermission: string,
  now: Date = new Date(),
): Promise<string[]> {
  if (!userId) {
    throw new Response(null, { status: 403 })
  }
  const held = await getUserPermissions(db, userId, now)
  if (!matchPermission(requiredPermission, held)) {
    throw new Response(null, { status: 403 })
  }
  return held
}

/**
 * 服务端权限守卫：读取当前请求会话、解析 RBAC 权限点并校验 `requiredPermission`。
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
    const held = await assertUserPermission(db, userId, requiredPermission)
    return { db, adminId: userId, permissions: held }
  },
)

export interface AdminRolesOverview {
  roles: RoleWithPermissions[]
  permissionsCatalog: PermissionSeed[]
  actorPermissions: string[]
}

/** 获取角色列表、权限目录及当前操作者的生效权限（需 `admin.roles.read`）。 */
export const fetchAdminRoles = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AdminRolesOverview> => {
    const { db, permissions: actorPermissions } = await requirePermissionDb('admin.roles.read')
    const [roleList, catalog] = await Promise.all([
      listRolesWithPermissions(db),
      listPermissionsCatalog(db),
    ])
    return {
      roles: roleList,
      permissionsCatalog: catalog,
      actorPermissions,
    }
  },
)

const saveRoleSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_]+$/),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional().nullable(),
  status: z.enum(['active', 'disabled']).default('active'),
  permissionCodes: z.array(z.string().trim().min(1)).max(100),
})

/** 创建或更新角色及权限点绑定（需 `admin.roles.write`）。 */
export const saveAdminRole = createServerFn({ method: 'POST' })
  .validator((input: unknown) => saveRoleSchema.parse(input))
  .handler(async ({ data }): Promise<RoleWithPermissions> => {
    const {
      db,
      adminId,
      permissions: actorPermissions,
    } = await requirePermissionDb('admin.roles.write')
    const saved = await upsertRoleWithPermissions(db, {
      actorPermissions,
      id: data.id,
      name: data.name,
      title: data.title,
      description: data.description,
      status: data.status,
      permissionCodes: data.permissionCodes,
    })
    await safeRecordAuditLog(db, {
      actorId: adminId,
      actorType: 'admin',
      operation: data.id ? 'rbac.role.update' : 'rbac.role.create',
      targetType: 'role',
      targetId: saved.id,
      summary: `${data.id ? '更新' : '新建'}角色 ${saved.name}（${saved.permissions.length} 项权限）`,
    })
    return saved
  })

const removeRoleSchema = z.object({
  roleId: z.string().trim().min(1),
})

/** 删除自定义角色（需 `admin.roles.write`）。 */
export const removeAdminRole = createServerFn({ method: 'POST' })
  .validator((input: unknown) => removeRoleSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const {
      db,
      adminId,
      permissions: actorPermissions,
    } = await requirePermissionDb('admin.roles.write')
    await deleteRole(db, {
      actorPermissions,
      roleId: data.roleId,
    })
    await safeRecordAuditLog(db, {
      actorId: adminId,
      actorType: 'admin',
      operation: 'rbac.role.delete',
      targetType: 'role',
      targetId: data.roleId,
      summary: `删除角色 ${data.roleId}`,
    })
    return { ok: true }
  })

const assignUserRolesSchema = z.object({
  userId: z.string().trim().min(1),
  assignments: z
    .array(
      z.object({
        roleName: z.string().trim().min(1),
        expiresAt: z.string().datetime().optional().nullable(),
      }),
    )
    .max(20),
})

/** 为指定用户分配角色（需 `admin.users.write`）。 */
export const assignAdminUserRoles = createServerFn({ method: 'POST' })
  .validator((input: unknown) => assignUserRolesSchema.parse(input))
  .handler(async ({ data }): Promise<{ roleNames: string[]; permissions: string[] }> => {
    const {
      db,
      adminId,
      permissions: actorPermissions,
    } = await requirePermissionDb('admin.users.write')
    const result = await assignRolesToUser(db, {
      actorPermissions,
      targetUserId: data.userId,
      assignments: data.assignments.map((a) => ({
        roleName: a.roleName,
        expiresAt: a.expiresAt ? new Date(a.expiresAt) : null,
      })),
    })
    await safeRecordAuditLog(db, {
      actorId: adminId,
      actorType: 'admin',
      operation: 'rbac.user.assign_roles',
      targetType: 'user',
      targetId: data.userId,
      summary: `分配角色：${result.roleNames.join(', ') || '无'}`,
    })
    return result
  })
