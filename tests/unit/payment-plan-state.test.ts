import { describe, expect, it } from 'vitest'
import {
  findSupersededSubscriptions,
  isActiveSubscriptionStatus,
  isSameProduct,
  isSupersededByPurchase,
  type OwnedPlan,
  resolveCurrentPlan,
  resolveProductHoldings,
} from '@/payment/plan-state'

/**
 * 买断与订阅的归属判定。
 *
 * 判据优先级：**产品配置 > Stripe Product**。
 * - 同一个产品内：买断是订阅的更高档位，买断接管订阅（付两次就是重复收费）。
 * - 跨产品：默认并存；只有配置显式声明 `exclusiveWith` 才互斥。
 * - 都没说清时：按 Stripe Product 兜底（同一个 Product 下的价格是同一个东西的
 *   不同价位）。
 *
 * 一次性购买**可以有多笔**（实物商品买三件就是三单），所以「已拥有」不是通用拦截
 * 条件——只有订阅才受互斥约束。
 */

/** 本仓产品 id → 互斥产品 id。与 `src/config/products.ts` 的声明同形。 */
const EXCLUSIVITY: Record<string, string[]> = {
  lifetime: ['pro'],
  // 实物商品：显式声明「不与任何东西互斥」，可与订阅并存，也可买多件。
  merch: [],
}

function sub(overrides: Partial<OwnedPlan> & { id: string }): OwnedPlan {
  return {
    kind: 'subscription',
    productId: 'pro',
    stripeProductId: 'prod_pro',
    status: 'active',
    ...overrides,
  }
}

function purchase(overrides: Partial<OwnedPlan> & { id: string }): OwnedPlan {
  return {
    kind: 'one_time',
    productId: 'pro',
    stripeProductId: 'prod_pro',
    status: 'paid',
    ...overrides,
  }
}

describe('plan-state 归属判定', () => {
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

  describe('isSupersededByPurchase', () => {
    it('同一个产品：买断接管订阅', () => {
      expect(
        isSupersededByPurchase({
          purchase: { productId: 'pro' },
          subscription: { productId: 'pro' },
        }),
      ).toBe(true)
    })

    it('跨产品且配置声明了互斥：买断接管订阅', () => {
      expect(
        isSupersededByPurchase({
          purchase: { productId: 'lifetime' },
          subscription: { productId: 'pro' },
          exclusivityByProductId: { ...EXCLUSIVITY },
        }),
      ).toBe(true)
    })

    it('跨产品但配置显式声明不互斥：两者并存', () => {
      // 实物商品可以与订阅同时持有，也可以在订阅之外再买。
      expect(
        isSupersededByPurchase({
          purchase: { productId: 'merch' },
          subscription: { productId: 'pro' },
          exclusivityByProductId: { ...EXCLUSIVITY },
        }),
      ).toBe(false)
    })

    it('跨产品且没声明互斥：按 Stripe Product 兜底，不同 Product 即并存', () => {
      expect(
        isSupersededByPurchase({
          purchase: { productId: 'plus', stripeProductId: 'prod_plus' },
          subscription: { productId: 'pro', stripeProductId: 'prod_pro' },
        }),
      ).toBe(false)
    })

    it('跨产品且没声明互斥，但落在同一个 Stripe Product：按兜底判定接管', () => {
      // 同一个 Stripe Product 下的价格是同一个东西的不同价位（月付 / 年付 / 买断）。
      expect(
        isSupersededByPurchase({
          purchase: { productId: 'plus', stripeProductId: 'prod_vip' },
          subscription: { productId: 'pro', stripeProductId: 'prod_vip' },
        }),
      ).toBe(true)
    })

    it('买断查不到本站产品 id 时退回 Stripe Product 判定', () => {
      // 查不到产品 id 就没法查配置，但「同一个 Stripe Product」是事实，不是猜测。
      expect(
        isSupersededByPurchase({
          purchase: { productId: null, stripeProductId: 'prod_vip' },
          subscription: { productId: 'pro', stripeProductId: 'prod_vip' },
        }),
      ).toBe(true)
    })

    it('两边都查不到任何产品标识时不接管：不能靠猜去取消订阅', () => {
      expect(
        isSupersededByPurchase({
          purchase: { productId: null, stripeProductId: null },
          subscription: { productId: 'pro', stripeProductId: 'prod_pro' },
        }),
      ).toBe(false)
    })
  })

  describe('findSupersededSubscriptions', () => {
    it('同产品的生效订阅被买断接管', () => {
      const result = findSupersededSubscriptions(purchase({ id: 'pay_1' }), [
        sub({ id: 'sub_1' }),
        sub({ id: 'sub_2', productId: 'plus', stripeProductId: 'prod_plus' }),
      ])
      expect(result.map((item) => item.id)).toEqual(['sub_1'])
    })

    it('不同产品的订阅不被接管：两者是不同的东西，可以并存', () => {
      const result = findSupersededSubscriptions(
        purchase({ id: 'pay_1', productId: 'plus', stripeProductId: 'prod_plus' }),
        [sub({ id: 'sub_1', productId: 'pro' })],
      )
      expect(result).toEqual([])
    })

    it('已取消的订阅不再被接管', () => {
      const result = findSupersededSubscriptions(purchase({ id: 'pay_1' }), [
        sub({ id: 'sub_1', status: 'canceled' }),
      ])
      expect(result).toEqual([])
    })

    it('买断查不到任何产品标识时不接管任何订阅', () => {
      const result = findSupersededSubscriptions(
        purchase({ id: 'pay_1', productId: null, stripeProductId: null }),
        [sub({ id: 'sub_1' })],
      )
      expect(result).toEqual([])
    })

    it('配置声明互斥时，跨产品的订阅也被接管', () => {
      const result = findSupersededSubscriptions(
        purchase({ id: 'pay_1', productId: 'lifetime' }),
        [sub({ id: 'sub_1', productId: 'pro' })],
        { ...EXCLUSIVITY },
      )
      expect(result.map((item) => item.id)).toEqual(['sub_1'])
    })
  })

  describe('resolveProductHoldings', () => {
    it('按产品归集订阅与买断', () => {
      const holdings = resolveProductHoldings({
        subscriptions: [sub({ id: 'sub_1' })],
        purchases: [purchase({ id: 'pay_1', productId: 'lifetime' })],
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
        purchases: [purchase({ id: 'pay_1', productId: 'pro' })],
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
      })
      expect(holdings[0]?.current?.id).toBe('pay_2')
    })

    it('不同产品各自有当前项，互不影响', () => {
      const holdings = resolveProductHoldings({
        subscriptions: [sub({ id: 'sub_1' })],
        purchases: [purchase({ id: 'pay_1', productId: 'plus', stripeProductId: 'prod_plus' })],
      })
      expect(holdings.every((holding) => holding.current !== null)).toBe(true)
      expect(holdings.find((h) => h.productId === 'pro')?.supersededSubscriptionIds).toEqual([])
    })

    it('跨产品的互斥接管是全局判定，不受分组影响', () => {
      // 买断与订阅不在同一组，但配置声明了互斥：订阅仍应被判为已被接管。
      const holdings = resolveProductHoldings({
        subscriptions: [sub({ id: 'sub_1', productId: 'pro' })],
        purchases: [purchase({ id: 'pay_1', productId: 'lifetime' })],
        exclusivityByProductId: { ...EXCLUSIVITY },
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
      })
      expect(current?.id).toBe('sub_1')
    })

    it('只有买断时，买断就是当前生效方案', () => {
      const current = resolveCurrentPlan({
        subscriptions: [],
        purchases: [purchase({ id: 'pay_1' })],
      })
      expect(current?.id).toBe('pay_1')
    })

    it('买断与订阅同一个产品：买断接管订阅，买断是当前生效方案', () => {
      const current = resolveCurrentPlan({
        subscriptions: [sub({ id: 'sub_1' })],
        purchases: [purchase({ id: 'pay_1', productId: 'pro' })],
      })
      expect(current?.id).toBe('pay_1')
    })

    it('买断与订阅不同产品：两者并存，没有唯一当前方案', () => {
      const current = resolveCurrentPlan({
        subscriptions: [sub({ id: 'sub_1', productId: 'pro' })],
        purchases: [purchase({ id: 'pay_1', productId: 'plus', stripeProductId: 'prod_plus' })],
      })
      expect(current).toBeNull()
    })

    it('多笔买断并存时没有唯一当前方案', () => {
      const current = resolveCurrentPlan({
        subscriptions: [],
        purchases: [
          purchase({ id: 'pay_1' }),
          purchase({ id: 'pay_2', productId: 'plus', stripeProductId: 'prod_plus' }),
        ],
      })
      expect(current).toBeNull()
    })

    it('什么都没有时返回 null', () => {
      expect(resolveCurrentPlan({ subscriptions: [], purchases: [] })).toBeNull()
    })

    it('已取消的订阅不算当前生效方案', () => {
      const current = resolveCurrentPlan({
        subscriptions: [sub({ id: 'sub_1', status: 'canceled' })],
        purchases: [],
      })
      expect(current).toBeNull()
    })

    it('未支付的买断不算数', () => {
      const current = resolveCurrentPlan({
        subscriptions: [],
        purchases: [purchase({ id: 'pay_1', status: 'refunded' })],
      })
      expect(current).toBeNull()
    })
  })
})
