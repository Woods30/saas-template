import { execFileSync } from 'node:child_process'
import { expect, type Page, test } from '@playwright/test'
import { seedVerifiedUser } from '../scripts/e2e-seed-subscription'

const PASSWORD = 'PaymentTest!2026'

/** 用已 seed 的账号走真实登录表单。 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/zh/auth/login')
  await expect(page.locator('button[type="submit"]').first()).toBeEnabled({ timeout: 15000 })
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
}

async function login(page: Page): Promise<string> {
  const email = `pay-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
  await seedVerifiedUser({ email, name: '支付用户', password: PASSWORD })
  await signIn(page, email)
  return email
}

/** 造一个管理员：付款页与订阅页当前按 `admin` 角色放行。 */
async function loginAsAdmin(page: Page): Promise<string> {
  const email = `pay-admin-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
  await seedVerifiedUser({ email, name: '支付管理员', password: PASSWORD, role: 'admin' })
  await signIn(page, email)
  return email
}

/** 管理页是 SSR 直出的：按钮先在 HTML 里出现，事件要等水合才绑上。 */
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
}

/** 本地 D1 与 dev server 抢同一 sqlite 文件，写种子偶发失败，退避重试几次。 */
function withD1Retry(args: string[]): void {
  for (let attempt = 0; ; attempt++) {
    try {
      execFileSync('pnpm', args, { stdio: 'pipe', encoding: 'utf8' })
      return
    } catch (error) {
      if (attempt === 3) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, (attempt + 1) * 300)
    }
  }
}

/** 直接写本地 D1 造一条已支付记录（含订单），避免为了分 tab 跑完整结账链路。 */
function seedPayment(email: string, provider: 'stripe' | 'manual_payments'): void {
  withD1Retry([
    'exec',
    'tsx',
    'scripts/e2e-seed-manual-payments.ts',
    '--seed-payment',
    email,
    provider,
    ...(process.env.E2E_D1_PERSIST_TO ? ['--persist-to', process.env.E2E_D1_PERSIST_TO] : []),
  ])
}
function seed(email: string, history = false) {
  withD1Retry([
    'exec',
    'tsx',
    'scripts/e2e-seed-subscription.ts',
    email,
    ...(history ? ['--history'] : []),
    ...(process.env.E2E_D1_PERSIST_TO ? ['--persist-to', process.env.E2E_D1_PERSIST_TO] : []),
  ])
}
async function configured(request: import('@playwright/test').APIRequestContext) {
  return (await request.post('/api/payment', { data: {} })).status() === 401
}

test.describe('Payment', () => {
  test('已有订阅从账单页管理，服务端拒绝新建订阅', async ({ page, request }) => {
    test.skip(!(await configured(request)), '支付未配置')
    const email = await login(page)
    seed(email)
    await page.goto('/zh/settings/billing')
    await expect(page.getByRole('button', { name: '管理订阅' })).toBeVisible()
    const response = await page.request.post('/api/payment', {
      data: {
        productId: 'pro',
        offerId: 'monthly',
        successUrl: `${new URL(page.url()).origin}/zh/settings/billing`,
        cancelUrl: `${new URL(page.url()).origin}/zh/pricing`,
      },
    })
    expect(response.status()).toBe(409)
  })
  test('账单展示订阅及折叠历史，没有站内切换', async ({ page, request }) => {
    test.skip(!(await configured(request)), '支付未配置')
    const email = await login(page)
    seed(email, true)
    await page.goto('/zh/settings/billing')
    await expect(page.getByText('专业版', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('生效中', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '管理订阅' })).toBeVisible()
    await expect(page.getByText('切换方案', { exact: true })).toHaveCount(0)
    await page.locator('summary').filter({ hasText: '历史订阅' }).click()
    await expect(page.locator('details li').filter({ hasText: '已取消' })).toBeVisible()
  })
  test('购买接口拒绝外部回跳和未知选项，Portal 不接受传入的客户归属', async ({ page, request }) => {
    test.skip(!(await configured(request)), '支付未配置')
    await login(page)
    const origin = new URL(page.url()).origin
    for (const data of [
      {
        productId: 'pro',
        offerId: 'monthly',
        successUrl: 'https://other.example/ok',
        cancelUrl: `${origin}/zh/pricing`,
      },
      {
        productId: 'pro',
        offerId: '__proto__',
        successUrl: `${origin}/zh/settings/billing`,
        cancelUrl: `${origin}/zh/pricing`,
      },
    ]) {
      expect((await page.request.post('/api/payment', { data })).status()).toBe(400)
    }
    expect(
      (
        await page.request.delete('/api/payment', {
          data: { customerId: 'cus_other', returnUrl: `${origin}/zh/settings/billing` },
        })
      ).status(),
    ).toBe(404)
  })
  test('旧价格地址跳转首页，只展示模板购买', async ({ page }) => {
    await page.goto('/zh/pricing')
    await expect(page).toHaveURL(/\/zh#pricing$/)
    // 价格形态随结账模式而变：provider 模式（Stripe 目录）显示 $ 金额或没有
    // 凭据时的「价格暂不可用」；manual payments 模式（E2E 全局注入）显示 ¥ 金额。
    // 两种都算通过，硬编码金额会在改价或换模式后红。
    await expect(page.locator('#pricing')).toContainText(/\$\d|¥\d|价格暂不可用/)
    await expect(page.getByText('专业版', { exact: true })).toHaveCount(0)
    await expect(page.getByText('资源包', { exact: true })).toHaveCount(0)
  })
})

test.describe('Admin 付款页', () => {
  test('四个类型 tab 可见，人工核销 tab 只出现 manual_payments 行且没有退款按钮', async ({
    page,
  }) => {
    await loginAsAdmin(page)

    // 两个买家各造一条已支付记录：渠道一次性付款与人工核销。tab 是划分而不是叠加，
    // 所以同一行不该同时出现在两边。
    const stripeEmail = `pay-stripe-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
    const manualEmail = `pay-manual-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
    await seedVerifiedUser({ email: stripeEmail, name: '渠道买家', password: PASSWORD })
    await seedVerifiedUser({ email: manualEmail, name: '核销买家', password: PASSWORD })
    seedPayment(stripeEmail, 'stripe')
    seedPayment(manualEmail, 'manual_payments')

    await page.goto('/zh/admin/payments')
    await waitForHydration(page)
    await expect(page.getByRole('heading', { name: '付款' })).toBeVisible({ timeout: 15000 })

    for (const name of ['全部', '订阅', '一次性', '人工核销']) {
      await expect(page.getByRole('tab', { name })).toBeVisible()
    }
    // 默认 tab 是 `all`，按约定不写进 URL。
    expect(new URL(page.url()).searchParams.has('tab')).toBe(false)

    await page.getByRole('tab', { name: '人工核销' }).click()
    await expect(page.getByText(manualEmail)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(stripeEmail)).toHaveCount(0)
    // 人工核销的钱走线下退，不提供渠道退款按钮。
    await expect(page.getByRole('button', { name: '退款' })).toHaveCount(0)

    await page.getByRole('tab', { name: '一次性' }).click()
    await expect(page.getByText(stripeEmail)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(manualEmail)).toHaveCount(0)
    // 渠道付款仍可退款。
    await expect(page.getByRole('button', { name: '退款' }).first()).toBeVisible()
  })
})
