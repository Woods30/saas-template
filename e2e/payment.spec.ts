import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { seedVerifiedUser } from '../scripts/e2e-seed-subscription'

const PASSWORD = 'PaymentTest!2026'
async function login(page: import('@playwright/test').Page): Promise<string> {
  const email = `pay-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
  await seedVerifiedUser({ email, name: '支付用户', password: PASSWORD })
  await page.goto('/zh/auth/login')
  await expect(page.locator('button[type="submit"]').first()).toBeEnabled({ timeout: 15000 })
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
  return email
}
function seed(email: string, history = false) {
  const args = [
    'exec',
    'tsx',
    'scripts/e2e-seed-subscription.ts',
    email,
    ...(history ? ['--history'] : []),
    ...(process.env.E2E_D1_PERSIST_TO ? ['--persist-to', process.env.E2E_D1_PERSIST_TO] : []),
  ]
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
async function configured(request: import('@playwright/test').APIRequestContext) {
  return (await request.post('/api/payment', { data: {} })).status() === 401
}

test.describe('Payment', () => {
  test('已有订阅从账单页管理，服务端拒绝新建订阅', async ({ page, request }) => {
    test.skip(!(await configured(request)), '支付未配置')
    const email = await login(page)
    seed(email)
    await page.goto('/zh/dashboard/billing')
    await expect(page.getByRole('button', { name: '管理订阅' })).toBeVisible()
    const response = await page.request.post('/api/payment', {
      data: {
        productId: 'pro',
        offerId: 'monthly',
        successUrl: `${new URL(page.url()).origin}/zh/dashboard/billing`,
        cancelUrl: `${new URL(page.url()).origin}/zh/pricing`,
      },
    })
    expect(response.status()).toBe(409)
  })
  test('账单展示订阅及折叠历史，没有站内切换', async ({ page, request }) => {
    test.skip(!(await configured(request)), '支付未配置')
    const email = await login(page)
    seed(email, true)
    await page.goto('/zh/dashboard/billing')
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
        successUrl: `${origin}/zh/dashboard/billing`,
        cancelUrl: `${origin}/zh/pricing`,
      },
    ]) {
      expect((await page.request.post('/api/payment', { data })).status()).toBe(400)
    }
    expect(
      (
        await page.request.delete('/api/payment', {
          data: { customerId: 'cus_other', returnUrl: `${origin}/zh/dashboard/billing` },
        })
      ).status(),
    ).toBe(404)
  })
  test('旧价格地址跳转首页，只展示模板购买', async ({ page }) => {
    await page.goto('/zh/pricing')
    await expect(page).toHaveURL(/\/zh#pricing$/)
    await expect(page.locator('#pricing')).toContainText('$99')
    await expect(page.getByText('专业版', { exact: true })).toHaveCount(0)
    await expect(page.getByText('资源包', { exact: true })).toHaveCount(0)
  })
})
