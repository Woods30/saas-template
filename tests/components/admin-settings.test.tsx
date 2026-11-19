import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettingsValues, SETTING_TABS } from '@/core/config/registry'
import { setLocale } from '@/locale/paraglide/runtime.js'
import { Route as AdminSettingsRoute } from '@/routes/{-$locale}/_layout/admin/settings'

/**
 * 系统设置页：tab 导航、每 tab 一个保存按钮、可折叠分组与按 tab 提交。
 *
 * server function 只 mock 定义它的模块（`@/core/config/admin`），页面走真实渲染。
 */
const mocks = vi.hoisted(() => ({
  fetchAdminSettings: vi.fn(),
  saveAdminSettings: vi.fn(),
  testAdminConnection: vi.fn(),
}))

vi.mock('@/core/config/admin', () => ({
  fetchAdminSettings: mocks.fetchAdminSettings,
  saveAdminSettings: mocks.saveAdminSettings,
  testAdminConnection: mocks.testAdminConnection,
}))

const AdminSettingsPage = AdminSettingsRoute.options.component as unknown as () => React.JSX.Element

beforeEach(() => {
  setLocale('zh', { reload: false })
  mocks.fetchAdminSettings.mockImplementation(async () => structuredClone(defaultSettingsValues()))
  mocks.saveAdminSettings.mockResolvedValue({ saved: 'general' })
  mocks.testAdminConnection.mockResolvedValue({ ok: true, message: 'ok' })
})

/** 渲染并等到首个 tab 的字段出现，避免在 Spinner 阶段断言。 */
async function renderPage() {
  render(<AdminSettingsPage />)
  await screen.findByLabelText('品牌名')
}

/** 注册表里某个 tab 的全部字段键，按声明顺序。 */
function tabFieldKeys(tabId: string): string[] {
  const tab = SETTING_TABS.find((item) => item.id === tabId)
  if (!tab) throw new Error(`未知 tab: ${tabId}`)
  return tab.groups.flatMap((group) => group.fields.map((field) => field.key))
}

describe('系统设置页', () => {
  it('切换 tab 只显示该 tab 的分组', async () => {
    await renderPage()
    expect(screen.getByText('品牌')).toBeInTheDocument()
    expect(screen.queryByText('默认角色')).toBeNull()

    // 草稿按 tab 保存：改完切走再切回来，未保存的输入还在。
    fireEvent.change(screen.getByLabelText('品牌名'), { target: { value: '新品牌' } })

    fireEvent.click(screen.getByRole('tab', { name: '用户' }))
    expect(await screen.findByText('默认角色')).toBeInTheDocument()
    expect(screen.queryByText('品牌')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: '基础与外观' }))
    expect(await screen.findByLabelText('品牌名')).toHaveValue('新品牌')
  })

  it('一个 tab 只有一个保存按钮', async () => {
    await renderPage()
    // 基础与外观有 3 个分组；若退回按卡片保存，这里会出现 3 个按钮。
    expect(screen.getAllByRole('button', { name: '保存' })).toHaveLength(1)

    fireEvent.click(screen.getByRole('tab', { name: '用户' }))
    await screen.findByText('默认角色')
    expect(screen.getAllByRole('button', { name: '保存' })).toHaveLength(1)
  })

  it('保存提交 tabId 与该 tab 全部字段', async () => {
    await renderPage()
    fireEvent.change(screen.getByLabelText('品牌名'), { target: { value: '新品牌' } })

    // 收起 SEO 分组：保存仍须带上它里面的字段。
    const seo = screen.getByRole('button', { name: 'SEO' })
    fireEvent.click(seo)
    await waitFor(() => expect(seo).toHaveAttribute('aria-expanded', 'false'))

    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.saveAdminSettings).toHaveBeenCalledTimes(1))

    const call = mocks.saveAdminSettings.mock.calls[0]?.[0] as {
      data: { tabId: string; values: Record<string, unknown> }
    }
    expect(call.data.tabId).toBe('general')
    expect(Object.keys(call.data.values).sort()).toEqual(tabFieldKeys('general').sort())
    expect(call.data.values['brand.name']).toBe('新品牌')
    // 来自已收起卡片的值没有丢。
    expect(call.data.values['seo.default.title']).toBe('Jerbix')
    expect(call.data.values['seo.default.keywords']).toEqual([])
  })

  it('分组可以折叠与展开', async () => {
    await renderPage()
    const trigger = screen.getByRole('button', { name: '品牌' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('品牌名')).toBeInTheDocument()

    fireEvent.click(trigger)
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'))
    expect(screen.queryByLabelText('品牌名')).toBeNull()

    fireEvent.click(trigger)
    await waitFor(() => expect(screen.getByLabelText('品牌名')).toBeInTheDocument())
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('json 字段未修改时按原值提交', async () => {
    const accounts = [
      {
        id: 'alipay_main',
        channel: 'alipay',
        displayName: '主收款账户',
        currency: 'cny',
        qrImageUrl: '/qr/alipay.png',
      },
    ]
    mocks.fetchAdminSettings.mockImplementation(async () => ({
      ...structuredClone(defaultSettingsValues()),
      'manualPayments.accounts': structuredClone(accounts),
    }))

    await renderPage()
    fireEvent.click(screen.getByRole('tab', { name: '支付' }))

    // 服务端结构要渲染成可编辑的 JSON 文本，而不是 `[object Object]`。
    const textarea = await screen.findByLabelText('收款账户')
    expect(textarea).toHaveValue(JSON.stringify(accounts, null, 2))

    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.saveAdminSettings).toHaveBeenCalledTimes(1))

    const call = mocks.saveAdminSettings.mock.calls[0]?.[0] as {
      data: { tabId: string; values: Record<string, unknown> }
    }
    expect(call.data.tabId).toBe('payment')
    expect(call.data.values['manualPayments.accounts']).toEqual(accounts)
  })

  it('json 字段编辑后按文本解析', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('tab', { name: '支付' }))

    const edited = [
      {
        id: 'bank_main',
        channel: 'bank',
        displayName: '银行账户',
        currency: 'cny',
        qrImageUrl: '/qr/bank.png',
      },
    ]
    fireEvent.change(await screen.findByLabelText('收款账户'), {
      target: { value: JSON.stringify(edited) },
    })

    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.saveAdminSettings).toHaveBeenCalledTimes(1))

    const call = mocks.saveAdminSettings.mock.calls[0]?.[0] as {
      data: { tabId: string; values: Record<string, unknown> }
    }
    expect(call.data.values['manualPayments.accounts']).toEqual(edited)
  })

  it('保存一个 tab 不清空其它 tab 的未保存草稿', async () => {
    await renderPage()
    fireEvent.change(screen.getByLabelText('品牌名'), { target: { value: '草稿品牌' } })

    fireEvent.click(screen.getByRole('tab', { name: '用户' }))
    fireEvent.change(await screen.findByLabelText('赠送数量'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.saveAdminSettings).toHaveBeenCalledTimes(1))

    // 保存「用户」后回「基础与外观」，之前的品牌名草稿仍在。
    fireEvent.click(screen.getByRole('tab', { name: '基础与外观' }))
    expect(await screen.findByLabelText('品牌名')).toHaveValue('草稿品牌')
  })

  it('custom tab 不渲染注册表字段', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('tab', { name: '自定义配置' }))

    expect(await screen.findByText(/自定义键值配置/)).toBeInTheDocument()
    // 注册表字段一个都不能出现；自定义面板由 Task 8 接管。
    expect(screen.queryByLabelText('品牌名')).toBeNull()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })
})
