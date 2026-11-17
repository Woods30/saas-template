/**
 * 用量计量与流水。
 *
 * 与积分账本一样，跑在 D1 上时没有交互式事务，所以：
 * - 用量流水靠 `idempotency_key` 唯一索引保证「同一次请求只记一次」；
 * - 额度与积分的消费都写成单条条件更新。
 */
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { type DB, schema } from '@/core/db'
import { consumeCredits, InsufficientCreditsError } from '@/modules/credits/service'
import { consumeQuota, restoreQuota } from '@/modules/entitlements/service'
import type { UsageRecord, UsageSummary } from './types'

export type { UsageRecord, UsageSummary }

export interface RecordUsageInput {
  userId: string
  /** 计量项。 */
  metric: string
  /** 数量，必须为正整数。 */
  quantity: number
  unit?: string
  /** 本次消耗的积分；不传按 0 记。 */
  credits?: number
  requestId?: string
  /** 幂等键：同一个键重复上报只记一次。 */
  idempotencyKey?: string
  metadata?: Record<string, unknown>
  now?: Date
}

export interface MeterUsageInput extends RecordUsageInput {
  /**
   * 额度权益键。
   *
   * 不传则不查额度。传了且权益是额度型，就按 `quantity` 扣额度。
   */
  entitlementKey?: string
}

export interface MeterUsageResult {
  usage: UsageRecord
  /** 这次扣了多少额度。 */
  quotaUsed: number
  /** 这次扣了多少积分。 */
  creditsUsed: number
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function toUsageRecord(row: typeof schema.usageRecords.$inferSelect): UsageRecord {
  let metadata: Record<string, unknown> | null = null
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>
    } catch {
      metadata = null
    }
  }
  return {
    id: row.id,
    userId: row.userId,
    metric: row.metric,
    quantity: row.quantity,
    unit: row.unit,
    credits: row.credits,
    requestId: row.requestId,
    idempotencyKey: row.idempotencyKey,
    metadata,
    createdAt: row.createdAt,
  }
}

/** 按幂等键找用量流水。 */
async function findByKey(db: DB, idempotencyKey: string): Promise<UsageRecord | undefined> {
  const rows = await db
    .select()
    .from(schema.usageRecords)
    .where(eq(schema.usageRecords.idempotencyKey, idempotencyKey))
    .limit(1)
  return rows[0] ? toUsageRecord(rows[0]) : undefined
}

/**
 * 记一条用量流水。
 *
 * 带幂等键时，同一个键重复上报只留一条：先查已有记录，命中就直接返回。
 */
export async function recordUsage(db: DB, input: RecordUsageInput): Promise<UsageRecord> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error(`用量数量必须为正整数，收到 ${input.quantity}`)
  }
  const credits = input.credits ?? 0
  if (!Number.isInteger(credits) || credits < 0) {
    throw new Error(`用量消耗的积分必须是非负整数，收到 ${credits}`)
  }

  if (input.idempotencyKey) {
    const existing = await findByKey(db, input.idempotencyKey)
    if (existing) return existing
  }

  const at = input.now ?? new Date()
  const record = {
    id: newId('usage'),
    userId: input.userId,
    metric: input.metric,
    quantity: input.quantity,
    unit: input.unit ?? 'count',
    credits,
    requestId: input.requestId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    createdAt: at,
  }

  await db
    .insert(schema.usageRecords)
    .values(record)
    .onConflictDoNothing({ target: schema.usageRecords.idempotencyKey })

  if (input.idempotencyKey) {
    const stored = await findByKey(db, input.idempotencyKey)
    if (stored) return stored
  }
  return toUsageRecord(record)
}

/**
 * 计量一次使用：扣额度 → 扣积分 → 记流水。
 *
 * 额度不足抛 `QuotaExceededError`，积分不足抛 `InsufficientCreditsError`；
 * 两者都**不留下用量流水**——没发生的用量不该出现在统计里。
 */
export async function meterUsage(db: DB, input: MeterUsageInput): Promise<MeterUsageResult> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error(`用量数量必须为正整数，收到 ${input.quantity}`)
  }
  const credits = input.credits ?? 0
  const at = input.now ?? new Date()

  // 额度先扣：额度不足时什么都没发生。
  if (input.entitlementKey) {
    await consumeQuota(db, input.userId, input.entitlementKey, input.quantity, at)
  }

  // 再扣积分；不够就把额度还回去，避免「占了额度却没收费」。
  if (credits > 0) {
    try {
      await consumeCredits(db, {
        userId: input.userId,
        amount: credits,
        idempotencyKey: input.idempotencyKey
          ? `usage:${input.idempotencyKey}`
          : `usage:${newId('auto')}`,
        now: at,
      })
    } catch (error) {
      if (input.entitlementKey) {
        await restoreQuota(db, input.userId, input.entitlementKey, input.quantity, at)
      }
      if (error instanceof InsufficientCreditsError) throw error
      throw error
    }
  }

  const usage = await recordUsage(db, { ...input, credits, now: at })
  return { usage, quotaUsed: input.entitlementKey ? input.quantity : 0, creditsUsed: credits }
}

/** 用量流水：最近的在前。 */
export async function listUsage(db: DB, userId: string, limit = 50): Promise<UsageRecord[]> {
  const rows = await db
    .select()
    .from(schema.usageRecords)
    .where(eq(schema.usageRecords.userId, userId))
    .orderBy(desc(schema.usageRecords.createdAt))
    .limit(limit)
  return rows.map(toUsageRecord)
}

/** 按计量项汇总；`since` 限定统计区间。 */
export async function getUsageSummary(
  db: DB,
  userId: string,
  since?: Date,
): Promise<UsageSummary[]> {
  const rows = await db
    .select({
      metric: schema.usageRecords.metric,
      quantity: sql<number>`sum(${schema.usageRecords.quantity})`,
      credits: sql<number>`sum(${schema.usageRecords.credits})`,
      records: sql<number>`count(*)`,
    })
    .from(schema.usageRecords)
    .where(
      since
        ? and(eq(schema.usageRecords.userId, userId), gte(schema.usageRecords.createdAt, since))
        : eq(schema.usageRecords.userId, userId),
    )
    .groupBy(schema.usageRecords.metric)

  return rows.map((row) => ({
    metric: row.metric,
    quantity: Number(row.quantity ?? 0),
    credits: Number(row.credits ?? 0),
    records: Number(row.records ?? 0),
  }))
}
