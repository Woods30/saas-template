import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'

/**
 * E2E: 支付（只守核心旅程）。
 *
 * 不真的结账：真实 Stripe Checkout 需要银行卡与账号，CI 没有。改为直接写本地 D1
 * 复现「已订阅」状态，再走真实的 API / 页面。
 *
 * 未配置 Stripe 凭据时用例跳过而非失败：模板开箱没有凭据是正常配置，CI 上即为此情形。
 */

const PASSWORD = 'e2e-password-12345'

/** 等认证页可交互再填：受控输入框必须先水合（见 auth.spec.ts）。 */
async function waitForForm(page: import('@playwright/test').Page) {
  await expect(page.locator('button[type="submit"]').first()).toBeEnabled({ timeout: 15000 })
}

/** 注册并回到首页，返回邮箱。后缀含随机段，`fullyParallel` 下不会撞。 */
async function register(page: import('@playwright/test').Page): Promise<string> {
  const email = `pay-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
  await page.goto('/zh/auth/register')
  await waitForForm(page)
  await page.getByLabel('昵称').fill('支付用户')
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码（≥ 8 字符）').fill(PASSWORD)
  await page.getByRole('button', { name: '注册' }).click()
  await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
  return email
}

/**
 * 写本地 D1，失败重试。wrangler 与 dev server 共用同一个 SQLite 文件，并发写入会
 * 抢不到 session commit token（环境竞争，不是产品缺陷）；真写不进去就让用例失败。
 */
function seedSubscriptionWithRetry(email: string) {
  // 注册刚写过 users 表，先让 dev server 的请求落一落，降低 commit token 竞争。
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)

  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      execFileSync('pnpm', ['exec', 'tsx', 'scripts/e2e-seed-subscription.ts', email], {
        stdio: 'pipe',
        encoding: 'utf-8',
      })
      return
    } catch (error) {
      lastError = error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, (attempt + 1) * 300)
    }
  }
  throw lastError
}

/** 支付模块是否已配齐：未配齐时门禁先返回 503，配齐后未登录调用才走到 401。 */
async function paymentConfigured(request: import('@playwright/test').APIRequestContext) {
  const response = await request.post('/api/payment', { data: {} })
  return response.status() !== 503
}

test.describe('Payment', () => {
  test('已订阅时定价页显示提示，且服务端返回 409 而不是再开一次结账', async ({ page, request }) => {
    test.skip(!(await paymentConfigured(request)), '支付模块未配置（缺 Stripe 凭据或 Price）')

    const email = await register(page)
    // 注册刚写过 users 表，先等一等再写 subscriptions，避开 commit token 竞争。
    await new Promise((r) => setTimeout(r, 200))
    seedSubscriptionWithRetry(email)

    await page.goto('/zh/pricing')
    // 冷启动时按钮可能还是 SSR 的静态 DOM，点下去没有处理器。提示走全局 toast，
    // 会自动消失，因此重试判的是「文案出现过」而不是常驻元素的可见性。
    const notice = page.getByText('你已经订阅了该方案')
    await expect(async () => {
      if (await notice.isVisible()) return
      await page.getByRole('button', { name: '选择专业版' }).click()
      await expect(notice).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 20000 })
    await expect(page).toHaveURL(/\/zh\/pricing/)
  })

  test('账单页用订阅卡展示套餐名、带时刻的续费日期、金额与计费周期', async ({ page, request }) => {
    test.skip(!(await paymentConfigured(request)), '支付模块未配置（缺 Stripe 凭据或 Price）')

    const email = await register(page)
    // 注册刚写过 users 表，先等一等再写 subscriptions，避开 commit token 竞争。
    await new Promise((r) => setTimeout(r, 200))
    seedSubscriptionWithRetry(email)

    await page.goto('/zh/dashboard/billing')
    await page.waitForURL(/\/zh\/dashboard\/billing/)

    const section = page.locator('section', { hasText: '当前订阅' }).first()
    // 套餐名来自 Price id 反查，显示成 `price_1US...` 说明映射没生效。
    await expect(section.getByText('专业版')).toBeVisible({ timeout: 15000 })
    // 只有日期不足以判断「今天会不会扣款」，所以必须带具体时刻。
    await expect(section.getByText(/\d{1,2}:\d{2}/)).toBeVisible()
    // 金额缺失时这里渲染成 `—`。
    await expect(section.getByText(/\$5\.99 \/ 按月/)).toBeVisible()
    // 周期为空曾被误归为终身，于是「订阅行已建、周期未补」会显示成买断版。
    await expect(section.getByText('终身')).toHaveCount(0)
    // 一页通常只有一条订阅，卡片比横向四列的表格合适。
    await expect(section.locator('table')).toHaveCount(0)
  })

  test('已登录用户点免费档按钮进入工作台，不再被送回注册页', async ({ page }) => {
    await register(page)

    await page.goto('/zh/pricing')
    // 冷启动时按钮可能还是 SSR 的静态 DOM，点下去没有处理器——先等水合。
    await page.waitForLoadState('networkidle')
    // 已登录 + 免费档必须显示「进入工作台」，否则会把已有账号的用户引回注册页。
    await expect(page.getByRole('button', { name: '进入工作台' })).toBeVisible()
    await page.getByRole('button', { name: '进入工作台' }).click()

    await expect(page).toHaveURL(/\/zh\/dashboard\/profile/, { timeout: 20000 })
  })
})
