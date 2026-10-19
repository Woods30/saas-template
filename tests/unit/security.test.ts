import { describe, expect, it } from 'vitest'
import {
  addNonceToInlineScripts,
  buildCspHeader,
  generateNonce,
  getAnalyticsScriptOrigins,
} from '@/lib/security'

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

// ---------------------------------------------------------------------------
// script-src 允许分析脚本（生产环境必须，否则浏览器全部拦截）
// ---------------------------------------------------------------------------

describe('buildCspHeader — script-src 允许分析脚本', () => {
  it('未启用分析时 script-src 仍是 self + nonce + 固定分析源，绝不放 unsafe-inline', () => {
    const header = buildCspHeader('n')
    // 取 script-src 指令本身，避免误匹配 connect-src 里的同名 origin。
    const scriptSrc = header
      .split('; ')
      .find((d) => d.startsWith('script-src'))
      ?.trim()
    expect(scriptSrc).toBe(
      "script-src 'self' 'nonce-n' https://www.googletagmanager.com https://plausible.io https://www.clarity.ms",
    )
  })

  it('显式传入的 analysis origin 出现在 script-src', () => {
    const header = buildCspHeader('n', ['https://plausible.io'])
    const scriptSrc = header.split('; ').find((d) => d.startsWith('script-src'))
    expect(scriptSrc).toContain('https://plausible.io')
    // 不会因为加了一个 origin 就放宽成 unsafe-inline。
    expect(scriptSrc).not.toContain("'unsafe-inline'")
  })

  it('默认包含三家固定域名的分析脚本', () => {
    // GA / Plausible / Clarity 的脚本 origin 是写死的，启用时直接放行。
    const header = buildCspHeader('n')
    const scriptSrc = header.split('; ').find((d) => d.startsWith('script-src'))
    expect(scriptSrc).toContain('https://www.googletagmanager.com')
    expect(scriptSrc).toContain('https://plausible.io')
    expect(scriptSrc).toContain('https://www.clarity.ms')
  })

  it('重复传入同一 origin 不产生重复项', () => {
    const header = buildCspHeader('n', ['https://plausible.io', 'https://plausible.io'])
    const scriptSrc = header.split('; ').find((d) => d.startsWith('script-src'))
    const occurrences = scriptSrc?.match(/https:\/\/plausible\.io/g)?.length ?? 0
    expect(occurrences).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// getAnalyticsScriptOrigins — 只放行真的会注入脚本的 provider
// ---------------------------------------------------------------------------

describe('getAnalyticsScriptOrigins', () => {
  const base = {
    VITE_GA_ID: 'G-XXX',
    VITE_PLAUSIBLE_DOMAIN: 'jerbix.dev',
    VITE_UMAMI_WEBSITE_ID: 'site-1',
    VITE_UMAMI_SCRIPT_URL: 'https://stats.jerbix.dev/script.js',
    VITE_CLARITY_PROJECT_ID: 'clarity-1',
  }

  it('analytics 关闭时返回空数组', () => {
    expect(
      getAnalyticsScriptOrigins({
        analytics: { enabled: false, providers: ['ga', 'plausible', 'umami', 'clarity'] },
        publicEnv: base,
      }),
    ).toEqual([])
  })

  it('未选中任何 provider 时返回空数组', () => {
    expect(
      getAnalyticsScriptOrigins({
        analytics: { enabled: true, providers: [] },
        publicEnv: base,
      }),
    ).toEqual([])
  })

  it('GA 选中但有 ID 缺失时不放行', () => {
    expect(
      getAnalyticsScriptOrigins({
        analytics: { enabled: true, providers: ['ga'] },
        publicEnv: { ...base, VITE_GA_ID: undefined },
      }),
    ).toEqual([])
  })

  it('Plausible 选中且有 domain 时放行', () => {
    expect(
      getAnalyticsScriptOrigins({
        analytics: { enabled: true, providers: ['plausible'] },
        publicEnv: base,
      }),
    ).toEqual(['https://plausible.io'])
  })

  it('Clarity 选中且有 project ID 时放行', () => {
    expect(
      getAnalyticsScriptOrigins({
        analytics: { enabled: true, providers: ['clarity'] },
        publicEnv: base,
      }),
    ).toEqual(['https://www.clarity.ms'])
  })

  it('Umami 的自托管脚本 URL 取 origin，不含路径', () => {
    expect(
      getAnalyticsScriptOrigins({
        analytics: { enabled: true, providers: ['umami'] },
        publicEnv: base,
      }),
    ).toEqual(['https://stats.jerbix.dev'])
  })

  it('Umami 缺脚本 URL 时不放行', () => {
    expect(
      getAnalyticsScriptOrigins({
        analytics: { enabled: true, providers: ['umami'] },
        publicEnv: { ...base, VITE_UMAMI_SCRIPT_URL: undefined },
      }),
    ).toEqual([])
  })

  it('Umami 的兼容字段 VITE_UMAMI_ID 同样有效', () => {
    expect(
      getAnalyticsScriptOrigins({
        analytics: { enabled: true, providers: ['umami'] },
        publicEnv: { ...base, VITE_UMAMI_WEBSITE_ID: undefined, VITE_UMAMI_ID: 'legacy-site' },
      }),
    ).toEqual(['https://stats.jerbix.dev'])
  })

  it('Clarity 的兼容字段 VITE_CLARITY_ID 同样有效', () => {
    expect(
      getAnalyticsScriptOrigins({
        analytics: { enabled: true, providers: ['clarity'] },
        publicEnv: { ...base, VITE_CLARITY_PROJECT_ID: undefined, VITE_CLARITY_ID: 'legacy' },
      }),
    ).toEqual(['https://www.clarity.ms'])
  })

  it('Umami 脚本 URL 非法时静默跳过，不写入来源不明字符串', () => {
    expect(
      getAnalyticsScriptOrigins({
        analytics: { enabled: true, providers: ['umami'] },
        publicEnv: { ...base, VITE_UMAMI_SCRIPT_URL: 'not a url' },
      }),
    ).toEqual([])
  })

  it('多个 provider 同时启用时去重且顺序稳定', () => {
    const origins = getAnalyticsScriptOrigins({
      analytics: { enabled: true, providers: ['ga', 'plausible', 'umami', 'clarity'] },
      publicEnv: base,
    })
    expect(origins).toEqual([
      'https://www.googletagmanager.com',
      'https://plausible.io',
      'https://stats.jerbix.dev',
      'https://www.clarity.ms',
    ])
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
