import { describe, expect, it } from 'vitest'
import { buildCspHeader, generateNonce } from '@/lib/security'

describe('buildCspHeader', () => {
  it('包含 default-src self', () => {
    const header = buildCspHeader('test-nonce')
    expect(header).toContain("default-src 'self'")
  })

  it('script-src 包含 nonce 且无 unsafe-inline', () => {
    const nonce = 'abc123'
    const header = buildCspHeader(nonce)
    expect(header).toContain(`script-src 'self' 'nonce-${nonce}'`)
    expect(header).not.toContain("script-src 'self' 'unsafe-inline'")
  })

  it('frame-ancestors 为 none', () => {
    const header = buildCspHeader('any-nonce')
    expect(header).toContain("frame-ancestors 'none'")
  })

  it('connect-src 包含 stripe 和 analytics origins', () => {
    const header = buildCspHeader('any-nonce')
    expect(header).toContain('https://*.stripe.com')
    expect(header).toContain('https://plausible.io')
    expect(header).toContain('https://www.googletagmanager.com')
    expect(header).toContain('https://www.clarity.ms')
    expect(header).toContain('https://*.umami.is')
  })

  it('connect-src 包含 self', () => {
    const header = buildCspHeader('any-nonce')
    expect(header).toContain("connect-src 'self'")
  })

  it('frame-src 包含 stripe js 域名', () => {
    const header = buildCspHeader('any-nonce')
    expect(header).toContain('https://js.stripe.com')
  })

  it('style-src 包含 unsafe-inline（Tailwind 需要）', () => {
    const header = buildCspHeader('any-nonce')
    expect(header).toContain("style-src 'self' 'unsafe-inline'")
  })

  it('不同 nonce 产生不同 header', () => {
    const header1 = buildCspHeader('nonce1')
    const header2 = buildCspHeader('nonce2')
    expect(header1).not.toBe(header2)
  })
})

describe('generateNonce', () => {
  it('返回非空字符串', () => {
    const nonce = generateNonce()
    expect(nonce).toBeTruthy()
    expect(typeof nonce).toBe('string')
    expect(nonce.length).toBeGreaterThan(0)
  })

  it('每次调用返回不同的 nonce', () => {
    const nonce1 = generateNonce()
    const nonce2 = generateNonce()
    expect(nonce1).not.toBe(nonce2)
  })

  it('返回的值不包含 base64 填充字符', () => {
    const nonce = generateNonce()
    expect(nonce).not.toContain('+')
    expect(nonce).not.toContain('/')
    expect(nonce).not.toContain('=')
  })

  it('返回值是 URL 安全 base64', () => {
    const nonce = generateNonce()
    // URL-safe base64 uses - and _ instead of + and /
    expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})
