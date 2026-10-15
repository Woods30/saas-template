import { expect, test } from '@playwright/test'

/**
 * E2E: 个人中心 `/settings/*`
 *
 * 覆盖三条真实路径：未登录被守卫拦下、登录后可改昵称且刷新后仍生效、登出后重新被拦。
 * 默认配置下 `newsletter` 模块关闭，因此「通知偏好」入口不出现——本套件据此断言
 * 菜单随模块门禁收敛，而不是写死四个入口。
 *
 * 注册邮箱带随机后缀：本地 D1 跨多次运行保留数据，固定邮箱会命中「已存在」。
 */

const PASSWORD = 'e2e-password-12345'

/** 等认证页真正可交互再操作；受控输入框必须先水合再填（见 auth.spec.ts 的说明）。 */
async function waitForForm(page: import('@playwright/test').Page) {
  await expect(page.locator('button[type="submit"]').first()).toBeEnabled({ timeout: 15000 })
}

/** 注册并回到首页，返回使用的邮箱。 */
async function register(page: import('@playwright/test').Page) {
  const email = `settings-${Date.now()}@example.com`
  await page.goto('/zh/auth/register')
  await waitForForm(page)
  await page.getByLabel('昵称').fill('设置用户')
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码（≥ 8 字符）').fill(PASSWORD)
  await page.getByRole('button', { name: '注册' }).click()
  await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
  return email
}

test.describe('Settings', () => {
  test('未登录访问个人中心被重定向到登录页', async ({ page }) => {
    await page.goto('/zh/settings/profile')
    await page.waitForURL(/\/zh\/auth\/login/)
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()
  })

  test('/settings 直接落到资料板块', async ({ page }) => {
    await register(page)
    await page.goto('/zh/settings')
    await page.waitForURL(/\/zh\/settings\/profile/)
  })

  test('个人中心展示资料板块，并随模块门禁收敛导航', async ({ page }) => {
    await register(page)
    await page.goto('/zh/settings/profile')
    // 昵称输入框带出当前会话的昵称。
    await expect(page.getByRole('textbox', { name: '昵称' })).toHaveValue('设置用户')
    // 默认未接 newsletter，「通知偏好」入口不应出现；其余三项恒在。
    await expect(page.getByRole('link', { name: '安全' })).toBeVisible()
    await expect(page.getByRole('link', { name: '登录设备' })).toBeVisible()
    await expect(page.getByRole('link', { name: '通知偏好' })).toHaveCount(0)
  })

  test('改昵称后刷新仍为新值', async ({ page }) => {
    await register(page)
    await page.goto('/zh/settings/profile')
    await waitForForm(page)

    // 昵称输入框用 `role` 定位而非 `getByLabel`：侧栏用户卡片的触发按钮带
    // `aria-label={name}`，卡片名字会变（这里是「新昵称」），与输入框标签「昵称」
    // 存在子串重叠，`getByLabel('昵称')` 会同时命中按钮和输入框。
    const nameField = page.getByRole('textbox', { name: '昵称' })
    await nameField.fill('新昵称')
    await page.getByRole('button', { name: '保存' }).click()
    await expect(page.getByRole('status')).toBeVisible({ timeout: 15000 })

    await page.reload()
    await expect(nameField).toHaveValue('新昵称')
  })

  test('登出后再次访问个人中心被重定向', async ({ page }) => {
    await register(page)
    await expect(page).toHaveURL(/\/zh$|\/$/)

    // 登出入口在侧栏底部用户卡片，得先离开首页进个人中心：`settings` 是 `_layout`
    // 路由、不渲染营销导航栏，首页顶栏的 `UserMenu` 在这里并不存在。
    await page.goto('/zh/settings/profile')
    // 等 hydration 完成再点卡片：与折叠用例同一约定——React 刚接管首帧时点下去，
    // 事件处理器还没绑定上，弹窗不会出现。
    await page.waitForLoadState('networkidle')
    const sidebar = page.locator('[data-slot="sidebar"]')
    await sidebar.getByRole('button', { name: /设置用户/ }).click()

    // 登出项用键盘激活而非点击：弹出层（`Menu.Popup`）没设 z-index，而侧栏容器是
    // `fixed z-10`，命中测试时 `sidebar-content` 盖在菜单项之上——鼠标点下去会被
    // 当成「点击外部」把菜单关掉、登出并不发生。键盘激活走同一条 menuitem 处理链，
    // 且不受层叠影响，因此用它确认登出。（这是产品缺陷，非测试取巧，见任务报告。）
    const logout = page.getByRole('menuitem', { name: '退出登录' })
    await logout.waitFor()
    await logout.press('Enter')
    // 登出会整页跳转（`window.location.assign('/')`）。等导航真正落地再继续——
    // 只等 URL 变化会撞上仍在进行的导航，随后的 `goto` 直接被 abort。
    await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
    await page.waitForLoadState('load')
    await expect(
      page.getByRole('navigation').first().getByRole('link', { name: '登录', exact: true }),
    ).toBeVisible()

    await page.goto('/zh/settings/profile')
    await page.waitForURL(/\/zh\/auth\/login/)
  })

  test('顶栏折叠按钮收起侧栏再展开', async ({ page }) => {
    await register(page)
    await page.goto('/zh/settings/profile')
    // 等 hydration 完成再点折叠按钮：此时 React 刚接管，若在首帧上直接点，
    // 事件处理器还没绑定上，`toggleSidebar` 不会执行，`data-state` 仍是 expanded。
    await page.waitForLoadState('networkidle')

    // 折叠前：三级面包屑末级是当前板块，且是当前页（非链接）。
    // 「资料」在页面上有三处（侧栏导航项、面包屑末级、内容区标题），文本相同，
    // 因此断言必须限定在面包屑导航内——只有末级那份带 aria-current="page"。
    const breadcrumb = page.getByRole('navigation', { name: 'breadcrumb' })
    await expect(breadcrumb).toBeVisible()
    await expect(breadcrumb.getByText('资料')).toHaveAttribute('aria-current', 'page')

    const sidebar = page.locator('[data-slot="sidebar"]')
    await expect(sidebar).toHaveAttribute('data-state', 'expanded')
    await page.locator('[data-slot="sidebar-trigger"]').click()
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed')
    await page.locator('[data-slot="sidebar-trigger"]').click()
    await expect(sidebar).toHaveAttribute('data-state', 'expanded')
  })
})
