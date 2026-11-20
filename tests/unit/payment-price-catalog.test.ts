import { describe, expect, it, vi } from 'vitest'

/**
 * 服务端读取目录依赖 ALS 上下文里的支付渠道注册表。
 *
 * `cacheProvider: undefined` 让 `getOrSetCache` 走 pass-through，用例不经过缓存。
 */
const { mockServerContext } = vi.hoisted(() => ({
  mockServerContext: {
    env: {},
    cacheProvider: undefined,
    paymentProviderRegistry: undefined as
      | Partial<
          Record<'stripe', () => { listPrices: (references: string[]) => Promise<unknown[]> }>
        >
      | undefined,
  },
}))

vi.mock('@/lib/server-context', () => ({
  getServerContext: () => mockServerContext,
  als: { run: (_ctx: unknown, fn: () => unknown) => fn() },
}))

import { collectPriceReferences } from '@/config/products'
import {
  findCatalogAmount,
  formatUsdAmount,
  isOneTimePriceValid,
  LANDING_PRICE_CURRENCY,
} from '@/core/payment/price-catalog'
import { getPriceCatalog } from '@/core/payment/price-catalog.server'

/**
 * 价格目录：价格的**唯一事实源**是 Stripe，代码里不再存第二份金额。
 *
 * 展示价与收款价读同一份目录，改价只需动 Stripe；配置里再存一份金额，
 * 只会制造「改了 Stripe、结账被拦」这类不一致。
 */

const catalog = {
  one_time: {
    reference: 'one_time',
    priceId: 'p1',
    amount: 1,
    currency: 'usd',
    mode: 'payment' as const,
    interval: null,
    intervalCount: null,
  },
}

describe('一次性价格校验', () => {
  it('目录里是一次性价格即视为可用，不比对别处的金额', () => {
    expect(isOneTimePriceValid(catalog.one_time)).toBe(true)
  })

  it('订阅型或缺失的条目不可用', () => {
    expect(isOneTimePriceValid({ ...catalog.one_time, mode: 'subscription' })).toBe(false)
    expect(isOneTimePriceValid(undefined)).toBe(false)
  })

  it('指定币种时按币种校验', () => {
    expect(isOneTimePriceValid(catalog.one_time, { currency: LANDING_PRICE_CURRENCY })).toBe(true)
    expect(isOneTimePriceValid({ ...catalog.one_time, currency: 'eur' }, { currency: 'usd' })).toBe(
      false,
    )
  })
})

describe('目录取价', () => {
  it('按产品与付费方式取金额（分）', () => {
    expect(findCatalogAmount(catalog, 'template', 'once')).toBe(1)
  })

  it('付费方式不存在或目录里没有该引用时返回 null', () => {
    expect(findCatalogAmount(catalog, 'template', 'missing')).toBeNull()
    expect(findCatalogAmount({}, 'template', 'once')).toBeNull()
  })
})

describe('服务端读取目录', () => {
  it('没有配置支付渠道时返回空目录，而不是抛错', async () => {
    // 模板工程本身没有 Stripe 账号，llms.txt 与定价页仍要能渲染。
    mockServerContext.paymentProviderRegistry = undefined

    await expect(getPriceCatalog()).resolves.toEqual({})
  })

  it('已配置渠道时按引用聚合，跳过没有金额的条目', async () => {
    // 引用来自实例的商品配置（官网与模板不同），不写死具体 key。
    const [priced, ...unpriced] = collectPriceReferences()
    if (!priced) throw new Error('商品配置里至少要有一个价格引用')
    mockServerContext.paymentProviderRegistry = {
      stripe: () => ({
        listPrices: async (references) =>
          references.map((reference) => ({
            id: `price_${reference}`,
            reference,
            // 只给第一个引用金额，其余模拟渠道里查不到价格的情况。
            amount: reference === priced ? 9900 : null,
            currency: 'usd',
            mode: 'payment',
            interval: null,
            intervalCount: null,
          })),
      }),
    }

    const catalog = await getPriceCatalog()

    expect(Object.keys(catalog)).toEqual([priced])
    expect(catalog[priced]).toMatchObject({ priceId: `price_${priced}`, amount: 9900 })
    expect(unpriced.length).toBeGreaterThan(0)
  })
})

describe('金额格式化', () => {
  it('整数金额不显示小数位', () => {
    expect(formatUsdAmount(9900)).toBe('$99')
  })

  it('非整数金额保留两位小数', () => {
    expect(formatUsdAmount(1)).toBe('$0.01')
    expect(formatUsdAmount(50)).toBe('$0.50')
  })

  it('取不到金额时返回空串', () => {
    expect(formatUsdAmount(null)).toBe('')
  })
})
