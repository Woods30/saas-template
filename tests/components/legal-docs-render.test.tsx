import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setLocale } from '@/locale/paraglide/runtime.js'
import { getRouter } from '@/router'

/**
 * legal / docs 详情页的真实渲染回归（真实 Router + memory history）。
 *
 * 必须走真实 `beforeLoad`：`_meta.path` 已剥离 `.md`，此前用合成 loaderData 的测试
 * 绕过了谓词，掩盖了该路由恒 404 的缺陷。
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

/** 页面一级标题；404 页面的 `<h1>` 为 `404`。 */
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

/**
 * 正文回归：标题断言不足以发现「命中失败渲染成 404」（`<h1>404</h1>` 一样查得到），
 * 因此再断言章节标题与 `role="alert"` 占位提示真的渲染了。
 */
describe('legal 详情页正文渲染', () => {
  it('terms 中英文都渲染出章节标题与占位提示', async () => {
    for (const [locale, path, heading] of [
      ['zh', '/zh/marketing/legal/terms', '服务的接受'],
      ['en', '/en/marketing/legal/terms', 'Acceptance'],
    ] as const) {
      setLocale(locale as 'zh' | 'en', { reload: false })
      await renderRoute(path)
      expect(
        screen.getByRole('heading', { level: 2, name: heading }),
        `${path} 应渲染章节「${heading}」`,
      ).toBeInTheDocument()
      expect(screen.getAllByRole('alert').length, `${path} 应有占位提示`).toBeGreaterThan(0)
    }
  })

  it('privacy 中英文都渲染出章节标题与占位提示', async () => {
    for (const [locale, path, heading] of [
      ['zh', '/zh/marketing/legal/privacy', '我们收集哪些信息'],
      ['en', '/en/marketing/legal/privacy', 'What we collect'],
    ] as const) {
      setLocale(locale as 'zh' | 'en', { reload: false })
      await renderRoute(path)
      expect(
        screen.getByRole('heading', { level: 2, name: heading }),
        `${path} 应渲染章节「${heading}」`,
      ).toBeInTheDocument()
      expect(screen.getAllByRole('alert').length, `${path} 应有占位提示`).toBeGreaterThan(0)
    }
  })

  it('未知 slug 渲染 404 而不是崩溃', async () => {
    setLocale('en', { reload: false })
    await renderRoute('/en/marketing/legal/does-not-exist')
    expect(pageTitle()).toBe('404')
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
