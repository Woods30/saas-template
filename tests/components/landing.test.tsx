import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LandingPage } from '@/components/marketing/LandingPage'
import { websiteConfig } from '@/config/website'
import { getLocale, setLocale } from '@/locale/paraglide/runtime.js'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    hash,
    preload: _preload,
    params: _params,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string
    hash?: string
    preload?: string
    params?: unknown
  }) => (
    <a {...props} href={`${to === '.' ? '' : (to ?? '')}${hash ? `#${hash}` : ''}`}>
      {children}
    </a>
  ),
}))

const auth = vi.hoisted(() => ({ session: null as { user: { id: string } } | null }))
vi.mock('@/auth/client', () => ({ useSession: () => ({ data: auth.session, isPending: false }) }))

const originalConfig = structuredClone(websiteConfig)
let motion: MediaQueryList
beforeEach(() => {
  auth.session = null
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable', { status: 400 })))
  setLocale('zh', { reload: false })
  motion = Object.assign(new EventTarget(), {
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }) as unknown as MediaQueryList
  vi.spyOn(window, 'matchMedia').mockReturnValue(motion)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Object.assign(websiteConfig, structuredClone(originalConfig))
  setLocale('zh', { reload: false })
})
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}
function reduce(matches: boolean) {
  act(() => {
    Object.defineProperty(motion, 'matches', { value: matches, configurable: true })
    motion.dispatchEvent(new Event('change'))
  })
}
function visibility(hidden: boolean) {
  act(() => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden)
    document.dispatchEvent(new Event('visibilitychange'))
  })
}
function demo() {
  return screen.getByRole('figure', { name: /源码与产品预览|Source and product preview/ })
}

describe('LandingPage', () => {
  it.each(['zh', 'en'] as const)('%s 首页销售模板源码并说明持续扩展能力', (locale) => {
    setLocale(locale, { reload: false })
    const { container } = render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      locale === 'zh'
        ? '不必从零开发，让想法更快上线。'
        : 'Skip the groundwork. Launch your idea sooner.',
    )
    expect(container.querySelector('.lab-hero')).toHaveTextContent('Small Steps. Big Leaps.')
    expect(container.querySelector('#pricing')).toHaveTextContent('$99')
    expect(container.querySelector('#pricing')).toHaveTextContent(
      locale === 'zh' ? '永久支持' : 'Lifetime support',
    )
    expect(container.querySelector('#pricing')).toHaveTextContent(
      locale === 'zh' ? '免费升级' : 'Free updates',
    )
    expect(container).not.toHaveTextContent(/专业版|资源包|Pro monthly|Resource pack/)
    for (const id of ['features', 'pricing', 'workflow', 'faq'])
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    expect(container.querySelector('#features')).toHaveTextContent('API Key')
    expect(container.querySelector('#features')).toHaveTextContent('SEO')
    expect(container.querySelector('#features')).toHaveTextContent(
      locale === 'zh' ? '更多语言' : 'more languages',
    )
    expect(container.querySelector('#features')).toHaveTextContent(
      locale === 'zh' ? '更多支付服务商' : 'more payment providers',
    )
    expect(
      screen.getByRole('link', {
        name: locale === 'zh' ? '获取全部源码 · $99' : 'Get the source · $99',
      }),
    ).toHaveAttribute('href', '#pricing')
  })

  it('locale 连续切换时标题与文档入口跟随语言', () => {
    const { rerender } = render(<LandingPage />)
    for (const locale of ['zh', 'en', 'zh'] as const) {
      setLocale(locale, { reload: false })
      rerender(<LandingPage />)
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        locale === 'zh' ? '让想法更快上线。' : 'Launch your idea sooner.',
      )
      expect(
        screen.getByRole('link', { name: locale === 'zh' ? '看看如何开始' : 'See how to start' }),
      ).toHaveAttribute('href', `/${locale}/docs`)
    }
  })

  it.each([true, false])(
    '支付模块 enabled=%s 不改变模板定价，文档关闭时不导向关闭页面',
    (enabled) => {
      auth.session = { user: { id: 'user_1' } }
      websiteConfig.payment.enabled = enabled
      websiteConfig.docs.enabled = false
      const { container } = render(<LandingPage />)
      expect(container.querySelector('#pricing')).toHaveTextContent('$99')
      expect(
        within(screen.getByRole('region', { name: '一次购买，持续创造。' })).getByRole('button', {
          name: '立即购买',
        }),
      )[enabled ? 'toBeEnabled' : 'toBeDisabled']()
      expect(screen.getByRole('link', { name: '看看如何开始' })).toHaveAttribute(
        'href',
        '#features',
      )
      expect(
        [...container.querySelectorAll('a')].some((a) =>
          /\/docs|\/pricing/.test(a.getAttribute('href') ?? ''),
        ),
      ).toBe(false)
    },
  )

  it.each(['zh', 'en'] as const)('%s 未登录购买先登录并携带继续购买目标', (locale) => {
    setLocale(locale, { reload: false })
    render(<LandingPage />)
    const pricing = screen.getByRole('region', {
      name: locale === 'zh' ? '一次购买，持续创造。' : 'Buy once. Keep building.',
    })
    const link = within(pricing).getByRole('link', {
      name: locale === 'zh' ? '立即购买' : 'Buy now',
    })
    const url = new URL(link.getAttribute('href') ?? '', 'https://example.com')
    expect(url.pathname).toBe(`/${locale}/auth/login`)
    expect(url.searchParams.get('redirect')).toBe(`/${locale}/#pricing`)
  })

  it('登录后通过现有 Checkout 购买模板，等待期间禁止重复提交', async () => {
    auth.session = { user: { id: 'user_1' } }
    let finish!: (response: Response) => void
    const request = vi.fn(
      (_url: string, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    vi.stubGlobal('fetch', request)
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    render(<LandingPage />)
    const button = within(screen.getByRole('region', { name: '一次购买，持续创造。' })).getByRole(
      'button',
      { name: '立即购买' },
    )
    fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(JSON.parse(request.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      productId: 'template',
      offerId: 'once',
      locale: 'zh',
    })
    expect(JSON.parse(request.mock.calls[0]?.[1]?.body as string).cancelUrl).toBe(
      `${websiteConfig.baseUrl.replace(/\/$/, '')}/zh/#pricing`,
    )
    await act(async () =>
      finish(new Response(JSON.stringify({ url: 'https://checkout.stripe.com/template' }))),
    )
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/template')
  })

  it('服务商价格未配置时明确提示并允许重试', async () => {
    auth.session = { user: { id: 'user_1' } }
    render(<LandingPage />)
    const pricing = screen.getByRole('region', { name: '一次购买，持续创造。' })
    fireEvent.click(within(pricing).getByRole('button', { name: '立即购买' }))
    await waitFor(() =>
      expect(within(pricing).getByRole('status')).toHaveTextContent('该方案暂未开放购买。'),
    )
    expect(within(pricing).getByRole('button', { name: '立即购买' })).toBeEnabled()
  })

  it('会话失效时仍引导登录并保留购买目标', async () => {
    auth.session = { user: { id: 'user_1' } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })))
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    render(<LandingPage />)
    fireEvent.click(
      within(screen.getByRole('region', { name: '一次购买，持续创造。' })).getByRole('button', {
        name: '立即购买',
      }),
    )
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('/zh/auth/login?redirect=%2Fzh%2F%23pricing'),
    )
  })

  it('源码与页面同步更新，默认自动进入第二轮', () => {
    vi.useFakeTimers()
    render(<LandingPage />)
    expect(demo()).toHaveTextContent("'Jerbix'")
    advance(850)
    expect(demo()).toHaveTextContent("'你的品牌'")
    advance(950)
    expect(demo()).toHaveTextContent('你的想法，现在开始。')
    advance(1200)
    expect(demo()).toHaveTextContent('支持部署到 Cloudflare')
    advance(3000)
    expect(demo()).toHaveTextContent("'Jerbix'")
    advance(850)
    expect(demo()).toHaveTextContent("'你的品牌'")
  })

  it('暂停保持阶段，后台回来不解除暂停，恢复后可重播', () => {
    vi.useFakeTimers()
    render(<LandingPage />)
    advance(850)
    fireEvent.click(screen.getByRole('button', { name: '暂停动效' }))
    visibility(true)
    advance(10000)
    visibility(false)
    expect(demo()).toHaveTextContent("'你的品牌'")
    expect(demo()).not.toHaveTextContent('你的想法，现在开始。')
    expect(vi.getTimerCount()).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: '恢复动效' }))
    advance(950)
    expect(demo()).toHaveTextContent('你的想法，现在开始。')
    fireEvent.click(screen.getByRole('button', { name: '重播演示' }))
    expect(demo()).toHaveTextContent("'Jerbix'")
    advance(850)
    expect(demo()).toHaveTextContent("'你的品牌'")
  })

  it('后台停止计时，返回前台后继续，卸载清除任务', () => {
    vi.useFakeTimers()
    const { unmount } = render(<LandingPage />)
    advance(850)
    visibility(true)
    expect(vi.getTimerCount()).toBe(0)
    advance(10000)
    visibility(false)
    advance(950)
    expect(demo()).toHaveTextContent('你的想法，现在开始。')
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('减少动态效果优先于重播，偏好恢复后继续循环', () => {
    vi.useFakeTimers()
    reduce(true)
    render(<LandingPage />)
    expect(demo()).toHaveTextContent('支持部署到 Cloudflare')
    expect(vi.getTimerCount()).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: '重播演示' }))
    expect(demo()).toHaveTextContent('支持部署到 Cloudflare')
    expect(vi.getTimerCount()).toBe(0)
    reduce(false)
    advance(6000)
    expect(demo()).toHaveTextContent("'Jerbix'")
    reduce(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('重播清零进度并解除暂停，重新保留完整的首阶段', () => {
    vi.useFakeTimers()
    render(<LandingPage />)
    advance(2400)
    fireEvent.click(screen.getByRole('button', { name: '暂停动效' }))
    fireEvent.click(screen.getByRole('button', { name: '重播演示' }))
    expect(demo()).toHaveTextContent("'Jerbix'")
    advance(849)
    expect(demo()).toHaveTextContent("'Jerbix'")
    advance(1)
    expect(demo()).toHaveTextContent("'你的品牌'")
    advance(1550)
    fireEvent.click(screen.getByRole('button', { name: '重播演示' }))
    expect(demo()).toHaveTextContent("'Jerbix'")
    advance(849)
    expect(demo()).toHaveTextContent("'Jerbix'")
  })

  it('启动流程能切换到部署指令', () => {
    render(<LandingPage />)
    fireEvent.click(screen.getByRole('button', { name: /检查，然后部署/ }))
    expect(screen.getByRole('region', { name: /检查，然后部署/ })).toHaveTextContent('pnpm deploy')
  })

  it('语言示例切换不改变站点 locale', () => {
    render(<LandingPage />)
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('group', { name: '语言预览' })).toHaveTextContent(
      'Build your next idea.',
    )
    expect(getLocale()).toBe('zh')
  })

  it('修改配置金额后，FAQ 与价格区保持一致', () => {
    websiteConfig.template.priceUsd = 199
    const { container } = render(<LandingPage />)
    expect(container.querySelector('#pricing')).toHaveTextContent('$199')
    expect(container.querySelector('#faq')).not.toHaveTextContent('$99')
  })

  it('暂停与后台状态同时控制页面其余持续动效', () => {
    const { container } = render(<LandingPage />)
    const root = container.querySelector('.landing-lab')
    expect(root).toHaveAttribute('data-motion', 'running')
    fireEvent.click(screen.getByRole('button', { name: '暂停动效' }))
    expect(root).toHaveAttribute('data-motion', 'paused')
    visibility(true)
    visibility(false)
    expect(root).toHaveAttribute('data-motion', 'paused')
    fireEvent.click(screen.getByRole('button', { name: '恢复动效' }))
    expect(root).toHaveAttribute('data-motion', 'running')
    visibility(true)
    expect(root).toHaveAttribute('data-motion', 'paused')
  })

  it('FAQ 保留配置与数据库事实，不虚构客户评价', () => {
    const { container } = render(<LandingPage />)
    const summary = screen.getByText('使用什么数据库？')
    fireEvent.click(summary)
    expect(summary.closest('details')).toHaveAttribute('open')
    expect(summary.closest('details')).toHaveTextContent('D1（SQLite）')
    expect(container).not.toHaveTextContent(/三天上线 MVP|100ms|用户怎么说/)
  })
})
