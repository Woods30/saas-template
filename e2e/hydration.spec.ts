import { expect, test } from '@playwright/test'

/**
 * E2E: SSR / hydration 契约
 *
 * 这是 E2E 里少数**只有真实服务端 + 真实浏览器**才能验证的东西：服务端渲染出的 DOM 与
 * 客户端首帧是否一致、事件是否真的绑上了。组件测试跑在 jsdom 里，没有真实水合过程。
 *
 * 两个 locale 放在**同一个用例**里循环，而不是复制成两条——跨语言行为由
 * `tests/unit/locale-*` 覆盖，这里只是顺带确认 en 的 SSR 输出同样干净。
 */
/** 主题菜单项文案随 locale 变，抽成表避免在断言里写三元嵌套。 */
const THEME_LABELS = {
  zh: { light: '浅色', dark: '深色' },
  en: { light: 'Light', dark: 'Dark' },
} as const

test('zh / en 首页水合无 React / CSP 错误，且主题切换已绑定事件', async ({ page }) => {
  const messages: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      messages.push(`[${message.type()}] ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => messages.push(`[pageerror] ${error.message}`))

  for (const locale of ['zh', 'en'] as const) {
    await page.goto(`/${locale}`)
    await page.waitForLoadState('networkidle')

    // 通过实际交互确认水合已绑定事件：主题切换是菜单，打开后点选与当前不同的主题。
    const html = page.locator('html')
    const before = await html.getAttribute('data-theme')
    const label = locale === 'zh' ? '切换主题' : 'Toggle theme'
    const target = THEME_LABELS[locale][before === 'dark' ? 'light' : 'dark']
    // 与 marketing.spec 同一处理：冷启动时按钮可能尚未水合，重试打开菜单；
    // 菜单已开就不再点（再点会关掉）。
    const trigger = page.getByRole('button', { name: label })
    const option = page.getByRole('menuitemradio', { name: target })
    await expect(async () => {
      if (await option.isVisible()) return
      await trigger.click()
      await expect(option).toBeVisible({ timeout: 500 })
    }).toPass({ timeout: 15000 })
    await option.click()
    await expect(html).not.toHaveAttribute('data-theme', before ?? '')
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
  expect(errors, '正文语言及 DOM 应与 SSR 一致').toEqual([])
})
