import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendAuthEmail, sendAuthEmailForRequest } from '@/auth/emails'
import type { WebsiteConfig } from '@/config/website'
import { createWebsiteConfig } from '@/config/website'
import type { ServerEnv } from '@/env/server'
import type { SendTemplateParams } from '@/mail/types'

/**
 * `src/auth/emails.ts` 的单测。
 *
 * 该模块是 better-auth 回调与 mail registry 之间的唯一桥梁，因此必须：
 * - 依赖注入（`sendMail` / `config` / `serverEnv` 由调用方传入），无需 ALS 即可测；
 * - 邮件关闭或发件人缺失时**不发送**并返回 `{ ok: false }`，绝不让调用方（注册 / 登录）
 *   因为邮件问题而失败；
 * - 把模板名、收件人、语言、发件人原样传给 mail registry。
 */

const sendMailMock =
  vi.fn<(...args: [string, SendTemplateParams]) => Promise<{ ok: boolean; error?: string }>>()

function makeConfig(overrides: Partial<WebsiteConfig> = {}): WebsiteConfig {
  return { ...createWebsiteConfig({ VITE_BASE_URL: 'https://example.com' }), ...overrides }
}

const mailEnabledConfig = makeConfig({
  mail: { enabled: true, provider: 'resend', supportEmail: 'support@example.com' },
})

const env: ServerEnv = { MAIL_FROM: 'noreply@example.com', RESEND_API_KEY: 're_test' } as ServerEnv

const deps = {
  sendMail: sendMailMock as never,
  config: mailEnabledConfig,
  serverEnv: env,
}

describe('sendAuthEmail', () => {
  it('verifyEmail：把模板、收件人、语言与发件人原样传给 mail registry', async () => {
    sendMailMock.mockReset()
    sendMailMock.mockResolvedValue({ ok: true })

    const result = await sendAuthEmail(
      {
        kind: 'verifyEmail',
        to: 'user@example.com',
        username: 'Alice',
        actionUrl: 'https://example.com/api/auth/verify-email?token=abc',
        locale: 'en',
      },
      deps,
    )

    expect(result.ok).toBe(true)
    expect(sendMailMock).toHaveBeenCalledOnce()
    expect(sendMailMock).toHaveBeenCalledWith('resend', {
      to: 'user@example.com',
      template: 'verifyEmail',
      locale: 'en',
      fromAddress: 'noreply@example.com',
      context: {
        username: 'Alice',
        actionUrl: 'https://example.com/api/auth/verify-email?token=abc',
      },
    })
  })

  it('forgotPassword：模板名为 forgotPassword，携带 actionUrl', async () => {
    sendMailMock.mockReset()
    sendMailMock.mockResolvedValue({ ok: true })

    await sendAuthEmail(
      {
        kind: 'forgotPassword',
        to: 'user@example.com',
        username: 'Bob',
        actionUrl: 'https://example.com/api/auth/reset-password/xyz',
        locale: 'zh',
      },
      deps,
    )

    expect(sendMailMock).toHaveBeenCalledWith(
      'resend',
      expect.objectContaining({
        template: 'forgotPassword',
        locale: 'zh',
        context: { username: 'Bob', actionUrl: 'https://example.com/api/auth/reset-password/xyz' },
      }),
    )
  })

  it('welcome：上下文只有 username，不含 actionUrl', async () => {
    sendMailMock.mockReset()
    sendMailMock.mockResolvedValue({ ok: true })

    await sendAuthEmail(
      { kind: 'welcome', to: 'user@example.com', username: 'Alice', locale: 'zh' },
      deps,
    )

    expect(sendMailMock).toHaveBeenCalledWith(
      'resend',
      expect.objectContaining({
        template: 'welcome',
        locale: 'zh',
        context: { username: 'Alice' },
      }),
    )
  })

  it('邮件模块关闭时不发送，返回 ok=false', async () => {
    sendMailMock.mockReset()
    const config = makeConfig({
      mail: { enabled: false, provider: 'resend', supportEmail: '' },
    })

    const result = await sendAuthEmail(
      { kind: 'welcome', to: 'user@example.com', username: 'Alice', locale: 'zh' },
      { ...deps, config },
    )

    expect(result.ok).toBe(false)
    expect(sendMailMock).not.toHaveBeenCalled()
  })

  it('发件人未配置时不发送，返回 ok=false', async () => {
    sendMailMock.mockReset()
    const result = await sendAuthEmail(
      { kind: 'welcome', to: 'user@example.com', username: 'Alice', locale: 'zh' },
      { ...deps, serverEnv: {} as ServerEnv },
    )

    expect(result.ok).toBe(false)
    expect(sendMailMock).not.toHaveBeenCalled()
  })

  it('provider 返回失败时透传错误信息，不抛出', async () => {
    sendMailMock.mockReset()
    sendMailMock.mockResolvedValue({ ok: false, error: 'smtp down' })

    const result = await sendAuthEmail(
      { kind: 'welcome', to: 'user@example.com', username: 'Alice', locale: 'zh' },
      deps,
    )

    expect(result.ok).toBe(false)
    expect(result.error).toBe('smtp down')
  })

  it('provider 抛异常时捕获并返回 ok=false，不向上抛（否则注册 / 登录会失败）', async () => {
    sendMailMock.mockReset()
    sendMailMock.mockRejectedValue(new Error('boom'))

    const result = await sendAuthEmail(
      { kind: 'welcome', to: 'user@example.com', username: 'Alice', locale: 'zh' },
      deps,
    )

    expect(result.ok).toBe(false)
    expect(result.error).toContain('boom')
  })

  it('cloudflare provider 回退到 CLOUDFLARE_EMAIL_SENDER 作为发件人', async () => {
    sendMailMock.mockReset()
    sendMailMock.mockResolvedValue({ ok: true })
    const config = makeConfig({
      mail: { enabled: true, provider: 'cloudflare', supportEmail: 'support@example.com' },
    })

    await sendAuthEmail(
      { kind: 'welcome', to: 'user@example.com', username: 'Alice', locale: 'zh' },
      {
        ...deps,
        config,
        serverEnv: { CLOUDFLARE_EMAIL_SENDER: 'cf@example.com' } as ServerEnv,
      },
    )

    expect(sendMailMock).toHaveBeenCalledWith(
      'cloudflare',
      expect.objectContaining({ fromAddress: 'cf@example.com' }),
    )
  })
})

/**
 * `sendAuthEmailForRequest`：better-auth 回调的入口形态。
 *
 * 回调拿不到 ALS，但能从 better-auth 传入的 `Request` 解析语言，因此这里验证
 * 「语言从请求推导」与「请求缺失时回退默认语言」两条路径。
 */
describe('sendAuthEmailForRequest', () => {
  afterEach(() => {
    sendMailMock.mockReset()
  })

  it('从请求的 URL 前缀解析语言', async () => {
    sendMailMock.mockResolvedValue({ ok: true })
    const request = new Request('https://example.com/en/api/auth/sign-up/email')

    await sendAuthEmailForRequest(
      { kind: 'welcome', to: 'user@example.com', username: 'Alice' },
      request,
      deps,
    )

    expect(sendMailMock).toHaveBeenCalledWith('resend', expect.objectContaining({ locale: 'en' }))
  })

  it('从请求的 cookie 解析语言（URL 无前缀时）', async () => {
    sendMailMock.mockResolvedValue({ ok: true })
    const request = new Request('https://example.com/api/auth/sign-up/email', {
      headers: { cookie: 'NEXT_LOCALE=en' },
    })

    await sendAuthEmailForRequest(
      { kind: 'welcome', to: 'user@example.com', username: 'Alice' },
      request,
      deps,
    )

    expect(sendMailMock).toHaveBeenCalledWith('resend', expect.objectContaining({ locale: 'en' }))
  })

  it('无法解析时回退默认语言 zh', async () => {
    sendMailMock.mockResolvedValue({ ok: true })
    const request = new Request('https://example.com/api/auth/sign-up/email', {
      headers: { cookie: 'NEXT_LOCALE=fr' },
    })

    await sendAuthEmailForRequest(
      { kind: 'welcome', to: 'user@example.com', username: 'Alice' },
      request,
      deps,
    )

    expect(sendMailMock).toHaveBeenCalledWith('resend', expect.objectContaining({ locale: 'zh' }))
  })

  it('请求为 undefined 时回退默认语言 zh', async () => {
    sendMailMock.mockResolvedValue({ ok: true })

    await sendAuthEmailForRequest(
      { kind: 'welcome', to: 'user@example.com', username: 'Alice' },
      undefined,
      deps,
    )

    expect(sendMailMock).toHaveBeenCalledWith('resend', expect.objectContaining({ locale: 'zh' }))
  })
})
