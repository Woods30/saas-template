import { fireEvent, render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Pricing } from '@/components/sections/Pricing'
import { getProducts } from '@/config/products'
import { getLocale, setLocale } from '@/locale/paraglide/runtime.js'
import type { PricingProduct, ProductDefinition } from '@/types/pricing'

// Mock @tanstack/react-router：Pricing 依赖 <Link>，但测试无需路由上下文。
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))

// 货币格式化纯函数，不依赖 React 渲染。
function formatPrice(amount: number, currency: string): string {
  return (amount / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  })
}

const originalLocale = getLocale()
afterEach(() => setLocale(originalLocale, { reload: false }))

// 文案随请求语言变化：必须用工厂函数。模块级常量会在 import 时求值，
// 切换语言不生效，SSR 下还会把首次请求的语言固化给后续请求。
describe('getProducts 语言响应', () => {
  it('文案随运行时 locale 变化', () => {
    setLocale('zh', { reload: false })
    const zh = getProducts()
    setLocale('en', { reload: false })
    const en = getProducts()

    const zhPro = zh.find((product) => product.id === 'pro')
    const enPro = en.find((product) => product.id === 'pro')
    expect(zhPro?.name).toBe('专业版')
    expect(enPro?.name).toBe('Pro')
    expect(zhPro?.id).toBe(enPro?.id)
    // 产品定义里没有金额（金额来自 Stripe），文案仍随语言变化。
    expect(zhPro?.features[0]).not.toBe(enPro?.features[0])
    expect(zhPro?.cta.label).not.toBe(enPro?.cta.label)
  })
})

// 产品配置形状。
/** 按 id 取产品；缺失即抛错，避免散落非空断言。 */
function requireProduct(id: string): ProductDefinition {
  const product = getProducts().find((p) => p.id === id)
  if (!product) throw new Error(`未找到产品: ${id}`)
  return product
}

describe('产品配置', () => {
  it('有 3 个产品: free, pro, lifetime', () => {
    expect(
      getProducts()
        .map((p) => p.id)
        .sort(),
    ).toEqual(['free', 'lifetime', 'pro'])
  })

  it('free 产品有卖点与 CTA，但没有付费方式', () => {
    const free = requireProduct('free')
    expect(free.features.length).toBeGreaterThan(0)
    expect(free.cta.label).toBeTruthy()
    expect(free.options).toEqual([])
  })

  it('pro 是推荐产品', () => {
    const pro = requireProduct('pro')
    expect(pro.highlighted).toBe(true)
    expect(pro.badge).toBeTruthy()
  })

  it('pro 的月付与年付是同一个产品的两种付费方式', () => {
    const pro = requireProduct('pro')
    expect(pro.options.map((option) => option.interval)).toEqual(['month', 'year'])
  })

  it('lifetime 是一次性买断，且与 pro 互斥', () => {
    const lifetime = requireProduct('lifetime')
    expect(lifetime.options.map((option) => option.kind)).toEqual(['one_time'])
    expect(lifetime.exclusiveWith).toEqual(['pro'])
  })

  it('产品定义里没有金额 —— 金额来自 Stripe', () => {
    // 写死金额会让页面显示与实际扣款分属两份数据，改价必然漂移。
    // 产品定义里有「付费方式」，但没有金额——金额由 Stripe 的 Price 决定。
    for (const product of getProducts()) {
      for (const option of product.options) {
        expect(option, `产品 ${product.id}: 付费方式不应带金额`).not.toHaveProperty('amount')
        expect(option, `产品 ${product.id}: 付费方式不应带币种`).not.toHaveProperty('currency')
      }
    }
  })

  it('每个产品都有 required fields', () => {
    for (const product of getProducts()) {
      expect(product.id, `产品 ${product.id}: missing id`).toBeTruthy()
      expect(product.name, `产品 ${product.id}: missing name`).toBeTruthy()
      expect(Array.isArray(product.features), `产品 ${product.id}: features not array`).toBe(true)
      expect(product.cta, `产品 ${product.id}: missing cta`).toBeTruthy()
      expect(product.cta.href, `产品 ${product.id}: cta missing href`).toBeTruthy()
      expect(product.cta.label, `产品 ${product.id}: cta missing label`).toBeTruthy()
    }
  })
})

// 货币格式化。
describe('formatPrice (extracted pure fn)', () => {
  it('1900 USD → $19.00', () => {
    expect(formatPrice(1900, 'USD')).toBe('$19.00')
  })

  it('29900 USD → $299.00', () => {
    expect(formatPrice(29900, 'USD')).toBe('$299.00')
  })

  it('0 USD → $0.00', () => {
    expect(formatPrice(0, 'USD')).toBe('$0.00')
  })

  it('999 USD → $9.99', () => {
    expect(formatPrice(999, 'USD')).toBe('$9.99')
  })

  it('CNY 大写不报错', () => {
    // CNY 在 en-US locale 下仍产生符号，实际渲染以 CI 环境为准。
    expect(() => formatPrice(9900, 'CNY')).not.toThrow()
  })
})

// Pricing 区块渲染。
describe('Pricing block render', () => {
  const fixture: PricingProduct[] = [
    {
      id: 'test_free',
      name: 'Free Plan',
      description: 'For individuals',
      options: [],
      features: ['Feature A', 'Feature B'],
      cta: { label: 'Get Started', href: '/register' },
    },
    {
      id: 'test_pro',
      name: 'Pro Plan',
      description: 'For teams',
      options: [
        {
          kind: 'subscription',
          amount: 1900,
          currency: 'USD',
          interval: 'month',
          label: 'per month',
        },
      ],
      features: ['Feature A', 'Feature B', 'Feature C'],
      cta: { label: 'Subscribe', href: '/register?plan=pro' },
      highlighted: true,
      badge: 'Recommended',
    },
  ]

  it('渲染产品名与描述', () => {
    render(<Pricing products={fixture} />)
    expect(screen.getByText('Free Plan')).toBeInTheDocument()
    expect(screen.getByText('For individuals')).toBeInTheDocument()
    expect(screen.getByText('Pro Plan')).toBeInTheDocument()
    expect(screen.getByText('For teams')).toBeInTheDocument()
  })

  it('渲染 feature 列表', () => {
    render(<Pricing products={fixture} />)
    expect(screen.getAllByText('Feature A')).toHaveLength(2)
    expect(screen.getByText('Feature C')).toBeInTheDocument()
  })

  it('渲染 highlighted 产品的 badge', () => {
    render(<Pricing products={fixture} />)
    expect(screen.getByText('Recommended')).toBeInTheDocument()
  })

  it('渲染 CTA label', () => {
    render(<Pricing products={fixture} />)
    expect(screen.getByText('Get Started')).toBeInTheDocument()
    expect(screen.getByText('Subscribe')).toBeInTheDocument()
  })

  it('自定义 renderCta 覆盖默认 CTA 渲染', () => {
    const customCta = vi.fn().mockReturnValue(<button type="button">Custom CTA</button>)
    render(<Pricing products={fixture} renderCta={customCta} />)
    // 免费档没有付费方式，但仍要渲染 CTA：它走「注册 / 进控制台」而不是结账。
    expect(customCta).toHaveBeenCalledWith(fixture[0], undefined)
    expect(customCta).toHaveBeenCalledWith(fixture[1], fixture[1]?.options[0])
    expect(screen.getAllByText('Custom CTA')).toHaveLength(2)
  })

  // 只显示选中的付费方式，两行金额并排会让用户以为要付两份。
  const dualIntervalProduct: PricingProduct = {
    id: 'dual',
    name: 'Dual Plan',
    options: [
      {
        kind: 'subscription',
        amount: 1900,
        currency: 'USD',
        interval: 'month',
        label: 'per month',
      },
      { kind: 'subscription', amount: 19000, currency: 'USD', interval: 'year', label: 'per year' },
    ],
    features: ['Feature A'],
    cta: { label: 'Subscribe', href: '/register' },
  }

  it('默认显示第一个付费方式的价格', () => {
    render(<Pricing products={[dualIntervalProduct]} />)
    expect(screen.getByText('$19.00')).toBeInTheDocument()
    expect(screen.queryByText('$190.00')).not.toBeInTheDocument()
  })

  it('切换器切到年付后只显示年付价格', () => {
    render(<Pricing products={[dualIntervalProduct]} />)
    fireEvent.click(screen.getByRole('button', { name: 'per year' }))
    expect(screen.getByText('$190.00')).toBeInTheDocument()
    expect(screen.queryByText('$19.00')).not.toBeInTheDocument()
  })

  it('切换器只在该产品有多个订阅周期时出现', () => {
    // 买断产品只有一种付费方式，切换器没有意义。
    const buyout: PricingProduct = {
      id: 'buyout',
      name: 'Buyout',
      options: [
        { kind: 'one_time', amount: 9900, currency: 'USD', interval: 'one_time', label: 'once' },
      ],
      features: ['Feature A'],
      cta: { label: 'Buy', href: '/register' },
    }
    render(<Pricing products={[buyout]} />)
    expect(screen.queryByRole('button', { name: 'once' })).not.toBeInTheDocument()
    expect(screen.getByText('$99.00')).toBeInTheDocument()
  })
})
