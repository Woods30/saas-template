import { expect, test } from '@playwright/test'

/** E2E: 注册无 session → 未验证拒绝登录 → 本地捕获验证邮件 → 登录 → 登出。 */

const PASSWORD = 'e2e-password-12345'

/**
 * 等认证页可交互再操作。提交按钮水合前禁用，且必须在 `fill()` 之前调用：
 * 受控输入框在水合前填入的值会被 React 接管时的首次渲染重置。
 */
async function waitForForm(page: import('@playwright/test').Page) {
  await expect(page.locator('button[type="submit"]').first()).toBeEnabled({ timeout: 15000 })
}

test.describe('Auth', () => {
  test('注册不产生会话，未验证不能登录，验证邮件后登录并登出', async ({ page }) => {
    const email = `e2e-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
    await page.goto('/zh/auth/register')

    await waitForForm(page)
    await page.getByLabel('昵称').fill('E2E 用户')
    await page.getByLabel('邮箱').fill(email)
    await page.getByLabel('密码（≥ 8 字符）').fill(PASSWORD)
    await page.getByRole('button', { name: '注册' }).click()

    await expect(page.getByRole('heading', { name: '请查收邮件' })).toBeVisible()
    expect(await (await page.request.get('/api/auth/get-session')).json()).toBeNull()
    await page.goto('/zh/auth/login')
    await waitForForm(page)
    await page.getByLabel('邮箱').fill(email)
    await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
    const denied = page.waitForResponse((response) =>
      response.url().includes('/api/auth/sign-in/email'),
    )
    await page.getByRole('button', { name: '登录', exact: true }).click()
    expect((await denied).status()).toBe(403)
    await expect(page.getByRole('alert')).toContainText('请先验证邮箱')
    expect(await (await page.request.get('/api/auth/get-session')).json()).toBeNull()
    await page.goto('/zh/dashboard/profile')
    await expect(page).toHaveURL(/\/zh\/auth\/login/)

    let verificationURL = ''
    await expect(async () => {
      const response = await page.request.get('/__e2e/mail', { params: { email } })
      const { html } = (await response.json()) as { html: string | null }
      const href = html?.match(/href="([^"]*\/api\/auth\/verify-email[^"]*)"/)?.[1]
      expect(href, '本地捕获服务应收到真实模板生成的验证链接').toBeTruthy()
      verificationURL = href?.replaceAll('&amp;', '&') ?? ''
    }).toPass({ timeout: 15000 })
    expect(new URL(verificationURL).origin).toBe(new URL(page.url()).origin)
    await page.goto(verificationURL)
    await expect(
      page
        .getByRole('button', { name: '继续', exact: true })
        .or(page.getByRole('link', { name: '继续', exact: true })),
    ).toBeVisible()
    await page
      .getByRole('button', { name: '继续', exact: true })
      .or(page.getByRole('link', { name: '继续', exact: true }))
      .click()
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
