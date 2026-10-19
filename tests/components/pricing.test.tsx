import { render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Pricing } from '@/components/blocks/marketing/pricing/Pricing'
import type { PricingPlan } from '@/components/blocks/marketing/pricing/types'
import { getPricingPlans } from '@/config/blocks/pricing'
import { getLocale, setLocale } from '@/locale/paraglide/runtime.js'

// ---------------------------------------------------------------------------
// Mock @tanstack/react-router — Pricing 组件依赖 <Link> 但测试无需路由上下文
// ---------------------------------------------------------------------------
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))

// ---------------------------------------------------------------------------
// 纯格式化函数 — 复用 Pricing.tsx 中的 (amount/100).toLocaleString 逻辑
// 用于独立测试货币格式化，不依赖 React 渲染
// ---------------------------------------------------------------------------
function formatPrice(amount: number, currency: string): string {
  return (amount / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  })
}

const originalLocale = getLocale()
afterEach(() => setLocale(originalLocale, { reload: false }))

// ---------------------------------------------------------------------------
// 文案随请求语言变化
//
// 这条用例守的是「工厂函数」本身：写成模块级常量时整个数组只在 import 那一刻求值，
// 之后切换语言不会变，SSR 下还会把首次请求的语言固化给所有后续请求。
// ---------------------------------------------------------------------------
describe('getPricingPlans 语言响应', () => {
  it('文案随运行时 locale 变化', () => {
    setLocale('zh', { reload: false })
    const zh = getPricingPlans()
    setLocale('en', { reload: false })
    const en = getPricingPlans()

    const zhPro = zh.find((plan) => plan.id === 'pro_monthly')
    const enPro = en.find((plan) => plan.id === 'pro_monthly')
    expect(zhPro?.name).toBe('专业版')
    expect(enPro?.name).toBe('Pro')
    // plan id 与金额不随语言变化：前者是 Price 映射的键，后者是展示数据。
    expect(zhPro?.id).toBe(enPro?.id)
    expect(zhPro?.prices.map((price) => [price.interval, price.amount])).toEqual(
      enPro?.prices.map((price) => [price.interval, price.amount]),
    )
    // `label` 是随语言变化的展示文案（「每月」/「/ month」）。
    expect(zhPro?.prices[0]?.label).not.toBe(enPro?.prices[0]?.label)
  })
})

// ---------------------------------------------------------------------------
// pricingPlans config shape
// ---------------------------------------------------------------------------
/** 按 id 取 plan；缺失即抛错，避免测试内散落非空断言。 */
function requirePlan(id: string): PricingPlan {
  const plan = getPricingPlans().find((p) => p.id === id)
  if (!plan) throw new Error(`未找到 plan: ${id}`)
  return plan
}

describe('pricingPlans config', () => {
  it('有 3 个 plan: free, pro_monthly, lifetime', () => {
    expect(
      getPricingPlans()
        .map((p) => p.id)
        .sort(),
    ).toEqual(['free', 'lifetime', 'pro_monthly'])
  })

  it('free 方案无价格', () => {
    const free = requirePlan('free')
    expect(free.prices).toHaveLength(0)
    expect(free.features.length).toBeGreaterThan(0)
    expect(free.cta.label).toBeTruthy()
  })

  it('pro_monthly 同时挂月付与年付两个 Price', () => {
    const pro = requirePlan('pro_monthly')
    // 两个周期都展示在页面上，由周期切换器决定实际提交哪一个。只有一个时
    // 「按年付」永远不会被选中（这是此前的实际状态）。
    expect(pro.prices.map((price) => price.interval)).toEqual(['month', 'year'])
    expect(pro.highlighted).toBe(true)
    expect(pro.badge).toBeTruthy()
  })

  it('pro_monthly 月付 $5.99、年付 $281.00', () => {
    const pro = requirePlan('pro_monthly')
    const month = pro.prices.find((price) => price.interval === 'month')
    const year = pro.prices.find((price) => price.interval === 'year')
    expect(month?.amount).toBe(599)
    expect(month?.currency).toBe('USD')
    expect(year?.amount).toBe(28100)
    expect(year?.currency).toBe('USD')
  })

  it('lifetime 方案价格为 $14.00 一次性', () => {
    const lifetime = requirePlan('lifetime')
    const [lifetimePrice] = lifetime.prices
    expect(lifetime.prices).toHaveLength(1)
    expect(lifetimePrice?.amount).toBe(1400)
    expect(lifetimePrice?.interval).toBe('one_time')
  })

  it('每个 plan 都有 required fields', () => {
    for (const plan of getPricingPlans()) {
      expect(plan.id, `plan ${plan.id}: missing id`).toBeTruthy()
      expect(plan.name, `plan ${plan.id}: missing name`).toBeTruthy()
      expect(Array.isArray(plan.prices), `plan ${plan.id}: prices not array`).toBe(true)
      expect(Array.isArray(plan.features), `plan ${plan.id}: features not array`).toBe(true)
      expect(plan.cta, `plan ${plan.id}: missing cta`).toBeTruthy()
      expect(plan.cta.href, `plan ${plan.id}: cta missing href`).toBeTruthy()
      expect(plan.cta.label, `plan ${plan.id}: cta missing label`).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// currency formatting
// ---------------------------------------------------------------------------
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
    // CNY 用 en-US locale 仍会产生符号；实际渲染以 CI 环境为准
    expect(() => formatPrice(9900, 'CNY')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Pricing block render
// ---------------------------------------------------------------------------
describe('Pricing block render', () => {
  const fixture: PricingPlan[] = [
    {
      id: 'test_free',
      name: 'Free Plan',
      description: 'For individuals',
      prices: [],
      features: ['Feature A', 'Feature B'],
      cta: { label: 'Get Started', href: '/register' },
    },
    {
      id: 'test_pro',
      name: 'Pro Plan',
      description: 'For teams',
      prices: [{ amount: 1900, currency: 'USD', interval: 'month', label: 'per month' }],
      features: ['Feature A', 'Feature B', 'Feature C'],
      cta: { label: 'Subscribe', href: '/register?plan=pro' },
      highlighted: true,
      badge: 'Recommended',
    },
  ]

  it('渲染 plan name 与 description', () => {
    render(<Pricing plans={fixture} />)
    expect(screen.getByText('Free Plan')).toBeInTheDocument()
    expect(screen.getByText('For individuals')).toBeInTheDocument()
    expect(screen.getByText('Pro Plan')).toBeInTheDocument()
    expect(screen.getByText('For teams')).toBeInTheDocument()
  })

  it('渲染 feature 列表', () => {
    render(<Pricing plans={fixture} />)
    expect(screen.getAllByText('Feature A')).toHaveLength(2)
    expect(screen.getByText('Feature C')).toBeInTheDocument()
  })

  it('渲染 highlighted plan 的 badge', () => {
    render(<Pricing plans={fixture} />)
    expect(screen.getByText('Recommended')).toBeInTheDocument()
  })

  it('渲染 CTA label', () => {
    render(<Pricing plans={fixture} />)
    expect(screen.getByText('Get Started')).toBeInTheDocument()
    expect(screen.getByText('Subscribe')).toBeInTheDocument()
  })

  it('自定义 renderCta 覆盖默认 CTA 渲染', () => {
    const customCta = vi.fn().mockReturnValue(<button type="button">Custom CTA</button>)
    render(<Pricing plans={fixture} renderCta={customCta} />)
    expect(customCta).toHaveBeenCalledWith(fixture[0])
    expect(customCta).toHaveBeenCalledWith(fixture[1])
    expect(screen.getAllByText('Custom CTA')).toHaveLength(2)
  })

  // 一个 plan 挂两个周期时只显示选中的那个：两行金额并排会让用户以为要付两份。
  const dualIntervalPlan: PricingPlan = {
    id: 'dual',
    name: 'Dual Plan',
    prices: [
      { amount: 1900, currency: 'USD', interval: 'month', label: 'per month' },
      { amount: 19000, currency: 'USD', interval: 'year', label: 'per year' },
    ],
    features: ['Feature A'],
    cta: { label: 'Subscribe', href: '/register' },
  }

  it('selectedInterval 决定显示哪一行价格', () => {
    const { rerender } = render(<Pricing plans={[dualIntervalPlan]} selectedInterval="month" />)
    expect(screen.getByText('$19.00')).toBeInTheDocument()
    expect(screen.queryByText('$190.00')).not.toBeInTheDocument()

    rerender(<Pricing plans={[dualIntervalPlan]} selectedInterval="year" />)
    expect(screen.getByText('$190.00')).toBeInTheDocument()
    expect(screen.queryByText('$19.00')).not.toBeInTheDocument()
  })

  it('不传 selectedInterval 时退回第一行价格', () => {
    render(<Pricing plans={[dualIntervalPlan]} />)
    expect(screen.getByText('$19.00')).toBeInTheDocument()
    expect(screen.queryByText('$190.00')).not.toBeInTheDocument()
  })

  it('selectedInterval 在该 plan 上不存在时仍退回第一行', () => {
    // 一次性方案（lifetime）没有 month/year，切换器对它不生效但不能渲染成空白。
    render(<Pricing plans={[dualIntervalPlan]} selectedInterval="one_time" />)
    expect(screen.getByText('$19.00')).toBeInTheDocument()
  })
})
