import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionInfo } from '@/auth/session'
import type { CollectionOrder } from '@/collection/types'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { LandingPage } from '@/components/marketing/LandingPage'
import { findProduct } from '@/config/products'
import { websiteConfig } from '@/config/website'
import { setLocale } from '@/locale/paraglide/runtime.js'
import { Route as OrderDetailRoute } from '@/routes/{-$locale}/_layout/dashboard/orders/$orderId'
import { Route as OrdersIndexRoute } from '@/routes/{-$locale}/_layout/dashboard/orders/index'

/**
 * 核销型支付的用户流程：首页分流、订单列表 / 详情、申报与轮询、无对象存储降级、
 * 个人中心入口。server function 只 mock **定义它的模块**（`@/collection/server`），
 * `src/collection/client.ts` 走真实实现，确保「失败返回 Response」这条契约真的被测到。
 */

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  pathname: '/zh/dashboard/orders',
  session: null as { user: { id: string } } | null,
  createOrder: vi.fn(),
  submitOrder: vi.fn(),
  cancelOrder: vi.fn(),
  fetchOrder: vi.fn(),
  fetchOrders: vi.fn(),
  fetchAdminOrders: vi.fn(),
  reviewOrder: vi.fn(),
  fetchAccounts: vi.fn(),
  saveAccount: vi.fn(),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({
      children,
      to,
      params,
      hash,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      to?: string
      params?: Record<string, unknown>
      hash?: string
    }) => {
      let href = (to ?? '').replace('/{-$locale}', `/${String(params?.locale ?? '')}`)
      for (const [key, value] of Object.entries(params ?? {})) {
        if (key !== 'locale') href = href.replace(`$${key}`, String(value))
      }
      return (
        <a {...props} href={`${href}${hash ? `#${hash}` : ''}`}>
          {children}
        </a>
      )
    },
    useNavigate: () => mocks.navigate,
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { pathname: string } }) => unknown
    }) => select({ location: { pathname: mocks.pathname } }),
  }
})

vi.mock('@/auth/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/client')>()
  return { ...actual, useSession: () => ({ data: mocks.session, isPending: false }) }
})

vi.mock('@/collection/server', () => ({
  createCollectionOrderFn: mocks.createOrder,
  submitCollectionOrderFn: mocks.submitOrder,
  cancelCollectionOrderFn: mocks.cancelOrder,
  fetchCollectionOrderFn: mocks.fetchOrder,
  fetchMyCollectionOrdersFn: mocks.fetchOrders,
  fetchAdminCollectionOrdersFn: mocks.fetchAdminOrders,
  reviewCollectionOrderFn: mocks.reviewOrder,
  fetchCollectionAccountsFn: mocks.fetchAccounts,
  saveCollectionAccountFn: mocks.saveAccount,
}))

const originalConfig = structuredClone(websiteConfig)
// 列表页在 index 子路由（父路由 `orders.tsx` 只承担门禁与 SEO，无 component）。
const OrdersPage = OrdersIndexRoute.options.component as unknown as () => React.JSX.Element
const OrderDetailPage = OrderDetailRoute.options.component as unknown as () => React.JSX.Element

function makeOrder(overrides: Partial<CollectionOrder> = {}): CollectionOrder {
  const createdAt = new Date(Date.now())
  return {
    id: 'ord_1',
    userId: 'u_1',
    accountId: 'alipay_main',
    channel: 'alipay',
    qrImageUrl: '/qr/alipay.png',
    qrImageKey: null,
    productId: 'template',
    offerId: 'once',
    kind: 'one_time',
    interval: null,
    intervalCount: null,
    baseAmount: 18_000,
    fingerprint: 42,
    payableAmount: 18_042,
    currency: 'cny',
    status: 'pending_payment',
    payerNote: null,
    receiptKey: null,
    submittedAt: null,
    observedAmount: null,
    externalReference: null,
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    expiresAt: new Date(createdAt.getTime() + 15 * 60 * 1000),
    settledAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

function stubDetail(order: CollectionOrder | null, canUpload: boolean) {
  vi.spyOn(OrderDetailRoute, 'useLoaderData').mockReturnValue({
    ok: order !== null,
    orderId: order?.id ?? 'ord_1',
    order,
    canUpload,
    errorCode: null,
  } as never)
}

function stubList(page: { rows: CollectionOrder[]; total: number } | null) {
  vi.spyOn(OrdersIndexRoute, 'useLoaderData').mockReturnValue({ ok: page !== null, page } as never)
}

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

let motion: MediaQueryList
beforeEach(() => {
  setLocale('zh', { reload: false })
  mocks.navigate.mockReset()
  mocks.pathname = '/zh/dashboard/orders'
  mocks.session = { user: { id: 'u_1' } }
  mocks.createOrder.mockReset().mockResolvedValue({ id: 'ord_1' })
  mocks.submitOrder.mockReset().mockResolvedValue({ status: 'pending_verification' })
  mocks.cancelOrder.mockReset().mockResolvedValue({ status: 'canceled' })
  mocks.fetchOrder.mockReset().mockResolvedValue({
    order: makeOrder({ status: 'pending_verification' }),
    canUpload: true,
  })
  mocks.fetchOrders.mockReset().mockResolvedValue({ rows: [], total: 0 })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable', { status: 400 })))
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

function enableCollection() {
  websiteConfig.checkout.mode = 'collection'
  websiteConfig.collection.enabled = true
}

describe('首页 collection 分流', () => {
  it('collection 模式展示本地价格的币种金额', () => {
    enableCollection()
    const { container } = render(
      <LandingPage priceCents={9900} collectionPrice={{ amount: 18_000, currency: 'cny' }} />,
    )
    expect(container.querySelector('#pricing')).toHaveTextContent('¥180.00')
    expect(container.querySelector('#pricing')).not.toHaveTextContent('$99')
  })

  it('collection 模式 CTA 创建订单并站内导航，不调用 provider 结账', async () => {
    enableCollection()
    const request = vi.fn().mockResolvedValue(new Response('Unavailable', { status: 400 }))
    vi.stubGlobal('fetch', request)
    render(<LandingPage priceCents={9900} collectionPrice={{ amount: 18_000, currency: 'cny' }} />)
    fireEvent.click(
      within(screen.getByRole('region', { name: '一次购买，持续创造。' })).getByRole('button', {
        name: '立即购买',
      }),
    )
    await waitFor(() =>
      expect(mocks.createOrder).toHaveBeenCalledWith({
        data: { productId: websiteConfig.landingOffer.productId, offerId: 'once' },
      }),
    )
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/{-$locale}/dashboard/orders/$orderId',
        params: { locale: 'zh', orderId: 'ord_1' },
      }),
    )
    expect(request).not.toHaveBeenCalled()
  })

  it('未登录用户先被引导登录，不创建订单', () => {
    enableCollection()
    mocks.session = null
    render(<LandingPage priceCents={9900} collectionPrice={{ amount: 18_000, currency: 'cny' }} />)
    const link = within(screen.getByRole('region', { name: '一次购买，持续创造。' })).getByRole(
      'link',
      { name: '立即购买' },
    )
    expect(link).toHaveAttribute('href', '/zh/auth/login?redirect=%2Fzh%2F%23pricing')
    expect(mocks.createOrder).not.toHaveBeenCalled()
  })

  it('服务端返回 UNAUTHENTICATED 时引导登录，不导航到订单页', async () => {
    enableCollection()
    mocks.createOrder.mockResolvedValue(
      Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 }),
    )
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    render(<LandingPage priceCents={9900} collectionPrice={{ amount: 18_000, currency: 'cny' }} />)
    fireEvent.click(
      within(screen.getByRole('region', { name: '一次购买，持续创造。' })).getByRole('button', {
        name: '立即购买',
      }),
    )
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('/zh/auth/login?redirect=%2Fzh%2F%23pricing'),
    )
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('provider 模式仍走原有结账，不创建核销订单', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(Response.json({ url: 'https://checkout.stripe.com/template' }))
    vi.stubGlobal('fetch', request)
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    render(<LandingPage priceCents={9900} />)
    fireEvent.click(
      within(screen.getByRole('region', { name: '一次购买，持续创造。' })).getByRole('button', {
        name: '立即购买',
      }),
    )
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/template'))
    expect(mocks.createOrder).not.toHaveBeenCalled()
  })
})

describe('订单详情页', () => {
  it('显示商品、精确应付金额、15 分钟倒计时、收款二维码与订单号', () => {
    const order = makeOrder()
    vi.useFakeTimers()
    vi.setSystemTime(order.createdAt)
    stubDetail(order, true)
    render(<OrderDetailPage />)
    expect(screen.getByText(findProduct('template')?.name ?? '')).toBeInTheDocument()
    expect(screen.getByText('¥180.42')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('15:00')
    expect(screen.getByRole('img', { name: '收款二维码' })).toHaveAttribute('src', '/qr/alipay.png')
    expect(screen.getByText('ord_1')).toBeInTheDocument()
  })

  it('qrImageKey 优先走服务端图片端点，不接受客户端指定 key', () => {
    stubDetail(makeOrder({ qrImageKey: 'collection-qrcodes/secret.png' }), true)
    render(<OrderDetailPage />)
    expect(screen.getByRole('img', { name: '收款二维码' })).toHaveAttribute(
      'src',
      '/api/collection/accounts/alipay_main/qrcode',
    )
  })

  it('风险正文写明人工核验、核验时限、精确金额、15 分钟有效、截图不代表到账、订阅不自动扣款', () => {
    stubDetail(makeOrder(), true)
    const { container } = render(<OrderDetailPage />)
    const risk = container.querySelector('[data-testid="collection-risk"]')
    expect(risk).not.toBeNull()
    expect(risk).toHaveTextContent('人工核验')
    expect(risk).toHaveTextContent('24 小时')
    expect(risk).toHaveTextContent('精确金额')
    expect(risk).toHaveTextContent('15 分钟')
    expect(risk).toHaveTextContent('不代表款项已确认到账')
    expect(risk).toHaveTextContent('不自动续费')
  })

  it('点击我已支付只进入待核验，不显示已到账', async () => {
    stubDetail(makeOrder(), true)
    render(<OrderDetailPage />)
    fireEvent.click(screen.getByRole('button', { name: '我已支付' }))
    await waitFor(() => expect(screen.getByText('等待人工核验')).toBeInTheDocument())
    expect(mocks.submitOrder).toHaveBeenCalledWith({
      data: { orderId: 'ord_1', payerNote: null },
    })
    expect(screen.queryByText('已到账')).toBeNull()
  })

  it('申报后每 5 秒轮询，订单 settled 后停止轮询', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const order = makeOrder({ status: 'pending_verification' })
    mocks.fetchOrder.mockResolvedValue({ order: { ...order, status: 'settled' }, canUpload: true })
    stubDetail(order, true)
    render(<OrderDetailPage />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(mocks.fetchOrder).toHaveBeenCalledTimes(1)
    expect(screen.getByText('已到账')).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(mocks.fetchOrder).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('没有对象存储时不显示上传入口，但辅助说明仍可填写', () => {
    stubDetail(makeOrder(), false)
    render(<OrderDetailPage />)
    expect(screen.queryByLabelText('付款凭证（选填）')).toBeNull()
    const note = screen.getByLabelText('辅助说明（选填）')
    fireEvent.change(note, { target: { value: '尾号 1234' } })
    expect(note).toHaveValue('尾号 1234')
  })

  it('有对象存储时上传凭证使用 file 字段，不传 R2 key', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', request)
    stubDetail(makeOrder(), true)
    render(<OrderDetailPage />)
    const input = screen.getByLabelText('付款凭证（选填）')
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'receipt.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(request).toHaveBeenCalled())
    const [url, init] = request.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/collection/orders/ord_1/receipt')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('file')).toBeInstanceOf(File)
  })

  it('服务端稳定错误码按码显示文案，不自己造码', async () => {
    mocks.submitOrder.mockResolvedValue(Response.json({ error: 'ORDER_EXPIRED' }, { status: 410 }))
    stubDetail(makeOrder(), true)
    render(<OrderDetailPage />)
    fireEvent.click(screen.getByRole('button', { name: '我已支付' }))
    // 风险须知卡片也是 role="alert"，按标题取错误提示这一张。
    await waitFor(() =>
      expect(screen.getByText('操作未完成').parentElement).toHaveTextContent('订单已过期'),
    )
  })
})

describe('订单列表页', () => {
  it('列出自己的订单、精确金额与状态，并提供详情入口', () => {
    stubList({ rows: [makeOrder({ status: 'settled' })], total: 1 })
    render(<OrdersPage />)
    expect(screen.getByText('ord_1')).toBeInTheDocument()
    expect(screen.getByText('¥180.42')).toBeInTheDocument()
    expect(screen.getByText('已到账')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看详情' })).toHaveAttribute(
      'href',
      '/zh/dashboard/orders/ord_1',
    )
  })

  it('没有订单时显示空态', () => {
    stubList({ rows: [], total: 0 })
    render(<OrdersPage />)
    expect(screen.getByText('还没有订单。')).toBeInTheDocument()
  })
})

describe('个人中心入口与面包屑', () => {
  function renderLayout() {
    return render(
      <DashboardLayout locale="zh" session={sessionWith()}>
        <div>内容区</div>
      </DashboardLayout>,
    )
  }

  it('collection 模块开启时显示「订单」入口，关闭时隐藏', () => {
    websiteConfig.collection.enabled = true
    const { unmount } = renderLayout()
    const sidebar = document.querySelector('[data-slot="sidebar"]') as HTMLElement
    expect(within(sidebar).getByRole('link', { name: '订单' })).toHaveAttribute(
      'href',
      '/zh/dashboard/orders',
    )
    unmount()
    websiteConfig.collection.enabled = false
    renderLayout()
    const closed = document.querySelector('[data-slot="sidebar"]') as HTMLElement
    expect(within(closed).queryByRole('link', { name: '订单' })).toBeNull()
  })

  it.each(['/zh/dashboard/orders', '/zh/dashboard/orders/ord_1'])('面包屑识别 %s', (pathname) => {
    mocks.pathname = pathname
    renderLayout()
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' })
    expect(within(breadcrumb).getByText('我的订单')).toHaveAttribute('aria-current', 'page')
  })
})
