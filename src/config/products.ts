import { m } from '@/locale/paraglide/messages.js'
import type { PricingInterval, ProductDefinition, ProductOption } from '@/types/pricing'

/**
 * 产品配置：本站卖什么、怎么卖、等级多高、与什么互斥。
 *
 * 一个产品对应 Stripe 的一个 **Product**，产品下的每个 `options` 项对应一个 **Price**
 * （靠 `lookup_key` 定位）。这样「同一个产品的月付 / 年付」在配置里就是同一个产品的
 * 两种付费方式，而不是两个互不相干的方案。
 *
 * 三份数据各司其职：
 * - 本文件：产品名、卖点、CTA、付费方式（lookup key）、等级与互斥关系；
 * - Stripe：金额。展示价按 `lookup_key` 实时取，不写死；
 * - `src/payment/plan-state.ts`：谁取代谁（等级与互斥判定的执行）。
 *
 * `lookup_key` 写在这里而不再放 env：它是「页面 ↔ 价格」的唯一锚点，两处各存一份
 * 必然漂移（改价时只改了一处，页面上就会出现对不上的价格）。
 *
 * 配置分两层：
 * - **结构层**（`PRODUCT_OPTIONS` / `PRODUCT_TIERS` / `PRODUCT_EXCLUSIVITY`）不依赖
 *   语言，诊断脚本、服务端任务与单测都能直接读；
 * - **文案层**（`getProducts()`）在渲染时求值，随请求语言变化。
 */

/**
 * 产品 → 付费方式。
 *
 * `lookup_key` 是 Stripe Price 的稳定对外名：改价时把 key 迁到新 Price 上
 * （`transfer_lookup_key=true`），页面与代码都不用动。Price ID 一换就得改代码
 * 重新部署，且极易与后台配置漂移。
 */
const PRODUCT_OPTIONS: Record<string, ProductOption[]> = {
  // 免费档不卖：没有付费方式，定价页上按钮走「注册」而不是结账。
  free: [],
  pro: [
    { kind: 'subscription', interval: 'month', lookupKey: 'pro_monthly' },
    { kind: 'subscription', interval: 'year', lookupKey: 'pro_yearly' },
  ],
  lifetime: [{ kind: 'one_time', interval: 'one_time', lookupKey: 'lifetime' }],
}

/**
 * 产品 → 与它互斥的产品 id 列表（**显式**声明）。
 *
 * 绝大多数互斥关系不需要写在这里——**等级**能自动推导出来（见 `PRODUCT_TIERS`）。
 * 这张表留给**没有等级**的产品：实物商品这类「不参与等级比较」的东西，只能靠显式
 * 声明表达「不能与某个订阅同时持有」。
 *
 * 例：买「终身版」就不要再订「专业版」——这一条不需要写，`lifetime` 等级高于 `pro`，
 * 自动互斥。写两遍就是两处说法，加一个新产品时必然漏改一处。
 */
const PRODUCT_EXCLUSIVITY: Record<string, string[]> = {}

/**
 * 产品 → 等级。数字越大，能用的功能越多（`lifetime > pro > free`）。
 *
 * 等级回答的是「权限高低」，与「怎么付钱」无关：月付与年付是同一个等级（都是 pro），
 * 买断是另一种付款方式，但它落在**自己产品**的等级上。
 *
 * 等级解决三件事：
 *
 * 1. **当前方案唯一**——用户持有的东西里等级最高的那个就是「当前生效的方案」，
 *    页面不必再在多个产品之间硬挑一个。
 * 2. **高级别替换低级别**——买更高级的会让低级的失效：订阅被停掉并按比例退款，
 *    用户不会为同一份东西付两次钱。
 * 3. **降级被挡**——已经持有更高等级时再买低级的没有意义，直接拒绝并说清楚原因。
 *
 * 没配等级的产品（实物商品）**不参与等级比较**：它可以与任何订阅并存，也可以买多件。
 */
const PRODUCT_TIERS: Record<string, number> = {
  free: 0,
  pro: 1,
  lifetime: 2,
}

/** 配置里的产品 id 列表（顺序即展示顺序）。 */
const PRODUCT_IDS = Object.keys(PRODUCT_OPTIONS)

/**
 * 产品定义：只描述「卖的是什么、怎么卖、点了去哪」。
 *
 * 金额与「这个产品卖多少钱」都不在这里——前者由 Stripe 的 Price 决定，后者由
 * `lookup_key` 决定（见 `src/payment/price-catalog.ts`）。写死金额的病根是
 * 「页面显示」与「实际扣款」分属两份数据，改价必然漂移。
 *
 * 用工厂函数而非常量：`m.*()` 读运行时 locale，模块级常量会把首次请求的语言固化给
 * 所有后续请求（SSR 下表现为整页语言不对 + hydration mismatch）。
 */
export function getProducts(): ProductDefinition[] {
  return [
    {
      id: 'free',
      name: m.pricing_free_name(),
      description: m.pricing_free_description(),
      features: [m.pricing_free_feature_1(), m.pricing_free_feature_2()],
      cta: { label: m.pricing_free_cta(), href: '/auth/register' },
      tier: PRODUCT_TIERS.free,
      exclusiveWith: exclusiveProductIds('free'),
      options: PRODUCT_OPTIONS.free ?? [],
    },
    {
      id: 'pro',
      name: m.pricing_pro_name(),
      description: m.pricing_pro_description(),
      features: [m.pricing_pro_feature_1(), m.pricing_pro_feature_2(), m.pricing_pro_feature_3()],
      cta: { label: m.pricing_pro_cta(), href: '/auth/register?plan=pro' },
      highlighted: true,
      badge: m.pricing_recommended(),
      tier: PRODUCT_TIERS.pro,
      exclusiveWith: exclusiveProductIds('pro'),
      // 月付与年付是**同一个产品**的两种订阅周期。换周期走 Stripe 的订阅更新
      // （Billing Portal），不是买第二份。
      options: PRODUCT_OPTIONS.pro ?? [],
    },
    {
      id: 'lifetime',
      name: m.pricing_lifetime_name(),
      description: m.pricing_lifetime_description(),
      features: [m.pricing_lifetime_feature_1(), m.pricing_lifetime_feature_2()],
      cta: { label: m.pricing_lifetime_cta(), href: '/auth/register?plan=lifetime' },
      tier: PRODUCT_TIERS.lifetime,
      exclusiveWith: exclusiveProductIds('lifetime'),
      options: PRODUCT_OPTIONS.lifetime ?? [],
    },
  ]
}

/**
 * 找产品；不存在返回 `undefined`。
 *
 * 不抛错：定价页可能渲染一个已下线产品的历史订单（账单页反查），调用方自行兜底。
 */
export function findProduct(productId: string): ProductDefinition | undefined {
  return getProducts().find((product) => product.id === productId)
}

/** 产品实际配置的付费方式（有 lookup key 才算）。 */
export function productOptions(productId: string): ProductOption[] {
  return (PRODUCT_OPTIONS[productId] ?? []).filter((option) => Boolean(option.lookupKey?.trim()))
}

/** 产品可购买的计费周期，顺序固定为 `month` → `year` → `one_time`。 */
export function productIntervals(productId: string): PricingInterval[] {
  const order: PricingInterval[] = ['month', 'year', 'one_time']
  const configured = new Set(
    productOptions(productId)
      .map((option) => option.interval)
      .filter((interval): interval is PricingInterval => Boolean(interval)),
  )
  return order.filter((interval) => configured.has(interval))
}

/**
 * 产品是否可购买。
 *
 * 没配任何付费方式时按钮降级为「先注册」，避免给用户一个点了就 502 的按钮。
 */
export function isProductPurchasable(productId: string): boolean {
  return productOptions(productId).length > 0
}

/**
 * 汇总所有产品的 lookup key，去重保序、空值不入列。
 *
 * 这是向 Stripe 批量取价（`lookup_keys[]`）的入参，也是「配没配价」的唯一判据。
 */
export function collectLookupKeys(): string[] {
  const keys = PRODUCT_IDS.flatMap((id) => productOptions(id).map((option) => option.lookupKey))
  return [...new Set(keys.filter((key): key is string => Boolean(key?.trim())))]
}

/** lookup_key → 产品 id；未匹配返回 `undefined`（Price 可能是后台手工创建的）。 */
export function findProductIdByLookupKey(lookupKey: string): string | undefined {
  return PRODUCT_IDS.find((id) =>
    productOptions(id).some((option) => option.lookupKey === lookupKey),
  )
}

/** 产品 + 计费周期 → lookup_key；任一缺失返回 `undefined`。 */
export function resolveLookupKey(
  productId: string,
  interval?: PricingInterval,
): string | undefined {
  const options = productOptions(productId)
  if (interval) return options.find((option) => option.interval === interval)?.lookupKey
  return options[0]?.lookupKey
}

/**
 * 互斥关系表：产品 id → 与它互斥的产品 id 列表。
 *
 * 合并了**显式声明**与**等级推导**：等级不同的两个可购买产品自动互斥（高档位顶替
 * 低档位），显式声明补上等级表达不了的那部分（实物商品之类）。
 *
 * 运行时只认这一张表：让判定逻辑去分别读「等级」与「显式声明」两处，等于把同一个
 * 事实拆成两个数据源。
 */
export function productExclusivityMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const id of PRODUCT_IDS) {
    const ids = exclusiveProductIds(id)
    if (ids.length > 0) map[id] = ids
  }
  return map
}

/**
 * 某个产品的互斥对象：显式声明 + 等级推导。
 *
 * 等级推导只发生在**可购买**的产品之间：`free` 是默认状态、不可购买，不该和谁
 * 互斥。
 */
export function exclusiveProductIds(productId: string): string[] {
  const explicit = PRODUCT_EXCLUSIVITY[productId] ?? []
  const derived = PRODUCT_IDS.filter((other) => {
    if (other === productId) return false
    if (!isProductPurchasable(productId) || !isProductPurchasable(other)) return false
    const cmp = compareProductTier(productId, other)
    // 等级不可比（有一方没配等级）或同级 → 不是互斥关系。
    return cmp !== null && cmp !== 0
  })
  return [...new Set([...explicit, ...derived])]
}

/**
 * 两个产品是否互斥。
 *
 * 互斥是**双向**的：A 与 B 互斥，等于 B 与 A 互斥——单向的互斥会让「谁取代谁」
 * 取决于判定方向，是最容易出错的地方。
 *
 * 判据：显式声明，或等级不同（都是可购买的产品）。
 */
export function isExclusiveProduct(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false
  return exclusiveProductIds(a).includes(b)
}

/**
 * 产品的等级；没配等级返回 `undefined`。
 *
 * `undefined` 表示「不参与等级比较」，不是「等级为 0」：实物商品买三件就是三单，
 * 不能因为「已经有等级 0 的东西」就把它挡掉。
 */
export function productTier(productId: string | null | undefined): number | undefined {
  if (!productId) return undefined
  const tier = PRODUCT_TIERS[productId]
  return typeof tier === 'number' ? tier : undefined
}

/** 等级表（产品 id → 等级）。判定上下文用。 */
export function productTierMap(): Record<string, number> {
  return { ...PRODUCT_TIERS }
}

/**
 * 比较两个产品的等级。
 *
 * 返回 `1`（a 更高）/ `-1`（a 更低）/ `0`（同级）；**不可比**返回 `null`——有一方
 * 没配等级时不能说谁更高。
 */
export function compareProductTier(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const tierA = productTier(a)
  const tierB = productTier(b)
  if (tierA === undefined || tierB === undefined) return null
  return tierA === tierB ? 0 : tierA > tierB ? 1 : -1
}

/**
 * 重复的 lookup_key。
 *
 * 一个 key 挂到两个产品上时，「Price → 产品」的反查就有歧义：账单页会把这个价格
 * 显示成其中任意一个产品，结账归属也会跟着漂。配置写错时要在自检里立刻暴露。
 */
export function findDuplicateLookupKeys(): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const key of collectLookupKeys()) {
    if (seen.has(key)) duplicates.add(key)
    seen.add(key)
  }
  return [...duplicates]
}

/**
 * 互斥关系里指向不存在产品的 id。
 *
 * 写错产品 id 不会报错，只会让互斥**静默失效**——用户同时付月费和终身费。自检
 * 必须把这种错配挑出来。
 */
export function findUnknownExclusiveRefs(): string[] {
  const unknown = new Set<string>()
  for (const refs of Object.values(PRODUCT_EXCLUSIVITY)) {
    for (const ref of refs) {
      if (!PRODUCT_IDS.includes(ref)) unknown.add(ref)
    }
  }
  return [...unknown]
}

/**
 * 等级表里指向不存在产品的 id。
 *
 * 写错产品 id 不会报错，只会让那个产品**永远不参与等级比较**——用户以为「高级别
 * 替换低级别」生效了，实际上两个订阅并存、两边扣钱。
 */
export function findUnknownTierRefs(): string[] {
  return Object.keys(PRODUCT_TIERS).filter((id) => !PRODUCT_IDS.includes(id))
}

/** 计费周期的展示文案（价格旁的「每月」「按年付」）。 */
export function pricingIntervalLabel(interval: PricingInterval): string {
  switch (interval) {
    case 'month':
      return m.pricing_per_month()
    case 'year':
      return m.pricing_per_year()
    case 'one_time':
      return m.pricing_one_time()
    default:
      return ''
  }
}
