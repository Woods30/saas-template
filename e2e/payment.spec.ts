import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'

/**
 * E2E: 支付（只守核心旅程）
 *
 * 两条：
 * 1. **已订阅后不能再买**：库里存在 `active` 订阅时，`POST /api/payment` 返回 409，
 *    定价页据此显示「你已经订阅了该方案」而不是再走一遍结账。这是「DB → API → 页面」
 *    三层联动的端到端证据，纯函数单测只覆盖了中间那一层。
 * 2. **账单页展示的是可读的订阅信息**：套餐名（不是 `price_xxx`）、续费日期带具体
 *    时刻、金额与计费周期。这三项都曾是「列存在但从不写入」或「渲染成 `—`」的缺陷。
 *
 * ## 为什么不真的结账
 *
 * 真实 Stripe Checkout 需要银行卡与可访问的 Stripe 账号，CI 没有；`stripe trigger`
 * 又要求 `stripe listen` 把事件转发到本地，等于把用例绑到一台装了 Stripe CLI 的机器上。
 * 因此这里**直接写本地 D1** 复现「已订阅」状态（`scripts/e2e-seed-subscription.ts`），
 * 再走真实的 API / 页面。Stripe 侧的 Price 数据由 `.env` 提供，与线上同源。
 *
 * ## 前置条件
 *
 * 用例依赖 `.env` 里配好 `VITE_PAYMENT_PROVIDER=stripe` 与三个 `VITE_STRIPE_PRICE_*`。
 * 未配置时支付模块处于 `incomplete`，`/api/payment` 会先返回 503——此时用例**跳过**
 * 而不是失败：模板开箱状态下没有凭据是正常配置，不该让 E2E 变红。CI 的 e2e job 用
 * `.env.example`（这些值为空），因此这两条在 CI 上会被跳过；本地联调时才会真正执行。
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
 * 写本地 D1，失败重试。
 *
 * wrangler 的 `d1 execute --local` 会打开**同一个** SQLite 文件，而 dev server 正持着它
 * 写会话与用户。并发写入时 miniflare 抢不到 session commit token，报
 * `Failed to get session commit token: internal error`——这是环境竞争，不是产品缺陷。
 * 限定次数重试即可；真的写不进去就让用例失败，不静默继续（否则后面所有断言都会变成
 * 「假红」）。
 */
function seedSubscriptionWithRetry(email: string) {
  // 退避：注册本身刚写过 users 表，紧接着再写 subscriptions 更容易撞上上面说的
  // commit token 竞争，因此第一次先让 dev server 的请求落一落。
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

/**
 * 支付模块是否已配齐。
 *
 * 判据是 `POST /api/payment` 的响应：未配齐时门禁先返回 503（`SERVICE_UNAVAILABLE`），
 * 配齐后未登录调用才走到 401。用一次请求代替读 `.env`——它测的是**服务端实际看到的**
 * 配置，而不是文件里写了什么。
 */
async function paymentConfigured(request: import('@playwright/test').APIRequestContext) {
  const response = await request.post('/api/payment', { data: {} })
  return response.status() !== 503
}

test.describe('Payment', () => {
  test('已订阅时定价页显示提示，且服务端返回 409 而不是再开一次结账', async ({ page, request }) => {
    test.skip(!(await paymentConfigured(request)), '支付模块未配置（缺 Stripe 凭据或 Price）')

    const email = await register(page)
    // 每次调用前 sleep 200ms：注册本身刚写过 users 表，紧接着再写 subscriptions
    // 更容易撞上上面说的 commit token 竞争。
    await new Promise((r) => setTimeout(r, 200))
    seedSubscriptionWithRetry(email)

    await page.goto('/zh/pricing')
    // 重试点击而不是加长等待：冷启动时按钮可能还是 SSR 的静态 DOM，点下去没有
    // 处理器（`networkidle` 只说明请求停了，不说明 React 已水合）。
    // 提示走全局 toast（`Toaster` 挂在根文档里），按文案定位；toast 会自动消失，
    // 所以判重试的是「这条文案出现过」而不是某个常驻元素的可见性。
    const notice = page.getByText('你已经订阅了该方案')
    await expect(async () => {
      if (await notice.isVisible()) return
      await page.getByRole('button', { name: '选择专业版' }).click()
      // 服务端 409 → 页面停在定价页并说明原因（而不是跳走或再开一个 Checkout）。
      await expect(notice).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 20000 })
    await expect(page).toHaveURL(/\/zh\/pricing/)
  })

  test('账单页用订阅卡展示套餐名、带时刻的续费日期、金额与计费周期', async ({ page, request }) => {
    test.skip(!(await paymentConfigured(request)), '支付模块未配置（缺 Stripe 凭据或 Price）')

    const email = await register(page)
    // 每次调用前 sleep 200ms：注册本身刚写过 users 表，紧接着再写 subscriptions
    // 更容易撞上上面说的 commit token 竞争。
    await new Promise((r) => setTimeout(r, 200))
    seedSubscriptionWithRetry(email)

    await page.goto('/zh/dashboard/billing')
    await page.waitForURL(/\/zh\/dashboard\/billing/)

    // 定位到「当前订阅」区块而不是整页：这几项都是这里独有的文案。
    const section = page.locator('section', { hasText: '当前订阅' }).first()
    // 套餐名来自 Price id 反查，显示成 `price_1US...` 说明映射没生效。
    await expect(section.getByText('专业版')).toBeVisible({ timeout: 15000 })
    // 续费日期必须带具体时刻（`toLocaleString`），只有日期不足以判断「今天会不会扣款」。
    await expect(section.getByText(/\d{1,2}:\d{2}/)).toBeVisible()
    // 金额与计费周期同格（`settings_billing_plan_price`），金额缺失时这里渲染成 `—`。
    await expect(section.getByText(/\$5\.99 \/ 按月/)).toBeVisible()
    // 周期写死为 month，就不能显示成「终身 / 周期待同步」：空值曾被误归为终身，
    // 于是任何「订阅行已建、周期未补」的订阅都显示成买了买断版。
    await expect(section.getByText('终身')).toHaveCount(0)
    // 当前订阅是卡片而非表格行：这份数据一页通常只有一条，横向四列对不上表头。
    await expect(section.locator('table')).toHaveCount(0)
  })

  test('已登录用户点免费档按钮进入工作台，不再被送回注册页', async ({ page }) => {
    await register(page)

    await page.goto('/zh/pricing')
    // 冷启动时按钮可能还是 SSR 的静态 DOM，点下去没有处理器——先等水合。
    await page.waitForLoadState('networkidle')
    // 按钮文案本身是修复的一半：已登录 + 免费档必须显示「进入工作台」而不是
    // 「免费开始」——后者会引导一个已有账号的用户再去注册一次。
    await expect(page.getByRole('button', { name: '进入工作台' })).toBeVisible()
    await page.getByRole('button', { name: '进入工作台' }).click()

    // `/dashboard` 自身重定向到 `/dashboard/profile`，落点以 profile 为准。
    await expect(page).toHaveURL(/\/zh\/dashboard\/profile/, { timeout: 20000 })
  })
})
