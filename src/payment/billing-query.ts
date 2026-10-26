import { findProduct } from '@/config/products'

/**
 * 账单页的行数据形状。单独成模块，让客户端组件只引类型而不把 D1 binding 带进 bundle。
 *
 * 时间字段写成 `Date | string`：Drizzle 读出是 `Date`，经 server function 序列化后
 * 变成 ISO 字符串，客户端两种都可能遇到。
 */

/** 订阅记录的计费周期；来自 Stripe Price 的 `recurring.interval`。 */
export type BillingInterval = 'month' | 'year' | 'one_time' | (string & {})

export interface SubscriptionRecord {
  id: string
  customerId?: string | null
  subscriptionId?: string | null
  status: string
  priceId?: string | null
  /**
   * 本站产品 id（如 `pro`）。
   *
   * 由服务端按 `lookup_key` 反查得出：DB 里只存 Stripe 的 Price id，而 Price id
   * 与「用户买的是哪个产品」之间隔着一次映射。取不到时为 `null`，页面退回显示
   * Price id（真实数据，好过编一个名字）。
   */
  productId?: string | null
  /** Stripe Product id；配置没声明互斥关系时的兜底判据。 */
  stripeProductId?: string | null
  /** 已被互斥的买断接管：这条订阅还在，但已经不再生效。 */
  superseded?: boolean
  /** 是否是该产品下当前生效的那一份。 */
  isCurrent?: boolean
  amount?: number | null
  currency?: string | null
  interval?: BillingInterval | null
  currentPeriodStart?: Date | string | null
  currentPeriodEnd?: Date | string | null
  cancelAtPeriodEnd?: boolean | null
  /** 已安排、周期末生效的方案变更（降级）。没有则为空。 */
  pending?: PendingChange | null
  createdAt: Date | string
}

/**
 * 切换方向。
 *
 * 由**服务端**算（`resolveSwitchDirection`）：客户端不重复判定，两处各判一次迟早
 * 漂移——最怕的是客户端说「升级」而服务端按「降级」处理，用户被少扣钱。
 */
export type SwitchDirection = 'upgrade' | 'downgrade' | 'change'

/**
 * 可切换到的目标（档位 × 周期）。
 *
 * 目标价由服务端按 `lookup_key` 解析后下发：客户端不传 Price id，与结账同一原则。
 */
export interface SwitchTarget {
  productId: string
  interval: BillingInterval
  /** 目标价 id。 */
  priceId: string
  /** 单价（分）。 */
  amount: number
  currency: string
  direction: SwitchDirection
  /** 是否就是当前这份订阅的价。 */
  isCurrent: boolean
  /** 降级 = 周期末生效的时刻（ISO 字符串）；立即生效的目标为 `null`。 */
  effectiveAt: string | null
}

/**
 * 已安排、**周期末生效**的方案变更。
 *
 * 降级用 `proration_behavior: 'none'` 实现：Stripe 上的价格立刻变成新价，而本期
 * 已付金额不变——用户此刻仍在按旧价扣款。本地另记一份「待生效」，账单页才不会显示
 * 一个用户其实没在付的低价。
 */
export interface PendingChange {
  productId: string
  interval: BillingInterval
  /** 目标单价（分）。 */
  amount: number
  currency: string
  /** 生效时刻（ISO 字符串）= 当前周期的结束时刻。 */
  effectiveAt: string
}

export interface PaymentRecord {
  id: string
  /** `subscription` / `invoice` / `one_time`。 */
  type: string
  /** `paid` / `refunded`。 */
  status: string
  /** 以「分」为单位。 */
  amount: number
  currency: string
  description?: string | null
  /** 本站产品 id；一次性买断靠它显示「买的是哪个产品」。 */
  productId?: string | null
  /** Stripe Product id；配置没声明互斥关系时的兜底判据。 */
  stripeProductId?: string | null
  /** 是否是该产品下当前生效的那一笔。 */
  isCurrent?: boolean
  paidAt?: Date | string | null
  refundedAt?: Date | string | null
  createdAt: Date | string
}

/**
 * 当前生效的方案。
 *
 * 按**等级**判定：用户持有的东西里等级最高的那个（`lifetime > pro > free`）。
 * 买断与订阅属于同一产品时买断接管订阅；跨产品时高级别顶替低级别。
 *
 * 同级并列（两个不同产品等级相同）时为 `null`：没有唯一的当前方案，页面把每个
 * 产品各自的当前项都列出来，而不是硬挑一个。
 */
export interface CurrentPlan {
  kind: 'subscription' | 'one_time'
  /** 订阅行 id 或 payments 行 id。 */
  id: string
  productId?: string | null
  stripeProductId?: string | null
  /** 等级（数字越大越高）；产品没配等级时为 `null`。 */
  tier?: number | null
}

/**
 * 订阅状态 → 展示文案的消息键。
 *
 * 归一化放在这里而非组件：Stripe 新增状态时组件不会因 `switch` 没覆盖而崩。
 */
export function subscriptionStatusMessageKey(
  status: string,
):
  | 'settings_billing_active'
  | 'settings_billing_cancelled'
  | 'settings_billing_past_due'
  | 'settings_billing_trialing'
  | 'settings_billing_status' {
  switch (status) {
    case 'active':
      return 'settings_billing_active'
    case 'canceled':
    case 'incomplete_expired':
      return 'settings_billing_cancelled'
    case 'past_due':
    case 'incomplete':
    case 'unpaid':
      return 'settings_billing_past_due'
    case 'trialing':
      return 'settings_billing_trialing'
    default:
      return 'settings_billing_status'
  }
}

/**
 * 产品 id → 展示用产品名。
 *
 * 名字按**当前语言**取自 `getProducts()`，不在服务端算：server function 拿不到
 * 页面的 locale，算出来的名字可能与页面语言对不上。
 *
 * 查不到时返回 `undefined`：产品可能已下线，调用方退回显示 Price id。
 */
export function productNameForProductId(productId: string | null | undefined): string | undefined {
  if (!productId) return undefined
  return findProduct(productId)?.name
}

/**
 * 付款状态 → 展示文案的消息键。
 *
 * 与订阅状态是两套取值域，不能互相复用：复用会把每一笔已付款显示成订阅的「生效中」。
 */
export function paymentStatusMessageKey(
  status: string,
): 'settings_billing_paid' | 'settings_billing_refunded' | 'settings_billing_payment_status' {
  switch (status) {
    case 'paid':
      return 'settings_billing_paid'
    case 'refunded':
      return 'settings_billing_refunded'
    default:
      return 'settings_billing_payment_status'
  }
}

/** 计费周期的展示文案键。 */
export type BillingIntervalMessageKey =
  | 'settings_billing_interval_month'
  | 'settings_billing_interval_year'
  | 'settings_billing_interval_lifetime'

/**
 * 计费周期 → 展示文案的消息键；未知周期返回 `null`，调用方只渲染金额。
 *
 * **空值不能归为终身**：`checkout.session.completed` 先插入订阅行（`interval` 还空着），
 * 要等 `customer.subscription.created` 才补齐；当成 `one_time` 会让月付显示成「终身」。
 */
export function subscriptionIntervalMessageKey(
  interval: string | null | undefined,
): BillingIntervalMessageKey | null {
  switch (interval) {
    case 'month':
      return 'settings_billing_interval_month'
    case 'year':
      return 'settings_billing_interval_year'
    case 'one_time':
      return 'settings_billing_interval_lifetime'
    default:
      return null
  }
}
