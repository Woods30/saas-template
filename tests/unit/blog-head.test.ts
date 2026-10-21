import { afterEach, describe, expect, it } from 'vitest'
import { overwriteServerAsyncLocalStorage } from '@/locale/paraglide/runtime.js'
import { Route as BlogPostRoute } from '@/routes/{-$locale}/_layout/marketing/blog/$slug'
import { Route as BlogIndexRoute } from '@/routes/{-$locale}/_layout/marketing/blog/index'
import { Route as ChangelogRoute } from '@/routes/{-$locale}/_layout/marketing/changelog/index'

/**
 * 博客 / changelog `head()` 的 canonical 与 hreflang 回归。
 *
 * 曾把 path 写成 `/blog/${title}`（缺 locale 前缀，且用标题当路径段），导致
 * canonical 与 alternate 都指向不存在的路由。
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

describe('博客列表页 head 的 canonical / hreflang', () => {
  it('canonical 指向真实路由 /marketing/blog', () => {
    withRequestLocale('zh')
    const head = (BlogIndexRoute.options.head as unknown as () => HeadResult)()
    expect(canonicalHref(head)).toMatch(/\/marketing\/blog$/)
  })

  it('hreflang alternate 同样基于 /marketing/blog', () => {
    withRequestLocale('zh')
    const head = (BlogIndexRoute.options.head as unknown as () => HeadResult)()
    const alternates = alternateHrefs(head)
    expect(alternates.length).toBeGreaterThan(0)
    for (const href of alternates) {
      expect(href).toMatch(/\/marketing\/blog$/)
    }
  })
})

describe('博客详情页 head 的 canonical / hreflang', () => {
  interface LoaderData {
    title: string
    description: string
    path: string
  }

  function runPostHead(loaderData: LoaderData): HeadResult {
    const head = BlogPostRoute.options.head as unknown as (ctx: {
      loaderData: LoaderData
    }) => HeadResult
    return head({ loaderData })
  }

  it('canonical 用真实 slug（_meta.path）拼出 /marketing/blog/<slug>', () => {
    withRequestLocale('zh')
    const head = runPostHead({ title: 'Hello, World', description: 'desc', path: 'hello-world' })
    expect(canonicalHref(head)).toMatch(/\/marketing\/blog\/hello-world$/)
  })

  it('canonical 不使用 title 作为路径段（含空格 / 中文的标题不进 URL）', () => {
    withRequestLocale('zh')
    const head = runPostHead({ title: '你好，世界', description: '描述', path: 'hello-world.zh' })
    const href = canonicalHref(head) ?? ''
    expect(href).toMatch(/\/marketing\/blog\/hello-world\.zh$/)
    expect(href).not.toContain('你好')
  })

  it('hreflang alternate 基于 /marketing/blog/<slug>', () => {
    withRequestLocale('zh')
    const head = runPostHead({ title: 'Hello, World', description: 'desc', path: 'hello-world' })
    const alternates = alternateHrefs(head)
    expect(alternates.length).toBeGreaterThan(0)
    for (const href of alternates) {
      expect(href).toMatch(/\/en\/marketing\/blog\/hello-world$/)
    }
  })
})

describe('changelog 页 head 的 canonical', () => {
  it('canonical 指向真实路由 /marketing/changelog', () => {
    withRequestLocale('zh')
    const head = (ChangelogRoute.options.head as unknown as () => HeadResult)()
    expect(canonicalHref(head)).toMatch(/\/marketing\/changelog$/)
  })
})
