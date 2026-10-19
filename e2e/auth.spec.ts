import { expect, test } from '@playwright/test'

/**
 * E2E: 身份认证（只守核心旅程）
 *
 * 取舍依据见 `AGENT.md` 的「测试分层」：E2E 只写需要真实浏览器 + 真实服务端才能验证的
 * 路径。因此这里保留两条：
 * - 注册 → 自动登录 → 用户菜单 → 登出（跨页面、真实会话 cookie）；
 * - 字段校验在提交前拦下非法输入（守「水合前不退化原生 GET」这一安全边界）。
 *
 * 以下内容已下沉，不再在 E2E 重复：
 * - SSR 输出里提交按钮禁用 → `tests/components/auth-form.test.tsx`
 * - 页面文案 / 链接 href / 英文 locale 文案 → 组件测试与 `tests/unit/locale-*`
 * - 忘记密码、重置密码、验证链接的错误分支 → `tests/unit/auth-flow.test.ts`
 *
 * 默认 `auth.requireEmailVerification` 为 false（模板未接邮件，`mail.enabled: false`），
 * better-auth 在注册时**自动登录**——这是模板开箱即用的路径，也是唯一能在 E2E 里端到端
 * 跑通的路径（没有真实 SMTP）。二者并非因果：`requireEmailVerification` 是显式安全控制，
 * 不跟随 `mail.enabled`。
 *
 * 注册用的邮箱带随机后缀：本地 D1 跨多次运行保留数据，固定邮箱第二次会命中「已存在」的
 * 通用响应，让断言失去意义；后缀还需跨 worker 唯一（`fullyParallel` 下 `Date.now()` 会撞）。
 */

const PASSWORD = 'e2e-password-12345'

/**
 * 等认证页真正可交互再操作。
 *
 * 提交按钮在水合前是禁用的（见 `SubmitButton`——否则点击会退化为原生 GET，把密码写进
 * URL）。**必须在 `fill()` 之前调用**：表单由 TanStack Form 驱动，输入框是受控的，水合前
 * 填进去的值会被 React 接管时的首次渲染重置回默认值。
 */
async function waitForForm(page: import('@playwright/test').Page) {
  // 所有认证页都只有一个提交按钮，按类型取比列举文案更稳（文案会随语言变）。
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

    // 默认配置不要求邮箱验证，better-auth 直接下发会话：注册后回到首页且已登录。
    await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
    // 15s 而非默认 5s：冷启动（vite 首次编译 `/api/auth/get-session`）下，页面已经
    // 跳到 `/zh`，但会话请求还没回来，此时导航栏渲染的是未登录回退。这不是登录失败——
    // 断言放宽的是「等会话到达」的时间，不是结果。
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
