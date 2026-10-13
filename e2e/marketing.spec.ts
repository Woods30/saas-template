import { expect, test } from '@playwright/test'

/**
 * E2E: Marketing paths
 *
 * Adaptations from brief:
 * - /features → /zh/marketing/features (features is under marketing layout, not top-level)
 * - /api/og → SKIPPED (no such endpoint; repo uses static /icon.svg)
 * - contact form → contact page is a placeholder <div> (no real form); test page load only
 * - locale switcher is an icon button (aria-label="切换语言") opening a menu (menuitem "English")
 * - pricing heading uses m.pricing_hero_title() = "简单透明的定价" / "Simple, transparent pricing"
 * - features content from m.feature_auth_title() = "身份认证" / "Authentication"
 */
test.describe('Marketing pages', () => {
  test('home renders landing blocks at /zh', async ({ page }) => {
    await page.goto('/zh')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // 价格入口在 Navbar 改为锚点（`#pricing`），而非独立页面链接。
    await expect(page.locator('nav a[href="/zh#pricing"]')).toBeVisible()
  })

  test('/marketing redirects to landing', async ({ page }) => {
    await page.goto('/zh/marketing')
    await expect(page).toHaveURL(/\/zh\/?$/)
  })

  test('navbar anchor scrolls to pricing section', async ({ page }) => {
    await page.goto('/zh')
    await page.locator('nav a[href="/zh#pricing"]').click()
    await expect(page).toHaveURL(/#pricing$/)
    await expect(page.locator('#pricing')).toBeVisible()
  })

  test('pricing page shows plans', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.getByRole('heading', { name: '简单透明的定价' })).toBeVisible()
  })

  test('features page lists modules', async ({ page }) => {
    await page.goto('/zh/marketing/features')
    await expect(page.getByText('身份认证')).toBeVisible()
    await expect(page.getByText('支付系统')).toBeVisible()
  })

  test('theme toggle switches data-theme', async ({ page }) => {
    await page.goto('/zh')
    // 等待 hydration 完成，否则点击发生在 React 绑定事件之前（切换无效）。
    await page.waitForLoadState('networkidle')
    const html = page.locator('html')
    const before = await html.getAttribute('data-theme')
    await page.getByRole('button', { name: '切换主题' }).click()
    await expect(html).not.toHaveAttribute('data-theme', before ?? '')
  })

  test('locale switcher navigates to real /en prefix', async ({ page }) => {
    // 语言切换按钮位于 Navbar，而 Navbar 仅由 MarketingLayout 提供；
    // `/pricing` 在 MarketingLayout 之外，没有切换按钮，故用带 Navbar 的页面。
    await page.goto('/zh/marketing/features')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: '切换语言' }).click()
    await page.getByRole('menuitem', { name: 'English' }).click()
    await expect(page).toHaveURL(/\/en\/marketing\/features$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('sitemap.xml returns valid XML', async ({ request }) => {
    const res = await request.get('/sitemap.xml')
    expect(res.status()).toBe(200)
    expect(await res.text()).toContain('<urlset')
  })

  test('robots.txt returns expected content', async ({ request }) => {
    const res = await request.get('/robots.txt')
    expect(res.status()).toBe(200)
    expect(await res.text()).toContain('Sitemap')
  })

  test('manifest.json advertises Jerbix', async ({ request }) => {
    const res = await request.get('/manifest.json')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toMatch(/json/)
    expect(await res.text()).toContain('Jerbix')
  })
})
