import { expect, test } from '@playwright/test'

/**
 * E2E: 营销站
 *
 * 只守一条：首页可访问，且语言切换真的走到 `/en` 前缀——这是客户端路由 + 服务端
 * locale 协商的端到端证据。水合与主题切换另见 `e2e/hydration.spec.ts`。
 *
 * 已下沉的内容（不再在 E2E 重复）：
 * - 落地页区块、定价锚点、FAQ、启动步骤 → `tests/components/landing.test.tsx`
 * - Navbar / Footer 菜单与移动端键盘开关 → `tests/components/navigation.test.tsx`
 * - 主题按钮的三态菜单 → `tests/components/theme-toggle.test.tsx`
 * - 断点溢出、Logo 资源、动画开关、锚点滚动 → 纯布局，手动过一遍即可
 * - sitemap / robots / manifest 内容 → `tests/unit/module-access.test.ts` 与
 *   `tests/unit/theme-colors.test.ts`（直接调用路由 handler，无需起服务）
 *
 * 语言只测一个方向（zh → en）：跨语言行为由 `tests/unit/locale-*` 覆盖，不逐语言复制。
 */
test.describe('Marketing', () => {
  test('首页渲染，语言切换走到真实的 /en 前缀', async ({ page }) => {
    await page.goto('/zh')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Leap from Idea to Launch.')
    await page.waitForLoadState('networkidle')

    // 语言切换按钮位于 Navbar，而 Navbar 仅由 MarketingLayout 提供。
    //
    // 重试打开菜单，而不是加长固定等待：`networkidle` 只说明请求停了，不说明 React
    // 已水合。冷启动时按钮可能还是 SSR 的静态 DOM，点下去没有处理器。菜单若已打开
    // 就不再点（再点一次会关掉），因此判断放在点击之前。
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
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Leap from Idea to Launch.')
  })
})
