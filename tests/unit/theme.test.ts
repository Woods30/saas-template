import { describe, expect, it } from 'vitest'
import {
  defaultTheme,
  getTheme,
  nextTheme,
  parseTheme,
  setServerThemeGetter,
  THEME_COOKIE_NAME,
  THEMES,
} from '@/lib/theme'

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

describe('THEMES / defaultTheme', () => {
  it('THEMES 覆盖三种取值且默认值为 system', () => {
    expect(THEMES).toEqual(['light', 'dark', 'system'])
    expect(defaultTheme).toBe('system')
  })
})

describe('getTheme / setServerThemeGetter', () => {
  it('服务端路径返回注入的 getter 值', () => {
    setServerThemeGetter(() => 'dark')
    // node 环境无 document，走 serverThemeGetter
    expect(getTheme()).toBe('dark')
    setServerThemeGetter(() => defaultTheme) // 复位，避免影响其他用例
  })

  it('默认 getter 返回 defaultTheme', () => {
    expect(getTheme()).toBe(defaultTheme)
  })
})
