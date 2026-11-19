import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { seedVerifiedUser } from '../scripts/e2e-seed-subscription'

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
    await page.goto('/zh/settings/profile')
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

/** 管理页是 SSR 直出的：按钮先在 HTML 里出现，事件要等水合才绑上。 */
async function waitForHydration(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle')
}

async function loginAsAdmin(page: import('@playwright/test').Page) {
  const email = `auth-admin-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
  await seedVerifiedUser({ email, name: '认证管理员', password: PASSWORD, role: 'admin' })
  await page.goto('/zh/auth/login')
  await waitForForm(page)
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
}

/**
 * 把「邮箱登录」开关设成目标状态。
 *
 * 走真实后台保存而不是直接写 D1：保存会立刻失效进程内配置快照，下一个请求就生效；
 * 直接写库要等 30 秒 TTL，中间这段窗口里登录页仍按旧配置渲染。
 */
async function setEmailLogin(page: import('@playwright/test').Page, enabled: boolean) {
  await page.goto('/zh/admin/settings')
  await waitForHydration(page)
  await page.getByRole('tab', { name: '认证与安全', exact: true }).click()
  const toggle = page.getByRole('switch', { name: '邮箱登录' })
  await expect(toggle).toBeVisible({ timeout: 15000 })
  const checked = (await toggle.getAttribute('aria-checked')) === 'true'
  if (checked === enabled) return
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', String(enabled))
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('设置已保存').last()).toBeVisible({ timeout: 15000 })
}

/** 读本地 D1 里的邮箱登录开关；只用于 afterAll 兜底。 */
function readEmailLoginSetting(): string | undefined {
  try {
    const out = execFileSync(
      'wrangler',
      [
        'd1',
        'execute',
        'DB',
        '--local',
        '--json',
        '--command',
        "SELECT value FROM settings WHERE key = 'auth.emailEnabled'",
      ],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    return (JSON.parse(out) as Array<{ results?: Array<{ value?: string }> }>)[0]?.results?.[0]
      ?.value
  } catch {
    return undefined
  }
}

test.describe('Admin 认证方式开关', () => {
  // 关闭邮箱登录是全局配置，必须串行；用例本身也会改全局状态。
  test.describe.configure({ mode: 'serial' })

  /** 进入本组前的原值；`undefined` 表示库里没有该行（等价于注册表默认 `true`）。 */
  let originalEmailLogin: string | undefined

  test.beforeAll(() => {
    originalEmailLogin = readEmailLoginSetting()
  })

  test('GitHub 登录按钮按配置出现在登录页', async ({ page }) => {
    // `auth.githubEnabled` 与假凭据由 `e2e/global-setup.ts` 写入。
    await page.goto('/zh/auth/login')
    await waitForHydration(page)
    await expect(page.getByRole('button', { name: '使用 GitHub 继续' })).toBeVisible({
      timeout: 15000,
    })
  })

  test('关闭邮箱登录后登录页不再渲染邮箱表单', async ({ page }) => {
    await loginAsAdmin(page)
    try {
      await setEmailLogin(page, false)
      await page.goto('/zh/auth/login')
      await waitForHydration(page)
      // 邮箱表单整体卸载；社交登录按钮仍在，说明不是整页空白。
      await expect(page.getByLabel('邮箱')).toHaveCount(0)
      await expect(page.getByRole('button', { name: '使用 GitHub 继续' })).toBeVisible()
    } finally {
      // 兜底恢复：会话 cookie 还在，同页即可改回，不必重新登录。
      await setEmailLogin(page, true)
    }
  })

  /**
   * 再兜一层：若上面的 finally 本身失败（浏览器崩溃 / 超时），把 D1 恢复到本组开始
   * 前的值（`beforeAll` 读出；行不存在时按默认 `true` 写回）。
   *
   * 这条只保证**持久状态**正确；dev server 的进程内快照最多滞后 30 秒（TTL），
   * 因此它不是主要恢复路径——主要恢复在用例的 finally 里走后台保存。
   */
  test.afterAll(() => {
    const target = originalEmailLogin ?? 'true'
    if (readEmailLoginSetting() === target) return
    try {
      execFileSync(
        'wrangler',
        [
          'd1',
          'execute',
          'DB',
          '--local',
          '--command',
          `INSERT INTO settings (key, value, updated_at) VALUES ('auth.emailEnabled', '${target}', strftime('%s','now')) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        ],
        { stdio: 'ignore' },
      )
    } catch {
      // 写不进去就让后续用例暴露真正原因，别吞成静默绿灯。
    }
  })
})
