import { describe, expect, it } from 'vitest'
import {
  authenticateApiKeyRequest,
  extractApiKeyFromHeaders,
  hashApiKey,
  validateApiKey,
} from '../../src/modules/apikeys/service'
import { createTestDatabase, seedUser } from '../helpers/database'

/**
 * 产品 API Key 的业务端点校验。
 *
 * 与 `@better-auth/api-key` 共用同一张 `apikey` 表与同一套 SHA-256 base64url 散列：
 * 用户在个人中心创建的密钥可直接通过 `Authorization: Bearer <key>` 或 `x-api-key`
 * 访问业务接口。
 */

async function insertApiKey(
  sqlite: ReturnType<typeof createTestDatabase>['sqlite'],
  input: {
    id: string
    userId: string
    rawKey: string
    name?: string
    enabled?: boolean
    expiresAtSec?: number | null
  },
): Promise<void> {
  const hashed = await hashApiKey(input.rawKey)
  sqlite
    .prepare(
      `INSERT INTO apikey(id, config_id, name, start, reference_id, prefix, key, enabled, request_count, expires_at, created_at, updated_at)
       VALUES (?, 'default', ?, ?, ?, 'key_', ?, ?, 0, ?, 1000, 1000)`,
    )
    .run(
      input.id,
      input.name ?? 'Test Key',
      input.rawKey.slice(0, 8),
      input.userId,
      hashed,
      input.enabled === false ? 0 : 1,
      input.expiresAtSec ?? null,
    )
}

describe('extractApiKeyFromHeaders', () => {
  it('解析 Bearer 与 x-api-key，畸形 Authorization 显式判为 malformed', () => {
    expect(extractApiKeyFromHeaders(new Headers({ authorization: 'Bearer key_abc123' }))).toEqual({
      kind: 'present',
      key: 'key_abc123',
    })
    expect(extractApiKeyFromHeaders(new Headers({ 'x-api-key': 'key_xyz' }))).toEqual({
      kind: 'present',
      key: 'key_xyz',
    })
    expect(extractApiKeyFromHeaders(new Headers())).toEqual({ kind: 'missing' })
    expect(extractApiKeyFromHeaders(new Headers({ authorization: 'Basic xxx' }))).toEqual({
      kind: 'malformed',
    })
  })
})

describe('validateApiKey & authenticateApiKeyRequest', () => {
  it('有效密钥通过校验并累加调用计数', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u_api_1')
    const rawKey = 'key_live_valid_secret_token_123456'
    await insertApiKey(sqlite, {
      id: 'ak_1',
      userId: 'u_api_1',
      rawKey,
      name: 'Production CLI',
    })

    const result = await validateApiKey(db, rawKey, new Date('2026-06-01T00:00:00Z'))
    expect(result).toEqual({
      valid: true,
      keyId: 'ak_1',
      userId: 'u_api_1',
      name: 'Production CLI',
    })

    const row = sqlite.prepare('SELECT request_count FROM apikey WHERE id = ?').get('ak_1') as {
      request_count: number
    }
    expect(row.request_count).toBe(1)
  })

  it('未知、禁用、过期或所属用户被封禁的密钥全部拒绝', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u_ok')
    seedUser(sqlite, 'u_banned')
    sqlite.prepare('UPDATE users SET banned = 1 WHERE id = ?').run('u_banned')

    const now = new Date('2026-06-01T00:00:00Z')
    const nowSec = Math.floor(now.getTime() / 1000)

    await insertApiKey(sqlite, {
      id: 'ak_disabled',
      userId: 'u_ok',
      rawKey: 'key_disabled_secret',
      enabled: false,
    })
    await insertApiKey(sqlite, {
      id: 'ak_expired',
      userId: 'u_ok',
      rawKey: 'key_expired_secret',
      expiresAtSec: nowSec - 60,
    })
    await insertApiKey(sqlite, {
      id: 'ak_banned_user',
      userId: 'u_banned',
      rawKey: 'key_banned_secret',
    })

    expect(await validateApiKey(db, 'key_unknown', now)).toEqual({
      valid: false,
      reason: 'INVALID_KEY',
    })
    expect(await validateApiKey(db, 'key_disabled_secret', now)).toEqual({
      valid: false,
      reason: 'DISABLED',
    })
    expect(await validateApiKey(db, 'key_expired_secret', now)).toEqual({
      valid: false,
      reason: 'EXPIRED',
    })
    expect(await validateApiKey(db, 'key_banned_secret', now)).toEqual({
      valid: false,
      reason: 'USER_BANNED',
    })
  })

  it('authenticateApiKeyRequest 对缺失/错误密钥返回 401，封禁用户返回 403', async () => {
    const { sqlite, db } = createTestDatabase()
    seedUser(sqlite, 'u_ok')
    seedUser(sqlite, 'u_banned')
    sqlite.prepare('UPDATE users SET banned = 1 WHERE id = ?').run('u_banned')

    await insertApiKey(sqlite, {
      id: 'ak_ok',
      userId: 'u_ok',
      rawKey: 'key_good_1',
    })
    await insertApiKey(sqlite, {
      id: 'ak_ban',
      userId: 'u_banned',
      rawKey: 'key_ban_1',
    })

    const missing = await authenticateApiKeyRequest(
      db,
      new Request('https://example.com/api/v1/tasks'),
    )
    expect(missing).toEqual({ ok: false, status: 401, error: 'MISSING_API_KEY' })

    const banned = await authenticateApiKeyRequest(
      db,
      new Request('https://example.com/api/v1/tasks', {
        headers: { authorization: 'Bearer key_ban_1' },
      }),
    )
    expect(banned).toEqual({ ok: false, status: 403, error: 'USER_BANNED' })

    const ok = await authenticateApiKeyRequest(
      db,
      new Request('https://example.com/api/v1/tasks', {
        headers: { 'x-api-key': 'key_good_1' },
      }),
    )
    expect(ok).toEqual({
      ok: true,
      keyId: 'ak_ok',
      userId: 'u_ok',
      name: 'Test Key',
    })
  })
})
