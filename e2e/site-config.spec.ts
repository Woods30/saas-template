import { expect, test } from '@playwright/test'

/**
 * E2E: 网站源码配置与公共菜单
 *
 * 在**默认配置**（`src/config/website.ts` 的 `createWebsiteConfig(publicEnv)`）下，
 * 通过真实 server 验证：
 * - 未闭环服务的 API 门禁在业务调用前返回 404，不会假成功；
 * - 公共菜单按当前 locale 生成真实站内链接；
 * - 关闭的套餐页既不响应也不进入 sitemap；
 * - 中英首页在 375 / 1100 / 1440 宽度下无横向溢出、无 hydration 错误；
 * - 深色 / 浅色主题下 Logo 资源可加载；
 * - mobile 菜单可键盘开关并恢复焦点。
 *
 * 启用 / 关闭各分支由纯函数与真实 handler 单测覆盖；E2E 不写真实 `.env` 切换开关。
 */
test.describe('Site config', () => {
  test('默认关闭的业务入口不会假成功', async ({ request }) => {
    for (const path of [
      'contact/submit',
      'newsletter/subscribe',
      'payment/checkout',
      'email/send',
    ]) {
      const response = await request.post(`/api/${path}`, { data: {} })
      expect(response.status(), `/api/${path} 应为 404`).toBe(404)
      expect(await response.json()).toEqual({ error: 'MODULE_DISABLED' })
    }
  })

  test('文档导航保持英文 locale，关闭套餐页面不进入 sitemap', async ({ page, request }) => {
    await page.goto('/en')
    await expect(
      page.getByRole('navigation').first().getByRole('link', { name: 'Docs', exact: true }),
    ).toHaveAttribute('href', '/en/docs')
    const pricing = await request.get('/en/pricing')
    expect(pricing.status()).toBe(404)
    const sitemap = await (await request.get('/sitemap.xml')).text()
    expect(sitemap).not.toContain('/pricing</loc>')
    expect(sitemap).toContain('/en/marketing/blog')
  })

  for (const locale of ['zh', 'en'] as const) {
    test(`${locale} 首页在 375 / 1100 / 1440 无横向溢出且无 hydration 错误`, async ({ page }) => {
      const messages: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') {
          messages.push(`[${message.type()}] ${message.text()}`)
        }
      })
      page.on('pageerror', (error) => messages.push(`[pageerror] ${error.message}`))

      for (const width of [375, 1100, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`/${locale}`)
        await page.waitForLoadState('networkidle')
        await expect(page.locator('html')).toHaveAttribute('lang', locale === 'zh' ? 'zh-CN' : 'en')
        const overflows = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        )
        expect(overflows, `${locale} @ ${width}px 不应横向溢出`).toBe(false)
      }

      const errors = messages.filter((message) => {
        const lower = message.toLowerCase()
        return (
          lower.includes('[pageerror]') ||
          lower.includes('hydrat') ||
          lower.includes('did not match') ||
          lower.includes('invalid dom property') ||
          lower.includes('content security policy')
        )
      })
      expect(errors, `${locale} 首页不应有 hydration / CSP 错误`).toEqual([])
    })
  }

  test('深色 / 浅色主题下 Logo 资源可加载', async ({ page, request }) => {
    await page.goto('/zh')
    await page.waitForLoadState('networkidle')

    const logo = page.locator('header img').first()
    await expect(logo).toHaveAttribute('src', '/logo-horizontal-transparent.svg')
    const asset = await request.get('/logo-horizontal-transparent.svg')
    expect(asset.status()).toBe(200)

    const html = page.locator('html')
    const before = await html.getAttribute('data-theme')
    // 主题切换是菜单：打开后点选一个与当前不同的主题。
    await page.getByRole('button', { name: '切换主题' }).click()
    await page.getByRole('menuitemradio', { name: before === 'dark' ? '浅色' : '深色' }).click()
    await expect(html).not.toHaveAttribute('data-theme', before ?? '')
    await expect(logo).toBeVisible()
  })

  test('mobile 菜单可键盘开关并恢复焦点', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/zh')
    await page.waitForLoadState('networkidle')
    const toggle = page.getByRole('button', { name: '打开导航菜单' })
    await toggle.focus()
    await page.keyboard.press('Enter')
    const close = page.getByRole('button', { name: '关闭导航菜单' })
    await expect(close).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toBeFocused()
  })
})
