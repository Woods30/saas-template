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

/**
 * 账单页的展示分组：当前生效的那一份 vs 历史。
 */
export interface BillingDisplay {
  /** 当前生效的订阅；没有则为空。 */
  currentSubscription: SubscriptionRecord | null
  /** 当前生效的一次性买断；没有则为空。 */
  currentPurchase: PaymentRecord | null
  /** 历史订阅：不再生效的那些。 */
  historySubscriptions: SubscriptionRecord[]
  /** 历史买断：过往的一次性购买。 */
  historyPurchases: PaymentRecord[]
}

/** 时间 → 毫秒数；无法解析时返回 `0`（视作最旧）。 */
function timeOf(value: Date | string | null | undefined): number {
  if (!value) return 0
  const date = value instanceof Date ? value : new Date(value)
  const time = date.getTime()
  return Number.isNaN(time) ? 0 : time
}

/**
 * 把持有物分成「当前生效的那一份」与「历史」。
 *
 * 「当前生效」完全依据服务端下发的 `isCurrent`——那是归属判定（等级说了算）的
 * 结果，客户端不重复判一遍：两处各判一次迟早漂移。
 *
 * 没有当前生效项时（订阅已取消、买断已退款）**退回最近的一条订阅**：页面至少要
 * 告诉用户「你曾经有什么」，而不是一片空白。它不是当前方案，所以不会带「当前生效」
 * 徽章。
 */
export function splitBillingDisplay(input: {
  subscriptions: SubscriptionRecord[]
  payments: PaymentRecord[]
}): BillingDisplay {
  const purchases = input.payments.filter((payment) => payment.type === 'one_time')
  const latest = <T extends { createdAt: Date | string }>(items: T[]): T | null =>
    items.reduce<T | null>(
      (newest, item) =>
        newest === null || timeOf(item.createdAt) > timeOf(newest.createdAt) ? item : newest,
      null,
    )

  const currentSubscription = input.subscriptions.find((sub) => sub.isCurrent) ?? null
  const currentPurchase = purchases.find((payment) => payment.isCurrent) ?? null

  let shownSubscription = currentSubscription
  const shownPurchase = currentPurchase
  if (!shownSubscription && !shownPurchase) {
    // 没有当前生效项：退回最近的一条订阅，让页面至少显示「你曾经有什么」。
    // 买断不参与这个兜底——付过钱的一次性购买本来就会被判为当前生效，
    // 走到这里的买断（已退款 / 未支付）不该被当成「当前方案」。
    shownSubscription = latest(input.subscriptions)
  }

  return {
    currentSubscription: shownSubscription,
    currentPurchase: shownPurchase,
    historySubscriptions: input.subscriptions.filter((sub) => sub.id !== shownSubscription?.id),
    historyPurchases: purchases.filter((payment) => payment.id !== shownPurchase?.id),
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
