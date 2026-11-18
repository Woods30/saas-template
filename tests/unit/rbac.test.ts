import { describe, expect, it } from 'vitest'
import {
  findCeilingViolation,
  isAdminPermission,
  matchAllPermissions,
  matchAnyPermission,
  matchPermission,
} from '../../src/core/auth/rbac'
import {
  assertUserPermission,
  assignRolesToUser,
  deleteRole,
  ensureDefaultRbac,
  getUserPermissions,
  hasPermission,
  listRolesWithPermissions,
  upsertRoleWithPermissions,
} from '../../src/modules/rbac/service'
import { createTestDatabase, seedUser } from '../helpers/database'

describe('RBAC 纯函数匹配与权限天花板', () => {
  it('支持精确匹配、多级前缀通配 .* 与全局 *', () => {
    expect(matchPermission('admin.users.read', ['admin.users.read'])).toBe(true)
    expect(matchPermission('admin.users.write', ['admin.users.read'])).toBe(false)
    expect(matchPermission('admin.users.write', ['admin.users.*'])).toBe(true)
    expect(matchPermission('admin.users.write', ['admin.*'])).toBe(true)
    expect(matchPermission('admin.users.write', ['*'])).toBe(true)
    expect(matchPermission('admin.users.*', ['admin.users.read'])).toBe(false)
    expect(matchPermission('admin.users.*', ['admin.*'])).toBe(true)
  })

  it('matchAnyPermission 与 matchAllPermissions 组合判定', () => {
    const held = ['admin.users.*', 'admin.orders.read']
    expect(matchAnyPermission(['admin.roles.write', 'admin.orders.read'], held)).toBe(true)
    expect(matchAnyPermission(['admin.roles.write', 'admin.settings.write'], held)).toBe(false)
    expect(matchAllPermissions(['admin.users.read', 'admin.orders.read'], held)).toBe(true)
    expect(matchAllPermissions(['admin.users.read', 'admin.orders.write'], held)).toBe(false)
  })

  it('findCeilingViolation 拦截超出操作者自身权限的授权', () => {
    expect(
      findCeilingViolation(['admin.users.*', 'admin.roles.write'], ['admin.users.read']),
    ).toBeNull()
    expect(findCeilingViolation(['admin.users.*', 'admin.roles.write'], ['*'])).toBe('*')
    expect(
      findCeilingViolation(
        ['admin.users.read', 'admin.roles.write'],
        ['admin.users.read', 'admin.users.write'],
      ),
    ).toBe('admin.users.write')
    expect(isAdminPermission('admin.users.read')).toBe(true)
    expect(isAdminPermission('*')).toBe(true)
    expect(isAdminPermission('profile.read')).toBe(false)
  })
})

describe('RBAC 数据库服务', () => {
  it('ensureDefaultRbac 幂等写入内置角色与权限点', async () => {
    const { db } = createTestDatabase()
    await ensureDefaultRbac(db)
    await ensureDefaultRbac(db)

    const roles = await listRolesWithPermissions(db)
    const names = roles.map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['super_admin', 'admin', 'editor', 'viewer']))

    const superAdmin = roles.find((r) => r.name === 'super_admin')
    expect(superAdmin?.isSystem).toBe(true)
    expect(superAdmin?.permissions).toContain('*')
  })

  it('兼容旧 users.role = admin 兜底，并支持带过期时间的角色分配', async () => {
    const { sqlite, db } = createTestDatabase()
    await ensureDefaultRbac(db)
    seedUser(sqlite, 'u_legacy_admin')
    seedUser(sqlite, 'u_temp_editor')
    sqlite.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run('u_legacy_admin')

    // 旧字段 role = 'admin' 在未绑定 user_roles 时仍具备超级管理员通配权限
    expect(await hasPermission(db, 'u_legacy_admin', 'admin.settings.write')).toBe(true)

    const now = new Date('2026-06-01T00:00:00Z')
    const future = new Date('2026-06-02T00:00:00Z')
    const past = new Date('2026-05-31T00:00:00Z')

    await assignRolesToUser(db, {
      actorPermissions: ['*'],
      targetUserId: 'u_temp_editor',
      assignments: [{ roleName: 'viewer', expiresAt: future }],
    })

    expect(await hasPermission(db, 'u_temp_editor', 'admin.users.read', now)).toBe(true)
    expect(await hasPermission(db, 'u_temp_editor', 'admin.users.write', now)).toBe(false)

    // 过期后立即失效
    await assignRolesToUser(db, {
      actorPermissions: ['*'],
      targetUserId: 'u_temp_editor',
      assignments: [{ roleName: 'viewer', expiresAt: past }],
    })
    expect(await getUserPermissions(db, 'u_temp_editor', now)).toEqual([])
    expect(await hasPermission(db, 'u_temp_editor', 'admin.users.read', now)).toBe(false)
  })

  it('自定义角色维护强制执行权限天花板并保护系统内置角色', async () => {
    const { db } = createTestDatabase()
    await ensureDefaultRbac(db)

    // 只有 admin.users.* 与 admin.roles.write 的管理员不能创建带 * 的角色
    await expect(
      upsertRoleWithPermissions(db, {
        actorPermissions: ['admin.users.*', 'admin.roles.write'],
        name: 'rogue_root',
        title: '越权超管',
        permissionCodes: ['*'],
      }),
    ).rejects.toThrow(/RBAC_CEILING_VIOLATION/)

    // 在自身权限范围内创建角色成功
    const supportRole = await upsertRoleWithPermissions(db, {
      actorPermissions: ['admin.users.*', 'admin.orders.read', 'admin.roles.write'],
      name: 'support_agent',
      title: '客服专员',
      description: '仅查看订单与管理用户',
      permissionCodes: ['admin.users.read', 'admin.orders.read'],
    })
    expect(supportRole.name).toBe('support_agent')
    expect(supportRole.permissions.sort()).toEqual(['admin.orders.read', 'admin.users.read'])

    // 系统内置角色禁止删除
    const roles = await listRolesWithPermissions(db)
    const superAdmin = roles.find((r) => r.name === 'super_admin')
    expect(superAdmin).toBeDefined()
    await expect(
      deleteRole(db, {
        actorPermissions: ['*'],
        roleId: superAdmin?.id ?? '',
      }),
    ).rejects.toThrow(/RBAC_SYSTEM_ROLE_PROTECTED/)

    // 自定义角色允许删除
    await deleteRole(db, {
      actorPermissions: ['*'],
      roleId: supportRole.id,
    })
    const afterDelete = await listRolesWithPermissions(db)
    expect(afterDelete.find((r) => r.name === 'support_agent')).toBeUndefined()
  })

  it('assertUserPermission 对未登录或越权调用抛出 HTTP 403 Response', async () => {
    const { sqlite, db } = createTestDatabase()
    await ensureDefaultRbac(db)
    seedUser(sqlite, 'u_viewer')

    await assignRolesToUser(db, {
      actorPermissions: ['*'],
      targetUserId: 'u_viewer',
      assignments: [{ roleName: 'viewer' }],
    })

    // viewer 拥有 admin.users.read，但没有 admin.users.write
    const perms = await assertUserPermission(db, 'u_viewer', 'admin.users.read')
    expect(perms).toContain('admin.users.read')

    await expect(assertUserPermission(db, 'u_viewer', 'admin.users.write')).rejects.toMatchObject({
      status: 403,
    })
    await expect(assertUserPermission(db, null, 'admin.users.read')).rejects.toMatchObject({
      status: 403,
    })
  })
})
