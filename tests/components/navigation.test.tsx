import { QueryClient } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MenuItems } from '@/components/layout/MenuItems'
import { Navbar } from '@/components/marketing/Navbar'
import { getPublicLinkOptions, type MenuItem } from '@/config/navigation'
import { homeBlocks } from '@/config/pages/home'
import { websiteConfig } from '@/config/website'
import { setLocale } from '@/locale/paraglide/runtime.js'
import { getRouter } from '@/router'

// 站点配置是模块级单例，部分用例需要临时改开关；afterEach 用快照整体复原，避免相互污染。
const originalConfig = structuredClone(websiteConfig)

beforeEach(() => setLocale('en', { reload: false }))
afterEach(() => {
  cleanup()
  setLocale('zh', { reload: false })
  Object.assign(websiteConfig, structuredClone(originalConfig))
})

/** 用真实 Router + memory history 渲染真实页面（Navbar / Footer 均在其中）。 */
async function renderRoute(path: string) {
  const router = getRouter()
  router.update({
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: new QueryClient() },
  })
  await router.load()
  return render(<RouterProvider router={router} />)
}

/**
 * 用最小 Router 只挂载 Navbar。
 *
 * 只给**需要交互**的用例用：真实 routeTree 的 `shellComponent` 会在 jsdom 里渲染
 * 嵌套 `<html>`，之后任何 state 更新都不返回（见下方用例的注释）。只渲染 Navbar
 * 既能覆盖触发按钮、面板与 Escape 行为，又不触碰那一层 shell。
 */
async function renderNavbar() {
  const rootRoute = createRootRoute({ component: () => <Navbar /> })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/en'] }),
    context: { queryClient: new QueryClient() },
  })
  await router.load()
  return render(<RouterProvider router={router} />)
}

/** 用独立真实 Router 只挂载 MenuItems fixture，隔离验证共享 renderer 的结构。 */
async function renderMenuItems(items: MenuItem[], variant: 'navbar' | 'footer') {
  const rootRoute = createRootRoute({
    component: () => <MenuItems items={items} variant={variant} />,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/en'] }),
    context: { queryClient: new QueryClient() },
  })
  await router.load()
  render(<RouterProvider router={router} />)
}

function internalLink(
  id: string,
  title: string,
  target: Parameters<typeof getPublicLinkOptions>[0],
) {
  return {
    kind: 'link',
    id,
    title,
    destination: { kind: 'internal', options: getPublicLinkOptions(target, 'en') },
  } satisfies MenuItem
}

describe('Navbar 消费菜单配置（真实 Router）', () => {
  it('渲染首页锚点、Docs、登录与主按钮的 href', async () => {
    await renderRoute('/en')
    const header = within(screen.getByRole('banner'))

    expect(header.getAllByRole('link', { name: 'How it works' })[0]).toHaveAttribute(
      'href',
      '/en#workflow',
    )
    expect(header.getAllByRole('link', { name: 'Features' })[0]).toHaveAttribute(
      'href',
      '/en#features',
    )
    expect(header.getAllByRole('link', { name: "What's included" })[0]).toHaveAttribute(
      'href',
      '/en#pricing',
    )
    expect(header.getAllByRole('link', { name: 'Docs' })[0]).toHaveAttribute('href', '/en/docs')
    expect(header.getAllByRole('link', { name: 'Sign in' })[0]).toHaveAttribute(
      'href',
      '/en/auth/login',
    )
    expect(header.getAllByRole('link', { name: 'Start building' })[0]).toHaveAttribute(
      'href',
      '/en/docs',
    )
  })

  // 这条用例不走 `renderRoute`（真实 routeTree）：`__root` 的 `shellComponent`
  // 会渲染 `<html><head>…<Scripts/></body></html>`，jsdom 下嵌套 html 元素会让
  // React 的挂载进入循环，此后**任何** state 更新都不返回——不止这条用例，
  // 同文件后续用例连同个 run 里的其他文件都会被拖死。
  // 因此这里用最小 Router 只挂 `Navbar`，与 `renderMenuItems` 同一思路。
  it('移动端 Escape 关闭面板并把焦点还给触发按钮', async () => {
    await renderNavbar()
    const header = within(screen.getByRole('banner'))
    const trigger = screen.getByRole('button', { name: 'Open navigation menu' })
    // 面板关闭时只有桌面导航里的一份 Docs。
    expect(header.getAllByRole('link', { name: 'Docs' })).toHaveLength(1)

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    // 打开后桌面与移动面板各有一份 Docs。
    expect(header.getAllByRole('link', { name: 'Docs' })).toHaveLength(2)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
    expect(header.getAllByRole('link', { name: 'Docs' })).toHaveLength(1)
  })

  it('关闭 docs 后移除 Docs 链接，主按钮回退首页 features 锚点', async () => {
    websiteConfig.docs.enabled = false
    await renderRoute('/en')

    const header = within(screen.getByRole('banner'))
    expect(header.queryByRole('link', { name: 'Docs' })).toBeNull()
    expect(header.getAllByRole('link', { name: 'Start building' })[0]).toHaveAttribute(
      'href',
      '/en#features',
    )
    expect(within(screen.getByRole('contentinfo')).queryByRole('link', { name: 'Docs' })).toBeNull()
  })
})

describe('Footer 消费菜单配置（真实 Router）', () => {
  it('渲染产品 / 资源分组与法律 slug 链接', async () => {
    await renderRoute('/en')
    const footer = within(screen.getByRole('contentinfo'))

    const product = footer.getByRole('navigation', { name: 'Product' })
    expect(product.querySelector('h2')).toHaveTextContent('Product')
    expect(within(product).getByRole('link', { name: 'Features' })).toHaveAttribute(
      'href',
      '/en#features',
    )

    const resources = footer.getByRole('navigation', { name: 'Resources' })
    expect(within(resources).getByRole('link', { name: 'Docs' })).toHaveAttribute(
      'href',
      '/en/docs',
    )
    expect(within(resources).getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/en/marketing/legal/terms',
    )
    expect(within(resources).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/en/marketing/legal/privacy',
    )
  })

  it('保留品牌 Slogan 与描述，页脚 icon 使用配置路径', async () => {
    await renderRoute('/en')
    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent('Small Steps. Big Leaps.')
    expect(footer).toHaveTextContent('Jerbix')
    expect(footer.querySelector('img')?.getAttribute('src')).toBe(
      websiteConfig.metadata.images.icon,
    )
  })
})

describe('Footer 社交区', () => {
  it('社交为空时不渲染社交导航', async () => {
    await renderRoute('/en')
    expect(screen.queryByRole('navigation', { name: 'Social links' })).toBeNull()
  })

  it('社交非空时渲染外链，带安全属性与可访问名', async () => {
    websiteConfig.social.github = 'https://github.com/jerbix'
    await renderRoute('/en')

    const social = within(screen.getByRole('navigation', { name: 'Social links' }))
    const link = social.getByRole('link', { name: 'GitHub' })
    expect(link).toHaveAttribute('href', 'https://github.com/jerbix')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link.querySelector('.sr-only')).toHaveTextContent('GitHub')
  })
})

describe('MenuItems 共享 renderer', () => {
  it('footer group 渲染为 nav + h2 + 子项链接', async () => {
    const items: MenuItem[] = [
      {
        kind: 'group',
        id: 'resources',
        title: 'Resources',
        items: [internalLink('docs', 'Docs', 'docs'), internalLink('blog', 'Blog', 'blog')],
      },
    ]
    await renderMenuItems(items, 'footer')

    const group = screen.getByRole('navigation', { name: 'Resources' })
    expect(within(group).getByRole('heading', { level: 2, name: 'Resources' })).toBeInTheDocument()
    expect(within(group).getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/en/docs')
    expect(within(group).getByRole('link', { name: 'Blog' })).toHaveAttribute(
      'href',
      '/en/marketing/blog',
    )
  })

  it('navbar group 渲染为 details/summary，summary 可获得焦点并可展开', async () => {
    const items: MenuItem[] = [
      {
        kind: 'group',
        id: 'more',
        title: 'More',
        items: [internalLink('docs', 'Docs', 'docs')],
      },
    ]
    await renderMenuItems(items, 'navbar')

    const summary = screen.getByText('More')
    expect(summary.tagName).toBe('SUMMARY')
    // 原生 <summary> 天然可聚焦；键盘 Enter / Space 展开由浏览器默认行为提供。
    summary.focus()
    expect(summary).toHaveFocus()
    const details = summary.closest('details')
    expect(details).not.toHaveAttribute('open')

    fireEvent.click(summary)
    expect(details).toHaveAttribute('open')
    expect(within(details as HTMLElement).getByRole('link', { name: 'Docs' })).toHaveAttribute(
      'href',
      '/en/docs',
    )
  })

  it('separator 渲染为分隔线', async () => {
    await renderMenuItems(
      [internalLink('docs', 'Docs', 'docs'), { kind: 'separator', id: 'sep' }],
      'footer',
    )
    expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument()
  })
})

describe('homeBlocks docs CTA 回退', () => {
  it('docs 启用时指向 /{locale}/docs，关闭时回退 #features', () => {
    expect(homeBlocks.Hero.primaryCta.href).toBe('/en/docs')
    expect(homeBlocks.Cta.primaryCta.href).toBe('/en/docs')

    websiteConfig.docs.enabled = false
    expect(homeBlocks.Hero.primaryCta.href).toBe('#features')
    expect(homeBlocks.Cta.primaryCta.href).toBe('#features')
  })
})

describe('MenuItems onNavigate', () => {
  it('透传 onNavigate 到每条链接', async () => {
    const items: MenuItem[] = [internalLink('docs', 'Docs', 'docs')]
    let navigated = 0
    const rootRoute = createRootRoute({
      component: () => (
        <MenuItems items={items} variant="footer" onNavigate={() => (navigated += 1)} />
      ),
    })
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/en'] }),
      context: { queryClient: new QueryClient() },
    })
    await router.load()
    render(<RouterProvider router={router} />)

    fireEvent.click(screen.getByRole('link', { name: 'Docs' }))
    expect(navigated).toBe(1)
  })
})
