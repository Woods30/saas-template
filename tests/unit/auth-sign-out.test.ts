// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * 登出公共函数。
 *
 * 三条行为对应三处调用方的共同需求：
 * - 成功才跳转：整页跳转让用户以为已登出，而会话其实还在——这是最坏的失败模式；
 * - 失败留在原地并留痕：调用方（导航栏菜单、个人中心用户卡片）自己决定是否提示；
 * - 跳转目标是站点根路径：不依赖调用方所在路由，`/` 由服务端按 locale 归一化。
 */
const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
}))

vi.mock('@/auth/client', () => ({
  signOut: (...args: unknown[]) => mocks.signOut(...args),
}))

import { signOutAndRedirect } from '@/auth/sign-out'

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('signOutAndRedirect', () => {
  it('登出成功后整页跳转到站点根路径', async () => {
    mocks.signOut.mockResolvedValue({ error: null })
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })

    await signOutAndRedirect()

    expect(mocks.signOut).toHaveBeenCalled()
    expect(assign).toHaveBeenCalledWith('/')
  })

  it('登出失败时不跳转，只在控制台留痕', async () => {
    mocks.signOut.mockResolvedValue({ error: { message: 'boom' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })

    await signOutAndRedirect()

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('登出失败'))
    expect(assign).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
