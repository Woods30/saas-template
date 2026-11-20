import { createServerFn } from '@tanstack/react-start'
import { and, count, eq, gte, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { type DB, schema } from '@/core/db'
import {
  FUNNEL_DIMENSIONS,
  type FunnelDimension,
  type FunnelRange,
  type FunnelReport,
  getFunnelReport,
} from './admin-funnel'
import { type AdminOrder, queryAdminPayments } from './admin-orders'
import { type AdminPaymentRow, summarizeRevenue } from './admin-query'
import { BILLING_ACTIVE_STATUSES } from './plan-state'

/**
 * 管理台概览。
 *
 * 一次取齐首屏需要的 KPI、漏斗、最近付款与待办。查询之间没有依赖，全部并行；
 * 需要多表聚合的口径（漏斗、营收）复用各自模块，避免页面和报表各算一套。
 */

export interface AdminOverview {
  users: { total: number; new24h: number }
  /** 最近 30 天净营收（最小货币单位），单币种主分组。 */
  revenue30d: { amount: number; currency: string }
  activeSubscriptions: number
  pendingManualReviews: number
  funnel: FunnelReport
  recentPayments: AdminOrder[]
  todos: {
    pendingManualReviews: number
    openTickets: number
    failedPayments24h: number
  }
}

export interface AdminOverviewInput {
  range?: FunnelRange
  groupBy?: FunnelDimension
}

const DAY_MS = 86_400_000
const REVENUE_WINDOW_MS = 30 * DAY_MS
const RECENT_PAYMENTS_LIMIT = 5

/** 只取首屏需要的几笔最近付款，复用付款列表的排序与列形状。 */
const RECENT_PAYMENTS_QUERY = { tab: 'all', limit: RECENT_PAYMENTS_LIMIT } as const

/**
 * 读出概览数据。
 *
 * `now` 只在测试里注入，生产用当前时间。所有窗口都以它为基准，避免同一屏里
 * 各 KPI 各自取 `Date.now()` 造成的毫秒级边界不一致。
 */
export async function queryAdminOverview(
  db: DB,
  input: AdminOverviewInput = {},
  now: Date = new Date(),
): Promise<AdminOverview> {
  const since24h = new Date(now.getTime() - DAY_MS)
  const since30d = new Date(now.getTime() - REVENUE_WINDOW_MS)

  const [
    totalUsers,
    newUsers,
    revenueRows,
    activeSubscriptions,
    pendingManualReviews,
    openTickets,
    failedPayments,
    funnel,
    recentPayments,
  ] = await Promise.all([
    db.select({ value: count() }).from(schema.users),
    db.select({ value: count() }).from(schema.users).where(gte(schema.users.createdAt, since24h)),
    db
      .select({
        amount: schema.payments.amount,
        currency: schema.payments.currency,
        refundedAmount: schema.payments.refundedAmount,
        status: schema.payments.status,
      })
      .from(schema.payments)
      .where(gte(schema.payments.createdAt, since30d)),
    db
      .select({ value: count() })
      .from(schema.subscriptions)
      .where(inArray(schema.subscriptions.status, [...BILLING_ACTIVE_STATUSES])),
    db
      .select({ value: count() })
      .from(schema.manualPaymentDetails)
      .where(eq(schema.manualPaymentDetails.status, 'pending_verification')),
    db.select({ value: count() }).from(schema.tickets).where(eq(schema.tickets.status, 'open')),
    db
      .select({ value: count() })
      .from(schema.payments)
      .where(and(eq(schema.payments.status, 'failed'), gte(schema.payments.createdAt, since24h))),
    getFunnelReport(
      db,
      {
        range: input.range ?? '30d',
        groupBy: input.groupBy ?? 'utm_source',
      },
      now,
    ),
    queryAdminPayments(db, RECENT_PAYMENTS_QUERY),
  ])

  const revenue = summarizeRevenue(revenueRows as AdminPaymentRow[])
  const primary = revenue.primary
  const pendingReviewCount = Number(pendingManualReviews[0]?.value ?? 0)

  return {
    users: {
      total: Number(totalUsers[0]?.value ?? 0),
      new24h: Number(newUsers[0]?.value ?? 0),
    },
    revenue30d: {
      amount: primary?.net ?? 0,
      currency: primary?.currency ?? 'usd',
    },
    activeSubscriptions: Number(activeSubscriptions[0]?.value ?? 0),
    pendingManualReviews: pendingReviewCount,
    funnel,
    recentPayments: recentPayments.orders,
    todos: {
      pendingManualReviews: pendingReviewCount,
      openTickets: Number(openTickets[0]?.value ?? 0),
      failedPayments24h: Number(failedPayments[0]?.value ?? 0),
    },
  }
}

const overviewInputSchema = z.object({
  range: z.enum(['24h', '7d', '30d']).default('30d'),
  groupBy: z.enum(FUNNEL_DIMENSIONS).default('utm_source'),
})

/**
 * 概览的 server function。
 *
 * 权限在服务端再校验：server function 是可被直接调用的 HTTP 端点，
 * 只靠菜单隐藏拦不住。
 */
export const fetchAdminOverview = createServerFn({ method: 'GET' })
  .validator((input: unknown) => overviewInputSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<AdminOverview> => {
    const { requirePermissionDb } = await import('@/modules/rbac/service')
    const { db } = await requirePermissionDb('admin.orders.read')
    return queryAdminOverview(db, data)
  })
