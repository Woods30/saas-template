import { render, screen } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LandingPage } from '@/components/marketing/LandingPage'

// LandingPage 依赖 <Link>，测试无需路由上下文
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))

describe('LandingPage', () => {
  it('包含特性 / 价格 / FAQ 三个锚点区段', () => {
    const { container } = render(<LandingPage />)
    expect(container.querySelector('#features')).not.toBeNull()
    expect(container.querySelector('#pricing')).not.toBeNull()
    expect(container.querySelector('#faq')).not.toBeNull()
  })

  it('渲染 hero 主标题', () => {
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})
