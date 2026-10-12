import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock server-context ALS
// ---------------------------------------------------------------------------
const mockNewsletterProviderRegistry: Record<string, (() => object) | undefined> = {}
const mockCacheProvider = {
  get: vi.fn<() => Promise<unknown>>(),
  set: vi.fn<() => Promise<void>>(),
  delete: vi.fn<() => Promise<void>>(),
  deleteByPrefix: vi.fn<() => Promise<void>>(),
}

vi.mock('@/lib/server-context', () => ({
  getServerContext: () => ({
    env: {},
    newsletterProviderRegistry: mockNewsletterProviderRegistry,
    cacheProvider: mockCacheProvider,
  }),
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

  it('allows first request and stores count 1', async () => {
    mockCacheProvider.get.mockResolvedValue(null)
    const result = await checkRateLimit('1.2.3.4', 'subscribe')
    expect(result).toBe(true)
    expect(mockCacheProvider.set).toHaveBeenCalledWith(
      'newsletter:ratelimit:1.2.3.4:subscribe',
      { count: 1 },
      60,
    )
  })

  it('allows up to 5 requests, blocks 6th', async () => {
    let callCount = 0
    mockCacheProvider.get.mockImplementation(async () => {
      callCount++
      return { count: callCount }
    })

    // 1-5 should be allowed
    for (let i = 1; i <= 5; i++) {
      const allowed = await checkRateLimit('1.2.3.4', 'subscribe')
      expect(allowed).toBe(true)
    }

    // 6th should be blocked
    const allowed = await checkRateLimit('1.2.3.4', 'subscribe')
    expect(allowed).toBe(false)
  })

  it('returns true when cache provider is unavailable (fail open)', async () => {
    // When cache returns null (no entry), no rate limit is applied — this is the fail-open path
    mockCacheProvider.get.mockResolvedValue(null)
    const result = await checkRateLimit('1.2.3.4', 'subscribe')
    expect(result).toBe(true)
  })
})
