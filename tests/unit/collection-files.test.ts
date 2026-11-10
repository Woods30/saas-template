import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 核销链路的文件端点：类型伪装、大小上限、越权读取与存储不可用。
 *
 * 断言对象是「行为」而不是实现细节：越权一律 404（不泄漏订单是否存在）、
 * 声明类型与文件头必须一致、缺对象存储绑定时返回 STORAGE_UNAVAILABLE 且不改数据。
 */

/** 测试用的可变状态：所有 mock 都从这里取当前会话、环境与存储实现。 */
const state = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  session: null as { user: { id: string; role?: string } } | null,
  /** 模块门禁的返回值；默认 undefined 表示模块可用。 */
  gate: undefined as Response | undefined,
  db: null as unknown,
  uploadFile: vi.fn(),
  downloadFile: vi.fn(),
  getFileInfo: vi.fn(),
  deleteFile: vi.fn(),
}))

vi.mock('@/lib/module-access.server', () => ({
  getModuleUnavailableResponse: () => state.gate,
}))

vi.mock('@/lib/server-context', () => ({
  getServerContext: () => ({ env: state.env }),
  als: {
    getStore: () => undefined,
    run: (_ctx: unknown, fn: () => unknown) => fn(),
  },
}))

vi.mock('@/auth/auth', () => ({
  getAuth: () => ({ api: { getSession: async () => state.session } }),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => true,
}))

vi.mock('@/storage', () => ({
  uploadFile: (...args: unknown[]) => state.uploadFile(...args),
  downloadFile: (...args: unknown[]) => state.downloadFile(...args),
  getFileInfo: (...args: unknown[]) => state.getFileInfo(...args),
  deleteFile: (...args: unknown[]) => state.deleteFile(...args),
}))

vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>()
  return { ...actual, createDb: () => state.db }
})

vi.mock('@/config/website', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/website')>()
  return {
    ...actual,
    websiteConfig: {
      ...actual.websiteConfig,
      collection: {
        ...actual.websiteConfig.collection,
        accounts: [
          {
            id: 'acct-main',
            channel: 'alipay',
            displayName: '支付宝',
            currency: 'cny',
            qrImageUrl: '/collection/main.png',
          },
        ],
      },
    },
  }
})

import { COLLECTION_IMAGE_MAX_BYTES, validateCollectionImage } from '@/collection/files'
import type { DB } from '@/db'
import { Route as QrcodeRoute } from '@/routes/api/collection/accounts/$accountId/qrcode'
import { Route as ReceiptRoute } from '@/routes/api/collection/orders/$orderId/receipt'

/** 最小可用的图片字节：文件头合法，内容随便。 */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
])
const JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
])
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
])

/** 回放全部迁移，得到与生产同构的内存 SQLite。 */
function database(): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of readdirSync('src/db/migrations')
    .filter((file) => file.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(`src/db/migrations/${name}`, 'utf8'))
  }
  return sqlite
}

/** 内存 SQLite + 全迁移回放 + 可用的 Drizzle db。 */
function createTestDb() {
  const sqlite = database()
  sqlite.exec(
    "INSERT INTO users(id,name,email,created_at,updated_at) VALUES ('u1','User','u1@example.com',1,1),('u2','Other','u2@example.com',1,1),('u3','Admin','u3@example.com',1,1)",
  )
  const db = drizzle(async (query, params, method) => {
    const statement = sqlite.prepare(query)
    if (method === 'run') {
      statement.run(...params)
      return { rows: [] }
    }
    return { rows: statement.all(...params).map((row) => Object.values(row)) }
  })
  return { sqlite, db: db as unknown as DB }
}

/** 写一行订单：收款码快照与凭证 key 都由调用方决定。 */
function insertOrder(
  sqlite: DatabaseSync,
  options: {
    id: string
    userId?: string
    status?: string
    receiptKey?: string | null
  },
): void {
  sqlite
    .prepare(
      `INSERT INTO collection_orders(id,user_id,account_id,channel,product_id,offer_id,kind,base_amount,fingerprint,payable_amount,currency,status,qr_image_url,qr_image_key,receipt_key,expires_at,created_at,updated_at)
       VALUES (?, ?, 'acct-main', 'alipay', 'pro', 'once', 'one_time', 1000, 1, 1001, 'cny', ?, '/collection/main.png', NULL, ?, 4102444800, 1, 1)`,
    )
    .run(
      options.id,
      options.userId ?? 'u1',
      options.status ?? 'pending_payment',
      options.receiptKey ?? null,
    )
}

/** 写一行收款账户记录。 */
function insertAccount(sqlite: DatabaseSync, accountId: string, qrImageKey: string | null): void {
  sqlite
    .prepare(
      `INSERT INTO collection_accounts(id,channel,display_name,currency,qr_image_key,enabled,created_at,updated_at)
       VALUES (?, 'alipay', '支付宝', 'cny', ?, 1, 1, 1)`,
    )
    .run(accountId, qrImageKey)
}

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>

function getHandler(route: unknown, method: 'GET' | 'POST'): Handler {
  const handlers = (route as { options?: { server?: { handlers?: Record<string, unknown> } } })
    .options?.server?.handlers
  const handler = handlers?.[method]
  if (typeof handler !== 'function') throw new Error(`${method} handler 缺失`)
  return handler as Handler
}

const receiptHandler = getHandler(ReceiptRoute, 'POST')
const receiptGetHandler = getHandler(ReceiptRoute, 'GET')
const qrcodeHandler = getHandler(QrcodeRoute, 'POST')
const qrcodeGetHandler = getHandler(QrcodeRoute, 'GET')

/** 构造一个 multipart 上传请求。 */
function uploadRequest(
  url: string,
  bytes: Uint8Array<ArrayBuffer>,
  type: string,
  name = 'shot.png',
): Request {
  const form = new FormData()
  form.set('file', new File([bytes], name, { type }))
  return new Request(url, { method: 'POST', body: form })
}

let sqlite: DatabaseSync

beforeEach(() => {
  vi.clearAllMocks()
  state.gate = undefined
  state.session = { user: { id: 'u1', role: 'user' } }
  state.env = { DB: {}, BUCKET: {} }
  const created = createTestDb()
  sqlite = created.sqlite
  state.db = created.db
  state.uploadFile.mockResolvedValue({
    key: 'collection-receipts/u1/1-o1.png',
    url: '/api/files/x',
    metadata: {},
  })
  state.downloadFile.mockResolvedValue(new ReadableStream())
  state.getFileInfo.mockResolvedValue({
    key: 'collection-receipts/u1/1-o1.png',
    size: 12,
    contentType: 'image/png',
    uploadedAt: new Date(),
  })
  state.deleteFile.mockResolvedValue(undefined)
})

describe('validateCollectionImage', () => {
  it('接受声明类型与文件头一致的 JPG / PNG / WebP', () => {
    expect(validateCollectionImage(PNG_BYTES, 'image/png', 'qrcode')).toEqual({
      ok: true,
      contentType: 'image/png',
    })
    expect(validateCollectionImage(JPEG_BYTES, 'image/jpeg', 'receipt')).toEqual({
      ok: true,
      contentType: 'image/jpeg',
    })
    expect(validateCollectionImage(WEBP_BYTES, 'image/webp', 'receipt')).toEqual({
      ok: true,
      contentType: 'image/webp',
    })
  })

  it('拒绝 MIME 为 image/png 但 magic bytes 不是 PNG 的文件', () => {
    expect(validateCollectionImage(JPEG_BYTES, 'image/png', 'receipt')).toEqual({
      ok: false,
      reason: 'content_mismatch',
    })
  })

  it('拒绝声明类型不在白名单的文件', () => {
    expect(validateCollectionImage(PNG_BYTES, 'image/gif', 'receipt')).toEqual({
      ok: false,
      reason: 'unsupported_type',
    })
  })

  it('凭证超过 5 MiB、二维码超过 2 MiB 时拒绝', () => {
    const tooBigForReceipt = new Uint8Array(COLLECTION_IMAGE_MAX_BYTES.receipt + 1)
    tooBigForReceipt.set(PNG_BYTES, 0)
    expect(validateCollectionImage(tooBigForReceipt, 'image/png', 'receipt')).toEqual({
      ok: false,
      reason: 'too_large',
    })

    const tooBigForQrcode = new Uint8Array(COLLECTION_IMAGE_MAX_BYTES.qrcode + 1)
    tooBigForQrcode.set(PNG_BYTES, 0)
    expect(validateCollectionImage(tooBigForQrcode, 'image/png', 'qrcode')).toEqual({
      ok: false,
      reason: 'too_large',
    })
  })

  it('大小上限边界：刚好等于上限的文件放行', () => {
    const exact = new Uint8Array(COLLECTION_IMAGE_MAX_BYTES.qrcode)
    exact.set(PNG_BYTES, 0)
    expect(validateCollectionImage(exact, 'image/png', 'qrcode')).toEqual({
      ok: true,
      contentType: 'image/png',
    })
  })
})

describe('付款凭证端点', () => {
  it('其他用户读取凭证返回 404，admin 可读', async () => {
    insertOrder(sqlite, { id: 'o1', userId: 'u1', receiptKey: 'collection-receipts/u1/1-o1.png' })

    state.session = { user: { id: 'u2', role: 'user' } }
    const denied = await receiptGetHandler({
      request: new Request('https://example.com/api/collection/orders/o1/receipt'),
      params: { orderId: 'o1' },
    })
    expect(denied.status).toBe(404)
    expect(await denied.json()).toEqual({ error: 'ORDER_NOT_FOUND' })
    expect(state.downloadFile).not.toHaveBeenCalled()

    state.session = { user: { id: 'u3', role: 'admin' } }
    const allowed = await receiptGetHandler({
      request: new Request('https://example.com/api/collection/orders/o1/receipt'),
      params: { orderId: 'o1' },
    })
    expect(allowed.status).toBe(200)
    expect(allowed.headers.get('Content-Type')).toBe('image/png')
    expect(allowed.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('订单所有者可读自己的凭证', async () => {
    insertOrder(sqlite, { id: 'o1', userId: 'u1', receiptKey: 'collection-receipts/u1/1-o1.png' })

    const response = await receiptGetHandler({
      request: new Request('https://example.com/api/collection/orders/o1/receipt'),
      params: { orderId: 'o1' },
    })

    expect(response.status).toBe(200)
    expect(state.downloadFile).toHaveBeenCalledWith('collection-receipts/u1/1-o1.png', true)
  })

  it('上传凭证成功：私有可见性 + 落库', async () => {
    insertOrder(sqlite, { id: 'o1', userId: 'u1' })

    const response = await receiptHandler({
      request: uploadRequest(
        'https://example.com/api/collection/orders/o1/receipt',
        PNG_BYTES,
        'image/png',
      ),
      params: { orderId: 'o1' },
    })

    expect(response.status).toBe(200)
    expect(state.uploadFile).toHaveBeenCalledTimes(1)
    const uploadArgs = state.uploadFile.mock.calls[0] ?? []
    expect(uploadArgs[2]).toBe('image/png')
    expect(uploadArgs[3]).toMatchObject({
      folder: 'collection-receipts',
      userId: 'u1',
      visibility: 'private',
    })
    const row = sqlite
      .prepare('SELECT receipt_key FROM collection_orders WHERE id = ?')
      .get('o1') as { receipt_key: string }
    expect(row.receipt_key).toBe('collection-receipts/u1/1-o1.png')
  })

  it('上传凭证时 MIME 伪装被拒绝且不写库', async () => {
    insertOrder(sqlite, { id: 'o1', userId: 'u1' })

    const response = await receiptHandler({
      request: uploadRequest(
        'https://example.com/api/collection/orders/o1/receipt',
        JPEG_BYTES,
        'image/png',
      ),
      params: { orderId: 'o1' },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'INVALID_RECEIPT' })
    expect(state.uploadFile).not.toHaveBeenCalled()
    const row = sqlite
      .prepare('SELECT receipt_key FROM collection_orders WHERE id = ?')
      .get('o1') as { receipt_key: string | null }
    expect(row.receipt_key).toBeNull()
  })

  it('上传凭证超过 5 MiB 时拒绝且不上传', async () => {
    insertOrder(sqlite, { id: 'o1', userId: 'u1' })
    const oversized = new Uint8Array(COLLECTION_IMAGE_MAX_BYTES.receipt + 1)
    oversized.set(PNG_BYTES, 0)

    const response = await receiptHandler({
      request: uploadRequest(
        'https://example.com/api/collection/orders/o1/receipt',
        oversized,
        'image/png',
      ),
      params: { orderId: 'o1' },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'INVALID_RECEIPT' })
    expect(state.uploadFile).not.toHaveBeenCalled()
  })

  it('非订单所有者上传凭证返回 404', async () => {
    insertOrder(sqlite, { id: 'o1', userId: 'u1' })
    state.session = { user: { id: 'u2', role: 'user' } }

    const response = await receiptHandler({
      request: uploadRequest(
        'https://example.com/api/collection/orders/o1/receipt',
        PNG_BYTES,
        'image/png',
      ),
      params: { orderId: 'o1' },
    })

    expect(response.status).toBe(404)
    expect(state.uploadFile).not.toHaveBeenCalled()
  })

  it('订单不在可上传状态时返回 INVALID_ORDER_STATE', async () => {
    insertOrder(sqlite, { id: 'o1', userId: 'u1', status: 'settled' })

    const response = await receiptHandler({
      request: uploadRequest(
        'https://example.com/api/collection/orders/o1/receipt',
        PNG_BYTES,
        'image/png',
      ),
      params: { orderId: 'o1' },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'INVALID_ORDER_STATE' })
    expect(state.uploadFile).not.toHaveBeenCalled()
  })

  it('无 BUCKET 时返回 STORAGE_UNAVAILABLE 且不改 DB', async () => {
    insertOrder(sqlite, { id: 'o1', userId: 'u1' })
    state.env = { DB: {} }

    const response = await receiptHandler({
      request: uploadRequest(
        'https://example.com/api/collection/orders/o1/receipt',
        PNG_BYTES,
        'image/png',
      ),
      params: { orderId: 'o1' },
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'STORAGE_UNAVAILABLE' })
    expect(state.uploadFile).not.toHaveBeenCalled()
    const row = sqlite
      .prepare('SELECT receipt_key FROM collection_orders WHERE id = ?')
      .get('o1') as { receipt_key: string | null }
    expect(row.receipt_key).toBeNull()
  })

  it('未登录读凭证返回 401 UNAUTHENTICATED；对象取不到时按 ORDER_NOT_FOUND 处理', async () => {
    state.session = null
    const denied = await receiptGetHandler({
      request: new Request('https://example.com/api/collection/orders/o1/receipt'),
      params: { orderId: 'o1' },
    })
    expect(denied.status).toBe(401)
    expect(await denied.json()).toEqual({ error: 'UNAUTHENTICATED' })

    state.session = { user: { id: 'u1', role: 'user' } }
    insertOrder(sqlite, { id: 'o1', userId: 'u1', receiptKey: 'collection-receipts/u1/gone.png' })
    state.downloadFile.mockResolvedValue(null)
    const missing = await receiptGetHandler({
      request: new Request('https://example.com/api/collection/orders/o1/receipt'),
      params: { orderId: 'o1' },
    })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'ORDER_NOT_FOUND' })
  })

  it('未登录上传凭证返回 401 UNAUTHENTICATED', async () => {
    state.session = null
    const response = await receiptHandler({
      request: uploadRequest(
        'https://example.com/api/collection/orders/o1/receipt',
        PNG_BYTES,
        'image/png',
      ),
      params: { orderId: 'o1' },
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'UNAUTHENTICATED' })
  })

  it('模块关闭时直接返回门禁响应，不碰对象存储', async () => {
    state.gate = Response.json({ error: 'MODULE_DISABLED' }, { status: 404 })

    const response = await receiptGetHandler({
      request: new Request('https://example.com/api/collection/orders/o1/receipt'),
      params: { orderId: 'o1' },
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'MODULE_DISABLED' })
    expect(state.downloadFile).not.toHaveBeenCalled()
  })
})

describe('收款码端点', () => {
  it('非 admin 不能上传二维码', async () => {
    state.session = { user: { id: 'u1', role: 'user' } }

    const response = await qrcodeHandler({
      request: uploadRequest(
        'https://example.com/api/collection/accounts/acct-main/qrcode',
        PNG_BYTES,
        'image/png',
      ),
      params: { accountId: 'acct-main' },
    })

    expect(response.status).toBe(403)
    expect(state.uploadFile).not.toHaveBeenCalled()
  })

  it('admin 上传收款码成功：先上传对象再更新账户记录', async () => {
    state.session = { user: { id: 'u3', role: 'admin' } }
    state.uploadFile.mockResolvedValue({
      key: 'collection-qrcodes/u3/1-acct-main.png',
      url: '/api/files/x',
      metadata: {},
    })

    const response = await qrcodeHandler({
      request: uploadRequest(
        'https://example.com/api/collection/accounts/acct-main/qrcode',
        PNG_BYTES,
        'image/png',
      ),
      params: { accountId: 'acct-main' },
    })

    expect(response.status).toBe(200)
    expect(state.uploadFile).toHaveBeenCalledTimes(1)
    expect(state.uploadFile.mock.calls[0]?.[3]).toMatchObject({
      folder: 'collection-qrcodes',
      visibility: 'private',
    })
    const row = sqlite
      .prepare('SELECT qr_image_key FROM collection_accounts WHERE id = ?')
      .get('acct-main') as { qr_image_key: string }
    expect(row.qr_image_key).toBe('collection-qrcodes/u3/1-acct-main.png')
  })

  it('替换收款码时删除旧对象：删除失败只告警，不回滚新配置', async () => {
    state.session = { user: { id: 'u3', role: 'admin' } }
    insertAccount(sqlite, 'acct-main', 'collection-qrcodes/u3/old.png')
    state.uploadFile.mockResolvedValue({
      key: 'collection-qrcodes/u3/new.png',
      url: '/api/files/x',
      metadata: {},
    })
    state.deleteFile.mockRejectedValue(new Error('R2 unavailable'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await qrcodeHandler({
      request: uploadRequest(
        'https://example.com/api/collection/accounts/acct-main/qrcode',
        PNG_BYTES,
        'image/png',
      ),
      params: { accountId: 'acct-main' },
    })

    expect(response.status).toBe(200)
    const row = sqlite
      .prepare('SELECT qr_image_key FROM collection_accounts WHERE id = ?')
      .get('acct-main') as { qr_image_key: string }
    expect(row.qr_image_key).toBe('collection-qrcodes/u3/new.png')
    expect(state.deleteFile).toHaveBeenCalledWith('collection-qrcodes/u3/old.png', true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('无 BUCKET 时返回 STORAGE_UNAVAILABLE 且账户记录未变', async () => {
    state.session = { user: { id: 'u3', role: 'admin' } }
    insertAccount(sqlite, 'acct-main', 'collection-qrcodes/u3/old.png')
    state.env = { DB: {} }

    const response = await qrcodeHandler({
      request: uploadRequest(
        'https://example.com/api/collection/accounts/acct-main/qrcode',
        PNG_BYTES,
        'image/png',
      ),
      params: { accountId: 'acct-main' },
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'STORAGE_UNAVAILABLE' })
    expect(state.uploadFile).not.toHaveBeenCalled()
    const row = sqlite
      .prepare('SELECT qr_image_key FROM collection_accounts WHERE id = ?')
      .get('acct-main') as { qr_image_key: string }
    expect(row.qr_image_key).toBe('collection-qrcodes/u3/old.png')
  })

  it('上传收款码时 MIME 伪装被拒绝', async () => {
    state.session = { user: { id: 'u3', role: 'admin' } }

    const response = await qrcodeHandler({
      request: uploadRequest(
        'https://example.com/api/collection/accounts/acct-main/qrcode',
        PNG_BYTES,
        'image/gif',
      ),
      params: { accountId: 'acct-main' },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'INVALID_QRCODE' })
    expect(state.uploadFile).not.toHaveBeenCalled()
  })

  it('上传收款码超过 2 MiB 时拒绝且不上传', async () => {
    state.session = { user: { id: 'u3', role: 'admin' } }
    const oversized = new Uint8Array(COLLECTION_IMAGE_MAX_BYTES.qrcode + 1)
    oversized.set(PNG_BYTES, 0)

    const response = await qrcodeHandler({
      request: uploadRequest(
        'https://example.com/api/collection/accounts/acct-main/qrcode',
        oversized,
        'image/png',
      ),
      params: { accountId: 'acct-main' },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'INVALID_QRCODE' })
    expect(state.uploadFile).not.toHaveBeenCalled()
  })

  it('读取不存在的收款账户返回 400 NO_COLLECTION_ACCOUNT', async () => {
    state.session = { user: { id: 'u3', role: 'admin' } }

    const response = await qrcodeGetHandler({
      request: new Request('https://example.com/api/collection/accounts/nope/qrcode'),
      params: { accountId: 'nope' },
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'NO_COLLECTION_ACCOUNT' })
    expect(state.downloadFile).not.toHaveBeenCalled()
  })

  it('读取没有二维码的收款账户返回 404 ORDER_NOT_FOUND', async () => {
    state.session = { user: { id: 'u3', role: 'admin' } }
    insertAccount(sqlite, 'acct-main', null)

    const response = await qrcodeGetHandler({
      request: new Request('https://example.com/api/collection/accounts/acct-main/qrcode'),
      params: { accountId: 'acct-main' },
    })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'ORDER_NOT_FOUND' })
    expect(state.downloadFile).not.toHaveBeenCalled()
  })

  it('未登录读收款码返回 401 UNAUTHENTICATED', async () => {
    state.session = null

    const response = await qrcodeGetHandler({
      request: new Request('https://example.com/api/collection/accounts/acct-main/qrcode'),
      params: { accountId: 'acct-main' },
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'UNAUTHENTICATED' })
  })

  it('未登录上传收款码返回 401；对象取不到时按 ORDER_NOT_FOUND 处理', async () => {
    state.session = null
    const denied = await qrcodeHandler({
      request: uploadRequest(
        'https://example.com/api/collection/accounts/acct-main/qrcode',
        PNG_BYTES,
        'image/png',
      ),
      params: { accountId: 'acct-main' },
    })
    expect(denied.status).toBe(401)
    expect(await denied.json()).toEqual({ error: 'UNAUTHENTICATED' })

    state.session = { user: { id: 'u3', role: 'admin' } }
    insertAccount(sqlite, 'acct-main', 'collection-qrcodes/u3/gone.png')
    state.downloadFile.mockResolvedValue(null)
    const missing = await qrcodeGetHandler({
      request: new Request('https://example.com/api/collection/accounts/acct-main/qrcode'),
      params: { accountId: 'acct-main' },
    })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'ORDER_NOT_FOUND' })
  })

  it('其他用户读取收款码返回 404，订单所有者与 admin 可读', async () => {
    state.session = { user: { id: 'u3', role: 'admin' } }
    insertAccount(sqlite, 'acct-main', 'collection-qrcodes/u3/old.png')
    state.getFileInfo.mockResolvedValue({
      key: 'collection-qrcodes/u3/old.png',
      size: 12,
      contentType: 'image/png',
      uploadedAt: new Date(),
    })

    state.session = { user: { id: 'u2', role: 'user' } }
    const denied = await qrcodeGetHandler({
      request: new Request('https://example.com/api/collection/accounts/acct-main/qrcode'),
      params: { accountId: 'acct-main' },
    })
    expect(denied.status).toBe(404)
    expect(state.downloadFile).not.toHaveBeenCalled()

    // 订单所有者可读：归属依据是他持有该收款账户的订单。
    insertOrder(sqlite, { id: 'o1', userId: 'u2' })
    const owner = await qrcodeGetHandler({
      request: new Request('https://example.com/api/collection/accounts/acct-main/qrcode'),
      params: { accountId: 'acct-main' },
    })
    expect(owner.status).toBe(200)
    expect(owner.headers.get('Cache-Control')).toBe('private, no-store')

    state.session = { user: { id: 'u3', role: 'admin' } }
    const admin = await qrcodeGetHandler({
      request: new Request('https://example.com/api/collection/accounts/acct-main/qrcode'),
      params: { accountId: 'acct-main' },
    })
    expect(admin.status).toBe(200)
  })
})
