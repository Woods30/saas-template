import { render, screen, waitFor, within } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionInfo } from '@/auth/session'
import { DashboardUserCard } from '@/components/dashboard/DashboardUserCard'
import { Sidebar, SidebarFooter, SidebarProvider } from '@/components/ui/sidebar'
import { websiteConfig } from '@/config/website'
import { setLocale } from '@/locale/paraglide/runtime.js'

/**
 * 个人中心侧栏底部的用户卡片。
 *
 * 关键行为：
 * - 有 `image` 渲染 `<img>`，没有则渲染首字母 fallback（OAuth 用户 vs 邮箱密码用户）；
 * - 展开菜单提供「退出登录」——这是个人中心内唯一的登出入口（`_layout` 路由不渲染营销导航栏）；
 * - 登出委托给 `signOutAndRedirect`，卡片自身不碰 `location`；
 * - 折叠成 icon 时只露头像，菜单仍可打开。
 *
 * 渲染必须包在 `SidebarProvider` 里：`SidebarMenuButton` 内部调 `useSidebar()`
 * （见 `src/components/ui/sidebar.tsx`），在 Provider 外会直接抛错。
 */
const mocks = vi.hoisted(() => ({
  signOutAndRedirect: vi.fn(),
}))

vi.mock('@/auth/sign-out', () => ({
  signOutAndRedirect: (...args: unknown[]) => mocks.signOutAndRedirect(...args),
}))

/**
 * 菜单里的「个人中心」是 `Link`。这里只替换 `Link`：`useLinkProps` 需要 Router
 * 上下文，jsdom 里没有；其余导出（`linkOptions` 等纯函数）走真实实现。
 */
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
  }
})

/**
 * jsdom 不带 `canvas` 包，`new window.Image()` 既不解析也不报错——jsdom 的
 * `HTMLImageElement-impl` 在 `_updateTheImageData` 开头就 `if (!Canvas) return`，
 * 于是 `complete` 永远是 `false`，`load` / `error` 一个都不派发。Base UI Avatar 的
 * `useImageLoadingStatus` 因此永远停在 `'loading'`，`AvatarImage` 永不挂载。
 *
 * 这里补一个只做一件事的 stub：把「异步派发 load」还原成浏览器的语义，让头像图能走完
 * 加载路径。组件本身的 `image` → `<img>` 分支才是被测行为。
 */
function stubImageLoad() {
  vi.stubGlobal(
    'Image',
    class StubImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      complete = false
      naturalWidth = 0
      private srcValue = ''

      set src(value: string) {
        this.srcValue = value
        queueMicrotask(() => {
          this.complete = true
          this.naturalWidth = 10
          this.onload?.()
        })
      }

      get src() {
        return this.srcValue
      }
    },
  )
}

/** 渲染卡片；包 `SidebarProvider` 是因为 `SidebarMenuButton` 内部调 `useSidebar()`。 */
function renderCard(session: SessionInfo) {
  return render(
    <SidebarProvider>
      <Sidebar>
        <SidebarFooter>
          <DashboardUserCard session={session} />
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>,
  )
}

function sessionWith(overrides: Partial<SessionInfo['user']> = {}): SessionInfo {
  return {
    user: {
      id: 'u_1',
      name: 'woods',
      email: 'woods@example.com',
      emailVerified: true,
      image: null,
      role: 'user',
      ...overrides,
    },
    impersonating: false,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  clearCookies()
  setLocale('zh', { reload: false })
  stubImageLoad()
})

afterEach(() => {
  vi.unstubAllGlobals()
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

/** 头像图：`alt=""` 是刻意的（名字就在旁边，避免读屏重复播报），
 *  空的 alt 会把 `img` 角色变成 presentation，所以按 data-slot 取元素。 */
function avatarImage() {
  return document.querySelector<HTMLImageElement>('img[data-slot="avatar-image"]')
}

/** 触发按钮的文本区：头像右侧那个 `grid flex-1` div，名字与邮箱都在其内。
 *  按结构而非样式类取——按钮里唯一的 div 就是它（头像是 span、箭头是 svg）。
 *  必须先定位它再断言：按钮自身的 `aria-label` 也是 `name || email`，直接
 *  `screen.getByText('woods')` 会命中按钮与 span 两侧，`getAllByText` 一样含糊。 */
function textSlot() {
  const trigger = screen.getByRole('button', { name: 'woods' })
  const slot = trigger.querySelector('div')
  if (!slot) throw new Error('触发按钮内未找到名字与邮箱的文本区')
  return slot
}

describe('DashboardUserCard', () => {
  it('有 image 时渲染头像图片', async () => {
    renderCard(sessionWith({ image: 'https://example.com/a.png' }))
    await waitFor(() => expect(avatarImage()).not.toBeNull())
    expect(avatarImage()).toHaveAttribute('src', 'https://example.com/a.png')
    // 装饰性头像：不参与可访问名，旁边已有名字与邮箱。
    expect(avatarImage()).toHaveAttribute('alt', '')
  })

  it('无 image 时渲染 name 首字母作为 fallback', () => {
    renderCard(sessionWith())
    // Avatar 的 fallback 渲染首字母；没有 <img>。
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('W')).toBeInTheDocument()
  })

  it('name 为空时用邮箱首字母', () => {
    renderCard(sessionWith({ name: '' }))
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('W')).toBeInTheDocument()
  })

  it('展示名字与邮箱', () => {
    renderCard(sessionWith())
    // 名字必须来自 `name` 字段、且是正文里的那一行（按钮 aria-label 也是
    // `name || email`，所以收窄到文本区内取，确保测的是渲染而非可访问名）。
    const slot = textSlot()
    expect(within(slot).getByText('woods')).toBeInTheDocument()
    expect(within(slot).getByText('woods@example.com')).toBeInTheDocument()
  })

  it('展开菜单后提供退出登录，点击调用 signOutAndRedirect', async () => {
    renderCard(sessionWith())
    screen.getByRole('button', { name: /woods/ }).click()
    await waitFor(() => expect(screen.getByText('退出登录')).toBeInTheDocument())
    screen.getByText('退出登录').click()
    await waitFor(() => expect(mocks.signOutAndRedirect).toHaveBeenCalled())
  })
})

/**
 * 用户菜单里的主题子菜单。
 *
 * 主题从侧栏里单独一行挪进账号菜单后，有两件事必须守住：
 * - 它和其它账号项同组（不再是侧栏里一个图标对不齐的孤立行）；
 * - 点选后写 `THEME` cookie 并更新 `<html data-theme>`，与独立按钮走同一套逻辑
 *   （`useTheme`），不能出现「菜单里切了但下次刷新又回去」。
 */
describe('DashboardUserCard 主题子菜单', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  /** 打开用户菜单并展开主题子菜单。 */
  async function openThemeSubmenu() {
    screen.getByRole('button', { name: /woods/ }).click()
    const trigger = await screen.findByRole('menuitem', { name: '切换主题' })
    // Base UI 的子菜单在 hover / 点击 trigger 时展开；点击在 jsdom 下最稳。
    trigger.click()
    return trigger
  }

  it('菜单里有主题子菜单，而不是侧栏里单独一行', async () => {
    renderCard(sessionWith())
    const trigger = await openThemeSubmenu()
    expect(trigger).toBeInTheDocument()
    // 子菜单 trigger 自带展开指示（chevron），说明用的是 `DropdownMenuSub`。
    expect(trigger.querySelector('svg')).not.toBeNull()
  })

  it('点选主题后更新 data-theme 与 cookie', async () => {
    document.documentElement.dataset.theme = 'system'
    renderCard(sessionWith())
    await openThemeSubmenu()

    const dark = await screen.findByRole('menuitemradio', { name: '深色' })
    dark.click()

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    expect(document.cookie).toContain('THEME=dark')
  })

  it('主题切换被禁用时整项不渲染', async () => {
    const original = websiteConfig.ui.enableThemeSwitch
    websiteConfig.ui.enableThemeSwitch = false
    try {
      renderCard(sessionWith())
      screen.getByRole('button', { name: /woods/ }).click()
      await screen.findByText('退出登录')
      expect(screen.queryByText('切换主题')).toBeNull()
    } finally {
      websiteConfig.ui.enableThemeSwitch = original
    }
  })
})
