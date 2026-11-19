import { describe, expect, it } from 'vitest'
import {
  attributionCookieHeaders,
  getClientIpFromHeaders,
  getCountryFromHeaders,
  guessLocaleFromAcceptLanguage,
  REFERRER_COOKIE,
  readAttribution,
  sanitizeReferrer,
  sanitizeUtm,
  UTM_COOKIE_KEYS,
  withAttributionCookies,
} from '@/lib/attribution'

const UTM_MAX_AGE = 'Max-Age=2592000; Path=/; SameSite=Lax'

describe('sanitizeUtm', () => {
  it('sanitizeUtm 保留字母数字与 ._-，截断到 100', () => {
    expect(sanitizeUtm('spring_sale-2026.v1')).toBe('spring_sale-2026.v1')
    // 空白与 URL 保留字符一律剔除，只留下白名单字符。
    expect(sanitizeUtm('a b/c?d=#e&f')).toBe('abcdef')
    // 标签注入被拆解成纯字母，落库后不可能构成 HTML。
    expect(sanitizeUtm('<script>alert(1)</script>')).toBe('scriptalert1script')
    expect(sanitizeUtm('x'.repeat(150))).toHaveLength(100)
    expect(sanitizeUtm('')).toBe('')
  })
})

describe('sanitizeReferrer', () => {
  it('sanitizeReferrer 去掉 query 与同站来源', () => {
    expect(sanitizeReferrer('https://www.google.com/search?q=saas#top')).toBe(
      'https://www.google.com/search',
    )
    // 同站来源（含子域）不是「外部触达」，返回空串表示未归因。
    expect(sanitizeReferrer('https://example.com/pricing?utm_source=x', ['example.com'])).toBe('')
    expect(sanitizeReferrer('https://app.example.com/pricing', ['example.com'])).toBe('')
    // 不同站点、非法 URL、非 http(s) 协议。
    expect(sanitizeReferrer('https://other.com/path', ['example.com'])).toBe(
      'https://other.com/path',
    )
    expect(sanitizeReferrer('not a url')).toBe('')
    expect(sanitizeReferrer('javascript:alert(1)')).toBe('')
    // 凭据部分不应进入归因。
    expect(sanitizeReferrer('https://user:pw@news.example/a?b=1')).toBe('https://news.example/a')
    // 超长值截断，避免伪造 cookie 把大段文本写进用户行。
    expect(sanitizeReferrer(`https://evil.example/${'x'.repeat(2000)}`).length).toBeLessThanOrEqual(
      500,
    )
  })
})

describe('attributionCookieHeaders — UTM', () => {
  it('首次请求写入 UTM Set-Cookie', () => {
    const request = new Request(
      'https://example.com/pricing?utm_source=launch&utm_medium=cpc&utm_ignored=1',
    )
    expect(attributionCookieHeaders(request)).toEqual([
      `utm_source=launch; ${UTM_MAX_AGE}`,
      `utm_medium=cpc; ${UTM_MAX_AGE}`,
    ])
    expect(UTM_COOKIE_KEYS).toEqual([
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
    ])
  })

  it('已有 utm cookie 时不重复写 Set-Cookie', () => {
    const request = new Request('https://example.com/pricing?utm_source=spring&utm_medium=cpc', {
      headers: { cookie: 'utm_source=newsletter' },
    })
    expect(attributionCookieHeaders(request)).toEqual([`utm_medium=cpc; ${UTM_MAX_AGE}`])
  })

  it('清洗后为空的 UTM 参数不写空 cookie，避免锁死后续归因', () => {
    const request = new Request('https://example.com/pricing?utm_source=%3C%3E')
    expect(attributionCookieHeaders(request)).toEqual([])
  })

  it('空值 utm cookie 不阻断后续有效参数', () => {
    const request = new Request('https://example.com/pricing?utm_source=spring', {
      headers: { cookie: 'utm_source=' },
    })
    expect(attributionCookieHeaders(request)).toEqual([`utm_source=spring; ${UTM_MAX_AGE}`])
  })
})

describe('attributionCookieHeaders — referrer', () => {
  it('首次外部 HTML 导航写入 first_referrer cookie', () => {
    const request = new Request('https://example.com/pricing', {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        referer: 'https://www.google.com/search?q=saas',
      },
    })
    expect(attributionCookieHeaders(request)).toEqual([
      `${REFERRER_COOKIE}=${encodeURIComponent('https://www.google.com/search')}; ${UTM_MAX_AGE}`,
    ])
  })

  it('空值 first_referrer cookie 不阻断后续外部来源', () => {
    const request = new Request('https://example.com/pricing', {
      headers: {
        accept: 'text/html',
        referer: 'https://www.google.com/search',
        cookie: 'first_referrer=',
      },
    })
    expect(attributionCookieHeaders(request)).toEqual([
      `${REFERRER_COOKIE}=${encodeURIComponent('https://www.google.com/search')}; ${UTM_MAX_AGE}`,
    ])
  })

  it('站内跳转的 referrer 不写 cookie', () => {
    const request = new Request('https://example.com/pricing', {
      headers: {
        accept: 'text/html',
        referer: 'https://example.com/blog/hello',
      },
    })
    expect(attributionCookieHeaders(request)).toEqual([])
  })

  it('已有 first_referrer cookie、非 GET 或非 HTML 请求都不写 referrer', () => {
    const withCookie = new Request('https://example.com/pricing', {
      headers: {
        accept: 'text/html',
        referer: 'https://www.google.com/search',
        cookie: 'first_referrer=https://www.google.com/search',
      },
    })
    expect(attributionCookieHeaders(withCookie)).toEqual([])

    const post = new Request('https://example.com/pricing', {
      method: 'POST',
      headers: { accept: 'text/html', referer: 'https://www.google.com/search' },
    })
    expect(attributionCookieHeaders(post)).toEqual([])

    const api = new Request('https://example.com/api/data', {
      headers: { accept: 'application/json', referer: 'https://www.google.com/search' },
    })
    expect(attributionCookieHeaders(api)).toEqual([])
  })
})

describe('readAttribution', () => {
  it('readAttribution 解码 cookie 并归一 country', () => {
    const headers = new Headers({
      cookie: [
        'utm_source=campaign',
        'utm_medium=cpc',
        `first_referrer=${encodeURIComponent('https://www.google.com/search?q=saas')}`,
      ].join('; '),
      'cf-ipcountry': 'us',
      'cf-connecting-ip': '203.0.113.9',
      'accept-language': 'en-US,en;q=0.9',
    })
    expect(readAttribution(headers)).toEqual({
      utmSource: 'campaign',
      utmMedium: 'cpc',
      utmCampaign: '',
      utmTerm: '',
      utmContent: '',
      referrer: 'https://www.google.com/search',
      country: 'US',
      ip: '203.0.113.9',
      locale: 'en',
    })
  })

  it('readAttribution 对伪造、超长与非法编码 cookie 再次清洗且不抛错', () => {
    const headers = new Headers({
      // 1000 个 A、带 query 的超长 referrer、非法百分号编码、大写 CC 都来自客户端。
      cookie: [
        `utm_source=${'A'.repeat(1000)}`,
        `utm_campaign=${encodeURIComponent(`https://evil.example/?q=${'B'.repeat(2000)}`)}`,
        'utm_content=E%0A4%ZZA',
        `${REFERRER_COOKIE}=`,
        'utm_term=ok_term',
      ].join('; '),
      'cf-ipcountry': 'xx',
      'x-forwarded-for': '198.51.100.7, 10.0.0.1',
    })
    const attribution = readAttribution(headers)
    expect(attribution.utmSource).toBe('A'.repeat(100))
    expect(attribution.utmCampaign).toContain('https')
    expect(attribution.utmCampaign).not.toContain('?')
    // 非法百分号编码不在解码处抛错；非法字符在清洗时被剔除。
    expect(attribution.utmContent).toBe('E0A4ZZA')
    // 无值的 cookie 表示未归因，而不是把空串当外部来源。
    expect(attribution.referrer).toBe('')
    expect(attribution.utmTerm).toBe('ok_term')
    expect(attribution.country).toBe('')
    expect(attribution.ip).toBe('198.51.100.7')
    expect(attribution.locale).toBe('')
  })

  it('readAttribution 过滤伪造的同站 referrer，外部来源保留', () => {
    const cookieFor = (url: string) =>
      new Headers({ host: 'example.com', cookie: `first_referrer=${encodeURIComponent(url)}` })

    expect(readAttribution(cookieFor('https://example.com/pricing')).referrer).toBe('')
    expect(readAttribution(cookieFor('https://app.example.com/pricing')).referrer).toBe('')
    expect(readAttribution(cookieFor('https://www.google.com/search?a=1')).referrer).toBe(
      'https://www.google.com/search',
    )
  })
})

describe('withAttributionCookies', () => {
  it('保留既有 Set-Cookie 并追加归因 Set-Cookie', () => {
    const request = new Request('https://example.com/pricing?utm_source=spring')
    const response = new Response('ok', {
      headers: {
        'Content-Type': 'text/plain',
        'Set-Cookie': 'NEXT_LOCALE=zh; Path=/; SameSite=Lax',
      },
    })

    const result = withAttributionCookies(response, request)
    expect(result.status).toBe(200)
    expect(result.headers.get('content-type')).toBe('text/plain')
    expect(result.headers.getSetCookie()).toEqual([
      'NEXT_LOCALE=zh; Path=/; SameSite=Lax',
      `utm_source=spring; ${UTM_MAX_AGE}`,
    ])
  })

  it('没有归因 cookie 时原样返回同一响应对象', () => {
    const request = new Request('https://example.com/pricing')
    const response = new Response('ok')
    expect(withAttributionCookies(response, request)).toBe(response)
  })
})

describe('请求头派生字段', () => {
  it('guessLocaleFromAcceptLanguage 复用既有语言解析', () => {
    expect(guessLocaleFromAcceptLanguage('en-US,en;q=0.9')).toBe('en')
    expect(guessLocaleFromAcceptLanguage('zh-CN,zh;q=0.9')).toBe('zh')
    expect(guessLocaleFromAcceptLanguage('fr-FR,fr;q=0.9')).toBe('')
    expect(guessLocaleFromAcceptLanguage(null)).toBe('')
  })

  it('getCountryFromHeaders 只接受两位字母国家码', () => {
    expect(getCountryFromHeaders(new Headers({ 'cf-ipcountry': 'jp' }))).toBe('JP')
    expect(getCountryFromHeaders(new Headers({ 'cf-ipcountry': 'XX' }))).toBe('')
    expect(getCountryFromHeaders(new Headers({ 'cf-ipcountry': 'USA' }))).toBe('')
    expect(getCountryFromHeaders(new Headers())).toBe('')
  })

  it('getClientIpFromHeaders 优先 cf-connecting-ip', () => {
    expect(
      getClientIpFromHeaders(
        new Headers({
          'cf-connecting-ip': '203.0.113.9',
          'x-forwarded-for': '198.51.100.7',
        }),
      ),
    ).toBe('203.0.113.9')
    expect(
      getClientIpFromHeaders(new Headers({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' })),
    ).toBe('198.51.100.7')
    expect(getClientIpFromHeaders(new Headers())).toBe('')
  })
})
