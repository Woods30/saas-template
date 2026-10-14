import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock server-context ALS
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Module under test — import after mocks
// ---------------------------------------------------------------------------
import { parseServerEnv } from '@/env/server'
import {
  buildNotificationProviderRegistry,
  DiscordNotificationProvider,
  FeishuNotificationProvider,
  notify,
} from '@/notification'

// ---------------------------------------------------------------------------
// DiscordNotificationProvider
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// FeishuNotificationProvider
// ---------------------------------------------------------------------------
describe('FeishuNotificationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('send returns true on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
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
})

// ---------------------------------------------------------------------------
// buildNotificationProviderRegistry
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// notify
// ---------------------------------------------------------------------------
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
