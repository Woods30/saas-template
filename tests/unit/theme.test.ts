import { describe, expect, it } from 'vitest'
import { nextTheme, parseTheme, THEME_COOKIE_NAME } from '@/lib/theme'

describe('parseTheme', () => {
  it('识别受支持的主题并归一化大小写与空白', () => {
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('DARK')).toBe('dark')
    expect(parseTheme('  System  ')).toBe('system')
  })

  it('对未知、空或缺失取值返回 undefined', () => {
    expect(parseTheme('sepia')).toBeUndefined()
    expect(parseTheme('')).toBeUndefined()
    expect(parseTheme(undefined)).toBeUndefined()
  })
})

describe('nextTheme', () => {
  it('按 light → dark → system → light 循环', () => {
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
    expect(nextTheme('system')).toBe('light')
  })
})

describe('THEME_COOKIE_NAME', () => {
  it('是稳定的 cookie 名', () => {
    expect(THEME_COOKIE_NAME).toBe('THEME')
  })
})
