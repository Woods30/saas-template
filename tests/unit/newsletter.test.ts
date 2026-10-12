import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock server-context ALS
// ---------------------------------------------------------------------------
const mockNewsletterProviderRegistry: Record<string, (() => object) | undefined> = {}

vi.mock('@/lib/server-context', () => ({
  getServerContext: () => ({
    env: {},
    newsletterProviderRegistry: mockNewsletterProviderRegistry,
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
  createCacheKey: (prefix: string, key: string) => `${prefix}:${key}`,
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
// BeehiivNewsletterProvider — basic sanity
// ---------------------------------------------------------------------------
describe('BeehiivNewsletterProvider', () => {
  it('getProviderName returns beehiiv', () => {
    const provider = new BeehiivNewsletterProvider('key', 'pub-1')
    expect(provider.getProviderName()).toBe('beehiiv')
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
