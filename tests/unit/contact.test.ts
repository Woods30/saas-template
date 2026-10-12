import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mock factories — must be at module top level so vi.mock hoisting
// can reference them inside the factory functions.
// ---------------------------------------------------------------------------
const mockMailProviderRegistry: Record<string, (() => object) | undefined> = {}
const mockNotificationProviderRegistry: Record<string, (() => object) | undefined> = {}
const mockSendTemplate = vi.fn()
const mockNotify = vi.fn()

vi.mock('@/lib/server-context', () => ({
  getServerContext: () => ({
    env: {},
    mailProviderRegistry: mockMailProviderRegistry,
    notificationProviderRegistry: mockNotificationProviderRegistry,
  }),
  als: {
    getStore: () => ({
      mailProviderRegistry: mockMailProviderRegistry,
      notificationProviderRegistry: mockNotificationProviderRegistry,
    }),
  },
}))

vi.mock('@/mail', () => ({
  sendMail: (...args: unknown[]) => mockSendTemplate(...args),
}))

vi.mock('@/notification', () => ({
  notify: (...args: unknown[]) => mockNotify(...args),
}))

import { deliverContactNotification } from '@/contact/notifications'
// ---------------------------------------------------------------------------
// Module under test — import after mocks
// ---------------------------------------------------------------------------
import { type ContactInput, contactSchema } from '@/contact/schema'

// ---------------------------------------------------------------------------
// contactSchema
// ---------------------------------------------------------------------------
describe('contactSchema', () => {
  it('accepts valid input', () => {
    const input = {
      name: '张三',
      fromEmail: 'zhangsan@example.com',
      subject: '测试主题',
      message: '这是一条超过十个字符的测试消息内容。',
    }
    expect(() => contactSchema.parse(input)).not.toThrow()
  })

  it('rejects empty name', () => {
    const input = {
      name: '',
      fromEmail: 'zhangsan@example.com',
      subject: '测试主题',
      message: '这是一条超过十个字符的测试消息内容。',
    }
    expect(() => contactSchema.parse(input)).toThrow()
  })

  it('rejects empty subject', () => {
    const input = {
      name: '张三',
      fromEmail: 'zhangsan@example.com',
      subject: '',
      message: '这是一条超过十个字符的测试消息内容。',
    }
    expect(() => contactSchema.parse(input)).toThrow()
  })

  it('rejects non-email fromEmail', () => {
    const input = {
      name: '张三',
      fromEmail: 'not-an-email',
      subject: '测试主题',
      message: '这是一条超过十个字符的测试消息内容。',
    }
    expect(() => contactSchema.parse(input)).toThrow()
  })

  it('rejects message shorter than 10 characters', () => {
    const input = {
      name: '张三',
      fromEmail: 'zhangsan@example.com',
      subject: '测试主题',
      message: '太短了',
    }
    expect(() => contactSchema.parse(input)).toThrow()
  })

  it('rejects message longer than 5000 characters', () => {
    const input = {
      name: '张三',
      fromEmail: 'zhangsan@example.com',
      subject: '测试主题',
      message: 'a'.repeat(5001),
    }
    expect(() => contactSchema.parse(input)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// deliverContactNotification
// ---------------------------------------------------------------------------
describe('deliverContactNotification', () => {
  const validInput: ContactInput = {
    name: '张三',
    fromEmail: 'zhangsan@example.com',
    subject: '测试主题',
    message: '这是一条超过十个字符的测试消息内容。',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls sendMail with contactMessage template and correct fromName mapping', async () => {
    mockSendTemplate.mockResolvedValue({ ok: true })

    await deliverContactNotification(validInput)

    expect(mockSendTemplate).toHaveBeenCalledWith(
      'cloudflare',
      expect.objectContaining({
        template: 'contactMessage',
        locale: 'zh',
        context: {
          fromName: validInput.name,
          fromEmail: validInput.fromEmail,
          subject: validInput.subject,
          message: validInput.message,
        },
      }),
    )
  })

  it('sendMail failure only logs, does not throw', async () => {
    mockSendTemplate.mockResolvedValue({ ok: false, error: 'SMTP error\ndetails' })
    const warnSpy = vi.spyOn(console, 'warn').mockReturnValue(undefined)

    await expect(deliverContactNotification(validInput)).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[contact]'))
    warnSpy.mockRestore()
  })

  it('does NOT call notify when notification.enable is false', async () => {
    mockSendTemplate.mockResolvedValue({ ok: true })

    await deliverContactNotification(validInput)

    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('calls notify when notification.enable is true', async () => {
    mockSendTemplate.mockResolvedValue({ ok: true })
    mockNotify.mockResolvedValue(true)

    // websiteConfig.notification.enable = true — re-import with mocked config
    vi.resetModules()
    vi.doMock('@/config/website', () => ({
      websiteConfig: {
        mail: { supportEmail: 'support@example.com' },
        notification: { enable: true },
      },
    }))
    vi.doMock('@/lib/server-context', () => ({
      getServerContext: () => ({
        env: {},
        mailProviderRegistry: mockMailProviderRegistry,
        notificationProviderRegistry: mockNotificationProviderRegistry,
      }),
      als: {
        getStore: () => ({
          mailProviderRegistry: mockMailProviderRegistry,
          notificationProviderRegistry: mockNotificationProviderRegistry,
        }),
      },
    }))
    vi.doMock('@/mail', () => ({
      sendMail: (...args: unknown[]) => mockSendTemplate(...args),
    }))
    vi.doMock('@/notification', () => ({
      notify: (...args: unknown[]) => mockNotify(...args),
    }))

    const { deliverContactNotification: reimportedDeliver } = await import(
      '@/contact/notifications'
    )

    mockNotificationProviderRegistry.discord = () => ({ send: async () => true })

    await reimportedDeliver(validInput)

    expect(mockNotify).toHaveBeenCalledWith(
      'discord',
      expect.objectContaining({
        title: expect.stringContaining('测试主题'),
      }),
    )
  })

  it('sendMail success + notify failure still resolves without throwing', async () => {
    mockSendTemplate.mockResolvedValue({ ok: true })
    mockNotify.mockResolvedValue(false)

    mockNotificationProviderRegistry.discord = () => ({ send: async () => false })

    // websiteConfig.notification.enable = true
    vi.resetModules()
    vi.doMock('@/config/website', () => ({
      websiteConfig: {
        mail: { supportEmail: 'support@example.com' },
        notification: { enable: true },
      },
    }))
    vi.doMock('@/lib/server-context', () => ({
      getServerContext: () => ({
        env: {},
        mailProviderRegistry: mockMailProviderRegistry,
        notificationProviderRegistry: mockNotificationProviderRegistry,
      }),
      als: {
        getStore: () => ({
          mailProviderRegistry: mockMailProviderRegistry,
          notificationProviderRegistry: mockNotificationProviderRegistry,
        }),
      },
    }))
    vi.doMock('@/mail', () => ({
      sendMail: (...args: unknown[]) => mockSendTemplate(...args),
    }))
    vi.doMock('@/notification', () => ({
      notify: (...args: unknown[]) => mockNotify(...args),
    }))

    const { deliverContactNotification: reimportedDeliverMixed } = await import(
      '@/contact/notifications'
    )

    // Should not throw even when notify returns false
    await expect(reimportedDeliverMixed(validInput)).resolves.toBeUndefined()
  })

  it('notify receives truncated message when over 1000 chars', async () => {
    mockSendTemplate.mockResolvedValue({ ok: true })
    mockNotify.mockResolvedValue(true)

    vi.resetModules()
    vi.doMock('@/config/website', () => ({
      websiteConfig: {
        mail: { supportEmail: 'support@example.com' },
        notification: { enable: true },
      },
    }))
    vi.doMock('@/lib/server-context', () => ({
      getServerContext: () => ({
        env: {},
        mailProviderRegistry: mockMailProviderRegistry,
        notificationProviderRegistry: mockNotificationProviderRegistry,
      }),
      als: {
        getStore: () => ({
          mailProviderRegistry: mockMailProviderRegistry,
          notificationProviderRegistry: mockNotificationProviderRegistry,
        }),
      },
    }))
    vi.doMock('@/mail', () => ({
      sendMail: (...args: unknown[]) => mockSendTemplate(...args),
    }))
    vi.doMock('@/notification', () => ({
      notify: (...args: unknown[]) => mockNotify(...args),
    }))

    const { deliverContactNotification: reimportedDeliver } = await import(
      '@/contact/notifications'
    )

    mockNotificationProviderRegistry.discord = () => ({ send: async () => true })

    const longMessage = 'a'.repeat(1001)
    await reimportedDeliver({ ...validInput, message: longMessage })

    expect(mockNotify).toHaveBeenCalledWith(
      'discord',
      expect.objectContaining({
        message: `${'a'.repeat(997)}...`,
      }),
    )
  })

  it('notify receives truncated subject when over 200 chars', async () => {
    mockSendTemplate.mockResolvedValue({ ok: true })
    mockNotify.mockResolvedValue(true)

    vi.resetModules()
    vi.doMock('@/config/website', () => ({
      websiteConfig: {
        mail: { supportEmail: 'support@example.com' },
        notification: { enable: true },
      },
    }))
    vi.doMock('@/lib/server-context', () => ({
      getServerContext: () => ({
        env: {},
        mailProviderRegistry: mockMailProviderRegistry,
        notificationProviderRegistry: mockNotificationProviderRegistry,
      }),
      als: {
        getStore: () => ({
          mailProviderRegistry: mockMailProviderRegistry,
          notificationProviderRegistry: mockNotificationProviderRegistry,
        }),
      },
    }))
    vi.doMock('@/mail', () => ({
      sendMail: (...args: unknown[]) => mockSendTemplate(...args),
    }))
    vi.doMock('@/notification', () => ({
      notify: (...args: unknown[]) => mockNotify(...args),
    }))

    const { deliverContactNotification: reimportedDeliver } = await import(
      '@/contact/notifications'
    )

    mockNotificationProviderRegistry.discord = () => ({ send: async () => true })

    const longSubject = 'b'.repeat(201)
    await reimportedDeliver({ ...validInput, subject: longSubject })

    expect(mockNotify).toHaveBeenCalledWith(
      'discord',
      expect.objectContaining({
        title: `新的联系消息：${'b'.repeat(197)}...`,
      }),
    )
  })
})
