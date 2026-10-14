import { render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocPager } from '@/components/docs/DocPager'
import { setLocale } from '@/locale/paraglide/runtime.js'

/**
 * 文档底部的上一篇 / 下一篇导航。
 *
 * 阅读顺序沿 `order` 全局推进（跨分组），因此「下一篇」会一路走完整个文档集，
 * 不在组边界停住。首篇只有下一篇、末篇只有上一篇。
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    params?: Record<string, string>
  }) => (
    <a {...props} href={`/docs/${params?.slug}`}>
      {children}
    </a>
  ),
}))

beforeEach(() => setLocale('en', { reload: false }))
afterEach(() => {
  document.body.innerHTML = ''
})

describe('DocPager', () => {
  it('两侧都为空时不渲染', () => {
    const { container } = render(<DocPager locale="en" />)
    expect(container.firstChild).toBeNull()
  })

  it('渲染上一篇与下一篇，并标明方向', () => {
    render(
      <DocPager
        locale="en"
        prev={{ slug: 'configuration', title: 'Website Config' }}
        next={{ slug: 'environment', title: 'Environment' }}
      />,
    )
    expect(screen.getByText('Previous')).toBeTruthy()
    expect(screen.getByText('Next')).toBeTruthy()
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.querySelector('span:last-child')?.textContent)).toEqual([
      'Website Config',
      'Environment',
    ])
    expect(links[0]).toHaveAttribute('href', '/docs/configuration')
    expect(links[1]).toHaveAttribute('href', '/docs/environment')
  })

  it('首篇只有下一篇：不渲染「上一篇」标签', () => {
    render(<DocPager locale="en" next={{ slug: 'b', title: 'B' }} />)
    expect(screen.queryByText('Previous')).toBeNull()
    expect(screen.getByText('Next')).toBeTruthy()
  })

  it('末篇只有上一篇：不渲染「下一篇」标签', () => {
    render(<DocPager locale="en" prev={{ slug: 'a', title: 'A' }} />)
    expect(screen.queryByText('Next')).toBeNull()
    expect(screen.getByText('Previous')).toBeTruthy()
  })
})
