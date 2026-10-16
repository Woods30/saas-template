import { render, screen, within } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionInfo } from '@/auth/session'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { setLocale } from '@/locale/paraglide/runtime.js'

/**
 * 个人中心外壳。
 *
 * 关键行为：
 * - 顶栏是「折叠按钮 + 三级面包屑 + 右上角主题切换」：不放 `<h1>`（面包屑末级
 *   带 `aria-current="page"`，就是页面标题），也不放「返回站点」（侧栏头 logo 已是出口）；
 * - 面包屑前两级是链接、末级是当前页；末级文案由 pathname 派生；
 * - `Breadcrumb` 等三组 shadcn 件在此第一次被消费，测试同时确认用的是现成件
 *   （`role="navigation"` + `aria-label="breadcrumb"`）而非手写等价物。
 */
const routerMocks = vi.hoisted(() => ({
  pathname: '/en/dashboard/profile',
}))

// 只替换路由边界（`Link` / `useRouterState`）；`linkOptions` 等其他导出走真实实现
// ——`linkOptions` 是纯对象包装，不依赖 Router 上下文，而 `getSettingsSections`
// 在调用时就会用到它。mock 的 `Link` 必须还原真实 `Link` 的 `params` → `href`
// 拼接，否则断言写死的 `/zh`、`/zh/dashboard/profile` 测的是 mock 而不是组件。
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

/** 渲染外壳；session 由路由 beforeLoad 的守卫取到后透传进来。 */
function renderLayout() {
  return render(
    <DashboardLayout locale="zh" session={sessionWith()}>
      <div>内容区</div>
    </DashboardLayout>,
  )
}

/** 夹具：与 `dashboard-user-card.test.tsx` 同形的会话（守卫已确认登录，此处只喂给用户卡片）。 */
function sessionWith(): SessionInfo {
  return {
    user: {
      id: 'u_1',
      name: 'woods',
      email: 'woods@example.com',
      emailVerified: true,
      image: null,
    },
  }
}

describe('SettingsLayout 顶栏', () => {
  /** 面包屑 `<nav>`：侧栏菜单里也有同名文案，断言末级时必须把范围收到面包屑内。 */
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
    // 末级是当前页，不是链接。
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
    // 除两级链接与「内容区」外， breadcrumb 里不应再有任何条目。
    const nav = breadcrumb()
    expect(nav.querySelectorAll('[data-slot="breadcrumb-item"]')).toHaveLength(2)
  })

  it('不放标题 h1（末级面包屑已是页面标题）', () => {
    renderLayout()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('不放「返回站点」链接（logo 已是回站点出口）', () => {
    renderLayout()
    expect(screen.queryByRole('link', { name: '返回站点' })).toBeNull()
  })

  it('右上角渲染主题切换按钮', () => {
    renderLayout()
    expect(screen.getByRole('button', { name: /主题/ })).toBeInTheDocument()
  })
})

/**
 * 侧栏底部的用户卡片。个人中心是 `_layout` 路由、不渲染营销导航栏，导航栏
 * `UserMenu` 里的登出入口在这里不可见——这张卡片就是本路由内唯一的登出口，
 * 因此「外壳是否真的把它装进了侧栏底部」必须有自己的断言守着：
 * 只在卡片组件内测渲染，外壳漏装 `SidebarFooter` 也不会有人发现。
 */
describe('SettingsLayout 侧栏底部的用户卡片', () => {
  /** 侧栏 footer：shadcn `SidebarFooter` 的原生契约（`src/components/ui/sidebar.tsx`
   *  渲染 `data-slot="sidebar-footer"`），不是本仓库自造的标记。 */
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
    // 卡片内容必须落在 footer 里：只证明 footer 存在不等于卡片装对了地方。
    expect(within(footer).getByText('woods@example.com')).toBeInTheDocument()
    expect(within(footer).getByRole('button', { name: 'woods' })).toBeInTheDocument()
  })
})
