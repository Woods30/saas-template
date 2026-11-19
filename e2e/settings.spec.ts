import { expect, test } from '@playwright/test'
import { seedVerifiedUser } from '../scripts/e2e-seed-subscription'

/**
 * E2E: 工作台跨页面旅程（路由守卫、默认落点、资料落到 D1、登出后会话失效）。
 *
 * 注册邮箱后缀必须跨 worker 唯一：`fullyParallel` 下同一文件的多个 test 会在同一毫秒
 * 起步，只用 `Date.now()` 会撞成同一邮箱，后到者撞上 `UNIQUE constraint failed`。
 */

const PASSWORD = 'e2e-password-12345'

/** 等认证页可交互再操作；受控输入框必须先水合再填（见 auth.spec.ts）。 */
async function waitForForm(page: import('@playwright/test').Page) {
  await expect(page.locator('button[type="submit"]').first()).toBeEnabled({ timeout: 15000 })
}

/** 本地 D1 fixture 已验证账号，再走真实登录，不调用注册 / 发信接口。 */
async function login(page: import('@playwright/test').Page) {
  const email = `settings-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
  await seedVerifiedUser({ email, name: '设置用户', password: PASSWORD })
  await page.goto('/zh/auth/login')
  await waitForForm(page)
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
  return email
}

test.describe('Settings', () => {
  test('未登录访问个人中心被重定向到登录页', async ({ page }) => {
    await page.goto('/zh/settings/profile')
    await page.waitForURL(/\/zh\/auth\/login/)
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()
  })

  test('/settings 落到资料板块，导航随模块门禁收敛', async ({ page }) => {
    await login(page)
    await page.goto('/zh/settings')
    await page.waitForURL(/\/zh\/settings\/profile/)

    await expect(page.getByRole('textbox', { name: '昵称' })).toHaveValue('设置用户')
    await expect(page.getByRole('link', { name: '安全' })).toBeVisible()
    await expect(page.getByRole('link', { name: '登录设备' })).toBeVisible()
    await expect(page.getByRole('link', { name: '通知偏好' })).toHaveCount(0)
  })

  test('改昵称后刷新仍为新值', async ({ page }) => {
    await login(page)
    await page.goto('/zh/settings/profile')
    await waitForForm(page)

    // 用 `role` 而非 `getByLabel`：侧栏用户卡片按钮带 `aria-label={name}`，其名字会变，
    // 与输入框标签「昵称」存在子串重叠，`getByLabel('昵称')` 会同时命中两者。
    const nameField = page.getByRole('textbox', { name: '昵称' })
    await nameField.fill('新昵称')
    await page.getByRole('button', { name: '保存' }).click()
    // 提示走全局 toast，按文案断言，避免绑到 toast 内部结构。
    await expect(page.getByText('昵称已更新。')).toBeVisible({ timeout: 15000 })

    // 刷新走服务端回读，验证写入真的落到了 D1。
    await page.reload()
    await expect(nameField).toHaveValue('新昵称')
  })

  test('登出后再次访问个人中心被重定向', async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(/\/zh$|\/$/)

    // 登出入口在侧栏用户卡片：个人中心是独立路由树，首页顶栏的 `UserMenu`
    // 在这里并不存在，必须先进入个人中心。
    await page.goto('/zh/settings/profile')
    await page.waitForLoadState('networkidle')
    const sidebar = page.locator('[data-slot="sidebar"]')
    const trigger = sidebar.getByRole('button', { name: /设置用户/ })
    // 页面级定位：`Menu.Portal` 把弹出层挂到 body 下，不是侧栏的 DOM 后代。
    const logout = page.getByRole('menuitem', { name: '退出登录' })
    // 冷启动时事件处理器可能还没绑定，点了也不弹菜单：重试点击，已开则不再点
    // （再点会关掉）。与 hydration.spec.ts 同一套等待方式。
    await expect(async () => {
      if (await logout.isVisible()) return
      await trigger.click()
      await expect(logout).toBeVisible({ timeout: 500 })
    }).toPass({ timeout: 15000 })
    await logout.click()
    // 登出是整页跳转；只等 URL 变化会撞上仍在进行的导航，随后 `goto` 被 abort。
    await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
    await page.waitForLoadState('load')

    await page.goto('/zh/settings/profile')
    await page.waitForURL(/\/zh\/auth\/login/)
  })
})

/** 管理页是 SSR 直出的：按钮先在 HTML 里出现，事件要等水合才绑上。 */
async function waitForHydration(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle')
}

/** 造一个管理员并走真实登录。 */
async function loginAsAdmin(page: import('@playwright/test').Page) {
  const email = `settings-admin-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
  await seedVerifiedUser({
    email,
    name: '设置管理员',
    password: PASSWORD,
    role: 'admin',
  })
  await page.goto('/zh/auth/login')
  await waitForForm(page)
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
}

/** 九个分类的顺序与 `SETTING_TABS` 一致。 */
const ADMIN_SETTING_TABS = [
  '基础与外观',
  '用户',
  '内容',
  '认证与安全',
  '支付',
  '邮件',
  '分析',
  '通知',
  '自定义配置',
] as const

test.describe('Admin 系统设置', () => {
  // 自定义配置是全局表：多个用例并发写会互相覆盖，必须串行。
  test.describe.configure({ mode: 'serial' })

  test('九个分类 tab 全部渲染', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/zh/admin/settings')
    await waitForHydration(page)

    await expect(page.getByRole('tab')).toHaveCount(ADMIN_SETTING_TABS.length)
    for (const name of ADMIN_SETTING_TABS) {
      await expect(page.getByRole('tab', { name, exact: true })).toBeVisible()
    }
  })

  test('当前 tab 只有一个保存按钮', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/zh/admin/settings')
    await waitForHydration(page)

    // 默认落在第一个分类；未激活的 panel 不挂载（Base UI Tabs 默认 keepMounted=false），
    // 因此全页只应有一个保存按钮。
    await expect(page.getByRole('button', { name: '保存', exact: true })).toHaveCount(1)
    await page.getByRole('tab', { name: '支付', exact: true }).click()
    await expect(page.getByRole('button', { name: '保存', exact: true })).toHaveCount(1)
  })

  test('分组卡片可折叠，折叠后字段从页面消失', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/zh/admin/settings')
    await waitForHydration(page)

    const brandField = page.getByLabel('品牌名')
    await expect(brandField).toBeVisible()
    const trigger = page.getByRole('button', { name: '品牌', exact: true })
    await trigger.click()
    // Collapsible 默认不保留挂载：收起即卸载字段，而不只是视觉隐藏。
    await expect(brandField).toHaveCount(0)
    await trigger.click()
    await expect(brandField).toBeVisible()
  })

  test('自定义配置可新增、保存、刷新后回读并删除', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/zh/admin/settings')
    await waitForHydration(page)
    await page.getByRole('tab', { name: '自定义配置', exact: true }).click()
    // 面板挂载后自己拉一次列表；拉取未完成就点「新增条目」，随后的响应会把新行覆盖掉。
    await waitForHydration(page)

    const key = `e2e_${crypto.randomUUID().slice(0, 8)}`
    await page.getByRole('button', { name: '新增条目', exact: true }).click()
    // 新行追加在末尾；按位置取，避免受历史残留的 custom.* 行影响。
    const newRow = page.getByRole('row').last()
    await newRow.getByRole('textbox').nth(0).fill(key)
    await newRow.getByRole('textbox').nth(1).fill('e2e-value')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    // 提示走全局 toast，按文案断言，避免绑到 toast 内部结构。
    await expect(page.getByText('设置已保存').first()).toBeVisible({ timeout: 15000 })

    // 刷新走服务端回读，验证写入真的落到了 D1。
    await page.reload()
    await waitForHydration(page)
    await page.getByRole('tab', { name: '自定义配置', exact: true }).click()
    await waitForHydration(page)
    // 列表按存储键排序，行序不固定；按输入框的当前值找到目标行。
    const keyInputs = page.getByRole('textbox', { name: /^键 \d+$/ })
    await expect(keyInputs.first()).toBeVisible({ timeout: 15000 })
    let rowIndex = -1
    for (let i = 0; i < (await keyInputs.count()); i++) {
      if ((await keyInputs.nth(i).inputValue()) === key) {
        rowIndex = i
        break
      }
    }
    expect(rowIndex, '刷新后应能回读到刚保存的自定义键').toBeGreaterThanOrEqual(0)
    // `row` 含表头，数据行从第 2 个开始。
    const savedRow = page.getByRole('row').nth(rowIndex + 1)
    await expect(savedRow.getByRole('textbox').nth(1)).toHaveValue('e2e-value')

    await savedRow.getByRole('button', { name: '删除', exact: true }).click()
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByText('设置已保存').first()).toBeVisible({ timeout: 15000 })

    await page.reload()
    await waitForHydration(page)
    await page.getByRole('tab', { name: '自定义配置', exact: true }).click()
    await waitForHydration(page)
    const stillThere = await page
      .locator('input')
      .evaluateAll(
        (els, target) => els.some((el) => (el as HTMLInputElement).value === target),
        key,
      )
    expect(stillThere, '删除并保存后该键不应再出现在列表里').toBe(false)
  })
})
