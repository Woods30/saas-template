import { expect, test } from '@playwright/test'

/** E2E: 认证核心旅程（注册自动登录 → 登出；提交前校验）。 */

const PASSWORD = 'e2e-password-12345'

/**
 * 等认证页可交互再操作。提交按钮水合前禁用，且必须在 `fill()` 之前调用：
 * 受控输入框在水合前填入的值会被 React 接管时的首次渲染重置。
 */
async function waitForForm(page: import('@playwright/test').Page) {
  await expect(page.locator('button[type="submit"]').first()).toBeEnabled({ timeout: 15000 })
}

test.describe('Auth', () => {
  test('注册 → 自动登录 → 用户菜单显示邮箱 → 登出', async ({ page }) => {
    const email = `e2e-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
    await page.goto('/zh/auth/register')

    await waitForForm(page)
    await page.getByLabel('昵称').fill('E2E 用户')
    await page.getByLabel('邮箱').fill(email)
    await page.getByLabel('密码（≥ 8 字符）').fill(PASSWORD)
    await page.getByRole('button', { name: '注册' }).click()

    await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
    // 15s：冷启动时会话请求可能晚于导航返回，导航栏短暂渲染未登录回退。
    const trigger = page.getByRole('button', { name: 'E2E 用户' })
    await expect(trigger).toBeVisible({ timeout: 15000 })
    await trigger.click()
    await expect(page.getByText(email)).toBeVisible()

    await page.getByText('退出登录').click()
    await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
    await expect(
      page.getByRole('navigation').first().getByRole('link', { name: '登录', exact: true }),
    ).toBeVisible()
  })

  test('字段校验在提交前拦下非法输入，不发起请求', async ({ page }) => {
    await page.goto('/zh/auth/login')
    let authCalls = 0
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/')) authCalls++
    })

    await waitForForm(page)
    await page.getByLabel('邮箱').fill('not-an-email')
    await page.getByLabel('密码').fill('short')
    await page.getByRole('button', { name: '登录' }).click()

    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 15000 })
    expect(authCalls, '字段校验未通过时不应请求 better-auth').toBe(0)
  })
})
