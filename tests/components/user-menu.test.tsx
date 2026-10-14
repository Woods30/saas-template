import { render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '@/locale/paraglide/runtime.js'

/**
 * 导航栏的用户菜单。
 *
 * 关键行为：
 * - `isPending` 与「未登录」都渲染 `guestFallback`：SSR 阶段会话尚未就绪，服务端输出
 *   的就是待定态，此时渲染骨架会让服务端 HTML 完全没有登录入口（访客要等客户端拿到
 *   会话才看到它，链接会闪一下才出现）；
 * - 已登录时显示邮箱，并提供登出入口（此前 `signOut` 已导出但全仓无人调用）；
 * - 未登录且未传 `guestFallback` 时不渲染任何内容。
 */
const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/auth/client', () => ({
  authClient: {
    useSession: (...args: unknown[]) => mocks.useSession(...args),
    signOut: (...args: unknown[]) => mocks.signOut(...args),
  },
  useSession: (...args: unknown[]) => mocks.useSession(...args),
  signOut: (...args: unknown[]) => mocks.signOut(...args),
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
    // 待定阶段不应泄漏任何账号信息。
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

  it('点击登出会调用 signOut', async () => {
    mocks.useSession.mockReturnValue({
      data: { user: { email: 'user@example.com', name: 'Alice' } },
      isPending: false,
    })
    mocks.signOut.mockResolvedValue({ error: null })
    render(<UserMenu />)

    screen.getByRole('button', { name: /Alice/ }).click()
    await waitFor(() => {
      expect(screen.getByText('退出登录')).toBeInTheDocument()
    })
    screen.getByText('退出登录').click()
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled())
  })

  it('登出失败时不跳转，只在控制台留痕', async () => {
    mocks.useSession.mockReturnValue({
      data: { user: { email: 'user@example.com', name: 'Alice' } },
      isPending: false,
    })
    mocks.signOut.mockResolvedValue({ error: { message: 'boom' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign, reload: vi.fn() })
    render(<UserMenu />)

    screen.getByRole('button', { name: /Alice/ }).click()
    await waitFor(() => expect(screen.getByText('退出登录')).toBeInTheDocument())
    screen.getByText('退出登录').click()
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(assign).not.toHaveBeenCalled()
    warn.mockRestore()
    vi.unstubAllGlobals()
  })
})
