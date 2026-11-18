/**
 * 权益：套餐功能与额度。
 *
 * 三层来源，优先级从低到高：
 * 1. **目录**（`entitlements`）：产品有哪些权益、默认额度多少；
 * 2. **套餐**（`plans` + `plan_entitlements`）：订阅生效时按套餐给额度；
 * 3. **用户覆盖**（`user_entitlements`）：后台给单个用户单独加的额度。
 *
 * 解析（`resolveEntitlements`）会把生效额度**物化**到 `user_entitlements` 行上——
 * 这样额度消费就能写成一条条件更新（`used + amount <= limit_value`），
 * 不必在应用层先查后写。D1 没有交互式事务，先查后写在并发下必然出错。
 */
import { and, eq, inArray, sql } from 'drizzle-orm'
import { type DB, schema } from '@/core/db'
import { atomic } from '@/core/db/atomic'
import { ACTIVE_SUBSCRIPTION_STATUSES } from '@/modules/subscriptions/service'
import {
  type EntitlementCatalogItem,
  EntitlementNotFoundError,
  type EntitlementPeriod,
  type EntitlementType,
  type PlanItem,
  QuotaExceededError,
  type ResolvedEntitlement,
} from './types'

// 错误类按值导出：调用方要用 `instanceof` 判断额度不足与权益缺失。
export { EntitlementNotFoundError, QuotaExceededError } from './types'
export type {
  EntitlementCatalogItem,
  EntitlementPeriod,
  EntitlementType,
  PlanItem,
  ResolvedEntitlement,
}

const MONTH = 30 * 24 * 60 * 60 * 1000
const YEAR = 365 * 24 * 60 * 60 * 1000

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

/** 目录：产品有哪些权益。 */
export async function listEntitlements(db: DB): Promise<EntitlementCatalogItem[]> {
  const rows = await db
    .select()
    .from(schema.entitlements)
    .orderBy(sql`${schema.entitlements.sortOrder} asc`)
  return rows.map((row) => ({
    key: row.key,
    name: row.name,
    type: row.type as EntitlementType,
    defaultLimit: row.defaultLimit,
    period: row.period as EntitlementPeriod,
    description: row.description,
    sortOrder: row.sortOrder,
  }))
}

/** 套餐清单。 */
export async function listPlans(db: DB): Promise<PlanItem[]> {
  const rows = await db.select().from(schema.plans).orderBy(sql`${schema.plans.sortOrder} asc`)
  return rows.map((row) => ({
    key: row.key,
    name: row.name,
    description: row.description,
    productId: row.productId,
    offerId: row.offerId,
    active: row.active,
    sortOrder: row.sortOrder,
  }))
}

/** 周期窗口：按周期算出起止。`none` 表示永久，没有窗口。 */
export function periodWindow(
  period: EntitlementPeriod,
  now: Date,
): { start: Date; end: Date } | undefined {
  if (period === 'none') return undefined
  const span = period === 'month' ? MONTH : YEAR
  return { start: now, end: new Date(now.getTime() + span) }
}

/** 用户当前生效的套餐 key：来自生效中的订阅。 */
async function planKeysOfUser(db: DB, userId: string): Promise<string[]> {
  const subscriptions = await db
    .select({
      productId: schema.subscriptions.productId,
      offerId: schema.subscriptions.offerId,
    })
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        inArray(schema.subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
      ),
    )
  if (subscriptions.length === 0) return []

  const plans = await db.select().from(schema.plans)
  const keys: string[] = []
  for (const plan of plans) {
    if (!plan.active) continue
    const matched = subscriptions.some(
      (subscription) =>
        subscription.productId !== null &&
        subscription.offerId !== null &&
        plan.productId === subscription.productId &&
        plan.offerId === subscription.offerId,
    )
    if (matched) keys.push(plan.key)
  }
  return keys
}

/**
 * 套餐给的权益与额度。
 *
 * `plan_entitlements.limit_value` 为 null 表示**沿用目录默认值**，不是不限量——
 * 不限量是目录默认值本身为 null。合并前先把每一行按目录默认值解析成具体额度，
 * 再取最大的那个；否则「一个套餐沿用默认值、另一个给更高额度」会被默认值盖掉。
 *
 * @param catalogDefaults 目录里的默认额度（key → 默认额度，null 表示不限量）
 */
async function planGrants(
  db: DB,
  planKeys: string[],
  catalogDefaults: Map<string, number | null>,
): Promise<Map<string, number | null>> {
  const grants = new Map<string, number | null>()
  if (planKeys.length === 0) return grants
  const rows = await db
    .select()
    .from(schema.planEntitlements)
    .where(
      and(
        inArray(schema.planEntitlements.planKey, planKeys),
        eq(schema.planEntitlements.enabled, true),
      ),
    )
  for (const row of rows) {
    const effective = row.limitValue ?? catalogDefaults.get(row.entitlementKey) ?? null
    const existing = grants.get(row.entitlementKey)
    // 多个套餐给同一权益时取额度更大的那个。
    if (existing === undefined) {
      grants.set(row.entitlementKey, effective)
      continue
    }
    // 任一套餐给不限量，整体就不限量。
    const merged = existing === null || effective === null ? null : Math.max(existing, effective)
    grants.set(row.entitlementKey, merged)
  }
  return grants
}

/**
 * 解析用户的生效权益，并把生效额度物化到 `user_entitlements`。
 *
 * 物化是消费能原子化的前提：额度消费要写成
 * `UPDATE ... WHERE used + ? <= limit_value`，`limit_value` 必须在行上。
 *
 * 「已用量」以**物化之后重新读到的行**为准：解析过程中可能正好有一次并发消费，
 * 用读到的旧值会把那次消费抹掉。
 */
export async function resolveEntitlements(
  db: DB,
  userId: string,
  now: Date = new Date(),
): Promise<ResolvedEntitlement[]> {
  const catalog = await listEntitlements(db)
  const catalogDefaults = new Map(catalog.map((item) => [item.key, item.defaultLimit]))
  const planKeys = await planKeysOfUser(db, userId)
  const grants = await planGrants(db, planKeys, catalogDefaults)

  const overrides = await db
    .select()
    .from(schema.userEntitlements)
    .where(eq(schema.userEntitlements.userId, userId))
  const overrideMap = new Map(overrides.map((row) => [row.entitlementKey, row]))

  for (const item of catalog) {
    const override = overrideMap.get(item.key)
    const grant = grants.get(item.key)

    // 额度优先级：用户覆盖 > 套餐 > 目录默认。
    // 套餐额度已经按目录默认值解析过（见 planGrants），它为 null 只可能是「不限量」。
    const limit =
      override?.limitValue ?? grant ?? (item.type === 'quota' ? item.defaultLimit : null)

    if (item.type !== 'quota') continue

    const storedPeriodEnd = override?.periodEnd ?? null
    const expired = storedPeriodEnd !== null && storedPeriodEnd.getTime() <= now.getTime()
    let periodStart = override?.periodStart ?? null
    let periodEnd = storedPeriodEnd
    // 第一次解析（还没有窗口）或周期已过：把窗口推到现在起算的下一个周期。
    if (expired || storedPeriodEnd === null) {
      const window = periodWindow(item.period, now)
      periodStart = window?.start ?? null
      periodEnd = window?.end ?? null
    }

    // 物化：额度型权益在用户行上落一份生效额度。
    await db
      .insert(schema.userEntitlements)
      .values({
        id: newId('ue'),
        userId,
        entitlementKey: item.key,
        limitValue: limit,
        used: 0,
        periodStart,
        periodEnd,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [schema.userEntitlements.userId, schema.userEntitlements.entitlementKey],
      })

    // 更新生效额度与周期窗口。
    //
    // `used` 只在**周期到期**时归零，其余情况不碰——无条件写 `used` 会把并发的
    // 额度消费抹掉（解析读到 5、消费把它加到 6、解析再写回 5）。
    const setValues: Partial<typeof schema.userEntitlements.$inferInsert> = {
      limitValue: limit,
      periodStart,
      periodEnd,
      updatedAt: now,
    }
    if (expired) setValues.used = 0
    await db
      .update(schema.userEntitlements)
      .set(setValues)
      .where(
        and(
          eq(schema.userEntitlements.userId, userId),
          eq(schema.userEntitlements.entitlementKey, item.key),
        ),
      )
  }

  // 物化之后重新读一次：已用量要准。
  const current = await db
    .select()
    .from(schema.userEntitlements)
    .where(eq(schema.userEntitlements.userId, userId))
  const currentMap = new Map(current.map((row) => [row.entitlementKey, row]))

  const resolved: ResolvedEntitlement[] = []
  for (const item of catalog) {
    const override = overrideMap.get(item.key)
    const grant = grants.get(item.key)
    const row = currentMap.get(item.key)

    const limit =
      override?.limitValue ?? grant ?? (item.type === 'quota' ? item.defaultLimit : null)
    const enabled = item.type === 'boolean' ? (override ? true : grant !== undefined) : true
    const used = row?.used ?? 0

    resolved.push({
      key: item.key,
      name: item.name,
      type: item.type,
      limit,
      used,
      remaining: limit === null ? null : Math.max(0, limit - used),
      enabled,
      period: item.period,
      periodStart: row?.periodStart ?? null,
      periodEnd: row?.periodEnd ?? null,
    })
  }
  return resolved
}

/**
 * 检查某个权益是否可用。
 *
 * `quota` 型看额度还够不够；`boolean` 型看开关。
 */
export async function checkEntitlement(
  db: DB,
  userId: string,
  entitlementKey: string,
  now: Date = new Date(),
): Promise<ResolvedEntitlement> {
  const resolved = await resolveEntitlements(db, userId, now)
  const found = resolved.find((item) => item.key === entitlementKey)
  if (!found) throw new EntitlementNotFoundError(entitlementKey)
  return found
}

/**
 * 消耗额度。
 *
 * 单条条件更新：额度不够时影响行数为 0，抛 `QuotaExceededError`。
 * 周期型权益在周期重置后额度自动恢复。
 */
export async function consumeQuota(
  db: DB,
  userId: string,
  entitlementKey: string,
  amount: number,
  now: Date = new Date(),
): Promise<void> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`消耗额度必须为正整数，收到 ${amount}`)
  }

  await atomic(db, async (tx) => {
    // 先解析（顺带物化生效额度），再扣。
    await resolveEntitlements(tx, userId, now)

    const rows = await tx
      .select()
      .from(schema.userEntitlements)
      .where(
        and(
          eq(schema.userEntitlements.userId, userId),
          eq(schema.userEntitlements.entitlementKey, entitlementKey),
        ),
      )
      .limit(1)
    const row = rows[0]
    if (!row) throw new EntitlementNotFoundError(entitlementKey)

    const limit = row.limitValue
    if (limit !== null && limit <= row.used) {
      throw new QuotaExceededError(entitlementKey, amount, limit, row.used)
    }

    const updated = await tx
      .update(schema.userEntitlements)
      .set({
        used: sql`${schema.userEntitlements.used} + ${amount}`,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.userEntitlements.userId, userId),
          eq(schema.userEntitlements.entitlementKey, entitlementKey),
          sql`(${schema.userEntitlements.limitValue} IS NULL OR ${schema.userEntitlements.used} + ${amount} <= ${schema.userEntitlements.limitValue})`,
        ),
      )
      .returning({ used: schema.userEntitlements.used })

    if (updated.length === 0) {
      // 并发下被别人抢先用掉了。
      const current = await tx
        .select({
          used: schema.userEntitlements.used,
          limitValue: schema.userEntitlements.limitValue,
        })
        .from(schema.userEntitlements)
        .where(
          and(
            eq(schema.userEntitlements.userId, userId),
            eq(schema.userEntitlements.entitlementKey, entitlementKey),
          ),
        )
        .limit(1)
      const state = current[0]
      throw new QuotaExceededError(entitlementKey, amount, state?.limitValue ?? 0, state?.used ?? 0)
    }
  })
}

/**
 * 给用户开通一个套餐：把套餐里的权益写进用户覆盖。
 *
 * 后台手动开通用；订阅生效时的自动开通由 `resolveEntitlements` 按订阅解析，
 * 不需要写覆盖行。
 */
export async function grantPlan(
  db: DB,
  userId: string,
  planKey: string,
  now: Date = new Date(),
): Promise<void> {
  const plans = await db.select().from(schema.plans).where(eq(schema.plans.key, planKey)).limit(1)
  const plan = plans[0]
  if (!plan) throw new Error(`未知套餐：${planKey}`)

  const grants = await db
    .select()
    .from(schema.planEntitlements)
    .where(
      and(eq(schema.planEntitlements.planKey, planKey), eq(schema.planEntitlements.enabled, true)),
    )

  for (const grant of grants) {
    const catalog = await db
      .select()
      .from(schema.entitlements)
      .where(eq(schema.entitlements.key, grant.entitlementKey))
      .limit(1)
    const item = catalog[0]
    if (!item) continue
    const limit = grant.limitValue ?? (item.type === 'quota' ? item.defaultLimit : null)
    const window =
      item.type === 'quota' ? periodWindow(item.period as EntitlementPeriod, now) : undefined

    await db
      .insert(schema.userEntitlements)
      .values({
        id: newId('ue'),
        userId,
        entitlementKey: grant.entitlementKey,
        limitValue: limit,
        used: 0,
        periodStart: window?.start ?? null,
        periodEnd: window?.end ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [schema.userEntitlements.userId, schema.userEntitlements.entitlementKey],
      })
    // 只更新额度与周期窗口，不动 `used`——重新开通套餐不该抹掉已用量。
    await db
      .update(schema.userEntitlements)
      .set({
        limitValue: limit,
        periodStart: window?.start ?? null,
        periodEnd: window?.end ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.userEntitlements.userId, userId),
          eq(schema.userEntitlements.entitlementKey, grant.entitlementKey),
        ),
      )
  }
}

/**
 * 退回额度：计量失败时把刚扣的额度还回去。
 *
 * 只供计量流程回滚用——它绕过额度上限，因此调用方必须确认刚扣掉的那部分
 * 确实没有产生用量。
 */
export async function restoreQuota(
  db: DB,
  userId: string,
  entitlementKey: string,
  amount: number,
  now: Date = new Date(),
): Promise<void> {
  if (!Number.isInteger(amount) || amount <= 0) return
  await db
    .update(schema.userEntitlements)
    .set({
      // 不用 `max(a, b)`：那是 SQLite 的标量函数，PostgreSQL 没有两参数的 max。
      used: sql`CASE WHEN ${schema.userEntitlements.used} - ${amount} < 0 THEN 0 ELSE ${schema.userEntitlements.used} - ${amount} END`,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.userEntitlements.userId, userId),
        eq(schema.userEntitlements.entitlementKey, entitlementKey),
      ),
    )
}

/** 收回一个权益：额度归零并禁用。 */
export async function revokeEntitlement(
  db: DB,
  userId: string,
  entitlementKey: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(schema.userEntitlements)
    .set({ limitValue: 0, used: 0, updatedAt: now })
    .where(
      and(
        eq(schema.userEntitlements.userId, userId),
        eq(schema.userEntitlements.entitlementKey, entitlementKey),
      ),
    )
}

/** 未用完的额度不返还——这里只做统计，供后台展示。 */
export async function entitlementUsage(
  db: DB,
  userId: string,
): Promise<Array<{ key: string; used: number; limit: number | null }>> {
  const rows = await db
    .select({
      key: schema.userEntitlements.entitlementKey,
      used: schema.userEntitlements.used,
      limit: schema.userEntitlements.limitValue,
    })
    .from(schema.userEntitlements)
    .where(eq(schema.userEntitlements.userId, userId))
  return rows.map((row) => ({ key: row.key, used: row.used, limit: row.limit }))
}
