import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock server-context ALS — hoisted so the factory always sees the live object
// ---------------------------------------------------------------------------
const { mockServerContext, mockCacheProvider, mockNewsletterProviderRegistry } = vi.hoisted(() => {
  const mockNewsletterProviderRegistry: Record<string, (() => object) | undefined> = {}
  const mockCacheProvider = {
    get: vi.fn<() => Promise<unknown>>(),
    set: vi.fn<(key: string, value: unknown, ttl: number) => Promise<void>>(),
    delete: vi.fn<() => Promise<void>>(),
    deleteByPrefix: vi.fn<() => Promise<void>>(),
  }
  const mockServerContext: {
    env: Record<string, unknown>
    newsletterProviderRegistry: typeof mockNewsletterProviderRegistry
    cacheProvider: object | null
  } = {
    env: {},
    newsletterProviderRegistry: mockNewsletterProviderRegistry,
    cacheProvider: mockCacheProvider,
  }
  return { mockServerContext, mockCacheProvider, mockNewsletterProviderRegistry }
})

vi.mock('@/lib/server-context', () => ({
  getServerContext: () => mockServerContext,
  als: {
    getStore: () => ({
      newsletterProviderRegistry: mockNewsletterProviderRegistry,
    }),
  },
}))

// ---------------------------------------------------------------------------
// Mock cache
// ---------------------------------------------------------------------------
vi.mock('@/cache', () => ({
  createCacheKey: (prefix: string, ...parts: string[]) => `${prefix}:${parts.join(':')}`,
  deleteCache: vi.fn().mockResolvedValue(undefined),
  getOrSetCache: vi
    .fn()
    .mockImplementation(async ({ fetcher }: { key: string; fetcher: () => Promise<boolean> }) =>
      fetcher(),
    ),
  CACHE_TTL: {
    newsletterStatus: 300,
    providerStatus: 300,
    publicList: 60,
  },
}))

// ---------------------------------------------------------------------------
// Mock resend SDK
// ---------------------------------------------------------------------------
const mockContactsCreate = vi.fn()
const mockContactsUpdate = vi.fn()
const mockContactsGet = vi.fn()

vi.mock('resend', () => ({
  Resend: class {
    contacts = {
      create: mockContactsCreate,
      update: mockContactsUpdate,
      get: mockContactsGet,
    }
  },
}))

// ---------------------------------------------------------------------------
// Module under test — import after mocks
// ---------------------------------------------------------------------------
import {
  BeehiivNewsletterProvider,
  buildNewsletterProviderRegistry,
  checkRateLimit,
  checkStatus,
  ResendNewsletterProvider,
  subscribe,
  unsubscribe,
} from '@/newsletter'

// ---------------------------------------------------------------------------
// ResendNewsletterProvider
// ---------------------------------------------------------------------------
describe('ResendNewsletterProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('subscribe returns true on success', async () => {
    mockContactsCreate.mockResolvedValue({ data: { id: 'contact-1' }, error: null })
    const provider = new ResendNewsletterProvider('test-key', 'audience-1')
    const result = await provider.subscribe({ email: 'test@example.com' })
    expect(result).toBe(true)
    expect(mockContactsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@example.com', unsubscribed: false }),
    )
  })

  it('subscribe returns false on API error', async () => {
    mockContactsCreate.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const provider = new ResendNewsletterProvider('test-key', 'audience-1')
    const result = await provider.subscribe({ email: 'test@example.com' })
    expect(result).toBe(false)
  })

  it('subscribe returns false on throw', async () => {
    mockContactsCreate.mockRejectedValue(new Error('network error'))
    const provider = new ResendNewsletterProvider('test-key', 'audience-1')
    const result = await provider.subscribe({ email: 'test@example.com' })
    expect(result).toBe(false)
  })

  it('unsubscribe returns true on success', async () => {
    mockContactsUpdate.mockResolvedValue({ data: { id: 'contact-1' }, error: null })
    const provider = new ResendNewsletterProvider('test-key', 'audience-1')
    const result = await provider.unsubscribe({ email: 'test@example.com' })
    expect(result).toBe(true)
    expect(mockContactsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@example.com', unsubscribed: true }),
    )
  })

  it('unsubscribe returns false on API error', async () => {
    mockContactsUpdate.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const provider = new ResendNewsletterProvider('test-key', 'audience-1')
    const result = await provider.unsubscribe({ email: 'test@example.com' })
    expect(result).toBe(false)
  })

  it('unsubscribe returns false on throw', async () => {
    mockContactsUpdate.mockRejectedValue(new Error('network error'))
    const provider = new ResendNewsletterProvider('test-key', 'audience-1')
    const result = await provider.unsubscribe({ email: 'test@example.com' })
    expect(result).toBe(false)
  })

  it('checkSubscribeStatus returns true when contact is subscribed', async () => {
    mockContactsGet.mockResolvedValue({
      data: { id: 'contact-1', email: 'test@example.com', unsubscribed: false },
      error: null,
    })
    const provider = new ResendNewsletterProvider('test-key', 'audience-1')
    const result = await provider.checkSubscribeStatus({ email: 'test@example.com' })
    expect(result).toBe(true)
  })

  it('checkSubscribeStatus returns false when contact is unsubscribed', async () => {
    mockContactsGet.mockResolvedValue({
      data: { id: 'contact-1', email: 'test@example.com', unsubscribed: true },
      error: null,
    })
    const provider = new ResendNewsletterProvider('test-key', 'audience-1')
    const result = await provider.checkSubscribeStatus({ email: 'test@example.com' })
    expect(result).toBe(false)
  })

  it('checkSubscribeStatus returns false when contact not found', async () => {
    mockContactsGet.mockResolvedValue({ data: null, error: { message: 'not found' } })
    const provider = new ResendNewsletterProvider('test-key', 'audience-1')
    const result = await provider.checkSubscribeStatus({ email: 'test@example.com' })
    expect(result).toBe(false)
  })

  it('checkSubscribeStatus returns false on throw', async () => {
    mockContactsGet.mockRejectedValue(new Error('network error'))
    const provider = new ResendNewsletterProvider('test-key', 'audience-1')
    const result = await provider.checkSubscribeStatus({ email: 'test@example.com' })
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// BeehiivNewsletterProvider
// ---------------------------------------------------------------------------
describe('BeehiivNewsletterProvider', () => {
  it('getProviderName returns beehiiv', () => {
    const provider = new BeehiivNewsletterProvider('key', 'pub-1')
    expect(provider.getProviderName()).toBe('beehiiv')
  })

  it('subscribe sends send_welcome_email: false by default', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    const provider = new BeehiivNewsletterProvider('key', 'pub-1')
    await provider.subscribe({ email: 'test@example.com' })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/subscriptions'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', send_welcome_email: false }),
      }),
    )

    vi.unstubAllGlobals()
  })

  it('subscribe sends send_welcome_email: true when enabled in constructor', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    const provider = new BeehiivNewsletterProvider('key', 'pub-1', true)
    await provider.subscribe({ email: 'test@example.com' })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/subscriptions'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', send_welcome_email: true }),
      }),
    )

    vi.unstubAllGlobals()
  })
})

// ---------------------------------------------------------------------------
// buildNewsletterProviderRegistry
// ---------------------------------------------------------------------------
describe('buildNewsletterProviderRegistry', () => {
  it('returns undefined for resend when env is missing', () => {
    const registry = buildNewsletterProviderRegistry({} as never)
    expect(registry.resend).toBeUndefined()
  })

  it('returns factory for resend when env has keys', () => {
    const registry = buildNewsletterProviderRegistry({
      RESEND_API_KEY: 'key-1',
      RESEND_AUDIENCE_ID: 'audience-1',
    } as never)
    expect(typeof registry.resend).toBe('function')
    const factory = registry.resend
    if (!factory) return
    const provider = factory()
    expect(provider.getProviderName()).toBe('resend')
  })

  it('returns undefined for beehiiv when env is missing', () => {
    const registry = buildNewsletterProviderRegistry({} as never)
    expect(registry.beehiiv).toBeUndefined()
  })

  it('returns factory for beehiiv when env has keys', () => {
    const registry = buildNewsletterProviderRegistry({
      BEEHIIV_API_KEY: 'key-1',
      BEEHIIV_PUBLICATION_ID: 'pub-1',
    } as never)
    expect(typeof registry.beehiiv).toBe('function')
    const factory = registry.beehiiv
    if (!factory) return
    const provider = factory()
    expect(provider.getProviderName()).toBe('beehiiv')
  })

  it('beehiiv factory receives sendWelcomeEmail: false by default', () => {
    const registry = buildNewsletterProviderRegistry({
      BEEHIIV_API_KEY: 'key-1',
      BEEHIIV_PUBLICATION_ID: 'pub-1',
    } as never)
    const factory = registry.beehiiv
    if (!factory) return

    // Mock fetch to inspect the subscribe call
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    const provider = factory() as BeehiivNewsletterProvider
    provider.subscribe({ email: 'test@example.com' })

    const call = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(call[1].body as string) as { send_welcome_email: boolean }
    expect(body.send_welcome_email).toBe(false)

    vi.unstubAllGlobals()
  })

  it('beehiiv factory receives sendWelcomeEmail: true when env is "true"', () => {
    const registry = buildNewsletterProviderRegistry({
      BEEHIIV_API_KEY: 'key-1',
      BEEHIIV_PUBLICATION_ID: 'pub-1',
      BEEHIIV_SEND_WELCOME_EMAIL: 'true',
    } as never)
    const factory = registry.beehiiv
    if (!factory) return

    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    const provider = factory() as BeehiivNewsletterProvider
    provider.subscribe({ email: 'test@example.com' })

    const call = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(call[1].body as string) as { send_welcome_email: boolean }
    expect(body.send_welcome_email).toBe(true)

    vi.unstubAllGlobals()
  })
})

// ---------------------------------------------------------------------------
// subscribe / unsubscribe / checkStatus via ALS
// ---------------------------------------------------------------------------
describe('subscribe / unsubscribe / checkStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(mockNewsletterProviderRegistry)) {
      delete mockNewsletterProviderRegistry[key]
    }
    mockCacheProvider.get.mockResolvedValue(null)
    mockCacheProvider.set.mockResolvedValue(undefined)
  })

  it('subscribe uses provider and deletes cache', async () => {
    const mockProvider = {
      getProviderName: () => 'resend',
      subscribe: vi.fn().mockResolvedValue(true),
    }
    mockNewsletterProviderRegistry.resend = () => mockProvider as never

    const result = await subscribe('resend', { email: 'test@example.com' })
    expect(result).toBe(true)
    expect(mockProvider.subscribe).toHaveBeenCalledWith({ email: 'test@example.com' })

    const { deleteCache } = await import('@/cache')
    expect(deleteCache).toHaveBeenCalledWith('newsletter:status:test@example.com')
  })

  it('unsubscribe uses provider and deletes cache', async () => {
    const mockProvider = {
      getProviderName: () => 'resend',
      unsubscribe: vi.fn().mockResolvedValue(true),
    }
    mockNewsletterProviderRegistry.resend = () => mockProvider as never

    const result = await unsubscribe('resend', { email: 'test@example.com' })
    expect(result).toBe(true)
    expect(mockProvider.unsubscribe).toHaveBeenCalledWith({ email: 'test@example.com' })

    const { deleteCache } = await import('@/cache')
    expect(deleteCache).toHaveBeenCalledWith('newsletter:status:test@example.com')
  })

  it('checkStatus uses cache hit path', async () => {
    const mockProvider = {
      getProviderName: () => 'resend',
      checkSubscribeStatus: vi.fn().mockResolvedValue(true),
    }
    mockNewsletterProviderRegistry.resend = () => mockProvider as never

    const { getOrSetCache } = await import('@/cache')
    vi.mocked(getOrSetCache).mockResolvedValueOnce(true)

    const result = await checkStatus('resend', { email: 'test@example.com' })
    expect(result).toBe(true)
    expect(getOrSetCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'newsletter:status:test@example.com' }),
    )
  })

  it('throws when provider is not registered', async () => {
    await expect(subscribe('resend' as never, { email: 'test@example.com' })).rejects.toThrow(
      'Newsletter provider 未注册',
    )
  })
})

// ---------------------------------------------------------------------------
// checkRateLimit
// ---------------------------------------------------------------------------
describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCacheProvider.get.mockResolvedValue(null)
    mockCacheProvider.set.mockResolvedValue(undefined)
  })

  it('allows first request and stores timestamps array', async () => {
    mockCacheProvider.get.mockResolvedValue(null)
    const before = Date.now()
    const result = await checkRateLimit('1.2.3.4', 'subscribe')
    expect(result).toBe(true)
    const setCall = mockCacheProvider.set.mock.calls[0] as unknown as [string, number[], number]
    expect(setCall[0]).toBe('newsletter:ratelimit:1.2.3.4:subscribe')
    expect(setCall[1]).toBeInstanceOf(Array)
    expect(setCall[1].length).toBe(1)
    expect(typeof setCall[1][0]).toBe('number')
    expect(setCall[2]).toBe(60)
    const after = Date.now()
    expect(setCall[1][0]).toBeGreaterThanOrEqual(before)
    expect(setCall[1][0]).toBeLessThanOrEqual(after)
  })

  it('allows up to 5 requests, blocks 6th', async () => {
    // Simulate persistent KV: set updates the value that get returns
    let storedTimestamps: number[] = []
    mockCacheProvider.get.mockImplementation(async () => storedTimestamps)
    mockCacheProvider.set.mockImplementation(async (_key: string, val: unknown) => {
      storedTimestamps = val as number[]
    })

    // 1st-5th requests should be allowed
    for (let i = 1; i <= 5; i++) {
      const allowed = await checkRateLimit('1.2.3.4', 'subscribe')
      expect(allowed).toBe(true)
    }

    // 6th request should be blocked
    const allowed = await checkRateLimit('1.2.3.4', 'subscribe')
    expect(allowed).toBe(false)
  })

  it('resets after window expires', async () => {
    // Simulate KV with timestamps that are all >60s old — filtered out
    let storedTimestamps: number[] = Array.from(
      { length: 5 },
      (_, i) => Date.now() - 70000 - i * 1000,
    )
    mockCacheProvider.get.mockImplementation(async () => storedTimestamps)
    mockCacheProvider.set.mockImplementation(async (_key: string, val: unknown) => {
      storedTimestamps = val as number[]
    })

    // Should be allowed because old timestamps are filtered out
    const result = await checkRateLimit('1.2.3.4', 'subscribe')
    expect(result).toBe(true)
    // New timestamp should be stored
    const setCall = mockCacheProvider.set.mock.calls[0] as unknown as [string, number[], number]
    expect(setCall[1].length).toBe(1)
  })

  it('denies when cache provider is unavailable (fail closed)', async () => {
    // Fail closed: when cacheProvider is null, deny the request
    const prev = mockServerContext.cacheProvider
    mockServerContext.cacheProvider = null
    const result = await checkRateLimit('1.2.3.4', 'subscribe')
    expect(result).toBe(false)
    mockServerContext.cacheProvider = prev // restore for other tests
  })

  it('applies stricter limit (1/min) for unknown IP', async () => {
    // Unknown IP gets 1 request allowed; 2nd is blocked
    let storedTimestamps: number[] = []
    mockCacheProvider.get.mockImplementation(async () => storedTimestamps)
    mockCacheProvider.set.mockImplementation(async (_key: string, val: unknown) => {
      storedTimestamps = val as number[]
    })

    const first = await checkRateLimit('unknown', 'subscribe')
    expect(first).toBe(true)

    const second = await checkRateLimit('unknown', 'subscribe')
    expect(second).toBe(false)
  })

  it('allows 5 requests for known IP in sequence', async () => {
    // Verify 5 sequential calls for a known IP all pass
    let storedTimestamps: number[] = []
    mockCacheProvider.get.mockImplementation(async () => storedTimestamps)
    mockCacheProvider.set.mockImplementation(async (_key: string, val: unknown) => {
      storedTimestamps = val as number[]
    })

    for (let i = 0; i < 5; i++) {
      const allowed = await checkRateLimit('5.6.7.8', 'subscribe')
      expect(allowed).toBe(true)
    }
    const sixth = await checkRateLimit('5.6.7.8', 'subscribe')
    expect(sixth).toBe(false)
  })
})
