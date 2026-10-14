import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setLocale } from '@/locale/paraglide/runtime.js'
import { getRouter } from '@/router'

/**
 * legal / docs 详情页的**真实渲染**回归测试（真实 Router + memory history）。
 *
 * 缺陷背景（Important I2）：`legal/$slug.tsx` 的 `beforeLoad` 谓词写成
 * `path === `${slug}.md``，但 Content Collections 的 `_meta.path` **已剥离
 * `.md`**（实测值为 `terms` / `terms.zh` / `privacy` / `privacy.zh`，见
 * `.content-collections/generated/allLegals.js`），因此 `'terms' === 'terms.md'`
 * 永不成立 → 该路由恒 404。此前的 `tests/unit/content-head.test.ts` 只把合成
 * `loaderData` 传给 `head()`，绕过了 `beforeLoad`，所以掩盖了该缺陷（评审已指出）。
 *
 * 本测试渲染真实路由，让 `beforeLoad` 真正执行：命中时页面渲染出当前语言的
 * frontmatter `title`；未命中时渲染根路由的 404 组件。
 *
 * docs 用例覆盖评审指出的 M-B 缺口：`/docs/$slug` 同样应渲染对应语言标题。
 *
 * 与 `tests/components/blog-jsonld.test.tsx` 同一模式（真实 Router + memory
 * history），属组件测试，需用 `vitest.components.config.ts` 运行。
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

/** 页面正文的一级标题文本（页面 `<h1>`）；404 页面的 `<h1>` 为 `404`。 */
function pageTitle(): string {
  return screen.getByRole('heading', { level: 1 }).textContent ?? ''
}

describe('legal 详情页真实渲染', () => {
  it('/zh/marketing/legal/terms 渲染中文标题「服务条款」而非 404', async () => {
    setLocale('zh', { reload: false })
    await renderRoute('/zh/marketing/legal/terms')
    expect(pageTitle()).toBe('服务条款')
  })

  it('/en/marketing/legal/terms 渲染英文标题 "Terms of Service" 而非 404', async () => {
    setLocale('en', { reload: false })
    await renderRoute('/en/marketing/legal/terms')
    expect(pageTitle()).toBe('Terms of Service')
  })

  it('/zh/marketing/legal/privacy 渲染中文标题「隐私政策」而非 404', async () => {
    setLocale('zh', { reload: false })
    await renderRoute('/zh/marketing/legal/privacy')
    expect(pageTitle()).toBe('隐私政策')
  })

  it('/en/marketing/legal/privacy 渲染英文标题 "Privacy Policy" 而非 404', async () => {
    setLocale('en', { reload: false })
    await renderRoute('/en/marketing/legal/privacy')
    expect(pageTitle()).toBe('Privacy Policy')
  })
})

describe('docs 详情页真实渲染', () => {
  it('/zh/docs/getting-started 渲染中文标题「快速开始」而非 404', async () => {
    setLocale('zh', { reload: false })
    await renderRoute('/zh/docs/getting-started')
    expect(pageTitle()).toBe('快速开始')
  })

  it('/en/docs/getting-started 渲染英文标题 "Getting Started" 而非 404', async () => {
    setLocale('en', { reload: false })
    await renderRoute('/en/docs/getting-started')
    expect(pageTitle()).toBe('Getting Started')
  })
})
