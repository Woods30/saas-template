import { expect, test } from '@playwright/test'

/**
 * E2E: 文档站（docs）
 *
 * 只守**跨行为的契约**：`/docs` 重定向到具体文档、搜索（快捷键 → 过滤 → 跳转）、
 * 侧栏收起偏好由服务端 cookie 回读。这三条都需要真实路由、真实内容管线或真实 SSR 首屏。
 *
 * 已下沉的内容（不再在 E2E 重复）：
 * - 侧栏 group 结构、TOC 锚点、上一篇 / 下一篇、`nextSteps` 卡片 → `tests/components/docs-*`
 * - 中英译文命中 → `tests/unit/docs.test.ts` / `tests/unit/content-locale.test.ts`
 * - 顶栏隐藏、浮动工具条位置、窄屏抽屉尺寸 → 纯布局，改一次就全红，手动过一遍即可
 */
test.describe('Docs', () => {
  test.beforeEach(async ({ context }) => {
    // 显式固定语言：无前缀 URL 会按 Accept-Language 协商，而 Playwright 默认 en-US，
    // 不固定的话断言文案会随运行环境漂移。
    await context.addCookies([{ name: 'NEXT_LOCALE', value: 'zh', url: 'http://localhost:3000' }])
  })

  test('/docs 重定向到干净的 slug，且渲染对应译文', async ({ page }) => {
    const response = await page.goto('/docs')
    await page.waitForURL('**/docs/**')
    expect(response?.status()).toBe(200)
    // URL 里不应出现 `index.zh` 这类内容文件名。
    expect(page.url()).not.toContain('index.zh')
    expect(page.url()).toMatch(/\/docs\/[a-z-]+$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('快速开始')
  })

  test('搜索可过滤并跳转到命中文档', async ({ page }) => {
    await page.goto('/docs/getting-started')
    // 等 hydration 完成，否则点击发生在 React 绑定事件之前（弹窗不会打开）。
    await page.waitForLoadState('networkidle')

    // 快捷键接得上：按键 → 弹窗打开 → 输入框自动聚焦。
    //
    // `networkidle` 只说明请求停了，不说明 React 已水合；全局 keydown 是在 effect 里
    // 绑的，冷启动（vite 首次编译）下偶发还没绑上，按一次没反应。这里重试按键而不是
    // 加长固定等待——前者在慢机器上同样成立，也不会掩盖真正的快捷键失效。
    const dialog = page.getByRole('dialog')
    await expect(async () => {
      await page.keyboard.press('ControlOrMeta+k')
      await expect(dialog).toBeVisible({ timeout: 500 })
    }).toPass({ timeout: 15000 })
    const input = dialog.getByRole('combobox')
    await expect(input).toBeFocused()

    // 默认不列出全部文档，只提示输入关键词。
    await expect(dialog.getByRole('link')).toHaveCount(0)

    await input.fill('支付')
    await dialog.getByRole('link', { name: /支付/ }).first().click()
    await expect(page).toHaveURL(/\/docs\/payment/)
    // 跳转后弹窗关闭。
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('收起侧栏后刷新仍保持收起（偏好由服务端回读）', async ({ page }) => {
    await page.goto('/docs/getting-started')
    await page.waitForLoadState('networkidle')

    // 页面里有多个 `<aside>`（常驻侧栏、窄屏抽屉），`.first()` 会随 DOM 顺序漂移。
    // 按可访问名定位「文档导航」这一块，才指向常驻侧栏本身。
    const sidebar = page.getByRole('navigation', { name: '文档导航' })
    await expect(sidebar).toBeVisible()
    await page.getByRole('button', { name: '收起文档导航' }).click()
    await expect(sidebar).toBeHidden()

    // 这是跨 SSR / 客户端的契约：刷新后首屏即收起，不会闪一下再收。
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('navigation', { name: '文档导航' })).toBeHidden()

    // 重试点击而不是加长等待：`networkidle` 只说明请求停了，不说明 React 已水合。
    // 冷启动时按钮可能还是 SSR 的静态 DOM，点下去没有处理器——重试能穿过这段窗口，
    // 也仍然会在「按钮真的坏了」时失败。
    await expect(async () => {
      await page.getByRole('button', { name: '展开文档导航' }).click()
      await expect(page.getByRole('navigation', { name: '文档导航' })).toBeVisible({
        timeout: 500,
      })
    }).toPass({ timeout: 15000 })
  })
})
