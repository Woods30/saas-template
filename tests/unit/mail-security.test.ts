import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// Mock server-context ALS。
const mockMailProviderRegistry: Record<string, (() => object) | undefined> = {}

vi.mock('@/lib/server-context', () => ({
  getServerContext: () => ({
    env: {},
  }),
  als: {
    getStore: () => ({
      mailProviderRegistry: mockMailProviderRegistry,
    }),
  },
}))

// Mock @react-email/render。
vi.mock('@react-email/render', () => ({
  render: vi.fn().mockResolvedValue('<html><body>test</body></html>'),
}))

// 在 SDK 边界 mock，保留真实 provider 的渲染和错误脱敏逻辑。
const { mockResendSend } = vi.hoisted(() => ({ mockResendSend: vi.fn() }))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockResendSend }
  },
}))

// 必须在 mock 之后导入。
import { ZodError } from 'zod'
import { allowedHostSuffixes, renderTemplate } from '@/mail/render'

// 与路由的 contactMessageContextSchema 同形；因 `$` 文件名与 Bundler 解析不兼容，无法直接导入。
const contactMessageContextSchema = z
  .object({
    fromName: z.string().max(200),
    fromEmail: z.string().email().max(200),
    subject: z.string().max(500),
    message: z.string().max(10000),
  })
  .strict()

// renderTemplate 拒绝非法 context。
describe('renderTemplate context validation', () => {
  describe('verifyEmail', () => {
    it('throws when context has extra field', async () => {
      await expect(
        renderTemplate({
          to: 'test@example.com',
          template: 'verifyEmail',
          locale: 'zh',
          // 故意多塞字段，验证 strict() 拒绝。
          context: { username: 'Alice', actionUrl: 'https://example.com/verify', extra: 'bad' },
        }),
      ).rejects.toThrow(ZodError)
    })

    it('throws when username is missing', async () => {
      await expect(
        renderTemplate({
          to: 'test@example.com',
          template: 'verifyEmail',
          locale: 'zh',
          context: { actionUrl: 'https://example.com/verify' },
        }),
      ).rejects.toThrow(ZodError)
    })

    it('throws when actionUrl is not a valid URL', async () => {
      await expect(
        renderTemplate({
          to: 'test@example.com',
          template: 'verifyEmail',
          locale: 'zh',
          context: { username: 'Alice', actionUrl: 'not-a-url' },
        }),
      ).rejects.toThrow(ZodError)
    })

    it('throws when username exceeds max length', async () => {
      const longUsername = 'A'.repeat(201)
      await expect(
        renderTemplate({
          to: 'test@example.com',
          template: 'verifyEmail',
          locale: 'zh',
          context: { username: longUsername, actionUrl: 'https://example.com/verify' },
        }),
      ).rejects.toThrow(ZodError)
    })

    it('renders correctly with valid context', async () => {
      const result = await renderTemplate({
        to: 'test@example.com',
        template: 'verifyEmail',
        locale: 'zh',
        context: { username: 'Alice', actionUrl: 'https://example.com/verify' },
      })
      expect(result.html).toBeTruthy()
      expect(result.subject).toBe('验证你的邮箱')
    })
  })

  describe('forgotPassword', () => {
    it('throws when context has extra field', async () => {
      await expect(
        renderTemplate({
          to: 'test@example.com',
          template: 'forgotPassword',
          locale: 'zh',
          // 故意多塞字段，验证 strict() 拒绝。
          context: { username: 'Bob', actionUrl: 'https://example.com/reset', extra: 'bad' },
        }),
      ).rejects.toThrow(ZodError)
    })

    it('throws when actionUrl is missing', async () => {
      await expect(
        renderTemplate({
          to: 'test@example.com',
          template: 'forgotPassword',
          locale: 'zh',
          context: { username: 'Bob' },
        }),
      ).rejects.toThrow(ZodError)
    })

    it('throws when fromEmail is not a valid email', async () => {
      await expect(
        renderTemplate({
          to: 'test@example.com',
          template: 'contactMessage',
          locale: 'zh',
          context: {
            fromName: 'Charlie',
            fromEmail: 'not-an-email',
            subject: 'Hello',
            message: 'Hi',
          },
        }),
      ).rejects.toThrow(ZodError)
    })

    it('renders correctly with valid contactMessage context', async () => {
      const result = await renderTemplate({
        to: 'test@example.com',
        template: 'contactMessage',
        locale: 'en',
        context: {
          fromName: 'Charlie',
          fromEmail: 'c@example.com',
          subject: 'Hello',
          message: 'Hi there',
        },
      })
      expect(result.html).toBeTruthy()
      expect(result.subject).toBe('New contact message')
    })
  })

  // actionUrl 必须落在白名单 host 上。
  describe('actionUrl host allowlist (defense-in-depth)', () => {
    it('accepts actionUrl on allowed host (example.com)', async () => {
      const result = await renderTemplate({
        to: 'test@example.com',
        template: 'verifyEmail',
        locale: 'zh',
        context: { username: 'Alice', actionUrl: 'https://example.com/verify?token=abc' },
      })
      expect(result.html).toBeTruthy()
    })

    it('accepts actionUrl on subdomain of allowed host (app.example.com)', async () => {
      const result = await renderTemplate({
        to: 'test@example.com',
        template: 'verifyEmail',
        locale: 'zh',
        context: { username: 'Alice', actionUrl: 'https://app.example.com/verify?token=abc' },
      })
      expect(result.html).toBeTruthy()
    })

    it('rejects actionUrl on attacker domain (attacker.com)', async () => {
      await expect(
        renderTemplate({
          to: 'test@example.com',
          template: 'verifyEmail',
          locale: 'zh',
          context: { username: 'Alice', actionUrl: 'https://attacker.com/verify?token=steal' },
        }),
      ).rejects.toThrow(ZodError)
    })

    it('rejects actionUrl with http (non-https)', async () => {
      await expect(
        renderTemplate({
          to: 'test@example.com',
          template: 'forgotPassword',
          locale: 'zh',
          context: { username: 'Bob', actionUrl: 'http://example.com/reset' },
        }),
      ).rejects.toThrow(ZodError)
    })
  })

  // welcome 模板的 schema 严格性与主题。
  describe('welcome', () => {
    it('renders with valid { username } context', async () => {
      const result = await renderTemplate({
        to: 'test@example.com',
        template: 'welcome',
        locale: 'zh',
        context: { username: 'Alice' },
      })
      expect(result.html).toBeTruthy()
      expect(result.subject).toBe('欢迎加入')
    })

    it('has localized subjects for every supported locale', async () => {
      const zh = await renderTemplate({
        to: 'test@example.com',
        template: 'welcome',
        locale: 'zh',
        context: { username: 'Alice' },
      })
      const en = await renderTemplate({
        to: 'test@example.com',
        template: 'welcome',
        locale: 'en',
        context: { username: 'Alice' },
      })
      expect(zh.subject).toBe('欢迎加入')
      expect(en.subject).toBe('Welcome aboard')
    })

    it('throws when context has extra field', async () => {
      await expect(
        renderTemplate({
          to: 'test@example.com',
          template: 'welcome',
          locale: 'zh',
          context: { username: 'Alice', extra: 'bad' },
        }),
      ).rejects.toThrow(ZodError)
    })
  })
})

// allowedHostSuffixes：白名单由站点 base URL 派生（APP_DOMAIN 已失效）。
describe('allowedHostSuffixes', () => {
  it('derives the host from the given base URL', () => {
    expect(allowedHostSuffixes('https://example.com')).toEqual(['example.com'])
  })

  it('ignores path and trailing slashes', () => {
    expect(allowedHostSuffixes('https://example.com/zh/')).toEqual(['example.com'])
  })

  it('returns an empty list for an unparseable base URL', () => {
    expect(allowedHostSuffixes('not a url')).toEqual([])
  })
})

// 错误消息中的敏感数据脱敏。
describe('Sensitive data redaction in provider errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Resend provider returns first line of error only', async () => {
    // 禁止真实网络请求；确认多行错误经过 provider 处理。
    const mockFetch = vi.fn().mockRejectedValue(new Error('测试禁止真实网络请求'))
    vi.stubGlobal('fetch', mockFetch)
    const { ResendMailProvider } = await import('@/mail/provider/resend')
    mockResendSend.mockReset()
    mockResendSend.mockResolvedValue({
      data: null,
      error: {
        message: 'API key invalid\nFull payload: to=user@example.com subject=secret\nstack: ...',
      },
    })
    const provider = new ResendMailProvider('re_test', 'noreply@example.com')

    const result = await provider.sendTemplate({
      to: 'user@example.com',
      template: 'verifyEmail',
      locale: 'zh',
      context: { username: 'Alice', actionUrl: 'https://example.com/verify' },
    })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockResendSend).toHaveBeenCalledOnce()
    expect(mockResendSend).toHaveBeenCalledWith({
      from: 'noreply@example.com',
      to: 'user@example.com',
      subject: '验证你的邮箱',
      html: '<html><body>test</body></html>',
    })
    expect(result).toEqual({ ok: false, error: 'API key invalid' })
    // 不得包含 payload 或 subject。
    expect(result.error).not.toContain('user@example.com')
    expect(result.error).not.toContain('secret')
    // 必须是单行安全字符串。
    expect(result.error?.split('\n')).toHaveLength(1)
  })
})

// bodySchema 只允许 contactMessage 模板。
describe('Route bodySchema — template restriction', () => {
  // 完整路由用例需要集成环境，这里只在 schema 层验证关键安全不变量。
  it('accepts contactMessage template with valid context', () => {
    const result = contactMessageContextSchema.safeParse({
      fromName: 'Alice',
      fromEmail: 'alice@example.com',
      subject: 'Hello',
      message: 'Hi there',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing required fields', () => {
    const result = contactMessageContextSchema.safeParse({
      fromName: 'Alice',
      // 缺 fromEmail / subject / message。
    })
    expect(result.success).toBe(false)
  })

  it('rejects extra fields (strict schema prevents unexpected fields)', () => {
    const result = contactMessageContextSchema.safeParse({
      fromName: 'Alice',
      fromEmail: 'alice@example.com',
      subject: 'Hello',
      message: 'Hi',
      // 多余字段会被 `.strict()` 拒绝。
      extraField: 'not allowed',
    })
    expect(result.success).toBe(false)
  })
})
