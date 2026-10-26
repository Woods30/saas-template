import { describe, expect, it } from 'vitest'
import { resolveRedirectTarget, safeInternalPath, safeSameOriginUrl } from '@/lib/urls'

describe('safeInternalPath', () => {
  it('接受站内相对路径', () => {
    expect(safeInternalPath('/pricing')).toBe('/pricing')
    expect(safeInternalPath('/dashboard/billing?checkout=success')).toBe(
      '/dashboard/billing?checkout=success',
    )
    expect(safeInternalPath('/a/b#section')).toBe('/a/b#section')
    expect(safeInternalPath('/')).toBe('/')
  })

  it('拒绝绝对 URL 与协议相对 URL', () => {
    expect(safeInternalPath('https://evil.com')).toBeUndefined()
    expect(safeInternalPath('http://evil.com/phish')).toBeUndefined()
    expect(safeInternalPath('//evil.com')).toBeUndefined()
    expect(safeInternalPath('///evil.com')).toBeUndefined()
    // 无协议域名形式浏览器当相对路径，但仍可能落到外站，直接拒。
    expect(safeInternalPath('evil.com')).toBeUndefined()
    expect(safeInternalPath('pricing')).toBeUndefined()
    expect(safeInternalPath('')).toBeUndefined()
  })

  it('拒绝反斜杠——浏览器把它当 /', () => {
    expect(safeInternalPath('/\\evil.com')).toBeUndefined()
    expect(safeInternalPath('\\\\evil.com')).toBeUndefined()
    expect(safeInternalPath('/a\\b')).toBeUndefined()
  })

  it('拒绝控制字符——浏览器解析前会剥离它们', () => {
    // tab / 换行被删除后 `/\t/evil.com` 变成 `//evil.com`。
    expect(safeInternalPath('/\t/evil.com')).toBeUndefined()
    expect(safeInternalPath('/\n/evil.com')).toBeUndefined()
    expect(safeInternalPath('/\r/evil.com')).toBeUndefined()
    expect(safeInternalPath('/pricing\u0000')).toBeUndefined()
    expect(safeInternalPath('/pricing\u007f')).toBeUndefined()
  })

  it('百分号编码不会改变 origin', () => {
    // `%2F` 不被解码成 `/`，仍是本站路径段（与会被解析器删除的控制字符相反）。
    expect(safeInternalPath('/%2f%2fevil.com')).toBe('/%2f%2fevil.com')
    expect(safeInternalPath('/%5Cevil.com')).toBe('/%5Cevil.com')
  })

  it('非字符串一律拒绝', () => {
    expect(safeInternalPath(undefined)).toBeUndefined()
    expect(safeInternalPath(null)).toBeUndefined()
    expect(safeInternalPath(42)).toBeUndefined()
    expect(safeInternalPath({ redirect: '/pricing' })).toBeUndefined()
    expect(safeInternalPath(['/pricing'])).toBeUndefined()
  })
})

describe('resolveRedirectTarget', () => {
  it('合法路径原样返回', () => {
    expect(resolveRedirectTarget('/pricing')).toBe('/pricing')
  })

  it('非法路径回落站点根', () => {
    expect(resolveRedirectTarget('//evil.com')).toBe('/')
    expect(resolveRedirectTarget('/\t/evil.com')).toBe('/')
    expect(resolveRedirectTarget(undefined)).toBe('/')
  })
})

describe('safeSameOriginUrl', () => {
  it('接受与站点基址同源的绝对地址', () => {
    expect(safeSameOriginUrl('https://example.com/zh/dashboard/billing?checkout=success')).toBe(
      'https://example.com/zh/dashboard/billing?checkout=success',
    )
    expect(safeSameOriginUrl('https://example.com/pricing?checkout=cancelled')).toBe(
      'https://example.com/pricing?checkout=cancelled',
    )
  })

  it('拒绝外域地址', () => {
    expect(safeSameOriginUrl('https://evil.com/phish')).toBeUndefined()
    // 后缀相似但不同源：origin 比较要能挡住。
    expect(safeSameOriginUrl('https://example.com.evil.com/phish')).toBeUndefined()
    expect(safeSameOriginUrl('http://example.com/phish')).toBeUndefined()
  })

  it('拒绝非 http(s) 协议与相对路径', () => {
    expect(safeSameOriginUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeSameOriginUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(safeSameOriginUrl('//example.com/x')).toBeUndefined()
    expect(safeSameOriginUrl('/dashboard/billing')).toBeUndefined()
  })

  it('拒绝非字符串', () => {
    expect(safeSameOriginUrl(undefined)).toBeUndefined()
    expect(safeSameOriginUrl(null)).toBeUndefined()
    expect(safeSameOriginUrl(42)).toBeUndefined()
    expect(safeSameOriginUrl({ successUrl: 'https://example.com' })).toBeUndefined()
  })

  it('配置基址之外的 origin 一律拒绝', () => {
    // 单测环境的 `VITE_BASE_URL` 是 https://example.com。
    // 请求自身的 origin 不算数：Host 头由客户端控制，攻击者自造 `Host: evil.com`
    // 就能让外域 URL 通过校验，所以白名单只能来自配置。
    expect(safeSameOriginUrl('http://127.0.0.1:3000/x')).toBeUndefined()
    expect(safeSameOriginUrl('https://jerbix.dev/x')).toBeUndefined()
  })
})
