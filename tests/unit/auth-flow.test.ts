import { describe, expect, it } from 'vitest'
import { requiresEmailVerification, signUpOutcome } from '@/auth/flow'
import { createWebsiteConfig, type WebsiteConfig } from '@/config/website'

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

  it('默认取站点单例配置，且默认不要求验证（开箱即用的邮箱密码路径必须可用）', () => {
    expect(requiresEmailVerification()).toBe(false)
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
