import { afterEach, describe, expect, it } from 'vitest'
import {
  compareMessageKeys,
  defaultLocale,
  getRequestLocale,
  LOCALE_COOKIE_NAME,
  parseAcceptLanguage,
  parseLocale,
  readCookieValue,
  readLocaleCookie,
  resolveLocale,
} from '@/lib/locale'
import { overwriteGetLocale } from '@/locale/paraglide/runtime.js'

function requestWith(headers: Record<string, string>): Request {
  return new Request('http://localhost/', { headers })
}

describe('getRequestLocale', () => {
  afterEach(() => {
    // `overwriteGetLocale` 改的是模块级实现，必须复位，否则污染同文件后续用例。
    overwriteGetLocale(() => 'zh')
  })

  it('返回受支持的语言', () => {
    overwriteGetLocale(() => 'en')
    expect(getRequestLocale()).toBe('en')
  })

  it('对 Paraglide 给出的未支持语言回退默认语言，而不是原样透传', () => {
    // `getLocale()` 读 cookie / Accept-Language，属用户可控输入，可能给出 'fr'。
    // 此前调用方一律 `as Locale` 强转，把非法值一路带进 `docsForLocale`（静默返回空）。
    overwriteGetLocale(() => 'fr' as never)
    expect(getRequestLocale()).toBe(defaultLocale)
  })
})

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

describe('readCookieValue', () => {
  it('返回 cookie 原始值，不做百分号解码', () => {
    expect(readCookieValue(`${LOCALE_COOKIE_NAME}=%65%6E`, LOCALE_COOKIE_NAME)).toBe('%65%6E')
    expect(readCookieValue(`${LOCALE_COOKIE_NAME}=en`, LOCALE_COOKIE_NAME)).toBe('en')
  })

  it('在多个 cookie 中按名精确匹配，值首尾空白被裁剪', () => {
    expect(
      readCookieValue(`foo=bar; ${LOCALE_COOKIE_NAME} = en ; baz=qux`, LOCALE_COOKIE_NAME),
    ).toBe('en')
  })

  it('缺失、无等号或未命中均返回 undefined', () => {
    expect(readCookieValue(null, LOCALE_COOKIE_NAME)).toBeUndefined()
    expect(readCookieValue('', LOCALE_COOKIE_NAME)).toBeUndefined()
    expect(readCookieValue(LOCALE_COOKIE_NAME, LOCALE_COOKIE_NAME)).toBeUndefined()
    expect(readCookieValue('other=en', LOCALE_COOKIE_NAME)).toBeUndefined()
  })
})

describe('百分号编码 cookie 的解析与比较一致性（回归）', () => {
  // 回归点：readLocaleCookie 会解码后解析，而持久化比较若直接取原始值，
  // `%65%6E`（即 en）会与 en 不等，导致每个请求都重复下发 Set-Cookie。
  it('原始值不同于解析结果，故比较必须基于解码后的解析值', () => {
    const header = `${LOCALE_COOKIE_NAME}=%65%6E`
    expect(readCookieValue(header, LOCALE_COOKIE_NAME)).toBe('%65%6E')
    expect(readLocaleCookie(header)).toBe('en')
    // persistLocaleCookie 以 readLocaleCookie 的结果与会话 locale 比较，故对同一 cookie
    // 解析与比较得出一致结论（都视作 en），不再重复下发。
    expect(readLocaleCookie(header)).toBe(resolveLocale(requestWith({ cookie: header })))
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

import { localeFromPathname, stripLocalePrefix, swapLocale } from '@/lib/locale'

describe('localeFromPathname', () => {
  it('提取显式 locale 前缀', () => {
    expect(localeFromPathname('/en')).toBe('en')
    expect(localeFromPathname('/zh/pricing')).toBe('zh')
  })

  it('无前缀或未知前缀返回 undefined', () => {
    expect(localeFromPathname('/')).toBeUndefined()
    expect(localeFromPathname('/pricing')).toBeUndefined()
    expect(localeFromPathname('/fr/x')).toBeUndefined()
  })
})

describe('stripLocalePrefix', () => {
  it('剥离已知前缀并保留其余路径', () => {
    expect(stripLocalePrefix('/zh')).toBe('/')
    expect(stripLocalePrefix('/en/pricing')).toBe('/pricing')
  })

  it('无已知前缀时原样返回', () => {
    expect(stripLocalePrefix('/')).toBe('/')
    expect(stripLocalePrefix('/pricing')).toBe('/pricing')
    expect(stripLocalePrefix('/fr/x')).toBe('/fr/x')
  })
})

describe('swapLocale', () => {
  it('替换已有前缀', () => {
    expect(swapLocale('/zh/pricing', 'en')).toBe('/en/pricing')
    expect(swapLocale('/en', 'zh')).toBe('/zh')
  })

  it('无前缀时补上，根路径得到纯前缀', () => {
    expect(swapLocale('/', 'en')).toBe('/en')
    expect(swapLocale('/pricing', 'en')).toBe('/en/pricing')
  })

  it('未知前缀不剥离，仅前置新前缀', () => {
    expect(swapLocale('/fr/x', 'en')).toBe('/en/fr/x')
  })
})

describe('resolveLocale 的 URL 前缀优先级', () => {
  function requestWithPath(path: string, headers: Record<string, string> = {}): Request {
    return new Request(`http://localhost${path}`, { headers })
  }

  it('URL 前缀优先于 cookie 与 Accept-Language', () => {
    const request = requestWithPath('/en/pricing', {
      cookie: `${LOCALE_COOKIE_NAME}=zh`,
      'accept-language': 'zh-CN',
    })
    expect(resolveLocale(request)).toBe('en')
  })

  it('无前缀时回退到 cookie（保持既有行为）', () => {
    const request = requestWithPath('/pricing', { cookie: `${LOCALE_COOKIE_NAME}=en` })
    expect(resolveLocale(request)).toBe('en')
  })

  it('未知前缀不生效，继续回退', () => {
    const request = requestWithPath('/fr/x', { 'accept-language': 'en' })
    expect(resolveLocale(request)).toBe('en')
  })
})
