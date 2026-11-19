import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getSettingsNav } from '@/config/settings-nav'
import { baseConfig, createWebsiteConfig } from '@/config/website'
import { runUserCreatedHooks } from '@/core/auth/user-hooks'
import type { DB } from '@/core/db'
import { parsePublicEnv } from '@/core/env/public'
import { registerSignupSideEffects } from '@/modules/rbac/signup'
import { createTestDatabase, seedUser } from '../helpers/database'

/**
 * 注册后置动作：默认 RBAC 角色与注册赠积分。
 *
 * `registerSignupSideEffects` 把动作注册进 `core/auth/user-hooks` 的钩子表；
 * better-auth 的 `databaseHooks.user.create.after` 之后调用 `runUserCreatedHooks`。
 * 这里直接驱动钩子，绕开需要请求上下文的注册端点。
 *
 * `user` 是**无后台角色**：它是本次重构新增的默认值，绝不能被当作 viewer——
 * viewer 持有全部 `admin.*.read`，默认授予等于把管理台开给每个注册用户。
 */

beforeAll(() => {
  // 幂等：重复调用只注册一次。
  registerSignupSideEffects()
  registerSignupSideEffects()
})

/** 记录出厂值，逐例还原——钩子在执行时读 `websiteConfig`，用例之间必须隔离。 */
const originalDefaultRole = baseConfig.users.defaultRole
const originalSignupCredits = { ...baseConfig.users.signupCredits }

afterEach(() => {
  baseConfig.users.defaultRole = originalDefaultRole
  baseConfig.users.signupCredits = { ...originalSignupCredits }
})

async function runSignup(db: DB, id: string): Promise<void> {
  await runUserCreatedHooks({ db, user: { id, email: `${id}@example.com` } })
}

/** 该用户绑定的角色名（按名字排序，便于断言）。 */
function roleNamesOf(sqlite: DatabaseSync, userId: string): string[] {
  const rows = sqlite
    .prepare(
      'SELECT r.name AS name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? ORDER BY r.name',
    )
    .all(userId) as Array<{ name: string }>
  return rows.map((row) => row.name)
}

function balanceOf(sqlite: DatabaseSync, userId: string): number {
  const row = sqlite.prepare('SELECT balance FROM credit_balances WHERE user_id = ?').get(userId) as
    | { balance: number }
    | undefined
  return row?.balance ?? 0
}

function transactionCount(sqlite: DatabaseSync, userId: string): number {
  const row = sqlite
    .prepare('SELECT COUNT(*) AS n FROM credit_transactions WHERE user_id = ?')
    .get(userId) as { n: number }
  return row.n
}

describe('注册默认角色', () => {
  it('默认角色为 viewer 时分配 viewer', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u_viewer')
    baseConfig.users.defaultRole = 'viewer'

    await runSignup(db, 'u_viewer')

    expect(roleNamesOf(sqlite, 'u_viewer')).toEqual(['viewer'])
  })

  it('默认角色为 editor 时分配 editor', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u_editor')
    baseConfig.users.defaultRole = 'editor'

    await runSignup(db, 'u_editor')

    expect(roleNamesOf(sqlite, 'u_editor')).toEqual(['editor'])
  })

  it('默认角色为普通用户时不分配任何角色', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u_plain')
    baseConfig.users.defaultRole = 'user'

    await runSignup(db, 'u_plain')

    expect(roleNamesOf(sqlite, 'u_plain')).toEqual([])
    const row = sqlite.prepare('SELECT role FROM users WHERE id = ?').get('u_plain') as {
      role: string
    }
    expect(row.role).toBe('user')
  })
})

describe('注册赠积分', () => {
  it('注册赠积分开启（amount>0）时发放一次', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u_bonus')
    baseConfig.users.defaultRole = 'user'
    baseConfig.users.signupCredits = { enabled: true, amount: 30, validDays: 0, description: '' }

    await runSignup(db, 'u_bonus')

    expect(balanceOf(sqlite, 'u_bonus')).toBe(30)
    expect(transactionCount(sqlite, 'u_bonus')).toBe(1)
  })

  it('同一用户重跑钩子不重复发放（幂等键）', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u_idem')
    baseConfig.users.defaultRole = 'user'
    baseConfig.users.signupCredits = { enabled: true, amount: 30, validDays: 0, description: '' }

    await runSignup(db, 'u_idem')
    await runSignup(db, 'u_idem')

    expect(balanceOf(sqlite, 'u_idem')).toBe(30)
    expect(transactionCount(sqlite, 'u_idem')).toBe(1)
  })

  it('赠积分关闭时不写任何流水', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u_off')
    baseConfig.users.defaultRole = 'user'
    baseConfig.users.signupCredits = { enabled: false, amount: 100, validDays: 0, description: '' }

    await runSignup(db, 'u_off')

    expect(balanceOf(sqlite, 'u_off')).toBe(0)
    expect(transactionCount(sqlite, 'u_off')).toBe(0)
  })

  it('amount 为 0 时也不写流水', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u_zero')
    baseConfig.users.defaultRole = 'user'
    baseConfig.users.signupCredits = { enabled: true, amount: 0, validDays: 0, description: '' }

    await runSignup(db, 'u_zero')

    expect(balanceOf(sqlite, 'u_zero')).toBe(0)
    expect(transactionCount(sqlite, 'u_zero')).toBe(0)
  })
})

describe('个人中心功能开关可见性', () => {
  it('userFeatures 关闭时个人中心入口不可见', () => {
    const config = createWebsiteConfig(parsePublicEnv({}))
    const gated = {
      ...config,
      // 模块都开着：能挡下入口的只应是 feature 开关。
      payment: { ...config.payment, enabled: true },
      manualPayments: { ...config.manualPayments, enabled: true },
      newsletter: { ...config.newsletter, enabled: true },
      userFeatures: {
        billing: false,
        manualPayments: false,
        apiKeys: false,
        notifications: false,
      },
    }

    const ids = getSettingsNav(gated).map((item) => item.id)
    expect(ids).not.toContain('billing')
    expect(ids).not.toContain('manual-payments')
    expect(ids).not.toContain('api-keys')
    expect(ids).not.toContain('notifications')
  })

  it('模块关闭时入口同样不可见（feature 开着也不行）', () => {
    const config = createWebsiteConfig(parsePublicEnv({}))
    const gated = {
      ...config,
      payment: { ...config.payment, enabled: false },
      manualPayments: { ...config.manualPayments, enabled: false },
      newsletter: { ...config.newsletter, enabled: false },
      userFeatures: {
        billing: true,
        manualPayments: true,
        apiKeys: true,
        notifications: true,
      },
    }

    const ids = getSettingsNav(gated).map((item) => item.id)
    expect(ids).not.toContain('billing')
    expect(ids).not.toContain('manual-payments')
    expect(ids).not.toContain('notifications')
    // api-keys 没有模块开关，只要 feature 开着就在。
    expect(ids).toContain('api-keys')
  })
})
