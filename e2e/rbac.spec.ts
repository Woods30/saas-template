import { expect, test } from '@playwright/test'
import { seedVerifiedUser } from '../scripts/e2e-seed-subscription'

/**
 * E2E: 管理台角色权限页（`/admin/roles`）与审计日志页（`/admin/audit`）。
 *
 * 验证三件事：
 * 1. 非管理员访问两个页面均被路由守卫拦截；
 * 2. 管理员能查看内置角色、创建自定义角色并绑定权限点；
 * 3. 创建角色的写操作自动写入 `audit_logs`，并在审计日志页立即可查。
 */

const PASSWORD = 'e2e-password-123'

async function waitForForm(page: import('@playwright/test').Page) {
  await expect(page.locator('button[type="submit"]').first()).toBeEnabled({ timeout: 15000 })
}

async function waitForHydration(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle')
}

async function loginAsAdmin(page: import('@playwright/test').Page): Promise<string> {
  const email = `rbac-admin-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
  await seedVerifiedUser({ email, name: '权限管理员', password: PASSWORD, role: 'admin' })
  await page.goto('/zh/auth/login')
  await waitForHydration(page)
  await waitForForm(page)
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')
  return email
}

test.describe('Admin 角色权限与审计日志', () => {
  test.describe.configure({ mode: 'serial' })

  test('非管理员访问角色权限页与审计日志页看不到内容', async ({ page }) => {
    const email = `rbac-plain-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
    await seedVerifiedUser({ email, name: '普通用户', password: PASSWORD })
    await page.goto('/zh/auth/login')
    await waitForHydration(page)
    await waitForForm(page)
    await page.getByLabel('邮箱').fill(email)
    await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')

    await page.goto('/zh/admin/roles')
    await expect(page.getByRole('heading', { name: '角色与权限' })).toHaveCount(0)
    // 门禁结果是 404，不是 403 或错误页：标题不存在不足以区分这三者。
    // 用 `page.request` 共享浏览器 cookie；`request` fixture 不共享，会以未登录
    // 身份被重定向到登录页，测不到门禁本身。
    expect((await page.request.get('/zh/admin/roles')).status()).toBe(404)

    await page.goto('/zh/admin/audit')
    await expect(page.getByRole('heading', { name: '审计日志' })).toHaveCount(0)
    expect((await page.request.get('/zh/admin/audit')).status()).toBe(404)
  })

  test('管理员创建自定义角色并在审计日志中查到轨迹', async ({ page }) => {
    await loginAsAdmin(page)
    const customRoleName = `auditor_${crypto.randomUUID().slice(0, 6).replace(/-/g, '_')}`

    await page.goto('/zh/admin/roles')
    await waitForHydration(page)
    await expect(page.getByRole('heading', { name: '角色与权限' })).toBeVisible({ timeout: 15000 })

    // 内置角色均在表格中
    await expect(page.getByTestId('role-row-super_admin')).toBeVisible()
    await expect(page.getByTestId('role-row-admin')).toBeVisible()
    await expect(page.getByTestId('role-row-editor')).toBeVisible()
    await expect(page.getByTestId('role-row-viewer')).toBeVisible()

    // 新建自定义角色
    await page.getByTestId('create-role-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByLabel('角色标识（小写字母、数字与下划线）').fill(customRoleName)
    await page.getByLabel('显示名称').fill('专项审计角色')
    await page.getByLabel('说明').fill('E2E 创建的只读角色')
    await page.getByTestId('perm-checkbox-admin.audit.read').click()
    await page.getByTestId('save-role-submit').click()

    const customRow = page.getByTestId(`role-row-${customRoleName}`)
    await expect(customRow).toBeVisible({ timeout: 15000 })
    await expect(customRow).toContainText('专项审计角色')
    await expect(customRow).toContainText('admin.audit.read')

    // 跳转到审计日志页，确认刚才的新建角色操作已落盘
    await page.goto('/zh/admin/audit')
    await waitForHydration(page)
    await expect(page.getByRole('heading', { name: '审计日志' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('table')).toContainText('rbac.role.create', { timeout: 15000 })
    await expect(page.getByRole('table')).toContainText(customRoleName)

    // 侧栏导航入口也在
    await expect(page.getByRole('link', { name: '角色与权限', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: '审计日志', exact: true }).first()).toBeVisible()
  })

  test('管理员侧栏完整显示 RBAC 分组', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/zh/admin/roles')
    await waitForHydration(page)
    await expect(page.getByRole('heading', { name: '角色与权限' })).toBeVisible({ timeout: 15000 })

    // 分组标题本身是折叠按钮；三个入口是链接。
    const sidebar = page.locator('[data-slot="sidebar"]')
    await expect(sidebar.getByRole('button', { name: '用户与权限' })).toBeVisible()
    for (const name of ['用户管理', '角色与权限', '审计日志']) {
      await expect(sidebar.getByRole('link', { name, exact: true })).toBeVisible()
    }
  })

  test('editor 进入管理台只看到有权限的菜单', async ({ page }) => {
    // `user_roles → role_editor` 需要内置角色行存在，`e2e/global-setup.ts` 用
    // `buildRbacSeedSql` 保证（与 `pnpm db:seed` 同一份定义）。
    const email = `rbac-editor-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`
    await seedVerifiedUser({
      email,
      name: '内容编辑',
      password: PASSWORD,
      role: 'editor',
    })
    await page.goto('/zh/auth/login')
    await waitForHydration(page)
    await waitForForm(page)
    await page.getByLabel('邮箱').fill(email)
    await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL((url) => url.pathname === '/zh' || url.pathname === '/')

    // 概览要求 `admin.orders.read`；editor 没有，应重定向到第一个可见入口（内容）。
    await page.goto('/zh/admin')
    await page.waitForURL(/\/zh\/admin\/content$/, { timeout: 15000 })
    await waitForHydration(page)

    const sidebar = page.locator('[data-slot="sidebar"]')
    await expect(sidebar.getByRole('link', { name: '内容与分类', exact: true })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: '工单与邀请码', exact: true })).toBeVisible()
    for (const hidden of ['用户管理', '角色与权限', '审计日志', '付款', '系统设置', 'AI 任务']) {
      await expect(sidebar.getByRole('link', { name: hidden, exact: true })).toHaveCount(0)
    }
    // 无权限的分组整组不渲染。
    await expect(sidebar.getByRole('button', { name: '用户与权限' })).toHaveCount(0)
    await expect(sidebar.getByRole('button', { name: '账单与财务' })).toHaveCount(0)
  })
})
