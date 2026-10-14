import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setLocale } from '@/locale/paraglide/runtime.js'
import { getRouter } from '@/router'

/**
 * 博客详情页 JSON-LD 的回归测试（渲染真实路由组件）。
 *
 * 缺陷背景：`BlogPost` 组件里 `articleJsonLd({ path: `/blog/${post._meta.path}` })`
 * 仍用旧前缀 `/blog`，输出的 JSON-LD `Article.url` 指向 404（真实路由前缀是
 * `/marketing/blog`）。`head()` 里的 canonical 已修正，但组件里这一行是独立的
 * 字面量，纯函数单测覆盖不到，必须渲染组件读取页面里的
 * `script[type="application/ld+json"]`。
 *
 * 用真实 Router + memory history 渲染整页（与 `tests/components/navigation.test.tsx`
 * 同一模式），根文档另会输出 Organization 的 JSON-LD，因此按 `@type` 过滤出 Article。
 */

beforeEach(() => setLocale('en', { reload: false }))
afterEach(() => {
  cleanup()
  setLocale('zh', { reload: false })
})

/** 用真实 Router + memory history 渲染真实页面。 */
async function renderRoute(path: string) {
  const router = getRouter()
  router.update({
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: new QueryClient() },
  })
  await router.load()
  return render(<RouterProvider router={router} />)
}

/** 从渲染结果中取出所有 JSON-LD 对象。 */
function jsonLdObjects(container: HTMLElement): Record<string, unknown>[] {
  return Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map(
    (node) => JSON.parse(node.textContent ?? '{}') as Record<string, unknown>,
  )
}

describe('博客详情页 JSON-LD', () => {
  it('Article.url 指向真实路由 /marketing/blog/<slug>', async () => {
    const { container } = await renderRoute('/en/marketing/blog/hello-world')

    const article = jsonLdObjects(container).find((data) => data['@type'] === 'Article')
    expect(article).toBeDefined()
    expect(String(article?.url)).toMatch(/\/marketing\/blog\/hello-world$/)
  })

  it('Article.url 的 pathname 恰为 /marketing/blog/<slug>（旧前缀 /blog 会失败）', async () => {
    const { container } = await renderRoute('/en/marketing/blog/hello-world')

    const article = jsonLdObjects(container).find((data) => data['@type'] === 'Article')
    const url = new URL(String(article?.url))
    // 旧缺陷产出 pathname `/blog/hello-world`；修复后必须是 `/marketing/blog/hello-world`。
    expect(url.pathname).toBe('/marketing/blog/hello-world')
  })
})
