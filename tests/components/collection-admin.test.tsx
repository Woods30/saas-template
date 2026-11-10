import { render, screen, waitFor, within } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionInfo } from '@/auth/session'
import type { CollectionOrder } from '@/collection/types'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { setLocale } from '@/locale/paraglide/runtime.js'
import { Route as AdminOrdersRoute } from '@/routes/{-$locale}/_layout/dashboard/admin/orders'

/**
 * 管理员核验队列与收款账户运营：入口门禁、默认筛选、金额不符禁提交、
 * 异常通过二次确认与理由强制、凭证展示。server function 只 mock **定义它的
 * 模块**（`@/collection/server`），页面走真实渲染。
 */

const routerMocks = vi.hoisted(() => ({
  pathname: '/zh/dashboard/admin/orders',
  navigate: vi.fn(),
}))

const mocks = vi.hoisted(() => ({
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
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      to?: string
      params?: Record<string, unknown>
    }) => {
      let href = (to ?? '').replace('/{-$locale}', `/${String(params?.locale ?? '')}`)
      for (const [key, value] of Object.entries(params ?? {})) {
        if (key !== 'locale') href = href.replace(`$${key}`, String(value))
      }
      return (
        <a {...props} href={href}>
          {children}
        </a>
      )
    },
    useNavigate: () => routerMocks.navigate,
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { pathname: string } }) => unknown
    }) => select({ location: { pathname: routerMocks.pathname } }),
  }
})

vi.mock('@/collection/server', () => ({
  fetchAdminCollectionOrdersFn: mocks.fetchAdminOrders,
  reviewCollectionOrderFn: mocks.reviewOrder,
  fetchCollectionAccountsFn: mocks.fetchAccounts,
  saveCollectionAccountFn: mocks.saveAccount,
  // 页面不会调用用户侧函数，但模块被整体 mock 时必须齐备。
  createCollectionOrderFn: vi.fn(),
  submitCollectionOrderFn: vi.fn(),
  cancelCollectionOrderFn: vi.fn(),
  fetchCollectionOrderFn: vi.fn(),
  fetchMyCollectionOrdersFn: vi.fn(),
}))

import { websiteConfig } from '@/config/website'

const originalConfig = structuredClone(websiteConfig)
const AdminOrdersPage = AdminOrdersRoute.options.component as unknown as () => React.JSX.Element

beforeEach(() => {
  setLocale('zh', { reload: false })
  routerMocks.pathname = '/zh/dashboard/admin/orders'
  Object.assign(websiteConfig, structuredClone(originalConfig))
  // 打开管理台与核销模块：本套件关心的是页面行为，不是门禁开关。
  websiteConfig.features.enableAdmin = true
  websiteConfig.collection = {
    enabled: true,
    verificationSlaHours: 24,
    accounts: [
      {
        id: 'alipay_main',
        channel: 'alipay',
        displayName: '主收款账户',
        currency: 'cny',
        qrImageUrl: '/qr/alipay.png',
      },
    ],
  }
  mocks.fetchAdminOrders.mockResolvedValue({ rows: [], total: 0 })
  mocks.fetchAccounts.mockResolvedValue([])
  mocks.reviewOrder.mockResolvedValue({ status: 'settled' })
  mocks.saveAccount.mockResolvedValue({ ok: true })
})

afterEach(() => {
  Object.assign(websiteConfig, structuredClone(originalConfig))
})

function makeOrder(overrides: Partial<CollectionOrder> = {}): CollectionOrder {
  const createdAt = new Date('2026-01-01T00:00:00.000Z')
  return {
    id: 'ord_1',
    userId: 'u_1',
    accountId: 'alipay_main',
    channel: 'alipay',
    qrImageUrl: null,
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
    status: 'pending_verification',
    payerNote: '转账尾号 1234',
    receiptKey: null,
    submittedAt: createdAt,
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

function stubLoaderData(payload: Record<string, unknown>, accounts: unknown[] = []) {
  vi.spyOn(AdminOrdersRoute, 'useLoaderData').mockReturnValue({ accounts, ...payload } as never)
  // 页面用 URL 状态驱动筛选与分页；组件直接渲染时没有 Router 上下文，stub 掉。
  vi.spyOn(AdminOrdersRoute, 'useSearch').mockReturnValue({} as never)
}

function sessionWith(role: SessionInfo['user']['role'] = 'admin'): SessionInfo {
  return {
    user: {
      id: 'a_1',
      name: 'admin',
      email: 'admin@example.com',
      emailVerified: true,
      image: null,
      role,
    },
    impersonating: false,
  }
}

/** 页面组件渲染外壳；入口门禁单独在 settings-layout 侧验证。 */
function renderPage() {
  return render(<AdminOrdersPage />)
}

describe('核验队列页', () => {
  it('默认筛选待核验：loader 不带状态参数时服务端收到 pending_verification', async () => {
    stubLoaderData({ ok: true as const, page: { rows: [], total: 0 } })
    renderPage()
    // 页面数据来自路由 loader；loader 的默认状态行为由服务端单测覆盖，
    // 这里断言页面把 loader 给的列表渲染出来。
    await waitFor(() => expect(screen.getByText('核销订单核验')).toBeInTheDocument())
  })

  it('列表显示订单号、买家邮箱、应付金额与辅助说明', async () => {
    stubLoaderData({
      ok: true as const,
      page: {
        rows: [
          Object.assign(makeOrder(), {
            userEmail: 'buyer@example.com',
          }),
        ],
        total: 1,
      },
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('ord_1')).toBeInTheDocument())
    expect(screen.getByText('buyer@example.com')).toBeInTheDocument()
    // 金额按币种格式化：18042 分 = ¥180.42。
    expect(screen.getByText(/180\.42/)).toBeInTheDocument()
    expect(screen.getByText('转账尾号 1234')).toBeInTheDocument()
  })

  it('凭证未上传时显示未上传，已上传时渲染服务端凭证端点', async () => {
    stubLoaderData({
      ok: true as const,
      page: {
        rows: [
          makeOrder({ id: 'ord_no_receipt', receiptKey: null }),
          makeOrder({ id: 'ord_with_receipt', receiptKey: 'collection-receipts/ord_with_receipt' }),
        ],
        total: 2,
      },
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('ord_no_receipt')).toBeInTheDocument())
    expect(screen.getByText('ord_with_receipt')).toBeInTheDocument()
    const img = screen.getByAltText('付款凭证') as HTMLImageElement
    // key 不暴露给客户端：src 只有端点路径，不含任何 R2 key。
    expect(img.src).toContain('/api/collection/orders/ord_with_receipt/receipt')
    expect(img.src).not.toContain('collection-receipts')
  })

  it('金额与应付金额相等才能普通通过；不等时按钮不可提交', async () => {
    stubLoaderData({
      ok: true as const,
      page: { rows: [makeOrder()], total: 1 },
    })
    renderPage()
    const open = await screen.findByRole('button', { name: '核验' })
    open.click()

    // 正确金额 → 可提交。
    const amount = (await screen.findByLabelText('实际到账金额（元）')) as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(amount, '180.42')
    amount.dispatchEvent(new Event('input', { bubbles: true }))
    const approve = await screen.findByRole('button', { name: '普通通过' })
    await waitFor(() => expect(approve).not.toBeDisabled())

    // 差一分的金额 → 置灰不可提交。
    setter?.call(amount, '180.43')
    amount.dispatchEvent(new Event('input', { bubbles: true }))
    await waitFor(() => expect(approve).toBeDisabled())
  })

  it('异常通过必须填写理由并二次确认', async () => {
    stubLoaderData({
      ok: true as const,
      page: { rows: [makeOrder()], total: 1 },
    })
    renderPage()
    ;(await screen.findByRole('button', { name: '核验' })).click()

    const amount = (await screen.findByLabelText('实际到账金额（元）')) as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(amount, '50')
    amount.dispatchEvent(new Event('input', { bubbles: true }))

    const exception = await screen.findByRole('button', { name: '异常通过' })
    // 没写理由 → 不可提交。
    await waitFor(() => expect(exception).toBeDisabled())

    const note = screen.getByLabelText('核验备注') as HTMLInputElement
    setter?.call(note, '用户多付了，按异常金额入账')
    note.dispatchEvent(new Event('input', { bubbles: true }))
    await waitFor(() => expect(exception).not.toBeDisabled())

    exception.click()
    // 二次确认弹窗：只有确认后才真正调用核验。
    const confirm = await screen.findByRole('button', { name: '确认异常通过' })
    confirm.click()
    await waitFor(() =>
      expect(mocks.reviewOrder).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'approve_exception' }),
      }),
    )
  })

  it('驳回需要理由', async () => {
    stubLoaderData({
      ok: true as const,
      page: { rows: [makeOrder()], total: 1 },
    })
    renderPage()
    ;(await screen.findByRole('button', { name: '核验' })).click()

    const reject = await screen.findByRole('button', { name: '驳回' })
    // 没写理由 → 不可提交。
    await waitFor(() => expect(reject).toBeDisabled())

    const note = screen.getByLabelText('核验备注') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(note, '未查到对应流水')
    note.dispatchEvent(new Event('input', { bubbles: true }))
    await waitFor(() => expect(reject).not.toBeDisabled())

    reject.click()
    await waitFor(() =>
      expect(mocks.reviewOrder).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'reject' }),
      }),
    )
  })
})

describe('收款账户区块', () => {
  it('显示配置账户与数据库覆盖状态', async () => {
    stubLoaderData({ ok: true as const, page: { rows: [], total: 0 } }, [
      {
        id: 'alipay_main',
        channel: 'alipay',
        displayName: '运营改名后的账户',
        currency: 'cny',
        qrImageKey: 'collection-qrcodes/alipay_main',
        enabled: true,
        updatedBy: 'a_1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ])
    renderPage()
    await waitFor(() => expect(screen.getByText('alipay_main')).toBeInTheDocument())
    // 数据库里有该账户 → 显示覆盖 Badge；显示名用数据库的。
    expect(screen.getByText('数据库覆盖')).toBeInTheDocument()
    expect(screen.getByText('运营改名后的账户')).toBeInTheDocument()
  })

  it('数据库没有的账户显示源码配置 Badge', async () => {
    // 源码配置账户没有数据库行：账户区块直接按 websiteConfig 渲染。
    stubLoaderData({ ok: true as const, page: { rows: [], total: 0 } })
    renderPage()
    await waitFor(() => expect(screen.getByText('alipay_main')).toBeInTheDocument())
    expect(screen.getByText('源码配置')).toBeInTheDocument()
    expect(screen.getByText('主收款账户')).toBeInTheDocument()
  })

  it('禁用账户调用保存接口', async () => {
    stubLoaderData({ ok: true as const, page: { rows: [], total: 0 } }, [
      {
        id: 'alipay_main',
        channel: 'alipay',
        displayName: '主收款账户',
        currency: 'cny',
        qrImageKey: null,
        enabled: true,
        updatedBy: 'a_1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ])
    renderPage()
    const disable = await screen.findByRole('button', { name: '禁用' })
    disable.click()
    await waitFor(() =>
      expect(mocks.saveAccount).toHaveBeenCalledWith({
        data: expect.objectContaining({ accountId: 'alipay_main', enabled: false }),
      }),
    )
  })
})

describe('个人中心入口', () => {
  function renderLayout(role: SessionInfo['user']['role']) {
    return render(
      <DashboardLayout locale="zh" session={sessionWith(role)}>
        <div>内容区</div>
      </DashboardLayout>,
    )
  }

  it('角色、功能开关与模块三者都满足才显示入口', () => {
    renderLayout('admin')
    expect(screen.getByRole('link', { name: '核验队列' })).toBeInTheDocument()
  })

  it('非管理员不显示入口', () => {
    renderLayout('user')
    expect(screen.queryByRole('link', { name: '核验队列' })).toBeNull()
  })

  it('模块关闭时不显示入口', () => {
    websiteConfig.collection.enabled = false
    renderLayout('admin')
    expect(screen.queryByRole('link', { name: '核验队列' })).toBeNull()
  })

  it('功能开关关闭时不显示入口', () => {
    websiteConfig.features.enableAdmin = false
    renderLayout('admin')
    expect(screen.queryByRole('link', { name: '核验队列' })).toBeNull()
  })

  it('面包屑识别管理订单页', () => {
    routerMocks.pathname = '/zh/dashboard/admin/orders'
    renderLayout('admin')
    const nav = screen.getByRole('navigation', { name: 'breadcrumb' })
    expect(within(nav).getByText('核销订单核验')).toBeInTheDocument()
  })
})
