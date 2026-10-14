import { render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocNextSteps } from '@/components/docs/DocNextSteps'
import { DocsSidebar } from '@/components/docs/DocsSidebar'
import type { DocEntry } from '@/lib/docs'
import { setLocale } from '@/locale/paraglide/runtime.js'

/** 与下方卡片测试用的同一篇文档，用于比对两处图标是否一致。 */
const SIDEBAR_DOC: DocEntry = {
  slug: 'configuration',
  title: 'Website Config',
  description: '',
  content: '',
  order: 2,
  group: 'config',
  updated: '',
}

/**
 * 正文末尾的「下一步」卡片。
 *
 * 原本是一组普通列表项，与其他内容视觉上没有区别；改为带图标的块状卡片后，
 * 「读完之后去哪」在页面底部一眼可见。站内相对链接走文档路由，站外链接按普通
 * 外链渲染。
 */
// 只替换路由边界；mock 需还原真实 `Link` 对 `params` / `hash` 的拼接方式，
// 否则「锚点是否保留」这条断言测的是 mock 而不是组件。
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    hash,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string
    params?: Record<string, string>
    hash?: string
  }) => (
    <a {...props} href={`${params ? `/docs/${params.slug}` : (to ?? '')}${hash ? `#${hash}` : ''}`}>
      {children}
    </a>
  ),
}))

beforeEach(() => setLocale('en', { reload: false }))
afterEach(() => {
  document.body.innerHTML = ''
})

describe('DocNextSteps', () => {
  it('没有条目时不渲染（不留下空标题）', () => {
    const { container } = render(<DocNextSteps steps={[]} locale="en" />)
    expect(container.firstChild).toBeNull()
  })

  it('每个条目渲染为一块指向对应文档的卡片', () => {
    render(
      <DocNextSteps
        steps={[
          { title: 'Website Config', href: './configuration', description: '' },
          { title: 'Environment', href: './environment#prod', description: '' },
        ]}
        locale="en"
      />,
    )
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.querySelector('span:last-child')?.textContent)).toEqual([
      'Website Config',
      'Environment',
    ])
    expect(links[0]).toHaveAttribute('href', '/docs/configuration')
    expect(links[1]).toHaveAttribute('href', '/docs/environment#prod')
  })

  it('每条卡片带一枚与侧边栏一致的主题图标', () => {
    // 卡片用「目标文档」的图标（`./configuration` → 配置图标），而不是统一箭头：
    // 与侧边栏同一份映射，用户能在两处认出同一项。
    const { container } = render(
      <DocNextSteps
        steps={[{ title: 'Website Config', href: './configuration', description: '' }]}
        locale="en"
      />,
    )
    // 卡片内：主题图标 + 末尾的箭头，共两枚；两者都是装饰性的。
    const svgs = container.querySelectorAll('li svg')
    expect(svgs).toHaveLength(2)
    for (const svg of svgs) {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('卡片图标与侧边栏中同一文档的图标一致', () => {
    /** 取图标的 tabler 名称，避免把两处的 className 差异也算进比较。 */
    const iconName = (root: HTMLElement | null, selector: string) =>
      root
        ?.querySelector(selector)
        ?.getAttribute('class')
        ?.match(/tabler-icon-([a-z-]+)/)?.[1]

    const sidebar = render(<DocsSidebar docs={[SIDEBAR_DOC]} />)
    // 取文档条目内的图标，而不是组标题那枚。
    const sidebarIcon = iconName(sidebar.container, 'li svg')
    sidebar.unmount()
    expect(sidebarIcon).toBe('settings')

    const { container } = render(
      <DocNextSteps
        steps={[{ title: 'Website Config', href: './configuration', description: '' }]}
        locale="en"
      />,
    )
    expect(iconName(container, 'li svg')).toBe(sidebarIcon)
  })

  it('渲染描述文字，并去掉行内代码标记', () => {
    render(
      <DocNextSteps
        steps={[
          {
            title: 'Website Config',
            href: './configuration',
            description: '`websiteConfig` 全字段',
          },
        ]}
        locale="en"
      />,
    )
    expect(screen.getByText('websiteConfig 全字段')).toBeTruthy()
    expect(screen.getByText('Website Config')).toBeTruthy()
  })

  it('锚点保留在链接上', () => {
    render(
      <DocNextSteps
        steps={[{ title: 'Email', href: './integrations#email', description: '' }]}
        locale="en"
      />,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/docs/integrations#email')
  })

  it('站外链接按普通外链渲染，并带 rel 保护', () => {
    render(
      <DocNextSteps
        steps={[{ title: 'Stripe', href: 'https://stripe.com', description: '' }]}
        locale="en"
      />,
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://stripe.com')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('卡片带图标（装饰性，不进可访问名）', () => {
    const { container } = render(
      <DocNextSteps steps={[{ title: 'Email', href: './email', description: '' }]} locale="en" />,
    )
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })
})
