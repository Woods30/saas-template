import { afterEach, describe, expect, it } from 'vitest'
import { articleJsonLd } from '@/lib/json-ld'
import { overwriteServerAsyncLocalStorage } from '@/locale/paraglide/runtime.js'
import { Route as DocSlugRoute } from '@/routes/{-$locale}/_layout/docs/$slug'
import { Route as LegalSlugRoute } from '@/routes/{-$locale}/_layout/marketing/legal/$slug'

/**
 * legal / docs `head()` 与 JSON-LD 的 canonical / hreflang 回归。
 *
 * 曾用内容标题当路径段（legal 还缺 `marketing` 前缀），导致 canonical 与 alternate
 * 都指向不存在的路由。这里验证路径基于真实 slug 且不泄漏中文标题。
 */

interface HeadLink {
  rel?: string
  href?: string
  hrefLang?: string
}

interface HeadResult {
  meta: { title?: string; name?: string; content?: string; property?: string }[]
  links: HeadLink[]
}

/** 固定当前请求语言，等价于 `paraglideMiddleware` 按请求写入 ALS。 */
function withRequestLocale(locale: 'zh' | 'en'): void {
  overwriteServerAsyncLocalStorage({
    getStore: () => ({ locale }),
    run: (_store, callback) => callback(),
  })
}

function canonicalHref(head: HeadResult): string | undefined {
  return head.links.find((link) => link.rel === 'canonical')?.href
}

/** 只取真实翻译的 alternate：`x-default` 是兜底项，不属于「另一个语言版本」。 */
function alternateHrefs(head: HeadResult): string[] {
  return head.links
    .filter((link) => link.rel === 'alternate' && link.hrefLang !== 'x-default')
    .map((link) => link.href ?? '')
}

afterEach(() => {
  overwriteServerAsyncLocalStorage(undefined)
})

describe('legal 详情页 head 的 canonical / hreflang', () => {
  interface LoaderData {
    title: string
    slug: string
  }

  function runLegalHead(loaderData: LoaderData): HeadResult {
    const head = LegalSlugRoute.options.head as unknown as (ctx: {
      loaderData: LoaderData
    }) => HeadResult
    return head({ loaderData })
  }

  it('canonical 指向真实路由 /marketing/legal/<slug>', () => {
    withRequestLocale('zh')
    const head = runLegalHead({ title: '服务条款', slug: 'terms' })
    expect(canonicalHref(head)).toMatch(/\/marketing\/legal\/terms$/)
  })

  it('canonical 不使用 title 作为路径段（中文标题不进 URL）', () => {
    withRequestLocale('zh')
    const head = runLegalHead({ title: '服务条款', slug: 'terms' })
    const href = canonicalHref(head) ?? ''
    expect(href).not.toContain('服务条款')
  })

  it('hreflang alternate 基于 /marketing/legal/<slug>', () => {
    withRequestLocale('zh')
    const head = runLegalHead({ title: '服务条款', slug: 'terms' })
    const alternates = alternateHrefs(head)
    expect(alternates.length).toBeGreaterThan(0)
    for (const href of alternates) {
      expect(href).toMatch(/\/en\/marketing\/legal\/terms$/)
    }
  })
})

describe('docs 详情页 head 的 canonical / hreflang', () => {
  interface LoaderData {
    title: string
    description: string
    content: string
    slug: string
  }

  function runDocHead(loaderData: LoaderData): HeadResult {
    const head = DocSlugRoute.options.head as unknown as (ctx: {
      loaderData: LoaderData
    }) => HeadResult
    return head({ loaderData })
  }

  it('canonical 用真实 slug 拼出 /docs/<slug>', () => {
    withRequestLocale('zh')
    const head = runDocHead({
      title: '快速开始',
      description: '描述',
      content: '',
      slug: 'getting-started',
    })
    expect(canonicalHref(head)).toMatch(/\/docs\/getting-started$/)
  })

  it('canonical 不使用 title 作为路径段（中文标题不进 URL）', () => {
    withRequestLocale('zh')
    const head = runDocHead({
      title: '快速开始',
      description: '描述',
      content: '',
      slug: 'getting-started',
    })
    const href = canonicalHref(head) ?? ''
    expect(href).not.toContain('快速开始')
  })

  it('hreflang alternate 基于 /docs/<slug>', () => {
    withRequestLocale('zh')
    const head = runDocHead({
      title: '快速开始',
      description: '描述',
      content: '',
      slug: 'getting-started',
    })
    const alternates = alternateHrefs(head)
    expect(alternates.length).toBeGreaterThan(0)
    for (const href of alternates) {
      expect(href).toMatch(/\/en\/docs\/getting-started$/)
    }
  })
})

describe('articleJsonLd 的 Article.url', () => {
  it('用传入 path 拼出 url（/marketing/blog/<slug>）', () => {
    const data = articleJsonLd({
      title: 'Hello, World',
      description: 'desc',
      date: '2026-01-01',
      path: '/marketing/blog/hello-world',
    })
    expect(data.url).toMatch(/\/marketing\/blog\/hello-world$/)
  })
})
