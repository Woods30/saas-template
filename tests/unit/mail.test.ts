import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock server-context ALS
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Mock @react-email/render (used in renderTemplate)
// ---------------------------------------------------------------------------
vi.mock('@react-email/render', () => ({
  render: vi.fn().mockResolvedValue('<html><body>test</body></html>'),
}))

// ---------------------------------------------------------------------------
// Module under test — import after mocks
// ---------------------------------------------------------------------------
import { getMailProvider, sendMail } from '@/mail'
import { CloudflareEmailProvider } from '@/mail/provider/cloudflare'

// ---------------------------------------------------------------------------
// Subject localization
// ---------------------------------------------------------------------------
describe('Subject localization', () => {
  it('verifyEmail has zh/en subjects', async () => {
    const { renderTemplate } = await import('@/mail/render')
    const zhResult = await renderTemplate({
      to: 'test@example.com',
      template: 'verifyEmail',
      locale: 'zh',
      context: { username: 'Alice', actionUrl: 'https://example.com/verify' },
    })
    expect(zhResult.subject).toBe('验证你的邮箱')

    const enResult = await renderTemplate({
      to: 'test@example.com',
      template: 'verifyEmail',
      locale: 'en',
      context: { username: 'Alice', actionUrl: 'https://example.com/verify' },
    })
    expect(enResult.subject).toBe('Verify your email')
  })

  it('forgotPassword has zh/en subjects', async () => {
    const { renderTemplate } = await import('@/mail/render')
    const zhResult = await renderTemplate({
      to: 'test@example.com',
      template: 'forgotPassword',
      locale: 'zh',
      context: { username: 'Bob', actionUrl: 'https://example.com/reset' },
    })
    expect(zhResult.subject).toBe('重置密码')

    const enResult = await renderTemplate({
      to: 'test@example.com',
      template: 'forgotPassword',
      locale: 'en',
      context: { username: 'Bob', actionUrl: 'https://example.com/reset' },
    })
    expect(enResult.subject).toBe('Reset your password')
  })

  it('contactMessage has zh/en subjects', async () => {
    const { renderTemplate } = await import('@/mail/render')
    const zhResult = await renderTemplate({
      to: 'test@example.com',
      template: 'contactMessage',
      locale: 'zh',
      context: {
        fromName: 'Charlie',
        fromEmail: 'c@example.com',
        subject: 'Hello',
        message: 'Hi there',
      },
    })
    expect(zhResult.subject).toBe('新的联系消息')

    const enResult = await renderTemplate({
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
    expect(enResult.subject).toBe('New contact message')
  })
})

// ---------------------------------------------------------------------------
// renderTemplate produces HTML
// ---------------------------------------------------------------------------
describe('renderTemplate', () => {
  it('returns html string', async () => {
    const { renderTemplate } = await import('@/mail/render')
    const result = await renderTemplate({
      to: 'test@example.com',
      template: 'verifyEmail',
      locale: 'zh',
      context: { username: 'Alice', actionUrl: 'https://example.com/verify' },
    })
    expect(typeof result.html).toBe('string')
    expect(result.html.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// sendMail with mock provider
// ---------------------------------------------------------------------------
describe('sendMail', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockMailProviderRegistry)) {
      delete mockMailProviderRegistry[key]
    }
  })

  it('sends via registered provider', async () => {
    const mockProvider = {
      getProviderName: () => 'mock',
      sendTemplate: vi
        .fn<() => Promise<{ ok: boolean; id?: string; error?: string }>>()
        .mockResolvedValue({ ok: true, id: 'msg-123' }),
    }
    mockMailProviderRegistry.mock = () => mockProvider

    const result = await sendMail('mock' as 'cloudflare' | 'resend', {
      to: 'test@example.com',
      template: 'verifyEmail',
      locale: 'zh',
      context: { username: 'Alice', actionUrl: 'https://example.com/verify' },
    })

    expect(result.ok).toBe(true)
    expect(result.id).toBe('msg-123')
    expect(mockProvider.sendTemplate).toHaveBeenCalledTimes(1)
  })

  it('retries on failure, succeeds on third attempt', async () => {
    const mockProvider = {
      getProviderName: () => 'retry-mock',
      sendTemplate: vi
        .fn<() => Promise<{ ok: boolean; id?: string; error?: string }>>()
        .mockResolvedValueOnce({ ok: false, error: 'fail 1' })
        .mockResolvedValueOnce({ ok: false, error: 'fail 2' })
        .mockResolvedValueOnce({ ok: true, id: 'msg-ok' }),
    }
    mockMailProviderRegistry['retry-mock'] = () => mockProvider

    const result = await sendMail('retry-mock' as 'cloudflare' | 'resend', {
      to: 'test@example.com',
      template: 'verifyEmail',
      locale: 'zh',
      context: { username: 'Alice', actionUrl: 'https://example.com/verify' },
    })

    expect(result.ok).toBe(true)
    expect(result.id).toBe('msg-ok')
    expect(mockProvider.sendTemplate).toHaveBeenCalledTimes(3)
  })

  it('returns error after 3 failures', async () => {
    const mockProvider = {
      getProviderName: () => 'always-fail',
      sendTemplate: vi
        .fn<() => Promise<{ ok: boolean; id?: string; error?: string }>>()
        .mockResolvedValue({ ok: false, error: 'permanent failure' }),
    }
    mockMailProviderRegistry['always-fail'] = () => mockProvider

    const result = await sendMail('always-fail' as 'cloudflare' | 'resend', {
      to: 'test@example.com',
      template: 'verifyEmail',
      locale: 'zh',
      context: { username: 'Alice', actionUrl: 'https://example.com/verify' },
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('permanent failure')
    expect(mockProvider.sendTemplate).toHaveBeenCalledTimes(3)
  })

  it('throws when provider not registered', () => {
    expect(() => getMailProvider('nonexistent' as 'cloudflare' | 'resend')).toThrow(
      'Mail provider 未注册',
    )
  })
})

// ---------------------------------------------------------------------------
// CloudflareEmailProvider — EmailMessage construction
// ---------------------------------------------------------------------------
describe('CloudflareEmailProvider', () => {
  it('calls binding.send with EmailMessageBuilder(from, to, subject, html)', async () => {
    let capturedMsg: { from: string; to: string; subject: string; html: string } | undefined
    const fakeSend = vi
      .fn()
      .mockImplementation(
        async (msg: { from: string; to: string; subject: string; html: string }) => {
          capturedMsg = { from: msg.from, to: msg.to, subject: msg.subject, html: msg.html }
          return { messageId: 'cf-123' }
        },
      )
    // biome-ignore lint/suspicious/noExplicitAny: fake binding matches SendEmail interface shape
    const fakeBinding = { send: fakeSend } as any

    const provider = new CloudflareEmailProvider(fakeBinding, 'noreply@example.com')

    const result = await provider.sendTemplate({
      to: 'user@example.com',
      template: 'verifyEmail',
      locale: 'zh',
      context: { username: 'Alice', actionUrl: 'https://example.com/verify' },
      fromAddress: 'custom@example.com',
    })

    expect(result.ok).toBe(true)
    expect(result.id).toBe('cf-123')
    expect(fakeSend).toHaveBeenCalledTimes(1)
    expect(capturedMsg?.from).toBe('custom@example.com')
    expect(capturedMsg?.to).toBe('user@example.com')
    expect(capturedMsg?.subject).toBe('验证你的邮箱')
    expect(typeof capturedMsg?.html).toBe('string')
  })

  it('returns error when binding.send throws', async () => {
    const fakeBinding = {
      send: vi.fn<() => Promise<never>>().mockRejectedValue(new Error('binding error')),
    }

    const provider = new CloudflareEmailProvider(fakeBinding as never, 'noreply@example.com')

    const result = await provider.sendTemplate({
      to: 'user@example.com',
      template: 'verifyEmail',
      locale: 'zh',
      context: { username: 'Alice', actionUrl: 'https://example.com/verify' },
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('binding error')
  })
})
