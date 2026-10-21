import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setLocale } from '@/locale/paraglide/runtime.js'
import { getRouter } from '@/router'

/**
 * 博客详情页 JSON-LD 回归：组件里的 `Article.url` 曾用旧前缀 `/blog` 指向 404。
 * 该字面量纯函数测不到，必须渲染整页再按 `@type` 从 JSON-LD 中过滤出 Article。
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
    // 旧缺陷产出 `/blog/hello-world`，修复后应为 `/marketing/blog/hello-world`。
    expect(url.pathname).toBe('/marketing/blog/hello-world')
  })
})
