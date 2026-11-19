import { describe, expect, it, vi } from 'vitest'
import { baseConfig, createWebsiteConfig, type WebsiteConfig } from '@/config/website'
import { DEFAULT_ROLES, matchPermission, ROLES } from '@/core/auth/rbac'
import { resolveSessionPermissions, toSessionInfo } from '@/core/auth/session'
import { SETTING_FIELDS } from '@/core/config/registry'
import { parsePublicEnv } from '@/core/env/public'
import { assertAdminAccess, assertUserFeatureEnabled } from '@/lib/module-access'

/**
 * 管理台门禁：任意 `admin.*` 权限即可进入。
 *
 * 判定用 404 而非 403，不向非管理员泄漏「页面存在但你没权限」。角色只认 RBAC
 * 权限点：`editor` 持有内容 / 工单权限，同样能进管理台；`super_admin` 的 `*`
 * 覆盖一切。
 */

const editorPermissions = DEFAULT_ROLES.find((role) => role.name === ROLES.EDITOR)?.permissions
const viewerPermissions = DEFAULT_ROLES.find((role) => role.name === ROLES.VIEWER)?.permissions

/** 断言抛出的确实是 `notFound()` 标记。 */
function expectNotFound(fn: () => unknown): void {
  let thrown: unknown
  try {
    fn()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeDefined()
  expect((thrown as { isNotFound?: boolean }).isNotFound).toBe(true)
}

function rawSession(): Parameters<typeof toSessionInfo>[0] {
  return {
    user: {
      id: 'u_1',
      name: 'woods',
      email: 'woods@example.com',
      emailVerified: true,
      image: null,
      role: 'user',
    },
    session: { token: 't_1' },
  } as Parameters<typeof toSessionInfo>[0]
}

describe('管理台权限门禁', () => {
  it('持 admin.* 的 editor 能通过管理台门禁', () => {
    expect(editorPermissions).toBeDefined()
    expect(() => assertAdminAccess(editorPermissions)).not.toThrow()
  })

  it('只有 user 角色的用户被 notFound', () => {
    expectNotFound(() => assertAdminAccess([]))
    expectNotFound(() => assertAdminAccess(undefined))
  })

  it('只读审计员同样持有 admin.* 权限，可以进入管理台', () => {
    expect(() => assertAdminAccess(viewerPermissions)).not.toThrow()
  })

  it('super_admin 的 * 覆盖 admin.*', () => {
    expect(() => assertAdminAccess(['*'])).not.toThrow()
  })

  it('非 admin 前缀的业务权限（如 payments.refund）不算管理台入口', () => {
    expectNotFound(() => assertAdminAccess(['payments.refund']))
  })

  it('admin 精确匹配目标权限；editor 读不到设置', () => {
    const adminPermissions =
      DEFAULT_ROLES.find((role) => role.name === ROLES.ADMIN)?.permissions ?? []
    expect(matchPermission('admin.settings.read', adminPermissions)).toBe(true)
    expect(matchPermission('admin.settings.read', editorPermissions ?? [])).toBe(false)
  })
})

describe('fetchSession 的权限点', () => {
  it('fetchSession 返回权限点列表', () => {
    const info = toSessionInfo(rawSession(), ['admin.users.read', 'admin.orders.read'])
    expect(info.permissions).toEqual(['admin.users.read', 'admin.orders.read'])
    expect(info.user.role).toBe('user')
  })

  it('读取权限点失败时返回空数组而不是抛错', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const permissions = await resolveSessionPermissions('u_1', async () => {
      throw new Error('database unavailable')
    })
    expect(permissions).toEqual([])
    expect(console.warn).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('读取成功时原样返回权限点，不走空数组兜底', async () => {
    const permissions = await resolveSessionPermissions('u_1', async () => ['admin.users.read'])
    expect(permissions).toEqual(['admin.users.read'])
  })
})

describe('用户中心功能开关', () => {
  it('关闭时抛 notFound', () => {
    const config: WebsiteConfig = {
      ...baseConfig,
      userFeatures: { ...baseConfig.userFeatures, apiKeys: false },
    }
    expectNotFound(() => assertUserFeatureEnabled('apiKeys', config))
  })

  it('开启时不抛错', () => {
    expect(() => assertUserFeatureEnabled('apiKeys', baseConfig)).not.toThrow()
  })
})

describe('features 已从站点配置移除', () => {
  it('WebsiteConfig 与注册表都不再携带 features', () => {
    const config = createWebsiteConfig(parsePublicEnv({}))
    expect('features' in config).toBe(false)
    expect('features' in baseConfig).toBe(false)
    expect(SETTING_FIELDS.some((field) => field.key.startsWith('features.'))).toBe(false)
  })
})
