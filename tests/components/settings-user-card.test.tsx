import { render, screen, waitFor, within } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionInfo } from '@/auth/session'
import { DashboardUserCard } from '@/components/dashboard/DashboardUserCard'
import { Sidebar, SidebarFooter, SidebarProvider } from '@/components/ui/sidebar'
import { websiteConfig } from '@/config/website'
import { setLocale } from '@/locale/paraglide/runtime.js'

/**
 * 个人中心侧栏底部的用户卡片：头像 / 首字母 fallback、退出登录（本路由唯一登出口）、
 * 折叠态菜单。渲染必须包在 `SidebarProvider` 里，`SidebarMenuButton` 内部调 `useSidebar()`。
 */
const mocks = vi.hoisted(() => ({
  signOutAndRedirect: vi.fn(),
}))

vi.mock('@/auth/sign-out', () => ({
  signOutAndRedirect: (...args: unknown[]) => mocks.signOutAndRedirect(...args),
}))

/** 只替换 `Link`：`useLinkProps` 需要 Router 上下文，jsdom 里没有。 */
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
 * jsdom 没有 `canvas`，`new Image()` 既不解析也不派发 `load` / `error`，Base UI Avatar
 * 会永远停在 loading。这里补一个异步派发 load 的 stub，让 `image` → `<img>` 分支可测。
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

/** 渲染卡片；`SidebarProvider` 是 `useSidebar()` 的必需上下文。 */
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

/** 头像图 `alt=""`（旁边已有名字），空 alt 使 img 角色变 presentation，故按 data-slot 取。 */
function avatarImage() {
  return document.querySelector<HTMLImageElement>('img[data-slot="avatar-image"]')
}

/** 触发按钮的文本区。按钮 `aria-label` 也是 `name || email`，直接 `getByText` 会同时
 *  命中按钮与 span，故先收窄到这个 div 再断言。 */
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
    expect(avatarImage()).toHaveAttribute('alt', '')
  })

  it('无 image 时渲染 name 首字母作为 fallback', () => {
    renderCard(sessionWith())
    // fallback 渲染首字母，没有 <img>。
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
    // 收窄到文本区内取，确保测的是渲染而非按钮的 aria-label。
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
 * 用户菜单里的主题子菜单：与其它账号项同组，且点选后写 `THEME` cookie 并更新
 * `<html data-theme>`，不能出现「菜单里切了但刷新又回去」。
 */
describe('DashboardUserCard 主题子菜单', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  /** 打开用户菜单并展开主题子菜单。 */
  async function openThemeSubmenu() {
    screen.getByRole('button', { name: /woods/ }).click()
    const trigger = await screen.findByRole('menuitem', { name: '切换主题' })
    // 子菜单在 hover / 点击时展开，点击在 jsdom 下最稳。
    trigger.click()
    return trigger
  }

  it('菜单里有主题子菜单，而不是侧栏里单独一行', async () => {
    renderCard(sessionWith())
    const trigger = await openThemeSubmenu()
    expect(trigger).toBeInTheDocument()
    // trigger 自带 chevron，说明用的是 `DropdownMenuSub`。
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
