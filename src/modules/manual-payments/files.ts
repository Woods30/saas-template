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
import { type DB, schema } from '@/core/db'
import type { ManualPaymentOrderStatus } from './types'

/** 收款码在 R2 中的目录前缀。 */
export const MANUAL_PAYMENT_QRCODE_FOLDER = 'manual-payment-qrcodes'
/** 付款凭证在 R2 中的目录前缀。 */
export const MANUAL_PAYMENT_RECEIPT_FOLDER = 'manual-payment-receipts'

/** 收款码 key 的命名空间前缀（含斜杠）。 */
export const MANUAL_PAYMENT_QRCODE_PREFIX = `${MANUAL_PAYMENT_QRCODE_FOLDER}/`

/** 付款凭证 key 的命名空间前缀（含斜杠）。 */
export const MANUAL_PAYMENT_RECEIPT_PREFIX = `${MANUAL_PAYMENT_RECEIPT_FOLDER}/`

/** 收款码 key 的扩展名白名单：与 `imageExtension` 的输出一致。 */
const QR_IMAGE_EXTENSIONS = ['jpg', 'png', 'webp'] as const

/** 账户 ID 的合法字符：字母、数字、下划线与连字符。 */
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/** 账户 ID 是否合法。 */
export function isManualPaymentAccountId(accountId: string): boolean {
  return ACCOUNT_ID_PATTERN.test(accountId)
}

/**
 * 由服务端派生收款码的 R2 key。
 *
 * key 只由「账户 ID + 扩展名」决定：客户端不能指定 key，否则就能把任意对象
 * （包括别的用户的付款凭证）挂到这个账户上，等于开了个任意文件读的口子。
 */
export function manualPaymentQrImageKey(accountId: string, extension: string): string {
  return `${MANUAL_PAYMENT_QRCODE_PREFIX}${accountId}.${extension}`
}

/**
 * 这个 key 是不是该账户自己的收款码。
 *
 * 只认服务端派生出来的形式：`manual-payment-qrcodes/<accountId>.<jpg|png|webp>`。
 * 账户 ID 本身也要先过字符检查，否则 key 里会出现路径片段。
 */
export function isManualPaymentQrImageKey(accountId: string, key: string): boolean {
  if (!isManualPaymentAccountId(accountId)) return false
  return QR_IMAGE_EXTENSIONS.some((ext) => manualPaymentQrImageKey(accountId, ext) === key)
}

/**
 * 由服务端派生付款凭证的 R2 key。
 *
 * 与收款码同理：key 只由订单号与扩展名决定，客户端无从构造。
 */
export function manualPaymentReceiptKey(orderId: string, extension: string): string {
  return `${MANUAL_PAYMENT_RECEIPT_PREFIX}${orderId}.${extension}`
}

/** 允许的图片类型：JPG / PNG / WebP。 */
export const MANUAL_PAYMENT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type ManualPaymentImageType = (typeof MANUAL_PAYMENT_IMAGE_TYPES)[number]

/** 图片用途：收款码由管理员上传，付款凭证由订单所有者上传。 */
export type ManualPaymentImageKind = 'qrcode' | 'receipt'

/** 各类图片的大小上限（字节）。 */
export const MANUAL_PAYMENT_IMAGE_MAX_BYTES: Record<ManualPaymentImageKind, number> = {
  qrcode: 2 * 1024 * 1024,
  receipt: 5 * 1024 * 1024,
}

/** 拒绝原因：类型不在白名单、超过大小上限、文件头与声明类型不符。 */
export type ManualPaymentImageRejection = 'unsupported_type' | 'too_large' | 'content_mismatch'

export type ManualPaymentImageValidation =
  | { ok: true; contentType: ManualPaymentImageType }
  | { ok: false; reason: ManualPaymentImageRejection }

/**
 * 校验上传的图片：声明类型、大小与文件头三者都要过。
 *
 * @param bytes 文件内容
 * @param mime 客户端声明的类型（`File.type`）
 * @param kind 图片用途，决定大小上限
 */
export function validateManualPaymentImage(
  bytes: Uint8Array,
  mime: string,
  kind: ManualPaymentImageKind,
): ManualPaymentImageValidation {
  const declared = normalizeMime(mime)
  if (!declared) return { ok: false, reason: 'unsupported_type' }

  const maxBytes = MANUAL_PAYMENT_IMAGE_MAX_BYTES[kind]
  if (bytes.byteLength > maxBytes) return { ok: false, reason: 'too_large' }

  const detected = detectImageType(bytes)
  if (!detected || detected !== declared) return { ok: false, reason: 'content_mismatch' }

  return { ok: true, contentType: declared }
}

/** 归一化 MIME：去参数、转小写，并把 `image/jpg` 视作 `image/jpeg`。 */
function normalizeMime(mime: string): ManualPaymentImageType | null {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  if (base === 'image/jpg') return 'image/jpeg'
  return (MANUAL_PAYMENT_IMAGE_TYPES as readonly string[]).includes(base)
    ? (base as ManualPaymentImageType)
    : null
}

/** 按文件头判断真实图片类型；认不出就是 null。 */
function detectImageType(bytes: Uint8Array): ManualPaymentImageType | null {
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
export function imageExtension(contentType: ManualPaymentImageType): 'jpg' | 'png' | 'webp' {
  if (contentType === 'image/jpeg') return 'jpg'
  if (contentType === 'image/webp') return 'webp'
  return 'png'
}

/** 订单的文件引用：只保留归属校验与状态判断需要的字段。 */
export interface ManualPaymentOrderFileRef {
  id: string
  userId: string
  status: ManualPaymentOrderStatus
  /** 付款凭证的 R2 key。 */
  receiptKey: string | null
}

/** 按订单 ID 读取文件引用；不存在返回 null。 */
export async function findOrderFileRef(
  db: DB,
  orderId: string,
): Promise<ManualPaymentOrderFileRef | null> {
  const rows = await db
    .select({
      id: schema.manualPaymentOrders.id,
      userId: schema.manualPaymentOrders.userId,
      status: schema.manualPaymentOrders.status,
      receiptKey: schema.manualPaymentOrders.receiptKey,
    })
    .from(schema.manualPaymentOrders)
    .where(eq(schema.manualPaymentOrders.id, orderId))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return { ...row, status: row.status as ManualPaymentOrderStatus }
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
    .update(schema.manualPaymentOrders)
    .set({ receiptKey: params.key, updatedAt: params.now ?? new Date() })
    .where(
      and(
        eq(schema.manualPaymentOrders.id, params.orderId),
        eq(schema.manualPaymentOrders.userId, params.userId),
        inArray(schema.manualPaymentOrders.status, ['pending_payment', 'pending_verification']),
      ),
    )
    .returning({ id: schema.manualPaymentOrders.id })
  return updated.length > 0
}

/** 收款账户的文件引用：只保留归属校验与 R2 key。 */
export interface ManualPaymentAccountFileRef {
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
): Promise<ManualPaymentAccountFileRef | null> {
  const rows = await db
    .select({
      id: schema.manualPaymentAccounts.id,
      channel: schema.manualPaymentAccounts.channel,
      displayName: schema.manualPaymentAccounts.displayName,
      currency: schema.manualPaymentAccounts.currency,
      qrImageKey: schema.manualPaymentAccounts.qrImageKey,
      enabled: schema.manualPaymentAccounts.enabled,
    })
    .from(schema.manualPaymentAccounts)
    .where(eq(schema.manualPaymentAccounts.id, accountId))
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
    .update(schema.manualPaymentAccounts)
    .set({ qrImageKey: params.key, updatedBy: params.updatedBy ?? null, updatedAt: now })
    .where(eq(schema.manualPaymentAccounts.id, params.accountId))
    .returning({ id: schema.manualPaymentAccounts.id })
  if (updated.length > 0) return

  await db.insert(schema.manualPaymentAccounts).values({
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
    .select({ id: schema.manualPaymentOrders.id })
    .from(schema.manualPaymentOrders)
    .where(
      and(
        eq(schema.manualPaymentOrders.userId, userId),
        eq(schema.manualPaymentOrders.accountId, accountId),
      ),
    )
    .limit(1)
  return rows.length > 0
}
