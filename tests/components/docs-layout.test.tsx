import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocsLayout } from '@/components/docs/DocsLayout'
import { setLocale } from '@/locale/paraglide/runtime.js'

/**
 * 文档站 shell 布局：宽屏侧栏常驻可收起，窄屏改用 `Sheet` 抽屉。
 *
 * 抽屉断言的是弹层契约（role、可访问名、Escape、焦点归还）而非类名——手写面板曾缺
 * 焦点陷阱，类名断言发现不了。断点由 `e2e/docs.spec.ts` 在真实视口下覆盖。
 */
const routerMocks = vi.hoisted(() => ({ pathname: '/zh/docs' }))

// mock 的 `Link` 必须还原 `href`：没有 `href` 的 `<a>` 没有 link 角色。
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string
    params?: { locale?: string; slug?: string }
  }) => (
    <a
      {...props}
      href={(to ?? '')
        .replace('/{-$locale}', `/${params?.locale ?? ''}`)
        .replace('$slug', params?.slug ?? '')}
    >
      {children}
    </a>
  ),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown
  }) => select({ location: { pathname: routerMocks.pathname } }),
}))

beforeEach(() => {
  // cookie jar 跨用例共享，必须先清；顺序也要在 `setLocale` 之前，否则语言一起被清。
  clearCookies()
  setLocale('zh', { reload: false })
  routerMocks.pathname = '/zh/docs'
})

function clearCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (name) {
      // biome-ignore lint/suspicious/noDocumentCookie: 测试清理，必须同步改写 cookie jar。
      document.cookie = `${name}=; Path=/; Max-Age=0`
    }
  }
}

/** 宽屏常驻侧栏；窄屏抽屉是 dialog，不在此列。 */
function aside() {
  return screen.getByRole('complementary')
}

/** 窄屏顶栏。jsdom 不应用 `lg:hidden`，顶栏与侧栏按钮同时可见，需收窄查询范围。 */
function header() {
  const element = document.querySelector('header')
  if (!element) throw new Error('未找到顶栏')
  return element as HTMLElement
}

/** 窄屏抽屉；可访问名来自隐藏的 `SheetTitle`。 */
function drawer() {
  return screen.getByRole('dialog', { name: '文档' })
}

describe('DocsLayout 宽屏侧栏', () => {
  it('宽屏默认展开侧栏，窄屏隐藏', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    expect(aside().className).toContain('lg:flex')
  })

  it('收起后侧栏整块隐藏，展开入口移到侧栏之外', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    expect(within(aside()).getByRole('button', { name: '收起文档导航' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '展开文档导航' })).toBeNull()

    fireEvent.click(within(aside()).getByRole('button', { name: '收起文档导航' }))
    // 侧栏整体隐藏，展开按钮必须在它外面才点得到。
    expect(aside().className).not.toContain('lg:flex')
    const expand = screen.getByRole('button', { name: '展开文档导航' })
    expect(aside().contains(expand)).toBe(false)
    expect(expand.parentElement?.className).toContain('fixed')
  })

  it('收起后可再次展开', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    fireEvent.click(within(aside()).getByRole('button', { name: '收起文档导航' }))
    fireEvent.click(screen.getByRole('button', { name: '展开文档导航' }))
    expect(aside().className).toContain('lg:flex')
  })

  it('侧栏内始终包含搜索、导航与左下角工具条', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    const panel = aside()
    expect(within(panel).getByRole('button', { name: '搜索文档' })).toBeTruthy()
    expect(within(panel).getByRole('navigation', { name: '文档导航' })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: '切换语言' })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: /切换主题/ })).toBeTruthy()
  })
})

describe('DocsLayout 窄屏抽屉', () => {
  it('默认不渲染抽屉', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('顶栏的菜单按钮以弹层打开侧栏，背景被屏蔽且焦点被锁在抽屉内', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    fireEvent.click(within(header()).getByRole('button', { name: '打开文档导航' }))
    const sheet = drawer()
    // Base UI Dialog 用 `aria-hidden` 标记其余部分实现模态，而非 `aria-modal`。
    const appRoot = document.body.children[0] as HTMLElement | undefined
    expect(appRoot).toHaveAttribute('aria-hidden', 'true')
    expect(appRoot?.contains(sheet)).toBe(false)
    expect(within(sheet).getByRole('button', { name: '搜索文档' })).toBeTruthy()
    expect(within(sheet).getByRole('navigation', { name: '文档导航' })).toBeTruthy()
    expect(within(sheet).getByRole('button', { name: '切换语言' })).toBeTruthy()
  })

  it('抽屉内的关闭按钮收起抽屉，并把焦点归还给触发按钮', async () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    const trigger = within(header()).getByRole('button', { name: '打开文档导航' })
    // 关闭时焦点归还给「打开前的活动元素」，`fireEvent.click` 不附带焦点，须先 focus。
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.click(within(drawer()).getByRole('button', { name: '关闭文档导航' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('点击文档条目后收起抽屉', async () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    fireEvent.click(within(header()).getByRole('button', { name: '打开文档导航' }))
    const nav = within(drawer()).getByRole('navigation', { name: '文档导航' })
    const firstDoc = within(nav).getAllByRole('link')[0]
    expect(firstDoc).toBeDefined()
    fireEvent.click(firstDoc as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('按 Escape 收起抽屉', async () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    fireEvent.click(within(header()).getByRole('button', { name: '打开文档导航' }))
    fireEvent.keyDown(drawer(), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

/** 分组折叠：默认全展开；当前文档所在分组必须展开，否则搜索跳转后高亮条目藏在折叠区。 */
describe('DocsLayout 侧栏分组折叠', () => {
  it('默认全部展开，分组标题是可点击的折叠按钮', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    const nav = within(aside()).getByRole('navigation', { name: '文档导航' })
    const toggles = within(nav).getAllByRole('button')
    expect(toggles.length).toBeGreaterThan(0)
    for (const toggle of toggles) {
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
    }
  })

  it('点击分组标题收起该组条目', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    const nav = within(aside()).getByRole('navigation', { name: '文档导航' })
    const toggle = within(nav).getAllByRole('button')[0] as HTMLElement
    const linksBefore = within(nav).getAllByRole('link').length
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(nav).getAllByRole('link').length).toBeLessThan(linksBefore)
  })

  it('当前文档所在分组即使被收起，也会因导航而展开', () => {
    // 先收起全部分组，再让路由落到某个分组的文档上。
    const { rerender } = render(<DocsLayout locale="zh">正文</DocsLayout>)
    const nav = within(aside()).getByRole('navigation', { name: '文档导航' })
    for (const toggle of within(nav).getAllByRole('button')) fireEvent.click(toggle)
    expect(
      within(nav)
        .getAllByRole('button')
        .every((el) => el.getAttribute('aria-expanded') === 'false'),
    ).toBe(true)

    // 切到配置组的某一篇（分组 key 是 `config`）。
    routerMocks.pathname = '/zh/docs/configuration'
    rerender(<DocsLayout locale="zh">正文</DocsLayout>)

    const configGroup = within(nav)
      .getAllByRole('button')
      .find((el) => el.getAttribute('aria-expanded') === 'true')
    expect(configGroup).toBeDefined()
  })
})

describe('DocsLayout 搜索', () => {
  it('顶栏的搜索图标与侧栏触发器打开同一个弹窗', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(within(header()).getByRole('button', { name: '搜索文档' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('⌘K / Ctrl+K 打开搜索弹窗', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
