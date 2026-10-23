/**
 * 订阅与一次性购买的归属判定（纯逻辑，无副作用）。
 *
 * 两类「付费物」的语义不同，不能用同一套唯一性规则：
 *
 * - **订阅**：持续扣费，同一产品下只能有一份（结账守卫已挡）。
 * - **一次性购买**：可以有多笔。实物商品买三件就是三笔订单，彼此独立、各自生效；
 *   不能因为「已经买过」就拦下第二单。
 *
 * 所以「互斥」只在两种情况下成立：
 *
 * 1. **同一个产品内**，一次性买断取代订阅——买断是那个东西的更高档位，留着订阅就是
 *    让用户为同一份权益付两次钱。
 * 2. **跨产品**，且配置显式声明了 `exclusiveWith`。
 *
 * 判据以**产品配置**为准（`ProductDefinition.exclusiveWith`），没声明时退回
 * **Stripe Product** 判定：同一个 Stripe Product 下的价格是同一个东西的不同价位。
 */

/** 仍占用订阅名额的订阅状态，与结账守卫的判定保持一致。 */
export const ACTIVE_SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'paused',
] as const

/** 归属判定需要的最小字段。 */
export interface PlanOwnership {
  /** 本站产品 id；互斥判定的**权威**依据。 */
  productId?: string | null
  /** Stripe Product id；配置没声明互斥关系时的兜底判据。 */
  stripeProductId?: string | null
}

/** 用户当前持有的一份「付费物」。 */
export interface OwnedPlan extends PlanOwnership {
  /** `subscription` = 订阅；`one_time` = 买断。 */
  kind: 'subscription' | 'one_time'
  /** 订阅行 id 或 payments 行 id。 */
  id: string
  /** Stripe 订阅 id；只有订阅有。接管旧订阅时用它去 Stripe 取消。 */
  subscriptionId?: string | null
  status?: string | null
  amount?: number | null
  currency?: string | null
  interval?: string | null
  paidAt?: Date | string | null
  currentPeriodEnd?: Date | string | null
  createdAt?: Date | string | null
}

/**
 * 两个 Stripe Product id 是否同一个产品。
 *
 * 任一为空都返回 `false`：**宁可判定为「不同产品」也不误伤订阅**。
 * 缺 Stripe Product id 的数据源（老数据、后台手工建的 Price）不该触发取消订阅
 * 这种不可逆动作。
 */
export function isSameProduct(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a === b
}

/** 订阅状态是否表示「仍在生效、仍会扣款」。 */
export function isActiveSubscriptionStatus(status: string | null | undefined): boolean {
  if (!status) return false
  return (ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
}

/**
 * 买断是否取代某条订阅（互斥判定）。
 *
 * 判据优先级：
 *
 * 1. **配置声明优先**（`exclusiveWith`，含同产品内隐式成立的那条）：
 *    - 同一个产品内，买断与订阅互斥；
 *    - 跨产品时看买断产品的 `exclusiveWith` 是否列出订阅产品；
 *    - 显式写了 `exclusiveWith: []` 的跨产品买断不取代任何订阅（实物商品可与订阅
 *      并存，也可以买多件）。
 * 2. **没声明时按 Stripe Product 兜底**：同一个 Product 下的价格是同一个东西的
 *    不同价位（月付 / 年付 / 终身），买断即升级。
 *
 * 配置声明了关系、但订阅的产品 id 查不到时退回 Stripe Product 判定：宁可按「同一个
 * 东西」处理，也不要因为一次取价失败就让用户同时付终身费和月付。
 */
export function isSupersededByPurchase(input: {
  purchase: PlanOwnership
  subscription: PlanOwnership
  /** 配置声明的互斥关系：产品 id → 与它互斥的产品 id 列表。 */
  exclusivityByProductId?: Record<string, string[]>
}): boolean {
  const { purchase, subscription, exclusivityByProductId } = input

  // 同一个产品：买断取代订阅。这条不需要配置——它就是「同一份权益」的定义。
  if (purchase.productId && purchase.productId === subscription.productId) return true

  const declared = purchase.productId ? exclusivityByProductId?.[purchase.productId] : undefined
  if (declared !== undefined && subscription.productId) {
    return declared.includes(subscription.productId)
  }

  // 兜底：同一个 Stripe Product 即同一个东西。
  return isSameProduct(purchase.stripeProductId, subscription.stripeProductId)
}

/**
 * 买断会接管哪些订阅。
 *
 * 接管条件：与买断**互斥**（见 `isSupersededByPurchase`）且订阅仍在生效。
 */
export function findSupersededSubscriptions(
  purchase: PlanOwnership,
  subscriptions: OwnedPlan[],
  exclusivityByProductId?: Record<string, string[]>,
): OwnedPlan[] {
  return subscriptions.filter(
    (sub) =>
      sub.kind === 'subscription' &&
      isActiveSubscriptionStatus(sub.status) &&
      isSupersededByPurchase({ purchase, subscription: sub, exclusivityByProductId }),
  )
}

/** 一个产品下用户持有的全部付费物。 */
export interface ProductHolding {
  /** 产品 id；查不到时为 `null`（老数据或后台手工建的 Price）。 */
  productId: string | null
  /** Stripe Product id；查不到时为 `null`。 */
  stripeProductId: string | null
  /** 该产品下的订阅（含已取消的，便于页面展示历史）。 */
  subscriptions: OwnedPlan[]
  /** 该产品下的买断订单。 */
  purchases: OwnedPlan[]
  /** 该产品下当前生效的那一份（订阅或买断）；多笔并列买断时取最新一笔。 */
  current: OwnedPlan | null
  /** 已被买断接管的订阅 id。 */
  supersededSubscriptionIds: string[]
}

/** 分组键：优先本站产品 id，退回 Stripe Product id，再退回行 id（不合并）。 */
function holdingKey(plan: OwnedPlan): string {
  return plan.productId ?? plan.stripeProductId ?? `ungrouped:${plan.id}`
}

/**
 * 按产品归集用户持有的付费物，并算出每个产品下「当前生效的那一份」。
 *
 * 传入的数组需按「最新在前」排序（服务端按创建时间倒序取数）：多笔并列买断时
 * 取第一笔作为该产品的当前项。
 *
 * 跨产品的买断**不会**影响别的产品：不同产品是不同的东西，各自计费、各自生效。
 */
export function resolveProductHoldings(input: {
  subscriptions: OwnedPlan[]
  purchases: OwnedPlan[]
  exclusivityByProductId?: Record<string, string[]>
}): ProductHolding[] {
  const groups = new Map<string, ProductHolding>()

  const groupOf = (plan: OwnedPlan): ProductHolding => {
    const key = holdingKey(plan)
    let group = groups.get(key)
    if (!group) {
      group = {
        productId: plan.productId ?? null,
        stripeProductId: plan.stripeProductId ?? null,
        subscriptions: [],
        purchases: [],
        current: null,
        supersededSubscriptionIds: [],
      }
      groups.set(key, group)
    }
    return group
  }

  for (const sub of input.subscriptions) groupOf(sub).subscriptions.push(sub)
  for (const purchase of input.purchases) groupOf(purchase).purchases.push(purchase)

  const allActiveSubscriptions = input.subscriptions.filter((sub) =>
    isActiveSubscriptionStatus(sub.status),
  )
  const allPaidPurchases = input.purchases.filter((purchase) => purchase.status === 'paid')

  // 买断接管订阅：同一产品内买断是更高档位，留着订阅就是重复收费。
  // 判定是**全局**的——跨产品的互斥关系（配置声明的 `exclusiveWith`）下，
  // 买断与订阅不在同一组，只按组内比较会漏掉接管。
  const superseded = new Set<string>()
  for (const purchase of allPaidPurchases) {
    for (const sub of allActiveSubscriptions) {
      if (
        isSupersededByPurchase({
          purchase,
          subscription: sub,
          exclusivityByProductId: input.exclusivityByProductId,
        })
      ) {
        superseded.add(sub.id)
      }
    }
  }

  for (const group of groups.values()) {
    const effectiveSubscriptions = group.subscriptions.filter(
      (sub) => isActiveSubscriptionStatus(sub.status) && !superseded.has(sub.id),
    )
    const paidPurchases = group.purchases.filter((purchase) => purchase.status === 'paid')
    group.supersededSubscriptionIds = group.subscriptions
      .filter((sub) => superseded.has(sub.id))
      .map((sub) => sub.id)

    if (effectiveSubscriptions.length > 0) {
      group.current = effectiveSubscriptions[0] ?? null
    } else if (paidPurchases.length > 0) {
      group.current = paidPurchases[0] ?? null
    }
  }

  return [...groups.values()]
}

/**
 * 当前生效的方案。
 *
 * - 只有一个产品持有付费物 → 该产品的当前项；
 * - 多个产品并存 → `null`：不同的东西并列生效，没有唯一「当前方案」，页面把每个
 *   都列出来，而不是硬挑一个。
 */
export function resolveCurrentPlan(input: {
  subscriptions: OwnedPlan[]
  purchases: OwnedPlan[]
  exclusivityByProductId?: Record<string, string[]>
}): OwnedPlan | null {
  const holdings = resolveProductHoldings(input).filter((group) => group.current !== null)
  if (holdings.length !== 1) return null
  return holdings[0]?.current ?? null
}
