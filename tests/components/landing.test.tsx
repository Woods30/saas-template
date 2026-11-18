import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LandingPage } from '@/components/marketing/LandingPage'
import { baseConfig, websiteConfig } from '@/config/website'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale, setLocale } from '@/locale/paraglide/runtime.js'

const router = vi.hoisted(() => ({ navigate: vi.fn() }))
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
  useNavigate: () => router.navigate,
}))

const auth = vi.hoisted(() => ({ session: null as { user: { id: string } } | null }))
vi.mock('@/core/auth/client', () => ({
  useSession: () => ({ data: auth.session, isPending: false }),
}))

// 核销链路只 mock 下单这一个函数，其余（错误码文案等）走真实实现。
const collection = vi.hoisted(() => ({ createOrder: vi.fn() }))
vi.mock('@/modules/manual-payments/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/manual-payments/service')>()
  return { ...actual, createCollectionOrder: collection.createOrder }
})

const originalConfig = structuredClone(baseConfig)
let motion: MediaQueryList
beforeEach(() => {
  auth.session = null
  router.navigate.mockReset()
  collection.createOrder.mockReset().mockResolvedValue({ kind: 'redirect', orderId: 'ord_1' })
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
  Object.assign(baseConfig, structuredClone(originalConfig))
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

/**
 * 演示「改之后」那侧显示的是站点自己的品牌（文案里的 `home_demo_brand`）。
 *
 * 取相对值而不是写死占位串：品牌是配置项，改名（改过配置就是改名）
 * 不该让测试变红。演示「改之前」那侧固定是模板原品牌，那是模板自己的对照物。
 */
function customizedBrand(): string {
  return `'${m.home_demo_brand({}, { locale: 'zh' })}'`
}

describe('LandingPage', () => {
  it.each(['zh', 'en'] as const)('%s 首页销售模板源码并说明持续扩展能力', (locale) => {
    setLocale(locale, { reload: false })
    const { container } = render(<LandingPage priceCents={9900} />)
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
    // 显式打开 docs 模块：本文只断言「入口跟着语言走」，不该受各仓默认开关影响。
    websiteConfig.docs = { enabled: true }
    const { rerender } = render(<LandingPage priceCents={9900} />)
    for (const locale of ['zh', 'en', 'zh'] as const) {
      setLocale(locale, { reload: false })
      rerender(<LandingPage priceCents={9900} />)
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        locale === 'zh' ? '让想法更快上线。' : 'Launch your idea sooner.',
      )
      expect(
        screen.getByRole('link', { name: locale === 'zh' ? '看看如何开始' : 'See how to start' }),
      ).toHaveAttribute('href', `/${locale}/docs`)
    }
  })

  it('文档站部署在外部时，首页的文档入口指向外链', () => {
    websiteConfig.docs = { enabled: false, siteUrl: 'https://docs.example.com' }
    render(<LandingPage priceCents={9900} />)
    expect(screen.getByRole('link', { name: '看看如何开始' })).toHaveAttribute(
      'href',
      'https://docs.example.com',
    )
  })

  it.each([true, false])(
    '支付模块 enabled=%s 不改变模板定价，文档关闭时不导向关闭页面',
    (enabled) => {
      auth.session = { user: { id: 'user_1' } }
      websiteConfig.payment.enabled = enabled
      websiteConfig.docs = { enabled: false }
      const { container } = render(<LandingPage priceCents={9900} />)
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
    render(<LandingPage priceCents={9900} />)
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
    render(<LandingPage priceCents={9900} />)
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'PRICE_UNAVAILABLE' }, { status: 400 })),
    )
    render(<LandingPage priceCents={9900} />)
    const pricing = screen.getByRole('region', { name: '一次购买，持续创造。' })
    fireEvent.click(within(pricing).getByRole('button', { name: '立即购买' }))
    await waitFor(() =>
      expect(within(pricing).getByRole('status')).toHaveTextContent('该方案暂未开放购买。'),
    )
    expect(within(pricing).getByRole('button', { name: '立即购买' })).toBeEnabled()
  })

  it('结账参数被拒时报通用错误，不误报成「未开放购买」', async () => {
    // 服务端 400 有多个来源；只有价格不可用才说「未开放购买」，
    // 否则用户会去查价格，而问题其实在请求本身。
    auth.session = { user: { id: 'user_1' } }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'INVALID_CHECKOUT' }, { status: 400 })),
    )
    render(<LandingPage priceCents={9900} />)
    const pricing = screen.getByRole('region', { name: '一次购买，持续创造。' })
    fireEvent.click(within(pricing).getByRole('button', { name: '立即购买' }))
    await waitFor(() =>
      expect(within(pricing).getByRole('status')).toHaveTextContent('无法发起结账，请稍后重试。'),
    )
    expect(within(pricing).getByRole('status')).not.toHaveTextContent('该方案暂未开放购买。')
  })

  it('会话失效时仍引导登录并保留购买目标', async () => {
    auth.session = { user: { id: 'user_1' } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })))
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    render(<LandingPage priceCents={9900} />)
    fireEvent.click(
      within(screen.getByRole('region', { name: '一次购买，持续创造。' })).getByRole('button', {
        name: '立即购买',
      }),
    )
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('/zh/auth/login?redirect=%2Fzh%2F%23pricing'),
    )
  })

  /**
   * 核销收款链路：首页购买入口不调渠道结账，而是创建核销订单并站内导航到
   * 订单详情；价格显示本地标价。
   */
  describe('核销收款链路', () => {
    beforeEach(() => {
      auth.session = { user: { id: 'user_1' } }
      websiteConfig.payment.checkoutMode = 'collection'
      // 两条链路互斥：核销链路下支付模块关着也不影响购买入口。
      websiteConfig.payment.enabled = false
      websiteConfig.collection.enabled = true
    })

    it('价格显示核销链路的本地标价', () => {
      const { container } = render(
        <LandingPage priceCents={9900} collectionPrice={{ amount: 18_000, currency: 'cny' }} />,
      )
      expect(container.querySelector('#pricing')).toHaveTextContent('¥180')
      expect(container.querySelector('#pricing')).not.toHaveTextContent('$99')
    })

    it('「立即购买」创建核销订单并进入订单详情，不调渠道结账', async () => {
      const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
      vi.stubGlobal('fetch', request)
      render(
        <LandingPage priceCents={9900} collectionPrice={{ amount: 18_000, currency: 'cny' }} />,
      )
      fireEvent.click(
        within(screen.getByRole('region', { name: '一次购买，持续创造。' })).getByRole('button', {
          name: '立即购买',
        }),
      )
      await waitFor(() => expect(router.navigate).toHaveBeenCalled())
      expect(router.navigate).toHaveBeenCalledWith({
        to: '/{-$locale}/settings/orders/$orderId',
        params: { locale: 'zh', orderId: 'ord_1' },
      })
      expect(request).not.toHaveBeenCalled()
    })

    it('核销模块关闭时购买入口不可用', () => {
      websiteConfig.collection.enabled = false
      render(
        <LandingPage priceCents={9900} collectionPrice={{ amount: 18_000, currency: 'cny' }} />,
      )
      expect(
        within(screen.getByRole('region', { name: '一次购买，持续创造。' })).getByRole('button', {
          name: '立即购买',
        }),
      ).toBeDisabled()
    })

    it('下单失败时按稳定错误码提示，不编造文案', async () => {
      collection.createOrder.mockResolvedValue({ kind: 'error', code: 'NO_COLLECTION_ACCOUNT' })
      render(
        <LandingPage priceCents={9900} collectionPrice={{ amount: 18_000, currency: 'cny' }} />,
      )
      fireEvent.click(
        within(screen.getByRole('region', { name: '一次购买，持续创造。' })).getByRole('button', {
          name: '立即购买',
        }),
      )
      await waitFor(() =>
        expect(
          within(screen.getByRole('region', { name: '一次购买，持续创造。' })).getByRole('status'),
        ).toHaveTextContent('暂无可用收款账户，请联系站点管理员。'),
      )
    })
  })

  it('源码与页面同步更新，默认自动进入第二轮', () => {
    vi.useFakeTimers()
    render(<LandingPage priceCents={9900} />)
    expect(demo()).toHaveTextContent("'Jerbix'")
    advance(850)
    expect(demo()).toHaveTextContent(customizedBrand())
    advance(950)
    expect(demo()).toHaveTextContent('你的想法，现在开始。')
    advance(1200)
    expect(demo()).toHaveTextContent('支持部署到 Cloudflare')
    advance(3000)
    expect(demo()).toHaveTextContent("'Jerbix'")
    advance(850)
    expect(demo()).toHaveTextContent(customizedBrand())
  })

  it('暂停保持阶段，后台回来不解除暂停，恢复后可重播', () => {
    vi.useFakeTimers()
    render(<LandingPage priceCents={9900} />)
    advance(850)
    fireEvent.click(screen.getByRole('button', { name: '暂停动效' }))
    visibility(true)
    advance(10000)
    visibility(false)
    expect(demo()).toHaveTextContent(customizedBrand())
    expect(demo()).not.toHaveTextContent('你的想法，现在开始。')
    expect(vi.getTimerCount()).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: '恢复动效' }))
    advance(950)
    expect(demo()).toHaveTextContent('你的想法，现在开始。')
    fireEvent.click(screen.getByRole('button', { name: '重播演示' }))
    expect(demo()).toHaveTextContent("'Jerbix'")
    advance(850)
    expect(demo()).toHaveTextContent(customizedBrand())
  })

  it('后台停止计时，返回前台后继续，卸载清除任务', () => {
    vi.useFakeTimers()
    const { unmount } = render(<LandingPage priceCents={9900} />)
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
    render(<LandingPage priceCents={9900} />)
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
    render(<LandingPage priceCents={9900} />)
    advance(2400)
    fireEvent.click(screen.getByRole('button', { name: '暂停动效' }))
    fireEvent.click(screen.getByRole('button', { name: '重播演示' }))
    expect(demo()).toHaveTextContent("'Jerbix'")
    advance(849)
    expect(demo()).toHaveTextContent("'Jerbix'")
    advance(1)
    expect(demo()).toHaveTextContent(customizedBrand())
    advance(1550)
    fireEvent.click(screen.getByRole('button', { name: '重播演示' }))
    expect(demo()).toHaveTextContent("'Jerbix'")
    advance(849)
    expect(demo()).toHaveTextContent("'Jerbix'")
  })

  it('启动流程能切换到部署指令', () => {
    render(<LandingPage priceCents={9900} />)
    fireEvent.click(screen.getByRole('button', { name: /检查，然后部署/ }))
    expect(screen.getByRole('region', { name: /检查，然后部署/ })).toHaveTextContent('pnpm deploy')
  })

  it('语言示例切换不改变站点 locale', () => {
    render(<LandingPage priceCents={9900} />)
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getByRole('group', { name: '语言预览' })).toHaveTextContent(
      'Build your next idea.',
    )
    expect(getLocale()).toBe('zh')
  })

  it('价格来自价格目录，改价后价格区与 CTA 一起跟随', () => {
    // 改价在 Stripe 后台完成，代码里不存第二份金额——页面读目录给的金额。
    const { container } = render(<LandingPage priceCents={19900} />)
    expect(container.querySelector('#pricing')).toHaveTextContent('$199')
    expect(screen.getByRole('link', { name: '获取全部源码 · $199' })).toBeTruthy()
  })

  it('价格目录取不到时降级为「价格暂不可用」，不编造金额', () => {
    const { container } = render(<LandingPage priceCents={null} />)
    expect(container.querySelector('#pricing')).toHaveTextContent('价格暂不可用')
    expect(container.querySelector('#pricing')).not.toHaveTextContent('$0')
    expect(screen.getByRole('link', { name: '获取全部源码' })).toBeTruthy()
  })

  it('暂停与后台状态同时控制页面其余持续动效', () => {
    const { container } = render(<LandingPage priceCents={9900} />)
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
    const { container } = render(<LandingPage priceCents={9900} />)
    const summary = screen.getByText('使用什么数据库？')
    fireEvent.click(summary)
    expect(summary.closest('details')).toHaveAttribute('open')
    expect(summary.closest('details')).toHaveTextContent('D1（SQLite）')
    expect(container).not.toHaveTextContent(/三天上线 MVP|100ms|用户怎么说/)
  })
})
