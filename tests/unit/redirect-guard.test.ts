import { describe, expect, it } from 'vitest'
import { resolveRedirectTarget, safeInternalPath } from '@/lib/urls'

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
    // 无协议的「域名」形式：浏览器会当相对路径，但落到外站仍需主机名，直接拒
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
    // tab / 换行被删除后 `/\t/evil.com` 变成 `//evil.com`
    expect(safeInternalPath('/\t/evil.com')).toBeUndefined()
    expect(safeInternalPath('/\n/evil.com')).toBeUndefined()
    expect(safeInternalPath('/\r/evil.com')).toBeUndefined()
    expect(safeInternalPath('/pricing\u0000')).toBeUndefined()
    expect(safeInternalPath('/pricing\u007f')).toBeUndefined()
  })

  it('百分号编码不会改变 origin', () => {
    // `%2F` 在 path 里是普通字符，不被解码成 `/`，因此仍是本站路径下的路径段；
    // origin 检查确认了这一点。这与控制字符相反——后者会被解析器真的删除。
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
