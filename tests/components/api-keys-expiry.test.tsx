import { render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '@/locale/paraglide/runtime.js'
import { Route as ApiKeysRoute } from '@/routes/{-$locale}/_layout/dashboard/api-keys'

/**
 * API 密钥创建弹窗的**有效期选择**回归。
 *
 * 三条要守的行为：
 *
 * 1. 默认选中 30 天（不是「永不过期」）——默认值本身就是一条安全决策；
 * 2. `expiresIn` 以**秒**传给插件，`null` 表示永不过期。单位错了页面看起来一切正常，
 *    只是密钥会在 30 秒后失效；
 * 3. 成功后表单归零，下一次创建重新从默认有效期开始——否则用户会拿一个陌生的有效期
 *    建出密钥，而这个弹窗是唯一展示「当前选择」的地方。
 */

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/auth/client', () => ({
  authClient: {
    apiKey: {
      create: (...args: unknown[]) => mocks.create(...args),
      list: (...args: unknown[]) => mocks.list(...args),
      delete: (...args: unknown[]) => mocks.delete(...args),
    },
  },
}))

const SECONDS_PER_DAY = 86_400

// 路由组件只通过 `Route.options.component` 暴露（页面未单独导出）。
const ApiKeysPage = ApiKeysRoute.options.component as unknown as () => React.JSX.Element

/** 渲染页面并打开创建弹窗，返回有效期下拉。 */
async function openCreateDialog(): Promise<HTMLSelectElement> {
  render(<ApiKeysPage />)
  await waitFor(() => expect(mocks.list).toHaveBeenCalled())
  screen.getAllByRole('button', { name: '创建密钥' })[0]?.click()
  // `findByLabelText` 的返回类型是 HTMLElement；此处已知是 `<select>`。
  return (await screen.findByLabelText('有效期')) as unknown as HTMLSelectElement
}

/**
 * 用原生 setter 改写 `<select>` 的值并派发 `change`。
 *
 * 直接赋值 `element.value = …` 不触发 React：React 在控件上挂了 value 存取器并覆写了
 * setter，绕过它的赋值只改 DOM 不改实例，受控值下一帧就被 React 改回去。
 */
function selectValue(element: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

/** 填入名称并提交。同理，input 也要走原生 setter。 */
function submitWithName(name: string) {
  const input = screen.getByLabelText('名称') as unknown as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, name)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  screen.getByRole('button', { name: '创建' }).click()
}

beforeEach(() => {
  setLocale('zh', { reload: false })
  mocks.list.mockReset()
  mocks.create.mockReset()
  mocks.delete.mockReset()
  // 列表必须有返回，否则页面停在 loading，拿不到创建按钮。
  mocks.list.mockResolvedValue({ data: { apiKeys: [] }, error: null })
  mocks.create.mockResolvedValue({ data: { key: 'key_test' }, error: null })
})
afterEach(() => {
  setLocale('en', { reload: false })
})

describe('API 密钥有效期', () => {
  it('默认选中 30 天', async () => {
    expect((await openCreateDialog()).value).toBe('30')
  })

  it('未改动时按默认 30 天换算秒传给插件', async () => {
    await openCreateDialog()
    submitWithName('CI 部署')

    await waitFor(() => expect(mocks.create).toHaveBeenCalled())
    expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
      name: 'CI 部署',
      expiresIn: 30 * SECONDS_PER_DAY,
    })
  })

  it('选「永不过期」时传 null', async () => {
    const select = await openCreateDialog()
    selectValue(select, 'never')
    submitWithName('长期集成')

    await waitFor(() => expect(mocks.create).toHaveBeenCalled())
    expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
      name: '长期集成',
      expiresIn: null,
    })
  })

  it('选 90 天时换算成对应的秒数', async () => {
    const select = await openCreateDialog()
    selectValue(select, '90')
    submitWithName('季度')

    await waitFor(() => expect(mocks.create).toHaveBeenCalled())
    expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
      expiresIn: 90 * SECONDS_PER_DAY,
    })
  })

  it('提供 30 / 90 / 365 天与「永不过期」四个选项', async () => {
    const select = await openCreateDialog()
    const values = Array.from(select.querySelectorAll('option')).map((el) =>
      el.getAttribute('value'),
    )
    expect(values).toEqual(['30', '90', '365', 'never'])
  })

  it('成功后有效期回到默认值，不把上次的选择带给下一次创建', async () => {
    const select = await openCreateDialog()
    selectValue(select, '90')
    submitWithName('下一次')

    // 明文展示弹窗出现，说明创建已成功；创建弹窗已在提交时关闭。
    await waitFor(() => expect(screen.getByText('密钥已创建')).toBeInTheDocument())
    screen.getByRole('button', { name: '完成' }).click()

    // 重新打开创建弹窗：有效期应回到 30 天，而不是残留上次的 90 天。
    const reopened = await openCreateDialog()
    expect(reopened.value).toBe('30')
  })
})
