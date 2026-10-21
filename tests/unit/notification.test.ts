import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock server-context ALS。
const mockNotificationProviderRegistry: Record<string, (() => object) | undefined> = {}

vi.mock('@/lib/server-context', () => ({
  getServerContext: () => ({
    env: {},
    notificationProviderRegistry: mockNotificationProviderRegistry,
  }),
  als: {
    getStore: () => ({
      notificationProviderRegistry: mockNotificationProviderRegistry,
    }),
  },
}))

// 被测模块，必须在 mock 之后导入。
import { parseServerEnv } from '@/env/server'
import {
  buildNotificationProviderRegistry,
  DiscordNotificationProvider,
  FeishuNotificationProvider,
  notify,
} from '@/notification'

// DiscordNotificationProvider。
describe('DiscordNotificationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('send returns true on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    const provider = new DiscordNotificationProvider('https://discord.com/api/webhooks/123/abc')
    const result = await provider.send({ title: 'Test', message: 'Hello' })
    expect(result).toBe(true)

    vi.unstubAllGlobals()
  })

  it('send returns false on 4xx response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 400 })
    vi.stubGlobal('fetch', mockFetch)

    const provider = new DiscordNotificationProvider('https://discord.com/api/webhooks/123/abc')
    const result = await provider.send({ title: 'Test', message: 'Hello' })
    expect(result).toBe(false)

    vi.unstubAllGlobals()
  })

  it('send returns false on throw', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'))
    vi.stubGlobal('fetch', mockFetch)

    const provider = new DiscordNotificationProvider('https://discord.com/api/webhooks/123/abc')
    const result = await provider.send({ title: 'Test', message: 'Hello' })
    expect(result).toBe(false)

    vi.unstubAllGlobals()
  })
})

// FeishuNotificationProvider。
describe('FeishuNotificationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('send returns true on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ code: 0 }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const provider = new FeishuNotificationProvider(
      'https://open.feishu.cn/open-apis/bot/v2/hook/abc-123',
    )
    const result = await provider.send({ title: 'Test', message: 'Hello' })
    expect(result).toBe(true)

    vi.unstubAllGlobals()
  })

  it('send returns false on throw', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'))
    vi.stubGlobal('fetch', mockFetch)

    const provider = new FeishuNotificationProvider(
      'https://open.feishu.cn/open-apis/bot/v2/hook/abc-123',
    )
    const result = await provider.send({ title: 'Test', message: 'Hello' })
    expect(result).toBe(false)

    vi.unstubAllGlobals()
  })

  it('HTTP 200 但 code 非 0 时返回 false（飞书的业务错误藏在响应体里）', async () => {
    // 校验失败是 HTTP 200 + 非 0 code，只看 `res.ok` 会把失败当成功。
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ code: 19021, msg: 'sign match fail' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const provider = new FeishuNotificationProvider(
      'https://open.feishu.cn/open-apis/bot/v2/hook/abc-123',
    )
    const result = await provider.send({ title: 'Test', message: 'Hello' })
    expect(result).toBe(false)

    vi.unstubAllGlobals()
  })

  it('code 为 0 时算成功', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ code: 0, msg: 'success' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const provider = new FeishuNotificationProvider(
      'https://open.feishu.cn/open-apis/bot/v2/hook/abc-123',
    )
    expect(await provider.send({ title: 'T', message: 'M' })).toBe(true)

    vi.unstubAllGlobals()
  })

  it('响应体不是 JSON 时按 HTTP 状态判断，不当失败', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(new Error('not json')),
    })
    vi.stubGlobal('fetch', mockFetch)

    const provider = new FeishuNotificationProvider(
      'https://open.feishu.cn/open-apis/bot/v2/hook/abc-123',
    )
    expect(await provider.send({ title: 'T', message: 'M' })).toBe(true)

    vi.unstubAllGlobals()
  })

  it('请求带超时信号，避免 webhook 挂住整个请求', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) })
    vi.stubGlobal('fetch', mockFetch)

    const provider = new FeishuNotificationProvider(
      'https://open.feishu.cn/open-apis/bot/v2/hook/abc-123',
    )
    await provider.send({ title: 'T', message: 'M' })

    const init = mockFetch.mock.calls[0]?.[1] as { signal?: AbortSignal }
    expect(init?.signal).toBeDefined()

    vi.unstubAllGlobals()
  })
})

// DiscordNotificationProvider 的超时。
describe('DiscordNotificationProvider', () => {
  it('请求带超时信号', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    const provider = new DiscordNotificationProvider('https://discord.com/api/webhooks/1/abc')
    expect(await provider.send({ title: 'T', message: 'M' })).toBe(true)

    const init = mockFetch.mock.calls[0]?.[1] as { signal?: AbortSignal }
    expect(init?.signal).toBeDefined()

    vi.unstubAllGlobals()
  })
})

// buildNotificationProviderRegistry。
describe('buildNotificationProviderRegistry', () => {
  it('returns undefined for both providers when env is empty', () => {
    const registry = buildNotificationProviderRegistry(parseServerEnv({}))
    expect(registry.discord).toBeUndefined()
    expect(registry.feishu).toBeUndefined()
  })

  it('returns factories when env has webhook URLs', () => {
    const registry = buildNotificationProviderRegistry(
      parseServerEnv({
        DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/abc',
        FEISHU_WEBHOOK_URL: 'https://open.feishu.cn/open-apis/bot/v2/hook/abc-123',
      }),
    )
    expect(typeof registry.discord).toBe('function')
    expect(typeof registry.feishu).toBe('function')
    const discordFactory = registry.discord
    if (!discordFactory) return
    const discordProvider = discordFactory()
    expect(discordProvider.getProviderName()).toBe('discord')
    const feishuFactory = registry.feishu
    if (!feishuFactory) return
    const feishuProvider = feishuFactory()
    expect(feishuProvider.getProviderName()).toBe('feishu')
  })
})

// notify。
describe('notify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(mockNotificationProviderRegistry)) {
      delete mockNotificationProviderRegistry[key]
    }
  })

  it('returns false and warns when provider is not registered', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockReturnValue(undefined)
    const result = await notify('discord', { title: 'Test', message: 'Hello' })
    expect(result).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith('[notification] provider 未注册：discord')
    warnSpy.mockRestore()
  })

  it('returns false and warns when provider send returns false', async () => {
    const mockProvider = {
      getProviderName: () => 'discord',
      send: vi.fn().mockResolvedValue(false),
    }
    mockNotificationProviderRegistry.discord = () => mockProvider as never

    const warnSpy = vi.spyOn(console, 'warn').mockReturnValue(undefined)
    const result = await notify('discord', { title: 'Test', message: 'Hello' })
    expect(result).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith('[notification] discord 投递失败')
    warnSpy.mockRestore()
  })

  it('returns true when provider send succeeds', async () => {
    const mockProvider = {
      getProviderName: () => 'discord',
      send: vi.fn().mockResolvedValue(true),
    }
    mockNotificationProviderRegistry.discord = () => mockProvider as never

    const result = await notify('discord', { title: 'Test', message: 'Hello' })
    expect(result).toBe(true)
  })
})
