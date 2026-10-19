import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocsLayout } from '@/components/docs/DocsLayout'
import { setLocale } from '@/locale/paraglide/runtime.js'

/**
 * 文档站的 shell 布局：侧边栏可收起，并随视口自适应。
 *
 * 宽屏（≥ lg）下侧栏常驻，但可手动收起，把 240px 让给正文；窄屏下常驻侧栏放不
 * 下（会把正文挤成一条），因此默认隐藏，由顶部菜单按钮以 `Sheet` 抽屉覆盖打开。
 *
 * 抽屉走的是 shadcn `Sheet`（Base UI Dialog）而不是手写 `fixed` 面板，因此这里
 * 断言的是**弹层契约**——`role="dialog"`、可访问名、Escape 关闭、点条目后收起、
 * 关闭后焦点归还——而不是某个类名。手写版曾经缺焦点陷阱与关闭行为，类名断言
 * 一条都发现不了。
 *
 * jsdom 不做媒体查询，断点本身由 `e2e/docs.spec.ts` 在真实视口下覆盖。
 */
const routerMocks = vi.hoisted(() => ({ pathname: '/zh/docs' }))

// mock 的 `Link` 必须把 `to` + `params` 还原成 `href`：没有 `href` 的 `<a>` 没有
// link 角色，`getAllByRole('link')` 会一条都查不到，测的就不是组件了。
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
  // 收起偏好写在 cookie 上，jsdom 的 cookie jar 在同一文件内跨用例共享——不清空会
  // 让后一个用例带着上一个用例的状态启动。必须先清再 `setLocale`：后者自己也写
  // cookie，顺序反了会把语言一起清掉，文案变成英文。
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

/** 宽屏常驻侧栏（`<aside>` → role=complementary）。窄屏抽屉是 dialog，不在此列。 */
function aside() {
  return screen.getByRole('complementary')
}

/**
 * 窄屏顶栏。
 *
 * jsdom 不应用 Tailwind 的 `lg:hidden`，因此顶栏与侧栏里的按钮在测试里**同时可见**，
 * 按名字全局查询会命中多个。需要区分时用本函数把查询范围收窄到顶栏。
 */
function header() {
  const element = document.querySelector('header')
  if (!element) throw new Error('未找到顶栏')
  return element as HTMLElement
}

/** 窄屏抽屉：`SheetContent` 渲染成 `role="dialog"`，可访问名来自隐藏的 `SheetTitle`。 */
function drawer() {
  return screen.getByRole('dialog', { name: '文档' })
}

describe('DocsLayout 宽屏侧栏', () => {
  it('宽屏默认展开侧栏，窄屏隐藏', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    // 基础 `hidden` 让窄屏先隐藏；`lg:flex` 在宽屏常驻。
    expect(aside().className).toContain('lg:flex')
  })

  it('收起后侧栏整块隐藏，展开入口移到侧栏之外', () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    // 展开态：收起按钮在侧栏内，浮动工具条不存在。
    expect(within(aside()).getByRole('button', { name: '收起文档导航' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '展开文档导航' })).toBeNull()

    fireEvent.click(within(aside()).getByRole('button', { name: '收起文档导航' }))
    // 侧栏整体隐藏，展开按钮必须落在它外面才点得到。
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
    // Base UI Dialog 用「把页面其余部分标 `aria-hidden`」实现模态，而不是 `aria-modal`：
    // 手写面板两样都没有，读屏软件仍会把被遮住的正文当成可读内容。
    const appRoot = document.body.children[0] as HTMLElement | undefined
    expect(appRoot).toHaveAttribute('aria-hidden', 'true')
    expect(appRoot?.contains(sheet)).toBe(false)
    // 抽屉内容与宽屏侧栏同构：搜索、导航、工具条都在。
    expect(within(sheet).getByRole('button', { name: '搜索文档' })).toBeTruthy()
    expect(within(sheet).getByRole('navigation', { name: '文档导航' })).toBeTruthy()
    expect(within(sheet).getByRole('button', { name: '切换语言' })).toBeTruthy()
  })

  it('抽屉内的关闭按钮收起抽屉，并把焦点归还给触发按钮', async () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    const trigger = within(header()).getByRole('button', { name: '打开文档导航' })
    // Base UI 关闭时把焦点还给「打开前的活动元素」，因此必须真的先把焦点放到触发按钮上
    // ——`fireEvent.click` 不会附带焦点，只点不 focus 的话归还目标是 `<body>`。
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
    // 不关的话新正文被抽屉盖住，用户不知道跳转成功了。
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('按 Escape 收起抽屉', async () => {
    render(<DocsLayout locale="zh">正文</DocsLayout>)
    fireEvent.click(within(header()).getByRole('button', { name: '打开文档导航' }))
    fireEvent.keyDown(drawer(), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

/**
 * 分组折叠（交互参照 GitBook）。
 *
 * 两条容易静默回退的行为：
 * - 默认全展开——文档站分组是主题分区，一进来全收起会让人以为只有几个入口；
 * - 当前文档所在分组必须展开——否则从搜索跳过去，高亮条目藏在折叠区里。
 */
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
    // 收起的是条目，不是整个侧栏：其它分组的条目仍在。
    expect(within(nav).getAllByRole('link').length).toBeLessThan(linksBefore)
  })

  it('当前文档所在分组即使被收起，也会因导航而展开', () => {
    // 先渲染并收起全部分组，再让路由落到某个分组的文档上。
    const { rerender } = render(<DocsLayout locale="zh">正文</DocsLayout>)
    const nav = within(aside()).getByRole('navigation', { name: '文档导航' })
    for (const toggle of within(nav).getAllByRole('button')) fireEvent.click(toggle)
    expect(
      within(nav)
        .getAllByRole('button')
        .every((el) => el.getAttribute('aria-expanded') === 'false'),
    ).toBe(true)

    // 文档 slug 换成配置组的某一篇（分组 key 是 `config`）。
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
    // 侧栏在窄屏是隐藏的，顶栏的图标是那里唯一的搜索入口。
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
