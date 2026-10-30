import { describe, expect, it } from 'vitest'
import { findCatalogAmount, formatUsdAmount, isTemplatePriceValid } from '@/payment/price-catalog'

/**
 * 价格目录：价格的**唯一事实源**是 Stripe，代码里不再存第二份金额。
 *
 * 展示价与收款价读同一份目录，改价只需动 Stripe；配置里再存一份金额，
 * 只会制造「改了 Stripe、结账被拦」这类不一致。
 */

const catalog = {
  jerbix_template: {
    reference: 'jerbix_template',
    priceId: 'p1',
    amount: 1,
    currency: 'usd',
    mode: 'payment' as const,
    interval: null,
    intervalCount: null,
  },
}

describe('模板价格校验', () => {
  it('目录里是一次性美元价格即视为可用，不比对别处的金额', () => {
    expect(isTemplatePriceValid(catalog.jerbix_template)).toBe(true)
  })

  it('订阅型、非美元或缺失的条目都不可用', () => {
    expect(isTemplatePriceValid({ ...catalog.jerbix_template, mode: 'subscription' })).toBe(false)
    expect(isTemplatePriceValid({ ...catalog.jerbix_template, currency: 'eur' })).toBe(false)
    expect(isTemplatePriceValid(undefined)).toBe(false)
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
