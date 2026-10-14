import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { websiteConfig } from '@/config/website'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  // 清空测试期间写入的 cookie
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom 使用同步 cookie 清理，以隔离各测试的主题状态。
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`
  }
})

/** 打开菜单并返回菜单容器。 */
function openMenu() {
  fireEvent.click(screen.getByRole('button'))
  return screen.getByRole('menu')
}

describe('ThemeToggle', () => {
  it('渲染带可访问名的图标按钮', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button')).toHaveAccessibleName()
  })

  it('点击后列出三种主题供直接选择，而不是循环切换', () => {
    document.documentElement.dataset.theme = 'system'
    render(<ThemeToggle />)
    const menu = openMenu()
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((i) => i.textContent),
    ).toEqual(['Light', 'Dark', 'System'])
  })

  it('直接点选某个主题即应用，不经过中间态', () => {
    document.documentElement.dataset.theme = 'system'
    render(<ThemeToggle />)
    // 从 system 直接跳到 dark，而非按 light → dark 逐级循环。
    fireEvent.click(within(openMenu()).getByRole('menuitemradio', { name: 'Dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.cookie).toContain('THEME=dark')
  })

  it('当前主题在菜单中标记为选中', () => {
    // getTheme() 客户端读 THEME cookie，因此这里要设 cookie 而非 DOM 属性。
    // biome-ignore lint/suspicious/noDocumentCookie: 测试内同步设置，模拟已选主题。
    document.cookie = 'THEME=dark; Path=/'
    render(<ThemeToggle />)
    const selected = within(openMenu())
      .getAllByRole('menuitemradio')
      .filter((item) => item.getAttribute('aria-checked') === 'true')
    expect(selected.map((i) => i.textContent)).toEqual(['Dark'])
  })

  it('enableThemeSwitch 关闭时不渲染按钮', () => {
    const original = websiteConfig.ui.enableThemeSwitch
    websiteConfig.ui.enableThemeSwitch = false
    try {
      render(<ThemeToggle />)
      expect(screen.queryByRole('button')).toBeNull()
    } finally {
      websiteConfig.ui.enableThemeSwitch = original
    }
  })
})
