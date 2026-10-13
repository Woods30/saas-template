import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Pricing } from '@/components/blocks/marketing/pricing/Pricing'
import type { PricingPlan } from '@/components/blocks/marketing/pricing/types'
import { pricingPlans } from '@/config/blocks/pricing'

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

// ---------------------------------------------------------------------------
// pricingPlans config shape
// ---------------------------------------------------------------------------
describe('pricingPlans config', () => {
  it('有 3 个 plan: free, pro_monthly, lifetime', () => {
    expect(pricingPlans.map((p) => p.id).sort()).toEqual(['free', 'lifetime', 'pro_monthly'])
  })

  it('free 方案无价格', () => {
    const free = pricingPlans.find((p) => p.id === 'free')!
    expect(free.prices).toHaveLength(0)
    expect(free.features.length).toBeGreaterThan(0)
    expect(free.cta.label).toBeTruthy()
  })

  it('pro_monthly 方案价格为 $19.00/月', () => {
    const pro = pricingPlans.find((p) => p.id === 'pro_monthly')!
    expect(pro.prices).toHaveLength(1)
    expect(pro.prices[0].amount).toBe(1900)
    expect(pro.prices[0].currency).toBe('USD')
    expect(pro.prices[0].interval).toBe('month')
    expect(pro.highlighted).toBe(true)
    expect(pro.badge).toBeTruthy()
  })

  it('lifetime 方案价格为 $299.00 一次性', () => {
    const lifetime = pricingPlans.find((p) => p.id === 'lifetime')!
    expect(lifetime.prices).toHaveLength(1)
    expect(lifetime.prices[0].amount).toBe(29900)
    expect(lifetime.prices[0].interval).toBe('one_time')
  })

  it('每个 plan 都有 required fields', () => {
    for (const plan of pricingPlans) {
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
    const customCta = vi.fn().mockReturnValue(<button>Custom CTA</button>)
    render(<Pricing plans={fixture} renderCta={customCta} />)
    expect(customCta).toHaveBeenCalledWith(fixture[0])
    expect(customCta).toHaveBeenCalledWith(fixture[1])
    expect(screen.getAllByText('Custom CTA')).toHaveLength(2)
  })
})
