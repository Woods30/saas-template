/** 计费周期。月付 / 年付按订阅，一次性为买断。 */
export type PricingInterval = 'month' | 'year' | 'one_time'

/**
 * 产品的一种付费方式。
 *
 * 「产品」是本站的一等概念，对应 Stripe 的一个 Product；「付费方式」对应它下面的
 * 一个 Price。月付与年付是同一个产品的两种订阅周期，终身买断是同一个产品的第三种
 * 付费方式——它们是**同一个东西的不同价位**，不是三个方案。
 */
export interface ProductOption {
  /** 付费方式：订阅（持续扣费）或一次性买断。 */
  kind: 'subscription' | 'one_time'
  /** 计费周期；一次性买断没有周期。 */
  interval?: PricingInterval
  /**
   * 展示用文案（如「终身」）。
   *
   * 一次性买断的含义因产品而异：数字权益可以是「终身」，实物商品是「一次性」。写死
   * 在配置里，才不会出现「实物商品也写着终身」这种荒唐文案。
   */
  label?: string
  /**
   * Stripe Price 的 `lookup_key`。
   *
   * 取价、结账都靠它定位 Price：改价时把 key 迁到新 Price 上（`transfer_lookup_key`），
   * 页面与代码都不用动。它写在产品配置里，不再放 env——配置是「页面 ↔ 价格」的
   * 唯一锚点，两处各存一份必然漂移。
   */
  lookupKey: string
}

/**
 * 定价产品定义：只描述「卖的是什么、怎么卖、点了去哪」。
 *
 * 金额与「这个产品卖多少钱」都不在这里——前者由 Stripe 的 Price 决定，后者由
 * `lookup_key` 决定（见 `src/payment/price-catalog.ts`）。写死金额的病根是
 * 「页面显示」与「实际扣款」分属两份数据，改价必然漂移。
 */
export interface ProductDefinition {
  /** 产品 id。互斥判定的权威依据（见 `src/payment/plan-state.ts`）。 */
  id: string
  name: string
  description?: string
  features: string[]
  cta: { label: string; href: string }
  highlighted?: boolean
  badge?: string
  /** 可购买方式。同一产品内：一次性买断与订阅互斥（买断替代订阅）。 */
  options: ProductOption[]
  /**
   * 与这些产品**互斥**（跨产品默认并存）。
   *
   * 例：买了「终身会员」就不要再买「专业版月付」——两者给的是同一份权益，付两次
   * 就是重复收费。互斥关系写在这里，是因为 Stripe 的 Product 结构表达不了它：
   * Stripe 只知道「哪些 Price 挂在同一个 Product 下」，管不了「买断是否顶替订阅」。
   */
  exclusiveWith?: string[]
}

/** 渲染用产品：产品定义 + 从 Stripe 取回的实时价格。 */
export interface PricingProduct extends Omit<ProductDefinition, 'options'> {
  options: ProductPrice[]
}

/** 产品某个付费方式的实时价格。 */
export interface ProductPrice {
  kind: 'subscription' | 'one_time'
  interval?: PricingInterval
  /** 以「分」为单位。 */
  amount: number
  currency: string
  /** 展示标签（如「按月」「终身」）。 */
  label: string
}
