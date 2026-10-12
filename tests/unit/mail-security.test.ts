import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock server-context ALS
// ---------------------------------------------------------------------------
const mockMailProviderRegistry: Record<string, (() => object) | undefined> = {}

vi.mock('@/lib/server-context', () => ({
  getServerContext: () => ({
    env: {
      // Default env for these tests; overridden per-test as needed.
    },
  }),
  als: {
    getStore: () => ({
      mailProviderRegistry: mockMailProviderRegistry,
    }),
  },
}))

// ---------------------------------------------------------------------------
// Mock @react-email/render
// ---------------------------------------------------------------------------
vi.mock('@react-email/render', () => ({
  render: vi.fn().mockResolvedValue('<html><body>test</body></html>'),
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------
import { ZodError } from 'zod'
import { renderTemplate } from '@/mail/render'

// ---------------------------------------------------------------------------
// Finding 3: Context validation — renderTemplate rejects invalid context
// ---------------------------------------------------------------------------
describe('renderTemplate context validation', () => {
  describe('verifyEmail', () => {
    it('throws when context has extra field', async () => {
      await expect(
        renderTemplate({
          to: 'test@example.com',
          template: 'verifyEmail',
          locale: 'zh',
          // intentionally inject extra field to test strict() rejection
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
          // intentionally inject extra field to test strict() rejection
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

    it('throws when fromEmail is not an email in contactMessage', async () => {
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
})

// ---------------------------------------------------------------------------
// Finding 2: Sensitive data redaction in error messages
// ---------------------------------------------------------------------------
describe('Sensitive data redaction in provider errors', () => {
  it('Resend provider returns first line of error only', async () => {
    // Verify that the resend provider strips multi-line errors
    const { ResendMailProvider } = await import('@/mail/provider/resend')
    const fakeClient = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: {
            message:
              'API key invalid\nFull payload: to=user@example.com subject=secret\nstack: ...',
          },
        }),
      },
    }
    // @ts-expect-error mock partial client
    const provider = new ResendMailProvider(fakeClient, 'noreply@example.com')

    const result = await provider.sendTemplate({
      to: 'user@example.com',
      template: 'verifyEmail',
      locale: 'zh',
      context: { username: 'Alice', actionUrl: 'https://example.com/verify' },
    })

    expect(result.ok).toBe(false)
    // Must NOT contain the payload or subject
    expect(result.error).not.toContain('user@example.com')
    expect(result.error).not.toContain('secret')
    // Must be a single-line safe string
    expect(result.error?.split('\n')).toHaveLength(1)
  })
})
