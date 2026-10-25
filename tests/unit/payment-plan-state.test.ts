import { describe, expect, it } from 'vitest'
import {
  comparePlanTiers,
  doesSupersede,
  findSupersededSubscriptions,
  isActiveSubscriptionStatus,
  isSameProduct,
  isStrictlyEarlier,
  isSubscriptionSuperseded,
  type OwnedPlan,
  type OwnershipContext,
  planTier,
  purchaseBlockedBy,
  resolveCurrentPlan,
  resolveProductHoldings,
} from '@/payment/plan-state'

/**
 * 归属判定：**等级**说了算。
 *
 * 等级是权限高低（`lifetime > pro > free`），与「怎么付钱」无关。月付与年付是同一个
 * 等级；买断是另一种付款方式，落在它自己产品的等级上。
 *
 * 三条规则：
 * 1. **当前方案唯一**——持有物里等级最高的那个；
 * 2. **高级别替换低级别**——买更高级的会让低级的失效；
 * 3. **降级被挡**——已有更高等级时再买低级的没有意义。
 *
 * 一次性购买**可以有多笔**（实物商品买三件就是三单），所以「已拥有」不是通用拦截
 * 条件——只有订阅才受唯一性约束。
 */

/** 等级表：数字越大权限越高。`merch`（实物）不配等级，不参与比较。 */
const TIERS: Record<string, number> = {
  free: 0,
  pro: 1,
  // `plus` / `team` 与 pro 同级：不同产品、同一档位，可以并存。
  plus: 1,
  team: 1,
  lifetime: 2,
}

/** 显式互斥声明：等级表达不了的那种（实物商品）。 */
const EXCLUSIVITY: Record<string, string[]> = {
  merch: ['pro'],
}

const CONTEXT: OwnershipContext = {
  tiersByProductId: TIERS,
  exclusivityByProductId: EXCLUSIVITY,
}

function sub(overrides: Partial<OwnedPlan> & { id: string }): OwnedPlan {
  return {
    kind: 'subscription',
    productId: 'pro',
    stripeProductId: 'prod_pro',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function purchase(overrides: Partial<OwnedPlan> & { id: string }): OwnedPlan {
  return {
    kind: 'one_time',
    productId: 'pro',
    stripeProductId: 'prod_pro',
    status: 'paid',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('plan-state 等级判定', () => {
  describe('isSameProduct', () => {
    it('同一个 Product id 算同一个产品', () => {
      expect(isSameProduct('prod_vip', 'prod_vip')).toBe(true)
    })

    it('不同 Product id 不算同一个产品', () => {
      expect(isSameProduct('prod_vip', 'prod_plus')).toBe(false)
    })

    it('任一 product id 缺失时不判定为同一个产品', () => {
      // 缺 product id 的数据源不该触发「取消订阅」这种不可逆动作。
      expect(isSameProduct(null, 'prod_vip')).toBe(false)
      expect(isSameProduct('prod_vip', null)).toBe(false)
      expect(isSameProduct(undefined, undefined)).toBe(false)
      expect(isSameProduct('', 'prod_vip')).toBe(false)
    })
  })

  describe('isActiveSubscriptionStatus', () => {
    it('仍在生效、仍会扣款的状态都算占用', () => {
      for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'paused']) {
        expect(isActiveSubscriptionStatus(status)).toBe(true)
      }
    })

    it('已结束的状态不再占用', () => {
      expect(isActiveSubscriptionStatus('canceled')).toBe(false)
      expect(isActiveSubscriptionStatus('incomplete_expired')).toBe(false)
      expect(isActiveSubscriptionStatus(null)).toBe(false)
      expect(isActiveSubscriptionStatus(undefined)).toBe(false)
    })
  })

  describe('planTier', () => {
    it('取到产品的等级', () => {
      expect(planTier({ productId: 'lifetime' }, CONTEXT)).toBe(2)
      expect(planTier({ productId: 'pro' }, CONTEXT)).toBe(1)
    })

    it('没配等级的产品返回 undefined —— 不参与等级比较', () => {
      // 实物商品买三件就是三单，不能因为「已经有等级 0 的东西」被挡。
      expect(planTier({ productId: 'merch' }, CONTEXT)).toBeUndefined()
    })

    it('缺产品 id 时返回 undefined', () => {
      expect(planTier({ productId: null }, CONTEXT)).toBeUndefined()
      expect(planTier({}, CONTEXT)).toBeUndefined()
    })
  })

  describe('comparePlanTiers', () => {
    it('lifetime > pro > free', () => {
      expect(comparePlanTiers({ productId: 'lifetime' }, { productId: 'pro' }, CONTEXT)).toBe(1)
      expect(comparePlanTiers({ productId: 'pro' }, { productId: 'free' }, CONTEXT)).toBe(1)
      expect(comparePlanTiers({ productId: 'free' }, { productId: 'lifetime' }, CONTEXT)).toBe(-1)
    })

    it('同级返回 0', () => {
      expect(comparePlanTiers({ productId: 'pro' }, { productId: 'pro' }, CONTEXT)).toBe(0)
    })

    it('有一方没配等级时不可比', () => {
      expect(comparePlanTiers({ productId: 'merch' }, { productId: 'pro' }, CONTEXT)).toBeNull()
    })
  })

  describe('doesSupersede', () => {
    it('同一个产品：新买的一份取代旧的', () => {
      expect(doesSupersede({ productId: 'pro' }, { productId: 'pro' }, CONTEXT)).toBe(true)
    })

    it('等级更高：高级别替换低级别', () => {
      expect(doesSupersede({ productId: 'lifetime' }, { productId: 'pro' }, CONTEXT)).toBe(true)
    })

    it('等级更低：不取代 —— 低级别不能顶替高级别', () => {
      // 买了终身版再订个专业版月付，绝不能把终身版顶掉。
      expect(doesSupersede({ productId: 'pro' }, { productId: 'lifetime' }, CONTEXT)).toBe(false)
    })

    it('同级不同产品：退回 Stripe Product 兜底', () => {
      expect(
        doesSupersede(
          { productId: 'plus', stripeProductId: 'prod_vip' },
          { productId: 'team', stripeProductId: 'prod_vip' },
          CONTEXT,
        ),
      ).toBe(true)
      expect(
        doesSupersede(
          { productId: 'plus', stripeProductId: 'prod_plus' },
          { productId: 'team', stripeProductId: 'prod_team' },
          CONTEXT,
        ),
      ).toBe(false)
    })

    it('互斥声明不参与取代判定：互斥挡的是购买，不是「谁取代谁」', () => {
      expect(doesSupersede({ productId: 'merch' }, { productId: 'pro' }, CONTEXT)).toBe(false)
    })
  })

  describe('purchaseBlockedBy', () => {
    it('同一个产品：挡住（换周期走 Stripe 的订阅更新）', () => {
      expect(purchaseBlockedBy({ productId: 'pro' }, { productId: 'pro' }, CONTEXT)).toBe(
        'same_product',
      )
    })

    it('已有更高等级：挡住 —— 再买低级的没有意义', () => {
      expect(purchaseBlockedBy({ productId: 'lifetime' }, { productId: 'pro' }, CONTEXT)).toBe(
        'higher_tier',
      )
    })

    it('目标等级更高：不挡 —— 这是升级', () => {
      expect(purchaseBlockedBy({ productId: 'pro' }, { productId: 'lifetime' }, CONTEXT)).toBeNull()
    })

    it('同级不同产品：不挡 —— 两个不同的东西可以并存', () => {
      expect(purchaseBlockedBy({ productId: 'plus' }, { productId: 'team' }, CONTEXT)).toBeNull()
    })

    it('等级不可比且显式声明互斥：挡住', () => {
      expect(purchaseBlockedBy({ productId: 'merch' }, { productId: 'pro' }, CONTEXT)).toBe(
        'exclusive_product',
      )
      expect(purchaseBlockedBy({ productId: 'pro' }, { productId: 'merch' }, CONTEXT)).toBe(
        'exclusive_product',
      )
    })

    it('等级不可比且没声明：不挡', () => {
      expect(purchaseBlockedBy({ productId: 'gift' }, { productId: 'pro' }, CONTEXT)).toBeNull()
    })
  })

  describe('isStrictlyEarlier', () => {
    it('能比出先后时返回 true', () => {
      expect(isStrictlyEarlier('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z')).toBe(true)
    })

    it('时间相同或缺时间戳时不判定先后 —— 判不出就不动', () => {
      // 取消订阅不可逆，宁可漏一次也不能取消错的那一条。
      expect(isStrictlyEarlier('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe(false)
      expect(isStrictlyEarlier(null, '2026-01-01T00:00:00.000Z')).toBe(false)
      expect(isStrictlyEarlier('2026-01-01T00:00:00.000Z', null)).toBe(false)
    })
  })

  describe('isSubscriptionSuperseded', () => {
    it('同产品的买断取代订阅：买断是终态权益，与时间无关', () => {
      const subscription = sub({ id: 'sub_1', createdAt: '2026-03-01T00:00:00.000Z' })
      const buyout = purchase({ id: 'pay_1', createdAt: '2026-01-01T00:00:00.000Z' })
      expect(isSubscriptionSuperseded(subscription, [buyout], CONTEXT)).toBe(true)
    })

    it('更高等级的买断取代低等级的订阅', () => {
      const subscription = sub({ id: 'sub_1', productId: 'pro' })
      const buyout = purchase({ id: 'pay_1', productId: 'lifetime', stripeProductId: 'prod_life' })
      expect(isSubscriptionSuperseded(subscription, [buyout], CONTEXT)).toBe(true)
    })

    it('更低等级的买断不取代订阅', () => {
      const subscription = sub({ id: 'sub_1', productId: 'lifetime', stripeProductId: 'prod_life' })
      const buyout = purchase({ id: 'pay_1', productId: 'pro' })
      expect(isSubscriptionSuperseded(subscription, [buyout], CONTEXT)).toBe(false)
    })

    it('同产品的新订阅取代旧的', () => {
      const older = sub({ id: 'sub_1', createdAt: '2026-01-01T00:00:00.000Z' })
      const newer = sub({ id: 'sub_2', createdAt: '2026-02-01T00:00:00.000Z' })
      expect(isSubscriptionSuperseded(older, [newer], CONTEXT)).toBe(true)
    })

    it('同产品的旧订阅不被新的取代', () => {
      const older = sub({ id: 'sub_1', createdAt: '2026-01-01T00:00:00.000Z' })
      const newer = sub({ id: 'sub_2', createdAt: '2026-02-01T00:00:00.000Z' })
      expect(isSubscriptionSuperseded(newer, [older], CONTEXT)).toBe(false)
    })

    it('更高等级的订阅取代低等级的订阅：等级说了算，与先后无关', () => {
      const lower = sub({ id: 'sub_1', productId: 'pro', createdAt: '2026-03-01T00:00:00.000Z' })
      const higher = sub({
        id: 'sub_2',
        productId: 'lifetime',
        stripeProductId: 'prod_life',
        createdAt: '2026-01-01T00:00:00.000Z',
      })
      expect(isSubscriptionSuperseded(lower, [higher], CONTEXT)).toBe(true)
    })

    it('实物品不取代任何订阅', () => {
      const subscription = sub({ id: 'sub_1' })
      const merch = purchase({ id: 'pay_1', productId: 'merch', stripeProductId: 'prod_merch' })
      expect(isSubscriptionSuperseded(subscription, [merch], CONTEXT)).toBe(false)
    })
  })

  describe('findSupersededSubscriptions', () => {
    it('同产品的生效订阅被买断接管', () => {
      const result = findSupersededSubscriptions(
        purchase({ id: 'pay_1' }),
        [sub({ id: 'sub_1' })],
        CONTEXT,
      )
      expect(result.map((item) => item.id)).toEqual(['sub_1'])
    })

    it('更低等级的买断不接管订阅', () => {
      const result = findSupersededSubscriptions(
        purchase({ id: 'pay_1', productId: 'pro' }),
        [sub({ id: 'sub_1', productId: 'lifetime', stripeProductId: 'prod_life' })],
        CONTEXT,
      )
      expect(result).toEqual([])
    })

    it('已取消的订阅不再被接管', () => {
      const result = findSupersededSubscriptions(
        purchase({ id: 'pay_1' }),
        [sub({ id: 'sub_1', status: 'canceled' })],
        CONTEXT,
      )
      expect(result).toEqual([])
    })
  })

  describe('resolveProductHoldings', () => {
    it('按产品归集订阅与买断', () => {
      const holdings = resolveProductHoldings({
        subscriptions: [sub({ id: 'sub_1' })],
        purchases: [purchase({ id: 'pay_1', productId: 'lifetime' })],
        context: CONTEXT,
      })
      expect(holdings).toHaveLength(2)
      expect(holdings.find((h) => h.productId === 'pro')?.subscriptions.map((s) => s.id)).toEqual([
        'sub_1',
      ])
      expect(holdings.find((h) => h.productId === 'lifetime')?.purchases.map((p) => p.id)).toEqual([
        'pay_1',
      ])
    })

    it('同一产品的买断接管订阅，当前生效的是买断', () => {
      const holdings = resolveProductHoldings({
        subscriptions: [sub({ id: 'sub_1' })],
        purchases: [purchase({ id: 'pay_1' })],
        context: CONTEXT,
      })
      const holding = holdings[0]
      expect(holding?.current?.id).toBe('pay_1')
      expect(holding?.supersededSubscriptionIds).toEqual(['sub_1'])
    })

    it('多笔买断并存时取最新一笔为当前项', () => {
      // 入参按「最新在前」排序（服务端按创建时间倒序取数）。
      const holdings = resolveProductHoldings({
        subscriptions: [],
        purchases: [purchase({ id: 'pay_2' }), purchase({ id: 'pay_1' })],
        context: CONTEXT,
      })
      expect(holdings[0]?.current?.id).toBe('pay_2')
    })

    it('不同产品各自有当前项，互不影响', () => {
      const holdings = resolveProductHoldings({
        subscriptions: [sub({ id: 'sub_1' })],
        purchases: [purchase({ id: 'pay_1', productId: 'plus', stripeProductId: 'prod_plus' })],
        context: CONTEXT,
      })
      expect(holdings.every((holding) => holding.current !== null)).toBe(true)
      expect(holdings.find((h) => h.productId === 'pro')?.supersededSubscriptionIds).toEqual([])
    })

    it('跨产品的取代是全局判定，不受分组影响', () => {
      // 买断（lifetime，等级 2）与订阅（pro，等级 1）不在同一组，
      // 只按组内比较会漏掉接管。
      const holdings = resolveProductHoldings({
        subscriptions: [sub({ id: 'sub_1', productId: 'pro' })],
        purchases: [
          purchase({
            id: 'pay_1',
            productId: 'lifetime',
            stripeProductId: 'prod_life',
          }),
        ],
        context: CONTEXT,
      })
      expect(holdings.find((h) => h.productId === 'pro')?.supersededSubscriptionIds).toEqual([
        'sub_1',
      ])
      expect(holdings.find((h) => h.productId === 'pro')?.current).toBeNull()
    })
  })

  describe('resolveCurrentPlan', () => {
    it('只有订阅时，订阅就是当前生效方案', () => {
      const current = resolveCurrentPlan({
        subscriptions: [sub({ id: 'sub_1' })],
        purchases: [],
        context: CONTEXT,
      })
      expect(current?.id).toBe('sub_1')
    })

    it('只有买断时，买断就是当前生效方案', () => {
      const current = resolveCurrentPlan({
        subscriptions: [],
        purchases: [purchase({ id: 'pay_1' })],
        context: CONTEXT,
      })
      expect(current?.id).toBe('pay_1')
    })

    it('高级别顶替低级别：lifetime > pro', () => {
      // 买了终身版之后，专业版不再是「当前」。
      const current = resolveCurrentPlan({
        subscriptions: [sub({ id: 'sub_1', productId: 'pro' })],
        purchases: [purchase({ id: 'pay_1', productId: 'lifetime', stripeProductId: 'prod_life' })],
        context: CONTEXT,
      })
      expect(current?.id).toBe('pay_1')
    })

    it('同产品的买断接管订阅，买断是当前生效方案', () => {
      const current = resolveCurrentPlan({
        subscriptions: [sub({ id: 'sub_1' })],
        purchases: [purchase({ id: 'pay_1' })],
        context: CONTEXT,
      })
      expect(current?.id).toBe('pay_1')
    })

    it('同级并列（不同产品同等级）时没有唯一当前方案', () => {
      const current = resolveCurrentPlan({
        subscriptions: [sub({ id: 'sub_1', productId: 'pro' })],
        purchases: [purchase({ id: 'pay_1', productId: 'plus', stripeProductId: 'prod_plus' })],
        context: CONTEXT,
      })
      expect(current).toBeNull()
    })

    it('没有等级的东西不参与竞争：实物买断不夺走 pro 的当前位', () => {
      const current = resolveCurrentPlan({
        subscriptions: [sub({ id: 'sub_1', productId: 'pro' })],
        purchases: [purchase({ id: 'pay_1', productId: 'merch', stripeProductId: 'prod_merch' })],
        context: CONTEXT,
      })
      expect(current?.id).toBe('sub_1')
    })

    it('什么都没有时返回 null', () => {
      expect(resolveCurrentPlan({ subscriptions: [], purchases: [], context: CONTEXT })).toBeNull()
    })

    it('已取消的订阅不算当前生效方案', () => {
      const current = resolveCurrentPlan({
        subscriptions: [sub({ id: 'sub_1', status: 'canceled' })],
        purchases: [],
        context: CONTEXT,
      })
      expect(current).toBeNull()
    })

    it('未支付的买断不算数', () => {
      const current = resolveCurrentPlan({
        subscriptions: [],
        purchases: [purchase({ id: 'pay_1', status: 'refunded' })],
        context: CONTEXT,
      })
      expect(current).toBeNull()
    })
  })
})
