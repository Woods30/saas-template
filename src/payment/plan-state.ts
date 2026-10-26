/**
 * 订阅与一次性购买的归属判定（纯逻辑，无副作用）。
 *
 * 三个概念必须分开，混用就会出现「付了两次钱却不知道哪次生效」：
 *
 * - **等级（tier）**：权限高低，`lifetime > pro > free`。等级高的持有物顶替等级低的，
 *   用户因此**只有一个当前方案**。
 * - **付费方式**：月付 / 年付 / 买断，只是怎么付钱，不是权限高低。月付与年付是
 *   同一个产品的两种周期，等级相同。
 * - **唯一性**：只约束**订阅**。一次性购买可以有多笔——实物商品买三件就是三单，
 *   彼此独立、各自生效。
 *
 * 于是判定分三问：
 *
 * 1. **谁取代谁**（`doesSupersede`）：同产品，或等级更高。买断与订阅都适用。
 * 2. **这次购买能不能做**（`purchaseBlockedBy`）：已有同产品方案、或已有更高等级时
 *    拒绝——降级没有意义，用户也不该为同一份东西付两次钱。
 * 3. **谁是当前方案**（`resolveCurrentPlan`）：持有物里等级最高的那个。
 *
 * 判据以**产品配置**为准（等级 + 互斥声明），都判不出来时退回 **Stripe Product**
 * 判定：同一个 Stripe Product 下的价格是同一个东西的不同价位。
 *
 * 上面回答的是「买的东西之间**怎么归属**」。本文件另外回答一个不同的问题：
 * 「这个账号**能不能再开一份订阅**」——那是**账号级**规则，与产品级归属是两回事，
 * 两套规则分开放在这里：
 *
 * - `purchaseBlockedBy`：这次购买与已有持有物**是否冲突**（买断 vs 订阅、显式互斥）；
 * - `resolveSubscriptionAction`：账号能不能再开一份订阅（一个账号最多一份），
 *   还是只能在**现有那份**上切换。
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
  /** 本站产品 id；等级与互斥判定的**权威**依据。 */
  productId?: string | null
  /** Stripe Product id；配置判不出来时的兜底判据。 */
  stripeProductId?: string | null
}

/**
 * 判定上下文：配置里的等级与互斥关系。
 *
 * 从 `src/config/products.ts` 读（`productTierMap()` / `productExclusivityMap()`），
 * 判定函数本身不读配置，方便单测直接构造上下文。
 */
export interface OwnershipContext {
  /** 产品 id → 等级（数字越大权限越高）。 */
  tiersByProductId?: Record<string, number>
  /** 互斥声明：产品 id → 与它互斥的产品 id 列表。 */
  exclusivityByProductId?: Record<string, string[]>
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
 * 持有物的等级；查不到返回 `undefined`。
 *
 * `undefined` 表示「不参与等级比较」，不是「等级 0」——实物商品买三件就是三单。
 */
export function planTier(plan: PlanOwnership, context: OwnershipContext = {}): number | undefined {
  const id = plan.productId
  if (!id) return undefined
  const tier = context.tiersByProductId?.[id]
  return typeof tier === 'number' ? tier : undefined
}

/**
 * 比较两个持有物的等级。
 *
 * `1`（a 更高）/ `-1`（a 更低）/ `0`（同级）；**不可比**返回 `null`——有一方没配
 * 等级时不能说谁更高。
 */
export function comparePlanTiers(
  a: PlanOwnership,
  b: PlanOwnership,
  context: OwnershipContext = {},
): number | null {
  const tierA = planTier(a, context)
  const tierB = planTier(b, context)
  if (tierA === undefined || tierB === undefined) return null
  return tierA === tierB ? 0 : tierA > tierB ? 1 : -1
}

/**
 * 新持有物是否取代旧持有物。
 *
 * 判据优先级：
 *
 * 1. **同一个产品**：买了两份同一个东西，只留最新的（买断永远赢——它是终态权益，
 *    退不回来）。
 * 2. **等级更高**：高级别替换低级别（`lifetime > pro > free`）。
 * 3. **同一个 Stripe Product**：兜底——同一个 Product 下的价格是同一个东西的不同
 *    价位。
 *
 * 等级**更低**时明确返回 `false`：低级别不能顶替高级别，否则「买了终身版再订个
 * 专业版月付」会把终身版顶掉。
 *
 * 注意这里**不看**互斥声明：互斥表达的是「不能同时持有」，所以它挡住的是**购买**
 * （见 `purchaseBlockedBy`），不是「谁取代谁」。
 */
export function doesSupersede(
  newer: PlanOwnership,
  older: PlanOwnership,
  context: OwnershipContext = {},
): boolean {
  if (newer.productId && newer.productId === older.productId) return true

  const cmp = comparePlanTiers(newer, older, context)
  if (cmp !== null) {
    // 同级且不同产品 → 靠 Stripe Product 兜底；低于 → 明确不取代。
    if (cmp > 0) return true
    if (cmp < 0) return false
  }

  return isSameProduct(newer.stripeProductId, older.stripeProductId)
}

/**
 * 购买被挡下的原因。
 *
 * - `same_product`：已经有这个产品的方案了（换周期走 Stripe 的订阅更新）。
 * - `higher_tier`：已经有更高等级的方案了，再买低级别没有意义。
 * - `exclusive_product`：配置显式声明与已有方案互斥（等级表达不了的那种）。
 * - `unknown_product`：已有方案查不出属于哪个产品——判不出是否重复，保守挡住。
 */
export type PurchaseBlockReason =
  | 'same_product'
  | 'higher_tier'
  | 'exclusive_product'
  | 'unknown_product'

/**
 * 已有持有物是否挡住这次购买。
 *
 * 与 `doesSupersede` 的方向相反：这里问的是「新的**不能**买」，判据是已有的一方
 * 更高（或同一个）。等级可比时只看等级——显式互斥声明只用于等级**不可比**的情形
 * （实物商品这类没有等级的东西），否则两套规则会打架。
 *
 * 已有持有物**查不出产品**时保守挡住：挡住只是让用户这次买不成，取消订阅才是不可逆
 * 的动作，这里宁严勿松。
 */
export function purchaseBlockedBy(
  existing: PlanOwnership,
  target: PlanOwnership,
  context: OwnershipContext = {},
): PurchaseBlockReason | null {
  // 查不出属于哪个产品就没法判断是否重复：挡住。
  if (!existing.productId) return 'unknown_product'

  if (existing.productId === target.productId) return 'same_product'

  const cmp = comparePlanTiers(existing, target, context)
  if (cmp !== null) {
    // 目标更高 → 这是升级，允许买（旧的会被顶替）。
    return cmp > 0 ? 'higher_tier' : null
  }

  const exclusivity = context.exclusivityByProductId
  if (
    target.productId &&
    (exclusivity?.[existing.productId]?.includes(target.productId) ||
      exclusivity?.[target.productId]?.includes(existing.productId))
  ) {
    return 'exclusive_product'
  }

  return null
}

/** 时间戳 → 毫秒数；无法解析时返回 `null`。 */
function timeOf(value: Date | string | null | undefined): number | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  const time = date.getTime()
  return Number.isNaN(time) ? null : time
}

/**
 * `a` 是否严格早于 `b`。
 *
 * 时间相同或任一方缺时间戳时返回 `false`：**判不出先后就不动**。取消订阅是不可逆
 * 动作，宁可漏一次（下次 webhook 再判），也不能取消错的那一条。
 */
export function isStrictlyEarlier(
  a: Date | string | null | undefined,
  b: Date | string | null | undefined,
): boolean {
  const timeA = timeOf(a)
  const timeB = timeOf(b)
  if (timeA === null || timeB === null) return false
  return timeA < timeB
}

/**
 * 某条订阅是否已被别的持有物取代（取代 = 不再生效，应当停掉并退款）。
 *
 * 取代者可以是买断，也可以是另一条订阅：
 * - **买断**取代订阅：买断是终态权益，与时间无关——买了终身版，之前订的月付就得停。
 * - **订阅**取代订阅：等级更高时无条件取代（等级说了算）；同产品或同级时只有
 *   **更新**的那条取代旧的（同一份东西买了两份，留最新的）。
 */
export function isSubscriptionSuperseded(
  subscription: OwnedPlan,
  others: OwnedPlan[],
  context: OwnershipContext = {},
): boolean {
  return others.some((other) => {
    if (other.id === subscription.id) return false
    if (!doesSupersede(other, subscription, context)) return false

    if (other.kind === 'one_time') return true

    const cmp = comparePlanTiers(other, subscription, context)
    // 等级更高：等级说了算，与先后无关。
    if (cmp !== null && cmp > 0) return true

    // 同产品或同级：只有更新的那条取代旧的。
    return isStrictlyEarlier(subscription.createdAt, other.createdAt)
  })
}

/**
 * 买断会接管哪些订阅。
 *
 * 接管条件：新持有物取代它（见 `doesSupersede`）且订阅仍在生效。
 */
export function findSupersededSubscriptions(
  purchase: PlanOwnership,
  subscriptions: OwnedPlan[],
  context: OwnershipContext = {},
): OwnedPlan[] {
  return subscriptions.filter(
    (sub) =>
      sub.kind === 'subscription' &&
      isActiveSubscriptionStatus(sub.status) &&
      doesSupersede(purchase, sub, context),
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
  /** 已被取代的订阅 id。 */
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
 * 「当前生效」是**每个产品各一个**：
 * - 买断优先于订阅——买断是终态权益，订阅留着就是重复收费；
 * - 买断之间取最新一笔，订阅之间取最新一条。
 *
 * 取代判定是**全局**的：跨产品的等级关系（`lifetime` 顶替 `pro`）下，买断与订阅
 * 不在同一组，只按组内比较会漏掉接管。
 */
export function resolveProductHoldings(input: {
  subscriptions: OwnedPlan[]
  purchases: OwnedPlan[]
  context?: OwnershipContext
}): ProductHolding[] {
  const context = input.context ?? {}
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

  // 被取代的订阅：任何别的持有物（买断或更新的订阅）取代它，都算。
  const holdings = [...allPaidPurchases, ...allActiveSubscriptions]
  const superseded = new Set<string>()
  for (const sub of allActiveSubscriptions) {
    if (isSubscriptionSuperseded(sub, holdings, context)) superseded.add(sub.id)
  }

  for (const group of groups.values()) {
    const effectiveSubscriptions = group.subscriptions.filter(
      (sub) => isActiveSubscriptionStatus(sub.status) && !superseded.has(sub.id),
    )
    const paidPurchases = group.purchases.filter((purchase) => purchase.status === 'paid')
    group.supersededSubscriptionIds = group.subscriptions
      .filter((sub) => superseded.has(sub.id))
      .map((sub) => sub.id)

    if (paidPurchases.length > 0) {
      // 买断优先：它是终态权益，留着订阅就是重复收费。
      group.current = paidPurchases[0] ?? null
    } else if (effectiveSubscriptions.length > 0) {
      group.current = effectiveSubscriptions[0] ?? null
    }
  }

  return [...groups.values()]
}

/**
 * 当前生效的方案。
 *
 * 规则是**等级说了算**：用户持有的东西里，等级最高的那个就是当前方案——
 * `lifetime > pro > free`，所以买了终身版之后，专业版不再是「当前」。
 *
 * 同级并列（两个不同产品等级相同）时返回 `null`：没有唯一的当前方案，页面把每个
 * 产品各自的当前项都列出来，而不是硬挑一个。
 *
 * 没有等级的东西（实物商品）不参与竞争：它是另一种东西，不是权限档位。
 */
export function resolveCurrentPlan(input: {
  subscriptions: OwnedPlan[]
  purchases: OwnedPlan[]
  context?: OwnershipContext
}): OwnedPlan | null {
  const context = input.context ?? {}
  const currents = resolveProductHoldings(input)
    .filter((group) => group.current !== null)
    .map((group) => group.current as OwnedPlan)

  if (currents.length === 0) return null
  if (currents.length === 1) return currents[0] ?? null

  const tiered = currents.filter((plan) => planTier(plan, context) !== undefined)
  if (tiered.length === 0) return null

  const maxTier = Math.max(...tiered.map((plan) => planTier(plan, context) as number))
  const atMax = tiered.filter((plan) => planTier(plan, context) === maxTier)
  // 同级并列：没有唯一的当前方案。
  if (atMax.length > 1) return null
  return atMax[0] ?? null
}

/* -------------------------------------------------------------------------- *
 * 账号级唯一性与切换
 *
 * 一个账号最多一份**活跃订阅**。要换档位或换周期，只能在现有那份上改（Stripe 的
 * 订阅更新），不能再开一份——两份订阅就是两份扣款。
 * -------------------------------------------------------------------------- */

/** 目标付费方式：切换与新购共用同一个形状。 */
export interface PlanTarget {
  /** 本站产品 id（档位）。 */
  productId: string
  /** Stripe Product id；兜底判据。 */
  stripeProductId?: string | null
  /** 单价（分）。 */
  amount?: number | null
  currency?: string | null
  /** 计费周期：`month` / `year` / … */
  interval?: string | null
}

/** 账号当前那一份活跃订阅（切换的「现状」）。 */
export interface ActiveSubscription extends OwnedPlan {
  amount?: number | null
  currency?: string | null
  interval?: string | null
}

/**
 * 切换方向。
 *
 * - `upgrade`：档位更高，或同级但更贵——立即生效并按比例结算；
 * - `downgrade`：档位更低，或同级但更便宜——**期末生效**，本期权益不变；
 * - `change`：同一档位换周期（月付 ↔ 年付）——权益没变，立即生效。
 */
export type SwitchDirection = 'upgrade' | 'downgrade' | 'change'

/**
 * 账号级判定结果。
 *
 * - `checkout`：没有活跃订阅 → 走 Checkout 新开一份；
 * - `switch`：有活跃订阅 → 只能切换，不能再开；
 * - `blocked`：状态不明确（认不出归属、多份活跃订阅）→ 保守处理，指去门户。
 */
export type SubscriptionAction =
  | { kind: 'checkout' }
  | { kind: 'switch'; direction: SwitchDirection; current: ActiveSubscription }
  | { kind: 'blocked'; reason: 'unknown_product' | 'multiple_subscriptions' }

/**
 * 金额折算成「每月」（分）。
 *
 * 跨周期比价必须折算：年付 $99 与月付 $10 谁更贵，不能直接比原值。折算不出来
 * （缺金额或未知周期）返回 `null`——**判不出就不判**，别拿 0 参与比较。
 */
export function monthlyEquivalent(
  amount: number | null | undefined,
  interval: string | null | undefined,
): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null
  switch (interval) {
    case 'month':
      return amount
    case 'year':
      return amount / 12
    case 'week':
      return (amount * 52) / 12
    case 'day':
      return amount * 30
    default:
      return null
  }
}

/**
 * 从当前方案切到目标方案的方向。
 *
 * 判定顺序：
 *
 * 1. **档位不同** → 等级说了算：更高是 `upgrade`，更低是 `downgrade`；
 * 2. **同一产品**（只是换周期）→ `change`：权益没变，不能算降级——否则「月付改
 *    年付」会被延到周期末，用户白等一个月才拿到年付价；
 * 3. **同级不同产品** → 比折算月均价：更贵算升级，更便宜算降级；
 * 4. **档位不可比**（有一方没配等级）→ 同样比金额；金额也判不出 → `change` 兜底。
 */
export function resolveSwitchDirection(input: {
  current: ActiveSubscription
  target: PlanTarget
  context?: OwnershipContext
}): SwitchDirection {
  const { current, target, context = {} } = input

  // 比较方向：target 相对 current。
  const cmp = comparePlanTiers(target, current, context)
  if (cmp !== null && cmp !== 0) return cmp > 0 ? 'upgrade' : 'downgrade'

  if (target.productId && target.productId === current.productId) return 'change'

  const targetMonthly = monthlyEquivalent(target.amount, target.interval)
  const currentMonthly = monthlyEquivalent(current.amount, current.interval)
  if (targetMonthly !== null && currentMonthly !== null) {
    if (targetMonthly > currentMonthly) return 'upgrade'
    if (targetMonthly < currentMonthly) return 'downgrade'
  }
  return 'change'
}

/**
 * 这个账号能不能再开一份订阅，还是只能在现有那份上切换。
 *
 * 一个账号最多一份**活跃订阅**——两份订阅就是两份扣款，账单页也只能标一份
 * 「当前生效」。所以已有活跃订阅时，一切新订阅都必须走**切换**。
 *
 * 买断（一次性购买）不占订阅名额：它由 `purchaseBlockedBy` 单独判定。
 */
export function resolveSubscriptionAction(input: {
  activeSubscriptions: ActiveSubscription[]
  target: PlanTarget
  context?: OwnershipContext
}): SubscriptionAction {
  const active = input.activeSubscriptions.filter((sub) => isActiveSubscriptionStatus(sub.status))

  if (active.length === 0) return { kind: 'checkout' }
  // 多份活跃订阅是脏数据（绕过本站开的）。判不出「当前那份」就不要动：
  // 取消订阅不可逆，宁可让人去门户处理。
  if (active.length > 1) return { kind: 'blocked', reason: 'multiple_subscriptions' }

  const current = active[0] as ActiveSubscription
  // 认不出属于哪个档位：分不清是重复还是切换，同样保守处理。
  if (!current.productId) return { kind: 'blocked', reason: 'unknown_product' }

  return {
    kind: 'switch',
    direction: resolveSwitchDirection({
      current,
      target: input.target,
      context: input.context,
    }),
    current,
  }
}
