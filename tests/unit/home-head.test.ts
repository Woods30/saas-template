import { afterEach, describe, expect, it } from 'vitest'
import { overwriteServerAsyncLocalStorage } from '@/locale/paraglide/runtime.js'

/**
 * 首页 `head()` 的 i18n 回归测试。
 *
 * 缺陷背景：首页曾用 `websiteConfig.metadata.description`（模块加载期求值的中文字面量），
 * 使 `<html lang="en">` 的页面仍输出中文 `<meta name="description">`，覆盖根路由按语言
 * 输出的 description。修复后 `head()` 内调用 `m.*()`，随请求语言变化。
 *
 * SSR 中 Paraglide 通过 AsyncLocalStorage 按请求写入语言；这里用假的 ALS store 复现
 * 「每请求调用 `head()`」的语义，从而在单测层验证语言切换（无需真实 dev server）。
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
async function runHomeHead(): Promise<HeadResult> {
  const { Route } = await import('@/routes/{-$locale}/_layout/marketing/index')
  const head = Route.options.head as unknown as () => HeadResult
  return head()
}

afterEach(() => {
  overwriteServerAsyncLocalStorage(undefined)
})

describe('首页 head 的 i18n', () => {
  it('description 随请求语言变化（en 输出英文）', async () => {
    withRequestLocale('en')
    const en = await runHomeHead()
    expect(en.meta).toContainEqual({
      name: 'description',
      content: 'A SaaS starter built on TanStack Start and Cloudflare Workers',
    })

    withRequestLocale('zh')
    const zh = await runHomeHead()
    expect(zh.meta).toContainEqual({
      name: 'description',
      content: '基于 TanStack Start 与 Cloudflare Workers 的 SaaS 起手模板',
    })
  })

  it('英文请求不输出中文 description（回归缺陷）', async () => {
    withRequestLocale('en')
    const en = await runHomeHead()
    const description = en.meta.find((entry) => entry.name === 'description')
    expect(description?.content).not.toContain('起手模板')
  })
})
