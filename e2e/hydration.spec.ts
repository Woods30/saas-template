import { expect, test } from '@playwright/test'

/** E2E: SSR 与客户端首帧一致、事件真的绑上（jsdom 无法覆盖）。 */
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

    const html = page.locator('html')
    const before = await html.getAttribute('data-theme')
    const label = locale === 'zh' ? '切换主题' : 'Toggle theme'
    const target = THEME_LABELS[locale][before === 'dark' ? 'light' : 'dark']
    // 冷启动时按钮可能尚未水合：重试打开菜单，已开则不再点（再点会关掉）。
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
