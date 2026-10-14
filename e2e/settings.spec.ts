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
    await expect(page.getByLabel('昵称')).toHaveValue('设置用户')
    // 默认未接 newsletter，「通知偏好」入口不应出现；其余三项恒在。
    await expect(page.getByRole('link', { name: '安全' })).toBeVisible()
    await expect(page.getByRole('link', { name: '登录设备' })).toBeVisible()
    await expect(page.getByRole('link', { name: '通知偏好' })).toHaveCount(0)
  })

  test('改昵称后刷新仍为新值', async ({ page }) => {
    await register(page)
    await page.goto('/zh/settings/profile')
    await waitForForm(page)

    await page.getByLabel('昵称').fill('新昵称')
    await page.getByRole('button', { name: '保存' }).click()
    await expect(page.getByRole('status')).toBeVisible({ timeout: 15000 })

    await page.reload()
    await expect(page.getByLabel('昵称')).toHaveValue('新昵称')
  })

  test('登出后再次访问个人中心被重定向', async ({ page }) => {
    await register(page)
    await expect(page).toHaveURL(/\/zh$|\/$/)

    // 个人中心是 `_layout` 路由，不渲染营销导航栏（与 docs 一致），
    // 因此登出入口在首页导航栏的用户菜单里。
    await page.getByRole('button', { name: '设置用户' }).click()
    await page.getByText('退出登录').click()
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
})
