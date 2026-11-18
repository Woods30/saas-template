import { defaultKeyHasher } from '@better-auth/api-key'
import { eq, sql } from 'drizzle-orm'
import type { DB } from '@/core/db'
import { apikey, users } from '@/core/db/schema'

export type ExtractedApiKey =
  | { kind: 'present'; key: string }
  | { kind: 'missing' }
  | { kind: 'malformed' }

export type ApiKeyRejectReason =
  | 'INVALID_KEY'
  | 'DISABLED'
  | 'EXPIRED'
  | 'QUOTA_EXCEEDED'
  | 'USER_BANNED'

export type ValidateApiKeyResult =
  | {
      valid: true
      keyId: string
      userId: string
      name: string | null
    }
  | {
      valid: false
      reason: ApiKeyRejectReason
    }

export type AuthenticateApiKeyResult =
  | {
      ok: true
      keyId: string
      userId: string
      name: string | null
    }
  | {
      ok: false
      status: 401 | 403
      error: 'MISSING_API_KEY' | 'MALFORMED_AUTH_HEADER' | ApiKeyRejectReason
    }

/** 与 `@better-auth/api-key` 共用同一 SHA-256 base64url 散列实现。 */
export async function hashApiKey(rawKey: string): Promise<string> {
  return defaultKeyHasher(rawKey)
}

/** 从 `Authorization: Bearer <key>` 或 `x-api-key` 请求头提取密钥。 */
export function extractApiKeyFromHeaders(headers: Headers): ExtractedApiKey {
  const authHeader = headers.get('authorization')
  if (authHeader !== null) {
    const trimmed = authHeader.trim()
    if (!/^Bearer\s+/i.test(trimmed)) {
      return { kind: 'malformed' }
    }
    const token = trimmed.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return { kind: 'malformed' }
    }
    return { kind: 'present', key: token }
  }

  const xApiKey = headers.get('x-api-key')?.trim()
  if (xApiKey) {
    return { kind: 'present', key: xApiKey }
  }

  return { kind: 'missing' }
}

/** 校验原始 API Key 并原子累加调用次数。 */
export async function validateApiKey(
  db: DB,
  rawKey: string,
  now: Date = new Date(),
): Promise<ValidateApiKeyResult> {
  const trimmed = rawKey.trim()
  if (!trimmed) {
    return { valid: false, reason: 'INVALID_KEY' }
  }

  const hashed = await hashApiKey(trimmed)
  const rows = await db
    .select({
      id: apikey.id,
      name: apikey.name,
      referenceId: apikey.referenceId,
      enabled: apikey.enabled,
      expiresAt: apikey.expiresAt,
      remaining: apikey.remaining,
    })
    .from(apikey)
    .where(eq(apikey.key, hashed))
    .limit(1)

  const row = rows[0]
  if (!row) {
    return { valid: false, reason: 'INVALID_KEY' }
  }
  if (row.enabled === false) {
    return { valid: false, reason: 'DISABLED' }
  }
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
    return { valid: false, reason: 'EXPIRED' }
  }
  if (row.remaining !== null && row.remaining !== undefined && row.remaining <= 0) {
    return { valid: false, reason: 'QUOTA_EXCEEDED' }
  }

  const userRows = await db
    .select({
      id: users.id,
      banned: users.banned,
    })
    .from(users)
    .where(eq(users.id, row.referenceId))
    .limit(1)

  const owner = userRows[0]
  if (!owner || owner.banned) {
    return { valid: false, reason: 'USER_BANNED' }
  }

  await db
    .update(apikey)
    .set({
      requestCount: sql`COALESCE(${apikey.requestCount}, 0) + 1`,
      lastRequest: now,
      updatedAt: now,
    })
    .where(eq(apikey.id, row.id))

  return {
    valid: true,
    keyId: row.id,
    userId: row.referenceId,
    name: row.name ?? null,
  }
}

/** 面向业务 API 路由的请求级鉴权入口。 */
export async function authenticateApiKeyRequest(
  db: DB,
  request: Request,
  now: Date = new Date(),
): Promise<AuthenticateApiKeyResult> {
  const extracted = extractApiKeyFromHeaders(request.headers)
  if (extracted.kind === 'missing') {
    return { ok: false, status: 401, error: 'MISSING_API_KEY' }
  }
  if (extracted.kind === 'malformed') {
    return { ok: false, status: 401, error: 'MALFORMED_AUTH_HEADER' }
  }

  const validated = await validateApiKey(db, extracted.key, now)
  if (!validated.valid) {
    const status =
      validated.reason === 'USER_BANNED' ||
      validated.reason === 'DISABLED' ||
      validated.reason === 'QUOTA_EXCEEDED'
        ? 403
        : 401
    return { ok: false, status, error: validated.reason }
  }

  return {
    ok: true,
    keyId: validated.keyId,
    userId: validated.userId,
    name: validated.name,
  }
}
