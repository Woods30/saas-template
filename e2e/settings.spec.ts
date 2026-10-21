import { expect, test } from '@playwright/test'

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

    await expect(page.getByRole('textbox', { name: '昵称' })).toHaveValue('设置用户')
    await expect(page.getByRole('link', { name: '安全' })).toBeVisible()
    await expect(page.getByRole('link', { name: '登录设备' })).toBeVisible()
    await expect(page.getByRole('link', { name: '通知偏好' })).toHaveCount(0)
  })

  test('改昵称后刷新仍为新值', async ({ page }) => {
    await register(page)
    await page.goto('/zh/dashboard/profile')
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
    await register(page)
    await expect(page).toHaveURL(/\/zh$|\/$/)

    // 登出入口在侧栏用户卡片：`dashboard` 是 `_layout` 路由，首页顶栏的 `UserMenu`
    // 在这里并不存在，必须先进入工作台。
    await page.goto('/zh/dashboard/profile')
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

    await page.goto('/zh/dashboard/profile')
    await page.waitForURL(/\/zh\/auth\/login/)
  })
})
