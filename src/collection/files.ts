/**
 * 核销链路的图片文件处理：收款码与付款凭证。
 *
 * 两条硬规则贯穿本文件：
 *
 * - **只信扩展名或只信 MIME 都不够**：攻击者可以把任意内容声明成 `image/png`。
 *   因此这里同时校验**声明类型**与**文件头（magic bytes）**，两者必须一致；
 *   收款码上限 2 MiB，付款凭证上限 5 MiB。
 * - **R2 key 不由客户端决定**：key 只能由订单号 / 账户 ID 查库得到。
 *   落库与读取都收口在这里，路由层拿不到「客户端指定的任意 key」。
 */

import { and, eq, inArray } from 'drizzle-orm'
import type { CollectionOrderStatus } from '@/collection/types'
import { type DB, schema } from '@/db'

/** 收款码在 R2 中的目录前缀。 */
export const COLLECTION_QRCODE_FOLDER = 'collection-qrcodes'
/** 付款凭证在 R2 中的目录前缀。 */
export const COLLECTION_RECEIPT_FOLDER = 'collection-receipts'

/** 允许的图片类型：JPG / PNG / WebP。 */
export const COLLECTION_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type CollectionImageType = (typeof COLLECTION_IMAGE_TYPES)[number]

/** 图片用途：收款码由管理员上传，付款凭证由订单所有者上传。 */
export type CollectionImageKind = 'qrcode' | 'receipt'

/** 各类图片的大小上限（字节）。 */
export const COLLECTION_IMAGE_MAX_BYTES: Record<CollectionImageKind, number> = {
  qrcode: 2 * 1024 * 1024,
  receipt: 5 * 1024 * 1024,
}

/** 拒绝原因：类型不在白名单、超过大小上限、文件头与声明类型不符。 */
export type CollectionImageRejection = 'unsupported_type' | 'too_large' | 'content_mismatch'

export type CollectionImageValidation =
  | { ok: true; contentType: CollectionImageType }
  | { ok: false; reason: CollectionImageRejection }

/**
 * 校验上传的图片：声明类型、大小与文件头三者都要过。
 *
 * @param bytes 文件内容
 * @param mime 客户端声明的类型（`File.type`）
 * @param kind 图片用途，决定大小上限
 */
export function validateCollectionImage(
  bytes: Uint8Array,
  mime: string,
  kind: CollectionImageKind,
): CollectionImageValidation {
  const declared = normalizeMime(mime)
  if (!declared) return { ok: false, reason: 'unsupported_type' }

  const maxBytes = COLLECTION_IMAGE_MAX_BYTES[kind]
  if (bytes.byteLength > maxBytes) return { ok: false, reason: 'too_large' }

  const detected = detectImageType(bytes)
  if (!detected || detected !== declared) return { ok: false, reason: 'content_mismatch' }

  return { ok: true, contentType: declared }
}

/** 归一化 MIME：去参数、转小写，并把 `image/jpg` 视作 `image/jpeg`。 */
function normalizeMime(mime: string): CollectionImageType | null {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  if (base === 'image/jpg') return 'image/jpeg'
  return (COLLECTION_IMAGE_TYPES as readonly string[]).includes(base)
    ? (base as CollectionImageType)
    : null
}

/** 按文件头判断真实图片类型；认不出就是 null。 */
function detectImageType(bytes: Uint8Array): CollectionImageType | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  // WebP: 'RIFF' .... 'WEBP'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

/** 图片类型到文件扩展名的映射：用于生成服务端可控的 R2 文件名。 */
export function imageExtension(contentType: CollectionImageType): 'jpg' | 'png' | 'webp' {
  if (contentType === 'image/jpeg') return 'jpg'
  if (contentType === 'image/webp') return 'webp'
  return 'png'
}

/** 订单的文件引用：只保留归属校验与状态判断需要的字段。 */
export interface CollectionOrderFileRef {
  id: string
  userId: string
  status: CollectionOrderStatus
  /** 付款凭证的 R2 key。 */
  receiptKey: string | null
}

/** 按订单 ID 读取文件引用；不存在返回 null。 */
export async function findOrderFileRef(
  db: DB,
  orderId: string,
): Promise<CollectionOrderFileRef | null> {
  const rows = await db
    .select({
      id: schema.collectionOrders.id,
      userId: schema.collectionOrders.userId,
      status: schema.collectionOrders.status,
      receiptKey: schema.collectionOrders.receiptKey,
    })
    .from(schema.collectionOrders)
    .where(eq(schema.collectionOrders.id, orderId))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return { ...row, status: row.status as CollectionOrderStatus }
}

/**
 * 写入付款凭证的 R2 key。
 *
 * 条件里带所有者与当前状态（CAS）：上传期间订单被取消 / 核验走完时写不进去，
 * 调用方据此回滚刚上传的对象，不留悬挂引用。
 *
 * @returns 是否写入成功
 */
export async function setOrderReceiptKey(
  db: DB,
  params: { orderId: string; userId: string; key: string; now?: Date },
): Promise<boolean> {
  const updated = await db
    .update(schema.collectionOrders)
    .set({ receiptKey: params.key, updatedAt: params.now ?? new Date() })
    .where(
      and(
        eq(schema.collectionOrders.id, params.orderId),
        eq(schema.collectionOrders.userId, params.userId),
        inArray(schema.collectionOrders.status, ['pending_payment', 'pending_verification']),
      ),
    )
    .returning({ id: schema.collectionOrders.id })
  return updated.length > 0
}

/** 收款账户的文件引用：只保留归属校验与 R2 key。 */
export interface CollectionAccountFileRef {
  id: string
  channel: string
  displayName: string
  currency: string
  /** 收款码的 R2 key。 */
  qrImageKey: string | null
  /** 账户是否启用：被禁用时账户解析会跳过它。 */
  enabled: boolean
}

/** 按账户 ID 读取文件引用；数据库没有该账户时返回 null。 */
export async function findAccountFileRef(
  db: DB,
  accountId: string,
): Promise<CollectionAccountFileRef | null> {
  const rows = await db
    .select({
      id: schema.collectionAccounts.id,
      channel: schema.collectionAccounts.channel,
      displayName: schema.collectionAccounts.displayName,
      currency: schema.collectionAccounts.currency,
      qrImageKey: schema.collectionAccounts.qrImageKey,
      enabled: schema.collectionAccounts.enabled,
    })
    .from(schema.collectionAccounts)
    .where(eq(schema.collectionAccounts.id, accountId))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return { ...row, enabled: Boolean(row.enabled) }
}

/**
 * 写入收款码的 R2 key。
 *
 * 数据库没有该账户时按调用方给的账户信息补一行（数据库只是覆盖，账户清单仍在
 * 源码配置里）；已有行只更新 key 与时间戳，**不改动 `enabled`** ——
 * 上传收款码不等于启用账户。
 */
export async function setAccountQrImageKey(
  db: DB,
  params: {
    accountId: string
    key: string
    channel: string
    displayName: string
    currency: string
    updatedBy?: string | null
    now?: Date
  },
): Promise<void> {
  const now = params.now ?? new Date()
  const updated = await db
    .update(schema.collectionAccounts)
    .set({ qrImageKey: params.key, updatedBy: params.updatedBy ?? null, updatedAt: now })
    .where(eq(schema.collectionAccounts.id, params.accountId))
    .returning({ id: schema.collectionAccounts.id })
  if (updated.length > 0) return

  await db.insert(schema.collectionAccounts).values({
    id: params.accountId,
    channel: params.channel,
    displayName: params.displayName,
    currency: params.currency,
    qrImageKey: params.key,
    enabled: true,
    updatedBy: params.updatedBy ?? null,
    createdAt: now,
    updatedAt: now,
  })
}

/** 该用户是否持有指定收款账户的订单：二维码读取的归属依据。 */
export async function hasOrderForAccount(
  db: DB,
  userId: string,
  accountId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: schema.collectionOrders.id })
    .from(schema.collectionOrders)
    .where(
      and(
        eq(schema.collectionOrders.userId, userId),
        eq(schema.collectionOrders.accountId, accountId),
      ),
    )
    .limit(1)
  return rows.length > 0
}
