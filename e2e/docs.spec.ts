import { expect, test } from '@playwright/test'

/** E2E: `/docs` 重定向、搜索跳转、侧栏收起偏好由服务端 cookie 回读。 */
test.describe('Docs', () => {
  test.beforeEach(async ({ context }) => {
    // 无前缀 URL 按 Accept-Language 协商，Playwright 默认 en-US，不固定则文案随环境漂移。
    await context.addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
  })

  test('/docs 重定向到干净的 slug，且渲染对应译文', async ({ page }) => {
    const response = await page.goto('/docs')
    await page.waitForURL('**/docs/**')
    expect(response?.status()).toBe(200)
    expect(page.url()).not.toContain('index.zh')
    expect(page.url()).toMatch(/\/docs\/[a-z-]+$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('快速开始')
  })

  test('搜索可过滤并跳转到命中文档', async ({ page }) => {
    await page.goto('/docs/getting-started')
    await page.waitForLoadState('networkidle')

    // `networkidle` 不代表已水合：全局 keydown 在 effect 里绑定，冷启动时可能未绑上。
    // 重试按键而非加长固定等待，慢机器上同样成立，也不会掩盖快捷键真的失效。
    const dialog = page.getByRole('dialog')
    await expect(async () => {
      await page.keyboard.press('ControlOrMeta+k')
      await expect(dialog).toBeVisible({ timeout: 500 })
    }).toPass({ timeout: 15000 })
    const input = dialog.getByRole('combobox')
    await expect(input).toBeFocused()

    await expect(dialog.getByRole('link')).toHaveCount(0)

    await input.fill('支付')
    await dialog.getByRole('link', { name: /支付/ }).first().click()
    await expect(page).toHaveURL(/\/docs\/payment/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('收起侧栏后刷新仍保持收起（偏好由服务端回读）', async ({ page }) => {
    await page.goto('/docs/getting-started')
    await page.waitForLoadState('networkidle')

    // 页面有多个 `<aside>`（常驻侧栏、窄屏抽屉），按可访问名才能定位到常驻侧栏。
    const sidebar = page.getByRole('navigation', { name: '文档导航' })
    await expect(sidebar).toBeVisible()
    await page.getByRole('button', { name: '收起文档导航' }).click()
    await expect(sidebar).toBeHidden()

    // 刷新后首屏即收起，不能闪一下再收。
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('navigation', { name: '文档导航' })).toBeHidden()

    // 冷启动时按钮可能还是 SSR 的静态 DOM，点下去没有处理器；重试能穿过未水合窗口。
    await expect(async () => {
      await page.getByRole('button', { name: '展开文档导航' }).click()
      await expect(page.getByRole('navigation', { name: '文档导航' })).toBeVisible({
        timeout: 500,
      })
    }).toPass({ timeout: 15000 })
  })
})
