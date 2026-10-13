import { expect, test } from '@playwright/test'

/**
 * E2E: 文档站（docs）
 *
 * 覆盖三项用户报告的修复：
 * 1. `/docs` 重定向到与语言无关的 slug（不再出现 `/index.zh`）。
 * 2. 切换语言到英文不再 404 —— 同一 URL 在两种语言下都命中对应译文。
 * 3. 文档站使用独立 layout：只有侧边栏导航，不含营销站点 Navbar / Footer，
 *    语言切换器位于左下角。
 */
test.describe('Docs', () => {
  test('/docs 重定向到干净的 slug（无 index.zh）', async ({ page }) => {
    await page.goto('/docs')
    await page.waitForURL('**/docs/**')
    expect(page.url()).not.toContain('index.zh')
    expect(page.url()).toMatch(/\/docs\/[a-z-]+$/)
  })

  test('同一 docs URL 在 zh / en 下都能打开（切换语言不 404）', async ({ page }) => {
    // zh：设置 cookie 后访问
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
    const zhRes = await page.goto('/docs/getting-started')
    expect(zhRes?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('快速开始')

    // en：切换 cookie 后访问同一 URL，必须 200 且渲染英文
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: 'http://localhost:3000' }])
    const enRes = await page.goto('/docs/getting-started')
    expect(enRes?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Getting Started')
  })

  test('文档站使用独立 layout：无营销 Navbar / Footer，语言切换在左下角', async ({ page }) => {
    await page.goto('/docs/getting-started')
    // 营销 Navbar 的特征：sticky top-0 z-40
    await expect(page.locator('nav.sticky')).toHaveCount(0)
    // 营销 Footer 的特征：包含版权符号
    await expect(page.getByText('保留所有权利')).toHaveCount(0)
    // 文档侧边栏导航存在
    await expect(page.locator('aside nav')).toHaveCount(1)
    // 语言切换器存在且在 aside（左下角区域）内
    const switcher = page.locator('aside select[aria-label="切换语言"]')
    await expect(switcher).toBeVisible()
  })
})
