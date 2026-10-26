import { render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '@/locale/paraglide/runtime.js'

/**
 * 导航栏用户菜单：`isPending` 与未登录都渲染 `guestFallback`（SSR 输出的是待定态，
 * 渲染骨架会让服务端 HTML 没有登录入口）；已登录显示邮箱与登出入口。
 */
const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
  signOutAndRedirect: vi.fn(),
}))

vi.mock('@/auth/client', () => ({
  authClient: {
    useSession: (...args: unknown[]) => mocks.useSession(...args),
    signOut: (...args: unknown[]) => mocks.signOut(...args),
  },
  useSession: (...args: unknown[]) => mocks.useSession(...args),
  signOut: (...args: unknown[]) => mocks.signOut(...args),
}))

vi.mock('@/auth/sign-out', () => ({
  signOutAndRedirect: (...args: unknown[]) => mocks.signOutAndRedirect(...args),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))

import { UserMenu } from '@/components/layout/UserMenu'

beforeEach(() => {
  vi.clearAllMocks()
  setLocale('zh', { reload: false })
})

describe('UserMenu', () => {
  it('会话待定时渲染 guestFallback（保证 SSR 首帧就有登录入口）', () => {
    mocks.useSession.mockReturnValue({ data: null, isPending: true })
    render(<UserMenu guestFallback={<a href="/auth/login">登录</a>} />)
    expect(screen.getByRole('link', { name: '登录' })).toBeInTheDocument()
    expect(screen.queryByText(/@/)).toBeNull()
  })

  it('未登录（会话已就绪但为空）时渲染 guestFallback', () => {
    mocks.useSession.mockReturnValue({ data: null, isPending: false })
    render(<UserMenu guestFallback={<a href="/auth/login">登录</a>} />)
    expect(screen.getByRole('link', { name: '登录' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('未登录且未传 guestFallback 时不渲染任何内容', () => {
    mocks.useSession.mockReturnValue({ data: null, isPending: false })
    const { container } = render(<UserMenu />)
    expect(container).toBeEmptyDOMElement()
  })

  it('已登录时以用户名作为触发按钮的可访问名，展开后显示邮箱', async () => {
    mocks.useSession.mockReturnValue({
      data: { user: { email: 'user@example.com', name: 'Alice' } },
      isPending: false,
    })
    render(<UserMenu />)
    const trigger = screen.getByRole('button', { name: 'Alice' })
    trigger.click()
    await waitFor(() => expect(screen.getByText('user@example.com')).toBeInTheDocument())
  })

  it('已登录但无 name 时回退到邮箱作为可访问名', () => {
    mocks.useSession.mockReturnValue({
      data: { user: { email: 'user@example.com', name: null } },
      isPending: false,
    })
    render(<UserMenu />)
    expect(screen.getByRole('button', { name: 'user@example.com' })).toBeInTheDocument()
  })

  it('点击登出会调用 signOutAndRedirect', async () => {
    mocks.useSession.mockReturnValue({
      data: { user: { email: 'user@example.com', name: 'Alice' } },
      isPending: false,
    })
    render(<UserMenu />)

    screen.getByRole('button', { name: /Alice/ }).click()
    await waitFor(() => {
      expect(screen.getByText('退出登录')).toBeInTheDocument()
    })
    screen.getByText('退出登录').click()
    await waitFor(() => expect(mocks.signOutAndRedirect).toHaveBeenCalled())
  })

  it('登出由公共函数处理，组件自身不再跳转', async () => {
    mocks.useSession.mockReturnValue({
      data: { user: { email: 'user@example.com', name: 'Alice' } },
      isPending: false,
    })
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    render(<UserMenu />)

    screen.getByRole('button', { name: /Alice/ }).click()
    await waitFor(() => expect(screen.getByText('退出登录')).toBeInTheDocument())
    screen.getByText('退出登录').click()
    await waitFor(() => expect(mocks.signOutAndRedirect).toHaveBeenCalled())
    // 跳转由公共函数负责，组件不应自己动 location。
    expect(assign).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

/** 向上找到 Base UI 的 Positioner 定位容器。 */
function positionerOf(menu: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = menu
  while (node && !node.className.includes('z-')) node = node.parentElement
  return node
}

describe('UserMenu 弹层层叠', () => {
  it('定位容器带 z-50，避免被 z-40 的 header 压住', async () => {
    mocks.useSession.mockReturnValue({
      data: { user: { email: 'user@example.com', name: 'Alice' } },
      isPending: false,
    })
    render(<UserMenu />)
    screen.getByRole('button', { name: 'Alice' }).click()
    const menu = await screen.findByRole('menu')
    const positioner = positionerOf(menu)
    expect(positioner?.className).toContain('z-50')
  })
})
