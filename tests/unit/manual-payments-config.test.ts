import { describe, expect, it } from 'vitest'
import { collectionConfigErrors, resolveCollectionPrice } from '@/config/products'
import { getServiceStatuses } from '@/config/service-status'
import { createWebsiteConfig, parseCollectionAccounts } from '@/config/website'
import { defaultSettingsValues } from '@/core/config/registry'
import { applySettingsToConfig } from '@/core/config/settings'
import { parsePublicEnv } from '@/core/env/public'
import { parseServerEnv, type RuntimeEnv } from '@/core/env/server'
import type { CollectionAccountConfig } from '@/types/collection'
import type { ProductDefinition } from '@/types/pricing'

/**
 * 核销型支付（collection）的配置与本地价格。
 *
 * 断言都取自显式摆出的配置，不依赖出厂值：模块开关、价格与账户都是配置项，
 * 使用者会把自己的收款码与金额填进去。
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
  enabled?: boolean
  accounts?: CollectionAccountConfig[]
  landingOffer?: { productId: string; offerId: string }
}) {
  const config = createWebsiteConfig(baseEnv)
  config.collection = {
    ...config.collection,
    enabled: options.enabled ?? true,
    accounts: options.accounts ?? [ACCOUNT],
  }
  if (options.landingOffer) config.landingOffer = options.landingOffer
  return getServiceStatuses({
    config,
    serverEnv: parseServerEnv({}) as RuntimeEnv,
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

describe('收款账户解析', () => {
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

  it('解析 JSON 数组为账户清单', () => {
    const accounts = parseCollectionAccounts(accountJson)
    expect(accounts).toHaveLength(1)
    expect(accounts?.[0]).toMatchObject({
      id: 'alipay-env',
      channel: 'alipay',
      currency: 'cny',
    })
  })

  it('留空或未设置时返回 undefined（表示没给）', () => {
    expect(parseCollectionAccounts('   ')).toBeUndefined()
    expect(parseCollectionAccounts(undefined)).toBeUndefined()
  })

  it('非法 JSON 或形状不对时整体忽略，不静默生效半个配置', () => {
    for (const bad of ['not-json', '[{"id":1}]', JSON.stringify({ id: 'x' }), '[]']) {
      expect(parseCollectionAccounts(bad)).toBeUndefined()
    }
  })

  it('配置值里的账户进入站点配置并参与 service-status 判定', () => {
    const values = { ...defaultSettingsValues(), 'collection.accounts': [ACCOUNT] }
    const config = applySettingsToConfig(createWebsiteConfig(baseEnv), {
      ...values,
      'modules.collection': true,
    })
    expect(config.collection.enabled).toBe(true)
    expect(config.collection.accounts).toEqual([ACCOUNT])
    const statuses = getServiceStatuses({
      config,
      serverEnv: parseServerEnv({}) as RuntimeEnv,
    })
    expect(statuses.collection.state).toBe('configured')
  })
})

describe('getServiceStatuses — collection', () => {
  it('collection 模块关闭时为 disabled，缺账户时为 incomplete', () => {
    expect(statusFor({ enabled: false }).collection.state).toBe('disabled')
    expect(statusFor({ accounts: [] }).collection.state).toBe('incomplete')
  })

  it('目标商品缺核销型价格时为 incomplete', () => {
    const statuses = statusFor({
      landingOffer: { productId: 'free', offerId: 'once' },
    })
    expect(statuses.collection.state).toBe('incomplete')
    expect(statuses.collection.issues.map((issue) => issue.key)).toContain('collection.products')
  })

  it('价格与账户齐备时为 configured', () => {
    expect(statusFor({}).collection.state).toBe('configured')
  })

  it('账户配置非法（ID 重复、二维码不是根路径或无凭据 HTTPS）时为 incomplete', () => {
    const statuses = statusFor({
      accounts: [ACCOUNT, { ...ACCOUNT, qrImageUrl: 'http://example.com/qr.png' }],
    })
    expect(statuses.collection.state).toBe('incomplete')
    expect(statuses.collection.issues.map((issue) => issue.key)).toContain('collection.accounts')
  })
})
