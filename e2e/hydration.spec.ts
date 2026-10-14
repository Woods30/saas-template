import { expect, test } from '@playwright/test'

for (const locale of ['zh', 'en']) {
  test(`${locale} 首页 hydration 无 React / CSP 错误`, async ({ page }) => {
    const messages: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        messages.push(`[${message.type()}] ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => messages.push(`[pageerror] ${error.message}`))

    await page.goto(`/${locale}`)
    await page.waitForLoadState('networkidle')
    // 通过实际交互确认 hydration 已绑定事件。主题切换是菜单：打开后点选一个与当前不同的主题。
    const html = page.locator('html')
    const before = await html.getAttribute('data-theme')
    await page.getByRole('button', { name: locale === 'zh' ? '切换主题' : 'Toggle theme' }).click()
    const darkLabel = locale === 'zh' ? '深色' : 'Dark'
    const lightLabel = locale === 'zh' ? '浅色' : 'Light'
    await page
      .getByRole('menuitemradio', { name: before === 'dark' ? lightLabel : darkLabel })
      .click()
    await expect(html).not.toHaveAttribute('data-theme', before ?? '')

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
}
