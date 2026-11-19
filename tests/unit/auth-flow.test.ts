import { describe, expect, it, vi } from 'vitest'
import {
  baseConfig,
  createWebsiteConfig,
  setResolvedConfig,
  type WebsiteConfig,
  websiteConfig,
} from '@/config/website'
import { emailPasswordEnabled, requiresEmailVerification, signUpOutcome } from '@/core/auth/flow'
import { resetSettingsCache, saveSettingsTab } from '@/core/config/service'

// 认证页 `beforeLoad` 会调 server function；测试环境没有 TanStack Start 请求上下文。
// 可见性本身在 `auth-providers.test.ts` 覆盖，这里只关心页面不再被模块开关拦下。
vi.mock('@/core/auth/providers', () => ({
  fetchAuthProviderAvailability: async () => ({ email: true, google: true, github: true }),
}))

/**
 * 注册流程的两个派生判定。邮箱验证是安全控制而非邮件开关，必须由显式配置
 * `auth.requireEmailVerification` 决定；随 `mail.enabled` 隐式降级会让「没配邮件」
 * 变成「任何人都能拿别人的邮箱注册」。
 */
function config(overrides: {
  requireEmailVerification?: boolean
  mailEnabled?: boolean
}): WebsiteConfig {
  const base = createWebsiteConfig({ VITE_BASE_URL: 'https://example.com' })
  return {
    ...base,
    mail: { enabled: overrides.mailEnabled ?? false, provider: 'resend', supportEmail: '' },
    auth: {
      ...base.auth,
      requireEmailVerification: overrides.requireEmailVerification ?? true,
    },
  }
}

describe('requiresEmailVerification', () => {
  it('读取显式配置，而非 mail.enabled', () => {
    expect(requiresEmailVerification(config({ requireEmailVerification: true }))).toBe(true)
    expect(requiresEmailVerification(config({ requireEmailVerification: false }))).toBe(false)
  })

  it('邮件未配置时仍要求验证（不得隐式降级）', () => {
    expect(
      requiresEmailVerification(config({ requireEmailVerification: true, mailEnabled: false })),
    ).toBe(true)
  })

  it('显式关闭验证时即使邮件可用也不要求', () => {
    expect(
      requiresEmailVerification(config({ requireEmailVerification: false, mailEnabled: true })),
    ).toBe(false)
  })

  it('站点默认要求邮箱验证', () => {
    expect(requiresEmailVerification()).toBe(true)
  })
})

describe('signUpOutcome', () => {
  it('要求验证时等待验证：注册成功不等于可登录', () => {
    expect(signUpOutcome(config({ requireEmailVerification: true }))).toBe('awaiting_verification')
  })

  it('显式关闭验证时直接登录：better-auth 会自动下发会话，页面应跳首页', () => {
    expect(signUpOutcome(config({ requireEmailVerification: false }))).toBe('signed_in')
  })
})

describe('emailPasswordEnabled', () => {
  it('跟随 auth.emailEnabled，与 better-auth 的注册条件同源', () => {
    const enabled = config({})
    expect(
      emailPasswordEnabled({ ...enabled, auth: { ...enabled.auth, emailEnabled: true } }),
    ).toBe(true)
    expect(
      emailPasswordEnabled({ ...enabled, auth: { ...enabled.auth, emailEnabled: false } }),
    ).toBe(false)
  })
})

describe('saveSettingsTab — auth', () => {
  it('三种登录全关时保存被拒绝', async () => {
    setResolvedConfig(baseConfig)
    resetSettingsCache()
    await expect(
      saveSettingsTab({} as never, 'auth', {
        'auth.emailEnabled': false,
        'auth.googleEnabled': false,
        'auth.githubEnabled': false,
      }),
    ).rejects.toMatchObject({
      name: 'SettingsValidationError',
      field: 'auth',
      reason: '至少保留一种登录方式',
    })
  })
})

describe('认证页面不再依赖模块开关', () => {
  it('认证页面不再因 modules.auth 关闭而 404', async () => {
    const modules = await Promise.all([
      import('@/routes/{-$locale}/auth/login'),
      import('@/routes/{-$locale}/auth/register'),
      import('@/routes/{-$locale}/auth/forgot-password'),
      import('@/routes/{-$locale}/auth/reset-password'),
      import('@/routes/{-$locale}/auth/verify-email'),
      import('@/routes/{-$locale}/auth/error'),
    ])
    for (const mod of modules) {
      const beforeLoad = (mod.Route as { options: { beforeLoad?: () => unknown } }).options
        .beforeLoad
      if (beforeLoad) await expect(Promise.resolve().then(beforeLoad)).resolves.not.toThrow()
    }
    // `auth.enabled` 已删除：页面没有可依赖的模块总闸。
    expect(Object.keys(websiteConfig.auth)).not.toContain('enabled')
  })
})
