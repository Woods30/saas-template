import { afterEach, describe, expect, it } from 'vitest'
import { overwriteServerAsyncLocalStorage } from '@/locale/paraglide/runtime.js'
import { Route as RoadmapRoute } from '@/routes/{-$locale}/_layout/marketing/roadmap'

/**
 * roadmap 页 `head()` 的 canonical 回归：`seo()` 的 path 曾漏 `marketing` 前缀，
 * canonical 与 hreflang 都指向不存在的地址而页面看起来正常。
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

afterEach(() => {
  overwriteServerAsyncLocalStorage(undefined)
})

describe('roadmap 页 head 的 canonical / hreflang', () => {
  function runHead(): HeadResult {
    const head = RoadmapRoute.options.head as unknown as () => HeadResult
    return head()
  }

  it.each(['zh', 'en'] as const)('%s 的 canonical 指向真实路由 /marketing/roadmap', (locale) => {
    withRequestLocale(locale)
    expect(canonicalHref(runHead())).toMatch(/\/marketing\/roadmap$/)
  })

  it('hreflang alternate 同样基于 /marketing/roadmap', () => {
    withRequestLocale('zh')
    const alternates = runHead().links.filter(
      (link) => link.rel === 'alternate' && link.hrefLang !== 'x-default',
    )
    expect(alternates.length).toBeGreaterThan(0)
    for (const link of alternates) {
      expect(link.href ?? '').toMatch(/\/en\/marketing\/roadmap$/)
    }
  })

  it('输出 x-default 兜底，指向默认语言', () => {
    withRequestLocale('zh')
    const xDefault = runHead().links.find((link) => link.hrefLang === 'x-default')
    expect(xDefault?.href ?? '').toMatch(/\/zh\/marketing\/roadmap$/)
  })
})
