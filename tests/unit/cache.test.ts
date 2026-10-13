import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock must be called before the module under test is imported.
// We build the mock ALS context once here.
const mockCacheProvider = {
  get: vi.fn<(key: string) => Promise<unknown>>(),
  set: vi.fn<(key: string, value: unknown, ttl: number) => Promise<void>>(),
  delete: vi.fn<(key: string) => Promise<void>>(),
  deleteByPrefix: vi.fn<(prefix: string) => Promise<void>>(),
}

// Mock the server-context module so getServerContext() returns our mock.
vi.mock('@/lib/server-context', () => ({
  getServerContext: () => ({
    env: {},
    cacheProvider: mockCacheProvider,
  }),
  als: {
    run: vi.fn((_ctx, fn) => fn()),
  },
}))

// Import after vi.mock — the mock is now active.
import { createCacheKey, deleteCache, deleteCacheByPrefix, getOrSetCache } from '@/cache'
import { CACHE_TTL } from '@/cache/constants'

describe('createCacheKey', () => {
  it('连接 parts 为字符串', () => {
    expect(createCacheKey('a', 'b', 'c')).toBe('a:b:c')
  })

  it('转义冒号避免键冲突', () => {
    expect(createCacheKey('a:b', 'c')).toBe('a_b:c')
  })

  it('多个冒号均被转义', () => {
    expect(createCacheKey('ns', 'user:123', 'profile')).toBe('ns:user_123:profile')
  })

  it('数字 parts 被转为字符串', () => {
    expect(createCacheKey('user', 42, 'data')).toBe('user:42:data')
  })
})

describe('CACHE_TTL', () => {
  it('包含预定义的 TTL 常量', () => {
    expect(CACHE_TTL.newsletterStatus).toBe(3600)
    expect(CACHE_TTL.providerStatus).toBe(300)
    expect(CACHE_TTL.publicList).toBe(60)
  })
})

describe('getOrSetCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cache hit — 不调用 fetcher，直接返回缓存值', async () => {
    mockCacheProvider.get.mockResolvedValueOnce({ id: 1, name: 'Alice' })

    const fetcher = vi.fn().mockResolvedValue({ id: 2, name: 'Bob' })

    const result = await getOrSetCache({
      key: 'key1',
      ttlSeconds: 3600,
      fetcher,
    })

    expect(result).toEqual({ id: 1, name: 'Alice' })
    expect(fetcher).not.toHaveBeenCalled()
    expect(mockCacheProvider.get).toHaveBeenCalledWith('key1')
    expect(mockCacheProvider.set).not.toHaveBeenCalled()
  })

  it('cache miss — 调用 fetcher，结果写入缓存', async () => {
    mockCacheProvider.get.mockResolvedValueOnce(null)

    const fetcher = vi.fn().mockResolvedValue({ id: 2, name: 'Bob' })

    const result = await getOrSetCache({
      key: 'key2',
      ttlSeconds: 3600,
      fetcher,
    })

    expect(result).toEqual({ id: 2, name: 'Bob' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(mockCacheProvider.set).toHaveBeenCalledWith('key2', { id: 2, name: 'Bob' }, 3600)
  })
})

describe('deleteCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('调用 provider.delete 删除指定 key', async () => {
    await deleteCache('key:to:delete')

    expect(mockCacheProvider.delete).toHaveBeenCalledWith('key:to:delete')
  })
})

describe('deleteCacheByPrefix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('调用 provider.deleteByPrefix 删除匹配前缀的 keys', async () => {
    await deleteCacheByPrefix('ns:user')

    expect(mockCacheProvider.deleteByPrefix).toHaveBeenCalledWith('ns:user')
  })
})
