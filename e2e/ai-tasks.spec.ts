import { expect, test } from '@playwright/test'
import { seedVerifiedUser } from '../scripts/e2e-seed-subscription'

/**
 * E2E: 管理台 AI 任务页（`/dashboard/admin/tasks`）。
 *
 * 验证三件事：
 * 1. 非管理员访问被路由守卫拦截；
 * 2. 管理员发起异步成功任务（预扣积分），手动轮询刷新后状态变为 `succeeded`；
 * 3. 管理员发起异步失败任务（预扣积分），轮询发现上游失败后状态变为 `failed` 并自动标记积分「已退回」。
 */

const PASSWORD = 'e2e-password-123'

async function waitForForm(page: import('@playwright/test').Page) {
  await expect(page.locator('button[type="submit"]').first()).toBeEnabled({ timeout: 15000 })
}

async function waitForHydration(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle')
}

async function loginAsAdmin(page: import('@playwright/test').Page): Promise<string> {
  const email = `ai-admin-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
  await seedVerifiedUser({ email, name: 'AI管理员', password: PASSWORD, role: 'admin' })
  await page.goto('/zh/auth/login')
  await waitForHydration(page)
  await waitForForm(page)
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
  return email
}

test.describe('Admin AI 任务与积分预扣/回滚', () => {
  test.describe.configure({ mode: 'serial' })

  test('非管理员访问 AI 任务页看不到内容', async ({ page }) => {
    const email = `ai-plain-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
    await seedVerifiedUser({ email, name: '普通用户', password: PASSWORD })
    await page.goto('/zh/auth/login')
    await waitForHydration(page)
    await waitForForm(page)
    await page.getByLabel('邮箱').fill(email)
    await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')

    await page.goto('/zh/dashboard/admin/tasks')
    await expect(page.getByRole('heading', { name: 'AI 任务' })).toHaveCount(0)
  })

  test('管理员发起沙箱 AI 任务、轮询完成与失败自动退回积分', async ({ page }) => {
    await loginAsAdmin(page)
    const okPrompt = `Neon skyline ${crypto.randomUUID().slice(0, 6)}`
    const failPrompt = `Broken render ${crypto.randomUUID().slice(0, 6)}`

    await page.goto('/zh/dashboard/admin/tasks')
    await waitForHydration(page)
    await expect(page.getByRole('heading', { name: 'AI 任务' })).toBeVisible({ timeout: 15000 })

    // 1. 发起异步成功任务
    await page.getByTestId('create-demo-task-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByTestId('task-mode-select').selectOption('async-succeed')
    await page.getByTestId('task-prompt-input').fill(okPrompt)
    await page.getByTestId('submit-demo-task').click()

    const okRow = page.locator('tr', { hasText: okPrompt })
    await expect(okRow).toBeVisible({ timeout: 15000 })
    await expect(okRow).toContainText('processing')

    // 点击轮询刷新 -> 状态变为 succeeded
    await okRow.getByRole('button', { name: '轮询刷新' }).click()
    await expect(okRow).toContainText('succeeded', { timeout: 15000 })

    // 2. 发起异步失败任务 -> 轮询后自动退回预扣积分
    await page.getByTestId('create-demo-task-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByTestId('task-mode-select').selectOption('async-fail')
    await page.getByTestId('task-prompt-input').fill(failPrompt)
    await page.getByTestId('submit-demo-task').click()

    const failRow = page.locator('tr', { hasText: failPrompt })
    await expect(failRow).toBeVisible({ timeout: 15000 })
    await expect(failRow).toContainText('processing')

    await failRow.getByRole('button', { name: '轮询刷新' }).click()
    await expect(failRow).toContainText('failed', { timeout: 15000 })
    await expect(failRow).toContainText('已退回')

    // 侧边栏入口存在
    await expect(page.getByRole('link', { name: 'AI 任务', exact: true }).first()).toBeVisible()
  })
})
