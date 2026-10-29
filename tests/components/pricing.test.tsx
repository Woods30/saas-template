import { fireEvent, render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Pricing } from '@/components/sections/Pricing'
import { getProducts } from '@/config/products'
import { getLocale, setLocale } from '@/locale/paraglide/runtime.js'
import type { PricingProduct } from '@/types/pricing'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))
const originalLocale = getLocale()
afterEach(() => setLocale(originalLocale, { reload: false }))

const product: PricingProduct = {
  id: 'mixed',
  name: 'Example',
  features: ['Feature'],
  prices: { monthly: 'month', yearly: 'year', once: 'once' },
  options: [
    {
      id: 'monthly',
      kind: 'subscription',
      amount: 1900,
      currency: 'usd',
      interval: 'month',
      label: 'Monthly',
    },
    {
      id: 'yearly',
      kind: 'subscription',
      amount: 19000,
      currency: 'usd',
      interval: 'year',
      label: 'Yearly',
    },
    {
      id: 'once',
      kind: 'one_time',
      amount: 9900,
      currency: 'usd',
      interval: 'one_time',
      label: 'Once',
    },
  ],
}

describe('Pricing', () => {
  it('套餐文案跟随当前语言', () => {
    setLocale('zh', { reload: false })
    const zh = getProducts().find((p) => p.id === 'pro')
    setLocale('en', { reload: false })
    const en = getProducts().find((p) => p.id === 'pro')
    expect(zh?.name).toBe('专业版')
    expect(en?.name).toBe('Pro')
  })
  it('购买按钮收到用户实际选择的一次性选项', () => {
    render(
      <Pricing
        products={[product]}
        renderCta={(_, option) => <button type="button">Buy {option?.id}</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Buy monthly' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Once' }))
    expect(screen.getByRole('button', { name: 'Buy once' })).toBeInTheDocument()
    expect(screen.getByText('$99.00')).toBeInTheDocument()
  })
  it('从登录返回后恢复年付选项', () => {
    render(
      <Pricing products={[product]} initialSelection={{ productId: 'mixed', offerId: 'yearly' }} />,
    )
    expect(screen.getByText('$190.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yearly' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('日元价格使用货币最小单位，周付不显示成年付', () => {
    render(
      <Pricing
        products={[
          {
            ...product,
            options: [
              {
                id: 'weekly',
                kind: 'subscription',
                amount: 1900,
                currency: 'jpy',
                interval: 'week',
                label: 'Weekly',
              },
            ],
          },
        ]}
      />,
    )
    expect(screen.getByText('¥1,900')).toBeInTheDocument()
    expect(screen.queryByText('/yr')).not.toBeInTheDocument()
  })
  it('免费套餐的自定义入口收到空选项', () => {
    render(
      <Pricing
        products={[{ id: 'free', name: 'Free', features: [], prices: {}, options: [] }]}
        renderCta={(_, option) => <button type="button">{option ? 'Buy' : 'Register'}</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument()
  })
})
