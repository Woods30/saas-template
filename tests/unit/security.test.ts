import { describe, expect, it } from 'vitest'
import { addNonceToInlineScripts, buildCspHeader, generateNonce } from '@/lib/security'

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

/**
 * `addNonceToInlineScripts` rewrites the response stream so every inline
 * `<script>` tag carries the CSP nonce. These tests exercise the underlying
 * tag-detection logic through a small in-process roundtrip.
 */
async function streamRewritten(response: Response, nonce: string): Promise<string> {
  const out = addNonceToInlineScripts(response, nonce)
  return await out.text()
}

describe('addNonceToInlineScripts', () => {
  const nonce = 'abc-test-nonce'

  it('对非 HTML 响应原样返回（不转译 JSON / 二进制）', async () => {
    const original = new Response(JSON.stringify({ a: 1 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    const rewritten = addNonceToInlineScripts(original, nonce)
    expect(rewritten).toBe(original)
  })

  it('为 inline <script> 标签补上 nonce', async () => {
    const html = `<html><head><script>foo</script></head><body></body></html>`
    const out = await streamRewritten(
      new Response(html, { headers: { 'Content-Type': 'text/html' } }),
      nonce,
    )
    expect(out).toContain(`<script nonce="${nonce}">foo</script>`)
  })

  it('为带其他属性的 inline <script> 标签补上 nonce（属性后追加）', async () => {
    const html = `<html><head><script data-tsr-stream-part="">bootstrap</script></head></html>`
    const out = await streamRewritten(
      new Response(html, { headers: { 'Content-Type': 'text/html' } }),
      nonce,
    )
    expect(out).toContain(`<script data-tsr-stream-part="" nonce="${nonce}">bootstrap</script>`)
  })

  it('已经有 nonce 的 script 标签不重复添加', async () => {
    const html = `<script nonce="existing">x</script>`
    const out = await streamRewritten(
      new Response(html, { headers: { 'Content-Type': 'text/html' } }),
      nonce,
    )
    expect(out).toContain('nonce="existing"')
    expect(out).not.toContain(`nonce="${nonce}"`)
  })

  it('外部 <script src="…"> 标签不修改（已由 self 放行）', async () => {
    const html = `<script src="/assets/index.js"></script>`
    const out = await streamRewritten(
      new Response(html, { headers: { 'Content-Type': 'text/html' } }),
      nonce,
    )
    expect(out).toBe(html)
  })

  it('JSON-LD <script type="application/ld+json"> 不补 nonce（CSP 不需要）', async () => {
    // JSON-LD is structured data, not executable JavaScript. CSP `script-src`
    // does not block it, and adding a nonce would create a server/client
    // hydration mismatch with the `JsonLd` component (which renders the tag
    // without a nonce attribute).
    const html = `<script type="application/ld+json">{"@context":"x"}</script>`
    const out = await streamRewritten(
      new Response(html, { headers: { 'Content-Type': 'text/html' } }),
      nonce,
    )
    expect(out).toBe(html)
  })

  it('混合 inline / external / 已有 nonce 的脚本一次处理', async () => {
    const html = [
      '<!doctype html><html><head>',
      '<script>inline1</script>',
      '<script src="/a.js"></script>',
      '<script nonce="x">already</script>',
      '<script data-x>y</script>',
      '</head></html>',
    ].join('')
    const out = await streamRewritten(
      new Response(html, { headers: { 'Content-Type': 'text/html' } }),
      nonce,
    )
    // inline 加 nonce
    expect(out).toContain(`<script nonce="${nonce}">inline1</script>`)
    // src 不变
    expect(out).toContain('<script src="/a.js"></script>')
    // 已有 nonce 不变
    expect(out).toContain('<script nonce="x">already</script>')
    // 属性后追加
    expect(out).toContain(`<script data-x nonce="${nonce}">y</script>`)
  })

  it('空 body 不抛错', async () => {
    const out = await streamRewritten(
      new Response('', { headers: { 'Content-Type': 'text/html' } }),
      nonce,
    )
    expect(out).toBe('')
  })
})
