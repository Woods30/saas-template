import { describe, expect, it } from 'vitest'
import {
  compareMessageKeys,
  defaultLocale,
  LOCALE_COOKIE_NAME,
  parseAcceptLanguage,
  parseLocale,
  readLocaleCookie,
  resolveLocale,
} from '@/lib/locale'

function requestWith(headers: Record<string, string>): Request {
  return new Request('http://localhost/', { headers })
}

describe('parseLocale', () => {
  it('识别受支持的语言并归一化大小写', () => {
    expect(parseLocale('zh')).toBe('zh')
    expect(parseLocale('EN')).toBe('en')
    expect(parseLocale('  En  ')).toBe('en')
  })

  it('对未知或缺失取值返回 undefined', () => {
    expect(parseLocale('fr')).toBeUndefined()
    expect(parseLocale(undefined)).toBeUndefined()
    expect(parseLocale('')).toBeUndefined()
  })
})

describe('readLocaleCookie', () => {
  it('从 cookie 头中读取 NEXT_LOCALE', () => {
    expect(readLocaleCookie(`${LOCALE_COOKIE_NAME}=en`)).toBe('en')
    expect(readLocaleCookie(`foo=bar; ${LOCALE_COOKIE_NAME}=en; baz=qux`)).toBe('en')
  })

  it('对未知语言值返回 undefined 以便回退', () => {
    expect(readLocaleCookie(`${LOCALE_COOKIE_NAME}=fr`)).toBeUndefined()
  })

  it('对 malformed cookie 安全回退而不抛错', () => {
    expect(readLocaleCookie(`${LOCALE_COOKIE_NAME}=%E0%A4%A`)).toBeUndefined()
    expect(readLocaleCookie(`${LOCALE_COOKIE_NAME}`)).toBeUndefined()
    expect(readLocaleCookie('')).toBeUndefined()
    expect(readLocaleCookie(undefined)).toBeUndefined()
  })
})

describe('parseAcceptLanguage', () => {
  it('按 q 值降序选择可用语言', () => {
    expect(parseAcceptLanguage('en-US,en;q=0.9,zh;q=0.8')).toBe('en')
    expect(parseAcceptLanguage('zh-CN,zh;q=0.9,en;q=0.8')).toBe('zh')
  })

  it('跳过 q=0 的语言，即使它排在首位', () => {
    expect(parseAcceptLanguage('en;q=0,zh;q=0.5')).toBe('zh')
    expect(parseAcceptLanguage('en;q=0')).toBeUndefined()
  })

  it('忽略未知语言但仍回退到后续有效语言', () => {
    expect(parseAcceptLanguage('fr-FR,de;q=0.9,zh;q=0.1')).toBe('zh')
    expect(parseAcceptLanguage('fr-FR,de')).toBeUndefined()
  })

  it('把区域标签归并到基础语言', () => {
    expect(parseAcceptLanguage('zh-Hant-TW')).toBe('zh')
    expect(parseAcceptLanguage('en-GB')).toBe('en')
  })

  it('处理空值与畸形 q 值而不抛错', () => {
    expect(parseAcceptLanguage(undefined)).toBeUndefined()
    expect(parseAcceptLanguage('')).toBeUndefined()
    expect(parseAcceptLanguage(',,')).toBeUndefined()
    expect(parseAcceptLanguage('en;q=abc,zh;q=0.1')).toBe('zh')
  })
})

describe('resolveLocale', () => {
  it('无任何偏好时回退到默认语言', () => {
    expect(resolveLocale(requestWith({}))).toBe(defaultLocale)
  })

  it('cookie 优先于 Accept-Language', () => {
    const request = requestWith({
      cookie: `${LOCALE_COOKIE_NAME}=zh`,
      'accept-language': 'en-US,en;q=0.9',
    })
    expect(resolveLocale(request)).toBe('zh')
  })

  it('无有效 cookie 时使用 Accept-Language', () => {
    expect(resolveLocale(requestWith({ 'accept-language': 'en-US,en;q=0.9' }))).toBe('en')
  })

  it('非法 cookie 不会阻止 Accept-Language 回退', () => {
    const request = requestWith({
      cookie: `${LOCALE_COOKIE_NAME}=fr`,
      'accept-language': 'en',
    })
    expect(resolveLocale(request)).toBe('en')
  })

  it('malformed cookie 安全回退到默认语言', () => {
    expect(resolveLocale(requestWith({ cookie: `${LOCALE_COOKIE_NAME}=%E0%A4%A` }))).toBe(
      defaultLocale,
    )
  })
})

describe('compareMessageKeys', () => {
  it('忽略 $schema 且键一致时无差异', () => {
    const result = compareMessageKeys(
      { $schema: 'a', site_name: 'x' },
      { $schema: 'b', site_name: 'y' },
    )
    expect(result).toEqual({ missing: [], extra: [] })
  })

  it('报告缺失键', () => {
    const result = compareMessageKeys({ site_name: 'x', nav_home: 'y' }, { site_name: 'x' })
    expect(result.missing).toEqual(['nav_home'])
    expect(result.extra).toEqual([])
  })

  it('报告多余键', () => {
    const result = compareMessageKeys({ site_name: 'x' }, { site_name: 'x', nav_home: 'y' })
    expect(result.missing).toEqual([])
    expect(result.extra).toEqual(['nav_home'])
  })
})
