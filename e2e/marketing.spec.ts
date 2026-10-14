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
    // 保留旧 pricing 锚点作为模板内容入口，首页不再展示演示套餐。
    await expect(page.locator('header nav a[href="/zh#pricing"]')).toBeVisible()
  })

  test('首页正文随中英文 URL 更新', async ({ page }) => {
    await page.goto('/zh')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Leap from Idea to Launch.')
    await expect(page.locator('#pricing')).not.toContainText('$19')
    await page.goto('/en')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Leap from Idea to Launch.')
    await expect(page.getByRole('link', { name: 'See how to start', exact: true })).toBeVisible()
    await expect(page.locator('#stack')).toContainText('A stack that fits together.')
    await expect(page.locator('#faq')).toContainText('D1')
    await page.goto('/zh')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Leap from Idea to Launch.')
  })

  test('窄屏导航可开关且页面无横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/zh')
    await page.waitForLoadState('networkidle')
    const toggle = page.getByRole('button', { name: '打开导航菜单' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    const close = page.getByRole('button', { name: '关闭导航菜单' })
    await expect(close).toHaveAttribute('aria-expanded', 'true')
    const menu = page.locator(`[id="${await close.getAttribute('aria-controls')}"]`)
    await menu.getByRole('link', { name: '特性', exact: true }).focus()
    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toBeFocused()
    await toggle.click()
    await menu.getByRole('link', { name: '模板内容', exact: true }).click()
    await expect(page).toHaveURL(/#pricing$/)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(overflows).toBe(false)
  })

  test('跳跃旅程可键盘切换、暂停动画，离屏停止并支持开发流程', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/zh')
    await page.waitForLoadState('networkidle')
    const mascot = page.locator('.leap-mascot')
    await expect(mascot).toHaveCSS('animation-play-state', 'running')
    await expect(page.locator('#story')).toContainText('Small Steps. Big Leaps.')
    const launch = page.getByRole('button', { name: '03 上线', exact: true })
    await launch.focus()
    await page.keyboard.press('Enter')
    await expect(launch).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.leap-scene')).toHaveAttribute('data-step', '2')
    await expect(page.getByRole('region', { name: '03 上线', exact: true })).toContainText('用户')
    await page.getByRole('button', { name: '暂停动效', exact: true }).click()
    await expect(mascot).toHaveCSS('animation-play-state', 'paused')
    await expect(page.locator('.leap-trail-big')).toHaveCSS('animation-play-state', 'paused')
    await expect(page.locator('.leap-trail-small')).toHaveCSS('animation-play-state', 'paused')
    await page.getByRole('button', { name: '恢复动效', exact: true }).click()
    await expect(mascot).toHaveCSS('animation-play-state', 'running')
    await expect(page.locator('.lab-terminal')).toHaveAttribute('data-in-view', 'false')
    await page.getByRole('button', { name: /检查，然后部署/ }).click()
    await expect(page.getByRole('region', { name: /检查，然后部署/ })).toContainText('pnpm build')
    await expect(page.locator('.lab-stage')).toHaveAttribute('data-in-view', 'false')
    await expect(mascot).toHaveCSS('animation-play-state', 'paused')
  })

  test('英文窄屏步骤上下排布，减少动效关闭轨道及 Hover 位移', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/en')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.lab-step').first()).toHaveCSS('flex-direction', 'column')
    await expect(page.locator('.leap-mascot')).toHaveCSS('animation-name', 'none')
    await expect(page.locator('.leap-trail-big')).toHaveCSS('animation-name', 'none')
    await page.getByRole('button', { name: '03 Launch', exact: true }).click()
    await expect(page.locator('.leap-scene')).toHaveAttribute('data-step', '2')
    await expect(page.locator('.leap-mascot')).toHaveCSS('transition-duration', '0s')
    await expect(page.locator('header img')).toHaveAttribute(
      'src',
      '/logo-horizontal-transparent.svg',
    )
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    expect(overflows).toBe(false)
    await page.setViewportSize({ width: 1440, height: 900 })
    const card = page.locator('.lab-feature-card').first()
    await card.hover()
    await expect(card).toHaveCSS('translate', 'none')
    const cta = page.getByRole('link', { name: 'See how to start', exact: true })
    await cta.hover()
    await expect(cta.locator('svg')).toHaveCSS('translate', 'none')
  })

  test('平板桌面断点保留登录入口', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 })
    await page.goto('/zh')
    await expect(
      page.locator('header').getByRole('link', { name: '登录', exact: true }),
    ).toBeVisible()
  })

  test('/marketing redirects to landing', async ({ page }) => {
    await page.goto('/zh/marketing')
    await expect(page).toHaveURL(/\/zh\/?$/)
  })

  test('navbar anchor scrolls to pricing section', async ({ page }) => {
    await page.goto('/zh')
    await page.locator('header nav a[href="/zh#pricing"]').click()
    await expect(page).toHaveURL(/#pricing$/)
    await expect(page.locator('#pricing')).toBeVisible()
  })

  test('默认关闭的独立定价页返回 404', async ({ page }) => {
    // 独立 `/pricing` 由 `payment.enabled` 门禁；默认关闭时返回 404。
    // 首页 `#pricing` 锚点段落仍存在，见上方「navbar anchor scrolls to pricing section」。
    const response = await page.goto('/pricing')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: '简单透明的定价' })).toHaveCount(0)
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
    // 主题切换是菜单：先打开，再点选一个与当前不同的主题。
    await page.getByRole('button', { name: '切换主题' }).click()
    const target = before === 'dark' ? '浅色' : '深色'
    await page.getByRole('menuitemradio', { name: target }).click()
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
