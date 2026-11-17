import type { KVNamespace } from '@cloudflare/workers-types'

export class KVCacheProvider {
  constructor(private readonly kv: KVNamespace) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.kv.get(key, 'json')
    return raw as T | null
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds })
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key)
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    let cursor: string | null | undefined
    do {
      const result = await this.kv.list({ prefix, cursor })
      await Promise.all(result.keys.map((k) => this.kv.delete(k.name)))
      cursor = result.list_complete ? undefined : result.cursor
    } while (cursor !== undefined)
  }
}
