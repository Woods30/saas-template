import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted mock factories：必须位于模块顶层，供 `vi.mock` 工厂引用。
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

import { websiteConfig } from '@/config/website'
import { deliverContactNotification } from '@/contact/notifications'
// 被测模块，必须在 mock 之后导入。
import { type ContactInput, contactSchema } from '@/contact/schema'

// contactSchema。
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

// deliverContactNotification。
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

  /** 以 `notification.enabled: false` 重新加载被测模块；不依赖随部署调整的出厂默认值。 */
  async function importWithNotificationDisabled() {
    vi.resetModules()
    vi.doMock('@/config/website', async () => {
      const actual = await vi.importActual<typeof import('@/config/website')>('@/config/website')
      const { parsePublicEnv } =
        await vi.importActual<typeof import('@/env/public')>('@/env/public')
      const base = actual.createWebsiteConfig(
        parsePublicEnv({ VITE_BASE_URL: 'https://jerbix.dev' }),
      )
      return {
        ...actual,
        websiteConfig: {
          ...base,
          notification: { enabled: false, provider: 'discord' },
        },
      }
    })
    return import('@/contact/notifications')
  }

  it('calls sendMail with configured provider and contactMessage template', async () => {
    mockSendTemplate.mockResolvedValue({ ok: true })

    await deliverContactNotification(validInput)

    // provider 取自 `websiteConfig.mail.provider` 配置，不固定写死。
    expect(mockSendTemplate).toHaveBeenCalledWith(
      websiteConfig.mail.provider,
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

  it('sendMail failure only logs, and reports not delivered when nothing else succeeds', async () => {
    mockSendTemplate.mockResolvedValue({ ok: false, error: 'SMTP error\ndetails' })
    const warnSpy = vi.spyOn(console, 'warn').mockReturnValue(undefined)
    const { deliverContactNotification: deliver } = await importWithNotificationDisabled()

    // 两个通道都未成功时调用方回 503。
    await expect(deliver(validInput)).resolves.toEqual({ delivered: false })

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[contact]'))
    warnSpy.mockRestore()
  })

  it('sendMail 抛异常时被接住，不让 500 冒到路由层', async () => {
    // provider 未注册或模板校验失败时 `sendMail` 直接 throw。
    mockSendTemplate.mockRejectedValue(new Error('provider not registered'))
    const warnSpy = vi.spyOn(console, 'warn').mockReturnValue(undefined)
    const { deliverContactNotification: deliver } = await importWithNotificationDisabled()

    await expect(deliver(validInput)).resolves.toEqual({ delivered: false })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[contact]'))
    warnSpy.mockRestore()
  })

  it('does NOT call notify when notification.enabled is false', async () => {
    mockSendTemplate.mockResolvedValue({ ok: true })
    const { deliverContactNotification: deliver } = await importWithNotificationDisabled()

    await deliver(validInput)

    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('calls notify when notification.enabled is true', async () => {
    mockSendTemplate.mockResolvedValue({ ok: true })
    mockNotify.mockResolvedValue(true)

    // 以 `notification.enabled: true` 重新导入。
    vi.resetModules()
    vi.doMock('@/config/website', () => ({
      websiteConfig: {
        mail: { supportEmail: 'support@example.com' },
        notification: { enabled: true, provider: 'discord' },
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

    // 以 `notification.enabled: true` 重新导入。
    vi.resetModules()
    vi.doMock('@/config/website', () => ({
      websiteConfig: {
        mail: { supportEmail: 'support@example.com' },
        notification: { enabled: true, provider: 'discord' },
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

    // 通知失败但邮件成功仍算已送达，不抛错。
    await expect(reimportedDeliverMixed(validInput)).resolves.toEqual({ delivered: true })
  })

  it('notify receives truncated message when over 1000 chars', async () => {
    mockSendTemplate.mockResolvedValue({ ok: true })
    mockNotify.mockResolvedValue(true)

    vi.resetModules()
    vi.doMock('@/config/website', () => ({
      websiteConfig: {
        mail: { supportEmail: 'support@example.com' },
        notification: { enabled: true, provider: 'discord' },
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
        notification: { enabled: true, provider: 'discord' },
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

  it('notification.provider = feishu 时 notify 收到 feishu 渠道', async () => {
    mockSendTemplate.mockResolvedValue({ ok: true })
    mockNotify.mockResolvedValue(true)

    vi.resetModules()
    vi.doMock('@/config/website', () => ({
      websiteConfig: {
        mail: { supportEmail: 'support@example.com' },
        notification: { enabled: true, provider: 'feishu' },
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

    mockNotificationProviderRegistry.feishu = () => ({ send: async () => true })

    await reimportedDeliver(validInput)

    expect(mockNotify).toHaveBeenCalledWith('feishu', expect.anything())
  })
})
