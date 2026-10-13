import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  // 清空测试期间写入的 cookie
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`
  }
})

describe('ThemeToggle', () => {
  it('渲染带可访问名的图标按钮', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button')).toHaveAccessibleName()
  })

  it('点击后改写 data-theme 并写入 THEME cookie', () => {
    document.documentElement.dataset.theme = 'system'
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button'))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.cookie).toContain('THEME=light')
  })
})
