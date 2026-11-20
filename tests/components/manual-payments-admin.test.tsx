import { render, screen, waitFor, within } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminConsoleLayout } from '@/components/admin/AdminConsoleLayout'
import { websiteConfig } from '@/config/website'
import type { SessionInfo } from '@/core/auth/session'
import { setLocale } from '@/locale/paraglide/runtime.js'
import type { ManualPaymentOrder } from '@/modules/manual-payments/service'
import { Route as AdminManualPaymentOrdersRoute } from '@/routes/{-$locale}/_layout/admin/manual-payments'

/**
 * 管理员核验队列与收款账户运营：入口门禁、默认筛选、金额不符禁提交、
 * 异常通过二次确认与理由强制、凭证展示。server function 只 mock **定义它的
 * 模块**（`@/modules/manual-payments/server`），页面走真实渲染。
 */

const routerMocks = vi.hoisted(() => ({
  pathname: '/zh/admin/manual-payments',
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
    // 页面改动后走 `router.invalidate()` 重新取数，测试里给一个空实现即可。
    useRouter: () => ({ invalidate: vi.fn() }),
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { pathname: string } }) => unknown
    }) => select({ location: { pathname: routerMocks.pathname } }),
  }
})

vi.mock('@/modules/manual-payments/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/manual-payments/server')>()
  return {
    ...actual,
    fetchAdminManualPaymentOrdersFn: mocks.fetchAdminOrders,
    reviewManualPaymentOrderFn: mocks.reviewOrder,
    fetchManualPaymentAccountsFn: mocks.fetchAccounts,
    saveManualPaymentAccountFn: mocks.saveAccount,
  }
})

// `websiteConfig` 是 Proxy（`structuredClone` 克隆不了），这里只留快照用到的字段。
const originalManualPaymentEnabled = websiteConfig.manualPayments.enabled
const originalManualPaymentAccounts = websiteConfig.manualPayments.accounts

const AdminManualPaymentOrdersPage = AdminManualPaymentOrdersRoute.options
  .component as unknown as () => React.JSX.Element

beforeEach(() => {
  setLocale('zh', { reload: false })
  routerMocks.pathname = '/zh/admin/manual-payments'
  // 打开核销模块：本套件关心的是页面行为，不是模块开关。
  websiteConfig.manualPayments.enabled = true
  websiteConfig.manualPayments.accounts = [
    {
      id: 'alipay_main',
      channel: 'alipay',
      displayName: '主收款账户',
      currency: 'cny',
      qrImageUrl: '/qr/alipay.png',
    },
  ]
  mocks.fetchAdminOrders.mockResolvedValue({ rows: [], total: 0 })
  mocks.fetchAccounts.mockResolvedValue([])
  mocks.reviewOrder.mockResolvedValue({ status: 'settled' })
  mocks.saveAccount.mockResolvedValue({ ok: true })
})

afterEach(() => {
  websiteConfig.manualPayments.enabled = originalManualPaymentEnabled
  websiteConfig.manualPayments.accounts = originalManualPaymentAccounts
})

function makeOrder(overrides: Partial<ManualPaymentOrder> = {}): ManualPaymentOrder {
  const createdAt = new Date('2026-01-01T00:00:00.000Z')
  return {
    id: 'ord_1',
    orderNo: 'ord_20260101000000_ABCDEF12',
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
  vi.spyOn(AdminManualPaymentOrdersRoute, 'useLoaderData').mockReturnValue({
    accounts,
    ...payload,
  } as never)
  // 页面用 URL 状态驱动筛选与分页；组件直接渲染时没有 Router 上下文，stub 掉。
  vi.spyOn(AdminManualPaymentOrdersRoute, 'useSearch').mockReturnValue({} as never)
  vi.spyOn(AdminManualPaymentOrdersRoute, 'useNavigate').mockReturnValue(
    routerMocks.navigate as never,
  )
}

/** `'admin'` 角色对应通配权限；其余角色给空权限（fail-closed）。 */
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
    permissions: role === 'admin' ? ['*'] : [],
    impersonating: false,
  }
}

/** 页面组件渲染外壳；入口门禁单独在 settings-layout 侧验证。 */
function renderPage() {
  return render(<AdminManualPaymentOrdersPage />)
}

describe('核验队列页', () => {
  it('状态筛选默认落在待核验', async () => {
    stubLoaderData({ ok: true as const, page: { rows: [], total: 0 } })
    renderPage()
    // 页面标题由布局统一渲染（取自菜单配置），页面自己只负责筛选与列表。
    // 默认筛选是「等待人工核验」：URL 里没有 status 时由页面兜底。
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('等待人工核验'))
  })

  it('列表显示订单号、买家邮箱、应付金额与辅助说明', async () => {
    stubLoaderData({
      ok: true as const,
      page: {
        rows: [
          Object.assign(makeOrder(), {
            email: 'buyer@example.com',
          }),
        ],
        total: 1,
      },
    })
    renderPage()
    // 订单号列展示对外订单号，而不是内部 UUID。
    await waitFor(() => expect(screen.getByText('ord_20260101000000_ABCDEF12')).toBeInTheDocument())
    expect(screen.queryByText('ord_1')).toBeNull()
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
          makeOrder({
            id: 'ord_no_receipt',
            orderNo: 'ord_no_receipt_no',
            receiptKey: null,
          }),
          makeOrder({
            id: 'ord_with_receipt',
            orderNo: 'ord_with_receipt_no',
            receiptKey: 'manual-payment-receipts/ord_with_receipt',
          }),
        ],
        total: 2,
      },
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('ord_no_receipt_no')).toBeInTheDocument())
    expect(screen.getByText('ord_with_receipt_no')).toBeInTheDocument()
    const img = screen.getByAltText('付款凭证') as HTMLImageElement
    // key 不暴露给客户端：src 只有端点路径，不含任何 R2 key。
    expect(img.src).toContain('/api/manual-payments/orders/ord_with_receipt/receipt')
    expect(img.src).not.toContain('manual-payment-receipts')
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
        qrImageKey: 'manual-payment-qrcodes/alipay_main',
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
      <AdminConsoleLayout locale="zh" session={sessionWith(role)}>
        <div>内容区</div>
      </AdminConsoleLayout>,
    )
  }

  it('持 admin.* 权限且模块开启时显示入口', () => {
    renderLayout('admin')
    expect(screen.getByText('核销审核')).toBeInTheDocument()
  })

  it('不持任何 admin.* 权限时不显示入口', () => {
    renderLayout('user')
    expect(screen.queryByText('核销审核')).toBeNull()
  })

  it('editor 只持内容权限时照样能进入管理台（侧栏不做权限过滤）', () => {
    // 管理台入口判定是「任意 admin.* 权限」，所以 editor / viewer 都进得来。
    // 侧栏目前不做逐项权限过滤：数据访问由每个 server function 的权限点把守，
    // 点进去拿不到数据即 403。逐项隐藏留给后续任务，这里只钉住「不再因角色被挡」。
    render(
      <AdminConsoleLayout
        locale="zh"
        session={{ ...sessionWith('user'), permissions: ['admin.content.read'] }}
      >
        <div>内容区</div>
      </AdminConsoleLayout>,
    )
    expect(screen.getByText('内容区')).toBeInTheDocument()
  })

  it('模块关闭时不显示入口', () => {
    websiteConfig.manualPayments.enabled = false
    renderLayout('admin')
    expect(screen.queryByText('核销审核')).toBeNull()
  })

  it('面包屑识别核验队列页', () => {
    routerMocks.pathname = '/zh/admin/manual-payments'
    renderLayout('admin')
    const nav = screen.getByRole('navigation', { name: 'breadcrumb' })
    expect(within(nav).getByText('核销订单核验')).toBeInTheDocument()
  })
})
