import { expect, test } from '@playwright/test'

/**
 * E2E: 身份认证页面
 *
 * 覆盖默认配置（`src/config/website.ts`）下的真实用户路径。默认 `auth.requireEmailVerification`
 * 为 false（模板未接邮件，`mail.enabled: false`），better-auth 在注册时**自动登录**——
 * 这是模板开箱即用的路径，也是唯一能在 E2E 里端到端跑通的路径（没有真实 SMTP）。
 *
 * 注意二者并非因果：`requireEmailVerification` 是显式安全控制，**不**跟随 `mail.enabled`。
 * 默认取 false 只是为了让未接邮件的模板可用；接上邮件后应改为 true。
 *
 * 邮件开启后的「注册成功 ≠ 可登录」分支由 `tests/unit/auth-flow.test.ts` 与
 * `tests/unit/module-access.test.ts` 覆盖；E2E 不写真实 `.env` 切换开关。
 *
 * 注册用的邮箱带随机后缀：本地 D1 跨多次运行保留数据，固定邮箱第二次会命中
 * 「已存在」的通用响应，让断言失去意义。
 */

const PASSWORD = 'e2e-password-12345'

/**
 * 等认证页真正可交互再操作。
 *
 * 提交按钮在水合前是禁用的（见 `SubmitButton`——否则点击会退化为原生 GET，把密码写进
 * URL）。Playwright 的 `click()` 会等元素可点，但这里显式等待更贴近真实用户，
 * 也让失败信息指向「页面没水合」而不是「按钮点不动」。
 *
 * **必须在 `fill()` 之前调用。** 表单由 TanStack Form 驱动，输入框是**受控**的：
 * 水合前填进去的值会被 React 接管时的首次渲染重置回默认值，于是提交的是空表单。
 * 按钮的 `disabled` 恰好是「水合完成」的信号——先等它可点，再填字段。
 */
async function waitForForm(page: import('@playwright/test').Page) {
  // 所有认证页都只有一个提交按钮，按类型取比列举文案更稳（文案会随语言变）。
  await expect(page.locator('button[type="submit"]').first()).toBeEnabled({ timeout: 15000 })
}

test.describe('Auth pages', () => {
  test('未登录时导航栏提供登录入口', async ({ page }) => {
    await page.goto('/zh')
    await expect(
      page.getByRole('navigation').first().getByRole('link', { name: '登录', exact: true }),
    ).toHaveAttribute('href', '/zh/auth/login')
  })

  test('登录页渲染表单，并把注册与忘记密码都链到正确路径', async ({ page }) => {
    await page.goto('/zh/auth/login')
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()
    await expect(page.getByLabel('邮箱')).toBeVisible()
    await expect(page.getByLabel('密码')).toBeVisible()
    await expect(page.getByRole('link', { name: '立即注册' })).toHaveAttribute(
      'href',
      '/zh/auth/register',
    )
    await expect(page.getByRole('link', { name: '忘记密码？' })).toHaveAttribute(
      'href',
      '/zh/auth/forgot-password',
    )
  })

  test('字段级校验在提交前拦下非法输入，不发起请求', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
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
    expect(consoleErrors, '不应有 console 错误').toEqual([])
    expect(authCalls, '字段校验未通过时不应请求 better-auth').toBe(0)
  })

  test('SSR 输出里提交按钮已禁用，避免水合前密码经原生 GET 进入 URL', async ({ request }) => {
    const html = await (await request.get('/zh/auth/login')).text()
    expect(html, 'SSR 输出里提交按钮必须带 disabled 属性').toMatch(
      /<button[^>]*type="submit"[^>]*\sdisabled(?:=|[\s>])/,
    )
  })

  test('注册 → 自动登录 → 用户菜单显示邮箱 → 登出', async ({ page }) => {
    // 后缀加随机段：`fullyParallel` 下同一文件多个 test 会在同一毫秒起步，
    // 仅用 `Date.now()` 会撞邮箱，后到的注册撞 UNIQUE 约束而永不跳转。
    const email = `e2e-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
    await page.goto('/zh/auth/register')

    await waitForForm(page)
    await page.getByLabel('昵称').fill('E2E 用户')
    await page.getByLabel('邮箱').fill(email)
    await page.getByLabel('密码（≥ 8 字符）').fill(PASSWORD)
    await page.getByRole('button', { name: '注册' }).click()

    // 默认配置不要求邮箱验证，better-auth 直接下发会话：注册后回到首页且已登录。
    await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
    const trigger = page.getByRole('button', { name: 'E2E 用户' })
    await expect(trigger).toBeVisible()
    await trigger.click()
    await expect(page.getByText(email)).toBeVisible()

    await page.getByText('退出登录').click()
    await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
    await expect(
      page.getByRole('navigation').first().getByRole('link', { name: '登录', exact: true }),
    ).toBeVisible()
  })

  test('未登录时访问忘记密码页可提交，且不泄漏邮箱是否存在', async ({ page }) => {
    await page.goto('/zh/auth/forgot-password')
    await waitForForm(page)
    await page.getByLabel('邮箱').fill(`nobody-${Date.now()}@example.com`)
    await page.getByRole('button', { name: '发送重置链接' }).click()
    await expect(page.getByText(/如果邮箱存在/)).toBeVisible()
  })

  test('缺少 token 时重置页先渲染表单，提交后才跳转错误页', async ({ page }) => {
    // token 只在提交时读取（`resetPassword` 需要它），因此页面加载本身不跳转——
    // 直接访问时用户看到的是表单，提交才会被送去错误页。
    await page.goto('/zh/auth/reset-password')
    await waitForForm(page)
    await page.getByLabel('新密码（≥ 8 字符）').fill(PASSWORD)
    await page.getByRole('button', { name: '提交' }).click()
    await expect(page).toHaveURL(/\/zh\/auth\/error/)
  })

  test('验证链接无效时落地页给出提示', async ({ page }) => {
    await page.goto('/zh/auth/verify-email?error=INVALID_TOKEN')
    await expect(page.getByText('验证链接无效或已过期。')).toBeVisible()
  })

  test('英文 locale 下的登录页使用英文文案', async ({ page }) => {
    await page.goto('/en/auth/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
  })
})
