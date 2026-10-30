import { render, screen, within } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionInfo } from '@/auth/session'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { setLocale } from '@/locale/paraglide/runtime.js'

/** 个人中心外壳：面包屑导航、收起态侧栏、侧栏底部用户卡片、内容区宽度。 */
const routerMocks = vi.hoisted(() => ({
  pathname: '/en/dashboard/profile',
}))

// 只替换路由边界；mock 的 `Link` 必须还原 `params` → `href` 拼接，
// 否则断言里的 `/zh/dashboard/profile` 测的是 mock 而不是组件。
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({
      children,
      to,
      params,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      to?: string
      params?: { locale?: string }
    }) => (
      <a {...props} href={`${(to ?? '').replace('/{-$locale}', `/${params?.locale ?? ''}`)}`}>
        {children}
      </a>
    ),
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { pathname: string } }) => unknown
    }) => select({ location: { pathname: routerMocks.pathname } }),
  }
})

beforeEach(() => {
  clearCookies()
  setLocale('zh', { reload: false })
  routerMocks.pathname = '/en/dashboard/profile'
})

function clearCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (name) {
      // biome-ignore lint/suspicious/noDocumentCookie: 测试清理，必须同步改写 cookie jar。
      document.cookie = `${name}; Path=/; Max-Age=0`
    }
  }
}

/** 渲染外壳；session 由路由 beforeLoad 取到后透传进来。 */
function renderLayout(role: SessionInfo['user']['role'] = 'user') {
  return render(
    <DashboardLayout locale="zh" session={sessionWith(role)}>
      <div>内容区</div>
    </DashboardLayout>,
  )
}

/** 与用户卡片测试同形的会话。 */
function sessionWith(role: SessionInfo['user']['role'] = 'user'): SessionInfo {
  return {
    user: {
      id: 'u_1',
      name: 'woods',
      email: 'woods@example.com',
      emailVerified: true,
      image: null,
      role,
    },
    impersonating: false,
  }
}

describe('SettingsLayout 顶栏', () => {
  /** 侧栏菜单里也有同名文案，断言末级时必须收窄到面包屑内。 */
  function breadcrumb() {
    return screen.getByRole('navigation', { name: 'breadcrumb' })
  }

  it('渲染折叠按钮（宽窄屏都常驻，窄屏靠它拉出抽屉）', () => {
    renderLayout()
    const trigger = document.querySelector('[data-slot="sidebar-trigger"]')
    expect(trigger).not.toBeNull()
  })

  it('面包屑渲染三级：首页 › 个人中心 › 当前板块', () => {
    renderLayout()
    const nav = breadcrumb()
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '首页' })).toHaveAttribute('href', '/zh')
    expect(screen.getByRole('link', { name: '个人中心' })).toHaveAttribute(
      'href',
      '/zh/dashboard/profile',
    )
    const page = within(breadcrumb()).getByText('资料')
    expect(page.tagName).toBe('SPAN')
    expect(page).toHaveAttribute('aria-current', 'page')
  })

  it('末级文案随 pathname 变化（安全板块 → 安全）', () => {
    routerMocks.pathname = '/zh/dashboard/security'
    renderLayout()
    const page = within(breadcrumb()).getByText('安全')
    expect(page.tagName).toBe('SPAN')
    expect(page).toHaveAttribute('aria-current', 'page')
  })

  it('pathname 不是已知板块时只渲染前两级，不渲染空末级', () => {
    routerMocks.pathname = '/zh/dashboard/unknown-future'
    renderLayout()
    expect(screen.getByRole('link', { name: '首页' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '个人中心' })).toBeInTheDocument()
    const nav = breadcrumb()
    expect(nav.querySelectorAll('[data-slot="breadcrumb-item"]')).toHaveLength(2)
  })

  it('不放标题 h1（末级面包屑已是页面标题）', () => {
    renderLayout()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  /**
   * 侧栏高亮必须按**目标路径**判定，而不是菜单 id。
   *
   * `admin` 分组下有两个子页（`admin/users` 与 `admin/revenue`），只按第一段匹配
   * 会让「用户管理」抢走「营收与订阅」的高亮——用户报过的实际缺陷。
   */
  it('管理子页高亮对应菜单项，不被同组其它项抢走', () => {
    routerMocks.pathname = '/zh/dashboard/admin/revenue'
    renderLayout('admin')
    // 侧栏与面包屑都有同名文案，断言须限定在侧栏内。
    const sidebar = document.querySelector('[data-slot="sidebar"]') as HTMLElement
    const revenue = within(sidebar).getByRole('link', { name: '营收与订阅' })
    const users = within(sidebar).getByRole('link', { name: '用户管理' })
    expect(revenue).toHaveAttribute('data-active')
    expect(users).not.toHaveAttribute('data-active')
  })

  it('管理子页的面包屑末级是页面自己的标题', () => {
    routerMocks.pathname = '/zh/dashboard/admin/revenue'
    renderLayout('admin')
    const page = within(breadcrumb()).getByText('营收与订阅')
    expect(page).toHaveAttribute('aria-current', 'page')
  })

  it('不放「返回站点」链接（logo 已是回站点出口）', () => {
    renderLayout()
    expect(screen.queryByRole('link', { name: '返回站点' })).toBeNull()
  })

  it('主题切换只出现在窄屏顶栏（md 以上交给用户菜单）', () => {
    renderLayout()
    const header = document.querySelector('main > header')
    expect(header).not.toBeNull()
    const themeButton = within(header as HTMLElement).getByRole('button', { name: /主题/ })
    // 侧栏常驻时入口在用户菜单里，这个按钮只在窄屏出现。
    expect(themeButton.closest('.md\\:hidden')).not.toBeNull()
  })
})

/**
 * 侧栏收起态（icon rail）。两条都会静默回退：横版 logo 缩到 3rem 宽只剩 18×5px，
 * 需换方形图标；原件 16px 图标在窄条里偏小，调用处放大到 20px。
 * jsdom 不做布局，故断言类名而非渲染尺寸。
 */
describe('SettingsLayout 收起态侧栏', () => {
  it('侧栏头同时提供横版 logo 与方形图标，按折叠状态切换', () => {
    renderLayout()
    const header = document.querySelector('[data-slot="sidebar-header"]')
    expect(header).not.toBeNull()
    const images = [...(header as HTMLElement).querySelectorAll('img')]
    // 横版 logo 是内联 SVG，因此这里唯一的 `<img>` 是收起态方形图标。
    expect(images.map((img) => img.getAttribute('src'))).toEqual(['/icon-jerboa.svg'])
    expect(header?.querySelector('svg')).not.toBeNull()
    expect(header?.querySelector('svg')?.getAttribute('width')).toBe('100%')
    expect(images[0]?.className).toContain('group-data-[collapsible=icon]:block')
    expect(images[0]?.className).toContain('hidden')
  })

  it('菜单项放大：展开态 40px 行 + 18px 图标，收起态 36px + 20px 图标', () => {
    renderLayout()
    const buttons = [...document.querySelectorAll('[data-slot="sidebar-menu-button"]')]
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) {
      // 原件 32px 行高 / 16px 图标在 240px 侧栏里偏挤。
      expect(button.className).toContain('h-10')
      expect(button.className).toContain('[&_svg]:size-[1.125rem]')
      // 原件 `size-8!` 带 important，覆盖必须同样带 `!`。
      expect(button.className).toContain('group-data-[collapsible=icon]:size-9!')
      expect(button.className).toContain('group-data-[collapsible=icon]:[&_svg]:size-5')
    }
  })

  it('侧栏底部不再单列主题行（已收进用户菜单）', () => {
    renderLayout()
    const footer = document.querySelector('[data-slot="sidebar-footer"]')
    expect(footer).not.toBeNull()
    expect(within(footer as HTMLElement).queryByRole('button', { name: /主题/ })).toBeNull()
  })
})

/**
 * 侧栏底部的用户卡片：`_layout` 路由不渲染营销导航栏，这张卡片是本路由内唯一的登出口。
 * 只在卡片组件内测渲染发现不了「外壳漏装」，故此处单独断言。
 */
describe('SettingsLayout 侧栏底部的用户卡片', () => {
  /** shadcn `SidebarFooter` 渲染的 `data-slot="sidebar-footer"`。 */
  function sidebarFooter() {
    const footer = document.querySelector<HTMLElement>('[data-slot="sidebar-footer"]')
    if (!footer) throw new Error('侧栏未渲染 sidebar-footer')
    return footer
  }

  it('把用户卡片渲染进侧栏底部', () => {
    renderLayout()
    expect(sidebarFooter()).toBeInTheDocument()
  })

  it('footer 内确实是用户卡片：头像、名字与邮箱都在其内', () => {
    renderLayout()
    const footer = sidebarFooter()
    expect(within(footer).getByText('woods@example.com')).toBeInTheDocument()
    expect(within(footer).getByRole('button', { name: 'woods' })).toBeInTheDocument()
  })
})

/**
 * 内容区宽度契约，守两条会静默回退的布局不变量：收窄到 `max-w-3xl` 会让表格列间无空隙；
 * `SidebarInset` 缺 `min-w-0` 时宽表格会撑出视口（768px 下实测过）。
 */
describe('SettingsLayout 内容区宽度', () => {
  it('内容区用宽容器而非表单窄栏', () => {
    renderLayout()
    const inner = screen.getByText('内容区').parentElement
    expect(inner).not.toBeNull()
    expect(inner?.className).toContain('max-w-6xl')
    expect(inner?.className).not.toContain('max-w-3xl')
    expect(inner?.className).toContain('min-w-0')
  })

  it('SidebarInset 允许收缩（表格超宽时由 Table 内部滚动）', () => {
    renderLayout()
    const inset = document.querySelector('[data-slot="sidebar-inset"]')
    expect(inset?.className).toContain('min-w-0')
  })
})
