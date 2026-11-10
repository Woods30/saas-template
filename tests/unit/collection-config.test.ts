import { describe, expect, it } from 'vitest'
import {
  collectionConfigErrors,
  formatMoneyAmount,
  resolveCollectionPrice,
} from '@/collection/pricing'
import type { CheckoutMode, CollectionAccountConfig } from '@/collection/types'
import { getServiceStatuses } from '@/config/service-status'
import { createWebsiteConfig } from '@/config/website'
import { parsePublicEnv } from '@/env/public'
import { parseServerEnv } from '@/env/server'
import type { ProductDefinition } from '@/types/pricing'

/**
 * 核销型支付（collection）的配置与本地价格。
 *
 * 断言都取自显式摆出的配置，不依赖出厂值：模块开关、价格与账户都是配置项，
 * `pnpm run init` 会把它们改写成使用者自己的值。
 */

const baseEnv = parsePublicEnv({})

/** 一个合规的收款账户：二维码走站内根路径。 */
const ACCOUNT: CollectionAccountConfig = {
  id: 'alipay-default',
  channel: 'alipay',
  displayName: '支付宝个人收款',
  currency: 'cny',
  qrImageUrl: '/collection/alipay-qrcode.png',
}

/** 只带核销型价格的商品夹具。 */
function makeProduct(collectionPrices: ProductDefinition['collectionPrices']): ProductDefinition {
  return { id: 'template', name: 'Template', features: [], prices: {}, collectionPrices }
}

/** 构造一份配置并取服务状态。 */
function statusFor(options: {
  mode?: CheckoutMode
  enabled?: boolean
  accounts?: CollectionAccountConfig[]
  landingOffer?: { productId: string; offerId: string }
}) {
  const config = createWebsiteConfig(baseEnv)
  config.checkout = { mode: options.mode ?? 'provider' }
  config.collection = {
    ...config.collection,
    enabled: options.enabled ?? true,
    accounts: options.accounts ?? [ACCOUNT],
  }
  if (options.landingOffer) config.landingOffer = options.landingOffer
  return getServiceStatuses({
    config,
    publicEnv: baseEnv,
    serverEnv: parseServerEnv({}),
  })
}

describe('resolveCollectionPrice', () => {
  it('解析 CNY collection price 且金额只接受正整数', () => {
    expect(resolveCollectionPrice('template', 'once')).toMatchObject({
      currency: 'cny',
      kind: 'one_time',
      amount: 18_000,
    })
    expect(
      collectionConfigErrors([
        makeProduct({ once: { amount: 18_000.5, currency: 'cny', kind: 'one_time' } }),
      ]),
    ).toContain('invalidCollectionAmount.template.once')
  })

  it('未知的商品或付费方式返回 undefined', () => {
    expect(resolveCollectionPrice('template', 'missing')).toBeUndefined()
    expect(resolveCollectionPrice('nope', 'once')).toBeUndefined()
  })

  it('配置不合法的价格不参与解析：金额非正整数、币种不对、周期规则不满足', () => {
    // 金额必须是正整数分。
    expect(
      collectionConfigErrors([
        makeProduct({ once: { amount: 0, currency: 'cny', kind: 'one_time' } }),
      ]),
    ).toContain('invalidCollectionAmount.template.once')
    // 首期只支持人民币。
    expect(
      collectionConfigErrors([
        makeProduct({
          once: { amount: 18_000, currency: 'usd' as 'cny', kind: 'one_time' },
        }),
      ]),
    ).toContain('invalidCollectionCurrency.template.once')
    // 一次性价格不得声明周期。
    expect(
      collectionConfigErrors([
        makeProduct({
          once: { amount: 18_000, currency: 'cny', kind: 'one_time', interval: 'month' },
        }),
      ]),
    ).toContain('invalidCollectionInterval.template.once')
    // 订阅价格必须声明周期。
    expect(
      collectionConfigErrors([
        makeProduct({ monthly: { amount: 18_000, currency: 'cny', kind: 'subscription' } }),
      ]),
    ).toContain('invalidCollectionInterval.template.monthly')
    // 订阅价格必须声明正的周期数。
    expect(
      collectionConfigErrors([
        makeProduct({
          monthly: {
            amount: 18_000,
            currency: 'cny',
            kind: 'subscription',
            interval: 'month',
            intervalCount: 0,
          },
        }),
      ]),
    ).toContain('invalidCollectionIntervalCount.template.monthly')
  })

  it('合法的订阅价格不产生错误', () => {
    expect(
      collectionConfigErrors([
        makeProduct({
          monthly: {
            amount: 18_000,
            currency: 'cny',
            kind: 'subscription',
            interval: 'month',
            intervalCount: 1,
          },
        }),
      ]),
    ).toEqual([])
  })
})

describe('checkout.mode', () => {
  it('VITE_CHECKOUT_MODE 覆盖源码默认值且默认仍为 provider', () => {
    expect(createWebsiteConfig(baseEnv).checkout.mode).toBe('provider')
    expect(
      createWebsiteConfig({ ...baseEnv, VITE_CHECKOUT_MODE: 'collection' }).checkout.mode,
    ).toBe('collection')
  })
})

describe('VITE_COLLECTION_ACCOUNTS', () => {
  /** 一个合法的账户 JSON：与 `ACCOUNT` 同构。 */
  const accountJson = JSON.stringify([
    {
      id: 'alipay-env',
      channel: 'alipay',
      displayName: '环境变量收款账户',
      currency: 'cny',
      qrImageUrl: '/collection/env-qrcode.png',
    },
  ])

  it('JSON 数组覆盖源码配置的收款账户', () => {
    const config = createWebsiteConfig({ ...baseEnv, VITE_COLLECTION_ACCOUNTS: accountJson })
    expect(config.collection.accounts).toHaveLength(1)
    expect(config.collection.accounts[0]).toMatchObject({
      id: 'alipay-env',
      channel: 'alipay',
      currency: 'cny',
    })
  })

  it('留空或未设置时沿用源码配置', () => {
    const withSource = createWebsiteConfig({
      ...baseEnv,
      VITE_COLLECTION_ACCOUNTS: '   ',
    })
    expect(withSource.collection.accounts).toEqual(createWebsiteConfig(baseEnv).collection.accounts)
  })

  it('非法 JSON 或形状不对时整体忽略，回退源码配置（fail-visible 由 service-status 报 incomplete）', () => {
    const source = createWebsiteConfig(baseEnv).collection.accounts
    for (const bad of ['not-json', '[{"id":1}]', JSON.stringify({ id: 'x' }), '[]']) {
      expect(
        createWebsiteConfig({ ...baseEnv, VITE_COLLECTION_ACCOUNTS: bad }).collection.accounts,
      ).toEqual(source)
    }
  })

  it('env 账户参与 service-status 的完整性判定', () => {
    const env = {
      ...baseEnv,
      VITE_MODULES: 'collection,auth',
      VITE_CHECKOUT_MODE: 'collection' as const,
      VITE_COLLECTION_ACCOUNTS: accountJson,
    }
    const config = createWebsiteConfig(env)
    expect(config.collection.enabled).toBe(true)
    const statuses = getServiceStatuses({
      config,
      publicEnv: env,
      serverEnv: parseServerEnv({}),
    })
    expect(statuses.collection.state).toBe('configured')
  })
})

describe('getServiceStatuses — collection', () => {
  it('collection checkout 缺模块、价格或账户时为 incomplete', () => {
    expect(statusFor({ mode: 'collection', enabled: false }).collection.state).toBe('disabled')
    expect(statusFor({ mode: 'collection', accounts: [] }).collection.state).toBe('incomplete')
  })

  it('目标商品缺核销型价格时为 incomplete', () => {
    const statuses = statusFor({
      mode: 'collection',
      landingOffer: { productId: 'free', offerId: 'once' },
    })
    expect(statuses.collection.state).toBe('incomplete')
    expect(statuses.collection.issues.map((issue) => issue.key)).toContain('collection.products')
  })

  it('价格与账户齐备时为 configured', () => {
    expect(statusFor({ mode: 'collection' }).collection.state).toBe('configured')
  })

  it('账户配置非法（ID 重复、二维码不是根路径或无凭据 HTTPS）时为 incomplete', () => {
    const statuses = statusFor({
      mode: 'collection',
      accounts: [ACCOUNT, { ...ACCOUNT, qrImageUrl: 'http://example.com/qr.png' }],
    })
    expect(statuses.collection.state).toBe('incomplete')
    expect(statuses.collection.issues.map((issue) => issue.key)).toContain('collection.accounts')
  })
})

describe('formatMoneyAmount', () => {
  it('按币种的最小单位换算：分转元并保留两位小数', () => {
    expect(formatMoneyAmount(18_000, 'cny', 'zh-CN')).toBe('¥180.00')
    expect(formatMoneyAmount(18_001, 'cny', 'zh-CN')).toBe('¥180.01')
  })

  it('无小数位的币种不补零', () => {
    expect(formatMoneyAmount(1_800, 'jpy', 'ja-JP')).toContain('1,800')
  })
})
