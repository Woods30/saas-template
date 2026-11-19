import { and, asc, countDistinct, desc, eq, gte, ne, type SQL, sql } from 'drizzle-orm'
import { type DB, schema } from '@/core/db'

/**
 * 管理台转化漏斗（注册 → 创建结账 → 付款）。
 *
 * cohort 是**窗口内注册的用户**，而不是窗口内的行为：先固定人群，再在人群里
 * 数有购买意图（`orders` 任意行）和有资金事实（`payments` 成功状态）的人。
 * 这样漏斗三档的分母始终一致，不会因为老用户续费把「创建结账」撑高。
 *
 * 计数一律 `count(distinct users.id)`：一个用户下多笔订单 / 付款只算一次。
 */

/** 可选时间窗口，值为毫秒。 */
export const FUNNEL_RANGES = {
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
} as const

export type FunnelRange = keyof typeof FUNNEL_RANGES

/** 可分组 / 可筛选的归因维度（与 `users` 的归因列一一对应）。 */
export const FUNNEL_DIMENSIONS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'referrer',
  'country',
] as const

export type FunnelDimension = (typeof FUNNEL_DIMENSIONS)[number]

export interface FunnelCounts {
  signups: number
  checkouts: number
  paid: number
}

export interface FunnelReport {
  totals: FunnelCounts
  /** 按分组维度聚合；空值归一后的显示值为 `direct`。 */
  rows: Array<FunnelCounts & { value: string }>
  /** 每个维度的筛选项（非空值，最多 50 个）。 */
  options: Record<FunnelDimension, string[]>
}

export interface FunnelInput {
  range: FunnelRange
  groupBy: FunnelDimension
  /** 组内再按其他归因维度筛选；`direct` 匹配空串。 */
  filters?: Partial<Record<FunnelDimension, string>>
}

/**
 * 维度 → 归因列。
 *
 * 在函数里构造而不是模块顶层常量：部分测试会部分 mock `@/core/db`，
 * 顶层求值 `schema.users.*` 会在模块加载时直接抛错。
 *
 * 返回类型交给推断：每列的字面量列名不同，任何单一列类型都会让其余列失配，
 * 而 `AnyColumn` 又缺少方言品牌，无法传给 `select` / `groupBy`；推断出的
 * 「七个列类型的联合」既保留方言信息，也不用逐一写字面量类型。
 */
function dimensionColumns() {
  return {
    utm_source: schema.users.utmSource,
    utm_medium: schema.users.utmMedium,
    utm_campaign: schema.users.utmCampaign,
    utm_term: schema.users.utmTerm,
    utm_content: schema.users.utmContent,
    referrer: schema.users.referrer,
    country: schema.users.country,
  } satisfies Record<FunnelDimension, unknown>
}

type DimensionColumns = ReturnType<typeof dimensionColumns>
type AttributionColumn = DimensionColumns[FunnelDimension]

const OPTIONS_LIMIT = 50

/**
 * 分组显示值：空串归一为 `direct`。
 *
 * 归一放在查询层而不是渲染层：分组键与筛选项必须是同一个口径，否则界面
 * 显示的 `direct` 点进去会筛不到任何行。
 */
function groupedValue(column: AttributionColumn): SQL<string> {
  return sql<string>`case when ${column} = '' then 'direct' else ${column} end`
}

/** 筛选条件；`direct` 表示该列的空串。 */
function filterConditions(columns: DimensionColumns, filters: FunnelInput['filters']): SQL[] {
  return Object.entries(filters ?? {}).flatMap(([dimension, value]) => {
    if (!value) return []
    const column = columns[dimension as FunnelDimension]
    return value === 'direct' ? [sql`${column} = ''`] : [eq(column, value)]
  })
}

/** 一次查出 funnel 的 totals、分组行与筛选选项。 */
export async function getFunnelReport(db: DB, input: FunnelInput): Promise<FunnelReport> {
  const since = new Date(Date.now() - FUNNEL_RANGES[input.range])
  const columns = dimensionColumns()
  const column = columns[input.groupBy]
  const groupValue = groupedValue(column)
  const signups = countDistinct(schema.users.id)
  const checkouts = countDistinct(schema.orders.userId)
  // 退款不抹掉曾经付款的事实，因此三种状态都计入 paid。
  const paid = sql<number>`count(distinct case when ${schema.payments.status} in ('paid','refunded','partially_refunded') then ${schema.users.id} end)`

  const conditions: SQL[] = [
    gte(schema.users.createdAt, since),
    ...filterConditions(columns, input.filters),
  ]

  const [rows, options] = await Promise.all([
    db
      .select({ value: groupValue, signups, checkouts, paid })
      .from(schema.users)
      // 两次 LEFT JOIN 会按「订单 × 付款」放大行数；distinct 计数不受影响。
      .leftJoin(schema.orders, eq(schema.orders.userId, schema.users.id))
      .leftJoin(schema.payments, eq(schema.payments.userId, schema.users.id))
      .where(and(...conditions))
      .groupBy(groupValue)
      .orderBy(desc(signups), asc(groupValue)),
    Promise.all(
      FUNNEL_DIMENSIONS.map(async (dimension) => {
        const optionColumn = columns[dimension]
        const values = await db
          .select({ value: optionColumn })
          .from(schema.users)
          .where(ne(optionColumn, ''))
          .groupBy(optionColumn)
          .orderBy(asc(optionColumn))
          .limit(OPTIONS_LIMIT)
        return [dimension, values.map((row) => row.value)] as const
      }),
    ).then((entries) => Object.fromEntries(entries) as Record<FunnelDimension, string[]>),
  ])

  const totals = rows.reduce<FunnelCounts>(
    (sum, row) => ({
      signups: sum.signups + Number(row.signups),
      checkouts: sum.checkouts + Number(row.checkouts),
      paid: sum.paid + Number(row.paid),
    }),
    { signups: 0, checkouts: 0, paid: 0 },
  )

  return {
    totals,
    rows: rows.map((row) => ({
      value: row.value,
      signups: Number(row.signups),
      checkouts: Number(row.checkouts),
      paid: Number(row.paid),
    })),
    options,
  }
}
