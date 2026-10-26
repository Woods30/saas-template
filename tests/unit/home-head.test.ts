import { afterEach, describe, expect, it } from 'vitest'
import { overwriteServerAsyncLocalStorage } from '@/locale/paraglide/runtime.js'
import { Route } from '@/routes/{-$locale}/index'

/**
 * 首页 `head()` 的 i18n 回归：曾用模块加载期求值的中文 description，
 * 使英文页面也输出中文。用假 ALS store 复现每请求调用 `head()`。
 */

interface HeadMeta {
  title?: string
  name?: string
  content?: string
}

interface HeadResult {
  meta: HeadMeta[]
}

/** 固定当前请求语言，等价于 `paraglideMiddleware` 按请求写入 ALS。 */
function withRequestLocale(locale: 'zh' | 'en'): void {
  overwriteServerAsyncLocalStorage({
    getStore: () => ({ locale }),
    run: (_store, callback) => callback(),
  })
}

/** 取出路由的 `head()` 并调用（`head` 是每请求调用的函数）。 */
function runHomeHead(): HeadResult {
  const head = Route.options.head as unknown as () => HeadResult
  return head()
}

afterEach(() => {
  overwriteServerAsyncLocalStorage(undefined)
})

describe('首页 head 的 i18n', () => {
  it.each(['zh', 'en'] as const)('%s 首页与 OG 标题明确品牌和产品技术栈', (locale) => {
    withRequestLocale(locale)
    const { meta } = runHomeHead()
    const title = 'Jerbix – TanStack Start SaaS Starter Kit'
    expect(meta).toContainEqual({ title })
    expect(meta).toContainEqual({ property: 'og:title', content: title })
  })
  it('description 随请求语言变化（en 输出英文）', () => {
    withRequestLocale('en')
    const en = runHomeHead()
    expect(en.meta).toContainEqual({
      name: 'description',
      content:
        'Jerbix is a customizable SaaS starter for indie developers, built on TanStack Start and Cloudflare Workers to reduce repetitive auth, payment, and content integration work.',
    })

    withRequestLocale('zh')
    const zh = runHomeHead()
    expect(zh.meta).toContainEqual({
      name: 'description',
      content:
        'Jerbix 是面向独立开发者的 SaaS Starter 源码起步工程，基于 TanStack Start 与 Cloudflare Workers，减少认证、支付与内容模块的重复接线。',
    })
  })

  it('英文请求不输出中文 description（回归缺陷）', () => {
    withRequestLocale('en')
    const en = runHomeHead()
    const description = en.meta.find((entry) => entry.name === 'description')
    expect(description?.content).not.toMatch(/[㐀-鿿]/u)
  })
})
