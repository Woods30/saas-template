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

import { Route, submitContact } from '@/routes/api/contact/$'

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

// ---------------------------------------------------------------------------
// 配置门禁：contact 关闭 → POST 返回 404，且不读取 body / 不调用 provider
//
// 门禁用例**显式**关掉开关：`website.ts` 的默认值随部署场景调整（本仓本地联调期
// 会打开部分模块），依赖出厂默认值的断言会在开关变更时静默失效。
// ---------------------------------------------------------------------------
describe('POST /api/contact 门禁', () => {
  beforeEach(() => {
    vi.doUnmock('@/config/website')
    vi.resetModules()
  })

  /** 以 `contact.enabled: false` 重新加载路由。 */
  async function importRouteWithContactDisabled() {
    vi.resetModules()
    vi.doMock('@/config/website', async () => {
      const actual = await vi.importActual<typeof import('@/config/website')>('@/config/website')
      const { parsePublicEnv } =
        await vi.importActual<typeof import('@/env/public')>('@/env/public')
      const base = actual.createWebsiteConfig(
        parsePublicEnv({ VITE_BASE_URL: 'https://jerbix.dev' }),
      )
      return { ...actual, websiteConfig: { ...base, contact: { enabled: false } } }
    })
    return import('@/routes/api/contact/$')
  }

  function getPostHandler(
    route: unknown = Route,
  ): (ctx: { request: Request }) => Promise<Response> {
    const handlers = (route as { options?: { server?: { handlers?: Record<string, unknown> } } })
      .options?.server?.handlers
    const handler = handlers?.POST
    if (typeof handler !== 'function') throw new Error('POST handler 缺失')
    return handler as (ctx: { request: Request }) => Promise<Response>
  }

  it('contact 关闭时返回 404 MODULE_DISABLED，且不读取 body', async () => {
    const { Route: DisabledRoute } = await importRouteWithContactDisabled()
    const request = new Request('https://jerbix.dev/api/contact/submit', {
      method: 'POST',
      body: '{}',
    })
    const read = vi.spyOn(request, 'json')

    const response = await getPostHandler(DisabledRoute)({ request })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'MODULE_DISABLED' })
    expect(read).not.toHaveBeenCalled()
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
  })

  it('contact 启用但 mail 未配置完整时返回 503 SERVICE_UNAVAILABLE', async () => {
    vi.resetModules()
    vi.doMock('@/config/website', async () => {
      const actual = await vi.importActual<typeof import('@/config/website')>('@/config/website')
      const { parsePublicEnv } =
        await vi.importActual<typeof import('@/env/public')>('@/env/public')
      const base = actual.createWebsiteConfig(
        parsePublicEnv({ VITE_BASE_URL: 'https://jerbix.dev' }),
      )
      return { ...actual, websiteConfig: { ...base, contact: { enabled: true } } }
    })

    const { Route: Reimported } = await import('@/routes/api/contact/$')
    const handlers = (
      Reimported as unknown as { options?: { server?: { handlers?: Record<string, unknown> } } }
    ).options?.server?.handlers
    const handler = handlers?.POST
    if (typeof handler !== 'function') throw new Error('POST handler 缺失')

    const request = new Request('https://jerbix.dev/api/contact/submit', {
      method: 'POST',
      body: '{}',
    })
    const read = vi.spyOn(request, 'json')

    const response = await (handler as (ctx: { request: Request }) => Promise<Response>)({
      request,
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'SERVICE_UNAVAILABLE' })
    expect(read).not.toHaveBeenCalled()
  })
})

// ------------------------------------------------------------------------------------------------
// 投递失败必须报告失败（旧实现一律回 200，访客以为消息已送达）
// ------------------------------------------------------------------------------------------------

describe('submitContact — 投递失败', () => {
  const validData = {
    name: '张三',
    fromEmail: 'zhangsan@example.com',
    subject: '测试主题',
    message: '这是一条超过十个字符的测试消息内容。',
  }

  beforeEach(() => {
    mockCheckRateLimit.mockReset()
    mockCheckRateLimit.mockResolvedValue(true)
  })

  /** 默认配置里 `notification.enabled` 为 false，需要单独打开才能走到 notify。 */
  async function enableNotification() {
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
          mail: { ...base.mail, supportEmail: 'support@example.com' },
          notification: { enabled: true, provider: 'discord' },
        },
      }
    })
    return import('@/routes/api/contact/$')
  }

  it('邮件与通知都失败时返回 503，而不是假装成功', async () => {
    const { submitContact: submit } = await enableNotification()
    const { sendMail } = await import('@/mail')
    const { notify } = await import('@/notification')
    vi.mocked(sendMail).mockResolvedValueOnce({ ok: false, error: 'SMTP down' })
    vi.mocked(notify).mockResolvedValueOnce(false)

    const result = await submit('1.2.3.4', validData)

    expect(result).toEqual({ error: 'Delivery failed', status: 503 })
  })

  it('邮件失败但通知成功时仍返回 ok', async () => {
    const { submitContact: submit } = await enableNotification()
    const { sendMail } = await import('@/mail')
    const { notify } = await import('@/notification')
    vi.mocked(sendMail).mockResolvedValueOnce({ ok: false, error: 'SMTP down' })
    vi.mocked(notify).mockResolvedValueOnce(true)

    const result = await submit('1.2.3.4', validData)

    expect(result).toEqual({ ok: true })
  })
})
