import { expect, test } from '@playwright/test'

/** E2E: 首页可访问，语言切换真的走到 `/en` 前缀（客户端路由 + 服务端协商）。 */
test.describe('Marketing', () => {
  test('首页渲染，语言切换走到真实的 /en 前缀', async ({ page }) => {
    await page.goto('/zh')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      '不必从零开发，让想法更快上线。',
    )
    await page.waitForLoadState('networkidle')

    // 冷启动时按钮可能还是 SSR 的静态 DOM，点下去没有处理器；菜单已开则不再点
    // （再点一次会关掉），因此判断放在点击之前。
    const trigger = page.getByRole('button', { name: '切换语言' })
    const menu = page.getByRole('menuitem', { name: 'English' })
    await expect(async () => {
      if (await menu.isVisible()) return
      await trigger.click()
      await expect(menu).toBeVisible({ timeout: 500 })
    }).toPass({ timeout: 15000 })
    await menu.click()
    await expect(page).toHaveURL(/\/en\/?$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Skip the groundwork. Launch your idea sooner.',
    )
  })
})
