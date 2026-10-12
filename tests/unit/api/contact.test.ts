import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCheckRateLimit = vi.fn()
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}))

vi.mock('@/lib/server-context', () => ({
  getServerContext: () => ({
    env: {},
    mailProviderRegistry: {},
    notificationProviderRegistry: {},
  }),
  als: {
    getStore: () => ({
      mailProviderRegistry: {},
      notificationProviderRegistry: {},
    }),
  },
}))

vi.mock('@/mail', () => ({
  sendMail: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/notification', () => ({
  notify: vi.fn().mockResolvedValue(true),
}))

import { submitContact } from '@/routes/api/contact/$'

describe('submitContact', () => {
  const validData = {
    name: '张三',
    fromEmail: 'zhangsan@example.com',
    subject: '测试主题',
    message: '这是一条超过十个字符的测试消息内容。',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckRateLimit.mockResolvedValue(true)
  })

  it('returns rate-limited result when checkRateLimit denies (4th call within 60s)', async () => {
    mockCheckRateLimit.mockResolvedValue(false)

    const result = await submitContact('203.0.113.1', validData)

    expect(result).toEqual({ error: 'Too Many Requests', status: 429 })
  })

  it('returns ok when rate limit is not exceeded', async () => {
    mockCheckRateLimit.mockResolvedValue(true)

    const result = await submitContact('203.0.113.1', validData)

    expect(result).toEqual({ ok: true })
  })
})
