import { expect, test } from '@playwright/test'
import { seedVerifiedUser } from '../scripts/e2e-seed-subscription'

/**
 * E2E: 管理台积分页（发放 / 扣减 / 流水），顺带覆盖订单与订阅两个列表页。
 *
 * 这三页都只有管理员能进，所以用例要造一个 admin 账号：管理页本身要 admin，
 * 第一个管理员只能由 CLI 或 seed 产生。
 *
 * 注册邮箱后缀必须跨 worker 唯一：`fullyParallel` 下同一文件的多个 test 会在同一毫秒
 * 起步，只用 `Date.now()` 会撞成同一邮箱，后到者撞上 `UNIQUE constraint failed`。
 */

const PASSWORD = 'e2e-password-123'

/** 等认证页可交互再操作；受控输入框必须先水合再填（见 auth.spec.ts）。 */
async function waitForForm(page: import('@playwright/test').Page) {
  await expect(page.locator('button[type="submit"]').first()).toBeEnabled({ timeout: 15000 })
}

/**
 * 等页面水合完再操作。
 *
 * 管理页是 SSR 直出的：按钮在 HTML 里就有，点它却什么也不会发生——
 * 事件还没绑上，与产品缺陷的表现完全一样。故一律等 `networkidle`。
 */
async function waitForHydration(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle')
}

/** 造一个管理员并走真实登录。 */
async function loginAsAdmin(page: import('@playwright/test').Page): Promise<string> {
  const email = `credits-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
  await seedVerifiedUser({ email, name: '积分管理员', password: PASSWORD, role: 'admin' })
  await page.goto('/zh/auth/login')
  await waitForForm(page)
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
  return email
}

/** 造一个普通用户，作为积分的接收方。 */
async function seedTarget(): Promise<string> {
  const email = `credits-target-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
  await seedVerifiedUser({ email, name: '积分接收人', password: PASSWORD })
  return email
}

test.describe('Admin 积分', () => {
  test('非管理员访问积分页看不到内容', async ({ page }) => {
    const email = `credits-plain-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
    await seedVerifiedUser({ email, name: '普通用户', password: PASSWORD })
    await page.goto('/zh/auth/login')
    await waitForForm(page)
    await page.getByLabel('邮箱').fill(email)
    await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')

    await page.goto('/zh/dashboard/admin/credits')
    // 非管理员被路由守卫挡下：页面不存在，而不是「有页面但空」。
    await expect(page.getByRole('heading', { name: '积分' })).toHaveCount(0)
  })

  test('管理员发放积分后余额与流水同步更新', async ({ page }) => {
    await loginAsAdmin(page)
    const target = await seedTarget()

    await page.goto('/zh/dashboard/admin/credits')
    await waitForHydration(page)
    await expect(page.getByRole('heading', { name: '积分' })).toBeVisible({ timeout: 15000 })

    // 按邮箱搜到接收人：没发过积分的用户也要在列表里，否则无从下手。
    await page.getByRole('textbox', { name: '按邮箱搜索' }).fill(target)
    const row = page.getByRole('row').filter({ hasText: target })
    await expect(row).toBeVisible({ timeout: 15000 })

    await row.getByRole('button', { name: '发放' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByLabel('积分数量').fill('100')
    await page.getByLabel('备注').fill('e2e 发放')
    await page.getByRole('button', { name: '确认发放' }).click()

    // 发放成功后余额变成 100。
    await expect(row).toContainText('100', { timeout: 15000 })

    // 流水里能看到这笔发放。
    await row.getByRole('button', { name: '积分流水' }).click()
    // 必须按名字取：toast 的 role 也是 `dialog`，宽泛匹配会命中两个元素。
    const dialog = page.getByRole('dialog', { name: '积分流水' })
    await expect(dialog).toContainText('发放', { timeout: 15000 })
    await expect(dialog).toContainText('+100')
    await expect(dialog).toContainText('e2e 发放')
  })

  test('扣减积分后余额减少', async ({ page }) => {
    await loginAsAdmin(page)
    const target = await seedTarget()

    await page.goto('/zh/dashboard/admin/credits')
    await waitForHydration(page)
    await expect(page.getByRole('heading', { name: '积分' })).toBeVisible({ timeout: 15000 })
    await page.getByRole('textbox', { name: '按邮箱搜索' }).fill(target)
    const row = page.getByRole('row').filter({ hasText: target })
    await expect(row).toBeVisible({ timeout: 15000 })

    await row.getByRole('button', { name: '发放' }).click()
    await page.getByLabel('积分数量').fill('60')
    await page.getByRole('button', { name: '确认发放' }).click()
    await expect(row).toContainText('60', { timeout: 15000 })

    await row.getByRole('button', { name: '扣减' }).click()
    await page.getByLabel('积分数量').fill('20')
    await page.getByRole('button', { name: '确认扣减' }).click()
    await expect(row).toContainText('40', { timeout: 15000 })
  })
})

test.describe('Admin 订单与订阅', () => {
  test('管理员能看到订单页与订阅页', async ({ page }) => {
    await loginAsAdmin(page)

    await page.goto('/zh/dashboard/admin/orders')
    await waitForHydration(page)
    await expect(page.getByRole('heading', { name: '订单' })).toBeVisible({ timeout: 15000 })

    await page.goto('/zh/dashboard/admin/subscriptions')
    await waitForHydration(page)
    await expect(page.getByRole('heading', { name: '订阅' })).toBeVisible({ timeout: 15000 })

    // 侧栏入口也要在：只有页面没有入口等于没做。
    await page.goto('/zh/dashboard/profile')
    await waitForHydration(page)
    // `exact` 必须开：侧栏里还有一项叫「营收与订阅」，且开启核销模块时用户侧栏也有「订单」。
    await expect(page.locator('a[href="/zh/dashboard/admin/orders"]')).toBeVisible()
    await expect(page.getByRole('link', { name: '订阅', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: '积分', exact: true })).toBeVisible()
  })
})
