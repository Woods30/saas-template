import { describe, expect, it } from 'vitest'

import { type DB, schema } from '@/core/db'
import {
  COLLECTION_IMAGE_MAX_BYTES,
  findAccountFileRef,
  findOrderFileRef,
  hasOrderForAccount,
  setAccountQrImageKey,
  setOrderReceiptKey,
  validateCollectionImage,
} from '@/modules/manual-payments/files'
import { createTestDatabase } from '../helpers/database'

/**
 * 核销链路的文件处理：类型伪装、大小上限、归属校验与 key 落库。
 *
 * 断言对象是「行为」而不是实现细节：声明类型与文件头必须一致、凭证 key
 * 只能写在「订单所有者 + 可上传状态」同时成立的行上。
 */

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

/** 内存 SQLite + 全迁移回放 + 可用的 Drizzle db。 */
function createTestDb() {
  const { sqlite, db } = createTestDatabase()
  sqlite.exec(
    "INSERT INTO users(id,name,email,created_at,updated_at) VALUES ('u1','User','u1@example.com',1,1),('u2','Other','u2@example.com',1,1),('u3','Admin','u3@example.com',1,1)",
  )
  return { sqlite, db }
}

/** 写一行订单：收款码快照与凭证 key 都由调用方决定。 */
function insertOrder(
  sqlite: ReturnType<typeof createTestDatabase>['sqlite'],
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
function insertAccount(
  sqlite: ReturnType<typeof createTestDatabase>['sqlite'],
  accountId: string,
  qrImageKey: string | null,
): void {
  sqlite
    .prepare(
      `INSERT INTO collection_accounts(id,channel,display_name,currency,qr_image_key,enabled,created_at,updated_at)
       VALUES (?, 'alipay', '支付宝', 'cny', ?, 1, 1, 1)`,
    )
    .run(accountId, qrImageKey)
}

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

describe('订单文件引用', () => {
  it('按订单 ID 读取引用，读不到时返回 null', async () => {
    const { db, sqlite } = createTestDb()
    insertOrder(sqlite, { id: 'o1', userId: 'u1', receiptKey: 'collection-receipts/u1/1-o1.png' })

    const ref = await findOrderFileRef(db, 'o1')
    expect(ref).toMatchObject({
      id: 'o1',
      userId: 'u1',
      status: 'pending_payment',
      receiptKey: 'collection-receipts/u1/1-o1.png',
    })
    expect(await findOrderFileRef(db, 'missing')).toBeNull()
    sqlite.close()
  })

  it('凭证 key 只写进「订单所有者 + 可上传状态」同时成立的行', async () => {
    const { db, sqlite } = createTestDb()
    insertOrder(sqlite, { id: 'o1', userId: 'u1' })

    // 别人的订单写不进去。
    expect(await setOrderReceiptKey(db, { orderId: 'o1', userId: 'u2', key: 'k.png' })).toBe(false)
    // 已结算的订单写不进去。
    sqlite.prepare("UPDATE collection_orders SET status = 'settled' WHERE id = 'o1'").run()
    expect(await setOrderReceiptKey(db, { orderId: 'o1', userId: 'u1', key: 'k.png' })).toBe(false)

    sqlite.prepare("UPDATE collection_orders SET status = 'pending_payment' WHERE id = 'o1'").run()
    expect(await setOrderReceiptKey(db, { orderId: 'o1', userId: 'u1', key: 'k.png' })).toBe(true)
    const row = sqlite
      .prepare('SELECT receipt_key FROM collection_orders WHERE id = ?')
      .get('o1') as {
      receipt_key: string
    }
    expect(row.receipt_key).toBe('k.png')
    sqlite.close()
  })

  it('该用户是否持有指定收款账户的订单', async () => {
    const { db, sqlite } = createTestDb()
    insertOrder(sqlite, { id: 'o1', userId: 'u1' })

    expect(await hasOrderForAccount(db, 'u1', 'acct-main')).toBe(true)
    expect(await hasOrderForAccount(db, 'u2', 'acct-main')).toBe(false)
    expect(await hasOrderForAccount(db, 'u1', 'acct-other')).toBe(false)
    sqlite.close()
  })
})

describe('收款账户文件引用', () => {
  it('数据库没有该账户时返回 null', async () => {
    const { db, sqlite } = createTestDb()
    expect(await findAccountFileRef(db, 'acct-main')).toBeNull()
    sqlite.close()
  })

  it('写入收款码 key：已有行只更新 key，不改启用状态', async () => {
    const { db, sqlite } = createTestDb()
    insertAccount(sqlite, 'acct-main', null)
    sqlite.prepare("UPDATE collection_accounts SET enabled = 0 WHERE id = 'acct-main'").run()

    await setAccountQrImageKey(db, {
      accountId: 'acct-main',
      key: 'collection-qrcodes/main.png',
      channel: 'alipay',
      displayName: '支付宝',
      currency: 'cny',
    })

    const ref = await findAccountFileRef(db, 'acct-main')
    expect(ref).toMatchObject({
      id: 'acct-main',
      qrImageKey: 'collection-qrcodes/main.png',
      // 上传收款码不等于启用账户。
      enabled: false,
    })
    sqlite.close()
  })

  it('数据库没有该账户时补一行', async () => {
    const { db, sqlite } = createTestDb()
    await setAccountQrImageKey(db, {
      accountId: 'acct-new',
      key: 'collection-qrcodes/new.png',
      channel: 'alipay',
      displayName: '新账户',
      currency: 'cny',
    })

    const rows = await db.select().from(schema.collectionAccounts)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'acct-new', enabled: true })
    sqlite.close()
  })
})

describe('db 类型', () => {
  it('测试用的 db 与模块签名一致', () => {
    const { db, sqlite } = createTestDb()
    const typed: DB = db
    expect(typed).toBeDefined()
    sqlite.close()
  })
})
