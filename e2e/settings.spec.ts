import { expect, test } from '@playwright/test'

/**
 * E2E: 工作台 `/dashboard/*`
 *
 * 只守四条跨页面旅程：路由守卫、默认落点、资料读写落到 D1、登出后会话失效。
 * 侧栏折叠、菜单层叠、面包屑结构等界面细节由 `tests/components/settings-layout.test.tsx`
 * 与 `tests/components/user-menu.test.tsx` 覆盖（见 `AGENT.md`「测试分层」）。
 *
 * 默认配置下 `newsletter` 模块关闭，因此「通知偏好」入口不出现——据此断言菜单随模块
 * 门禁收敛，而不是写死入口数量。
 *
 * 注册邮箱后缀必须**跨 worker 唯一**，不能只用 `Date.now()`：`fullyParallel: true` 会把
 * 同一文件里的多个 test 分给不同 worker，它们在同一毫秒起步，`Date.now()` 会撞成同一个
 * 邮箱，后到的注册撞上 `UNIQUE constraint failed: users.email` 而永远不跳转。
 */

const PASSWORD = 'e2e-password-12345'

/** 等认证页真正可交互再操作；受控输入框必须先水合再填（见 auth.spec.ts 的说明）。 */
async function waitForForm(page: import('@playwright/test').Page) {
  await expect(page.locator('button[type="submit"]').first()).toBeEnabled({ timeout: 15000 })
}

/** 注册并回到首页，返回使用的邮箱。 */
async function register(page: import('@playwright/test').Page) {
  const email = `settings-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
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
    await page.goto('/zh/dashboard/profile')
    await page.waitForURL(/\/zh\/auth\/login/)
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()
  })

  test('/dashboard 落到资料板块，导航随模块门禁收敛', async ({ page }) => {
    await register(page)
    await page.goto('/zh/dashboard')
    await page.waitForURL(/\/zh\/dashboard\/profile/)

    // 昵称输入框带出当前会话的昵称——页面读的是真实会话而不是空壳。
    await expect(page.getByRole('textbox', { name: '昵称' })).toHaveValue('设置用户')
    // 默认未接 newsletter，「通知偏好」入口不应出现；其余两项恒在。
    await expect(page.getByRole('link', { name: '安全' })).toBeVisible()
    await expect(page.getByRole('link', { name: '登录设备' })).toBeVisible()
    await expect(page.getByRole('link', { name: '通知偏好' })).toHaveCount(0)
  })

  test('改昵称后刷新仍为新值', async ({ page }) => {
    await register(page)
    await page.goto('/zh/dashboard/profile')
    await waitForForm(page)

    // 昵称输入框用 `role` 定位而非 `getByLabel`：侧栏用户卡片的触发按钮带
    // `aria-label={name}`，卡片名字会变（这里是「新昵称」），与输入框标签「昵称」
    // 存在子串重叠，`getByLabel('昵称')` 会同时命中按钮和输入框。
    const nameField = page.getByRole('textbox', { name: '昵称' })
    await nameField.fill('新昵称')
    await page.getByRole('button', { name: '保存' }).click()
    // 成功提示走全局 toast（`src/routes/__root.tsx` 挂的 `Toaster`），不再是表单内
    // 的 `role="status"`。按文案断言，避免把测试绑到 toast 的内部结构上。
    await expect(page.getByText('昵称已更新。')).toBeVisible({ timeout: 15000 })

    // 刷新走的是服务端回读：验证写入真的落到了 D1，而不是只改了本地状态。
    await page.reload()
    await expect(nameField).toHaveValue('新昵称')
  })

  test('登出后再次访问个人中心被重定向', async ({ page }) => {
    await register(page)
    await expect(page).toHaveURL(/\/zh$|\/$/)

    // 登出入口在侧栏底部用户卡片，得先离开首页进工作台：`dashboard` 是 `_layout`
    // 路由、不渲染营销导航栏，首页顶栏的 `UserMenu` 在这里并不存在。
    await page.goto('/zh/dashboard/profile')
    // 等 hydration 完成再点卡片：React 刚接管首帧时事件处理器还没绑定，弹窗不会出现。
    await page.waitForLoadState('networkidle')
    const sidebar = page.locator('[data-slot="sidebar"]')
    await sidebar.getByRole('button', { name: /设置用户/ }).click()

    // 定位用页面级而非侧栏级：`Menu.Portal` 把弹出层挂到 body 下，并非侧栏的 DOM 后代。
    const logout = page.getByRole('menuitem', { name: '退出登录' })
    await logout.waitFor()
    await logout.click()
    // 登出会整页跳转（`window.location.assign('/')`）。等导航真正落地再继续——
    // 只等 URL 变化会撞上仍在进行的导航，随后的 `goto` 直接被 abort。
    await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
    await page.waitForLoadState('load')

    await page.goto('/zh/dashboard/profile')
    await page.waitForURL(/\/zh\/auth\/login/)
  })
})
