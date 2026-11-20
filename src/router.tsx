import { QueryClient } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { rewriteDocsInput, rewriteDocsOutput } from '@/modules/docs/service'
import { websiteConfig } from './config/website'
import { installSiteConfigFromDocument } from './core/config/client'
import { routeTree } from './routeTree.gen'

/**
 * 文档站模式下把对外的根级地址与内部的 `/{locale}/docs/...` 路由互相换算。
 *
 * 只改地址、不改路由表：官网站（`asHome` 为 false）完全不经过这段逻辑，
 * 文档站也不需要维护第二套路由文件。
 */
function docsRewrite(asHome: boolean) {
  if (!asHome) return undefined
  return {
    input: ({ url }: { url: URL }) => {
      const pathname = rewriteDocsInput(url.pathname, true)
      if (pathname === undefined) return undefined
      const next = new URL(url)
      next.pathname = pathname
      return next
    },
    output: ({ url }: { url: URL }) => {
      const pathname = rewriteDocsOutput(url.pathname, true)
      if (pathname === undefined) return undefined
      const next = new URL(url)
      next.pathname = pathname
      return next
    },
  }
}

// 客户端在 hydration 前把 SSR 写进 HTML 的站点配置装回来：路由表与页面读到的
// 必须和服务端渲染时一致，否则会 hydration 错位。
installSiteConfigFromDocument()

// 框架经虚拟模块 `#tanstack-router-entry` 消费本文件，只认具名导出 `getRouter`。
export function getRouter() {
  const queryClient = new QueryClient()

  return createTanStackRouter({
    routeTree,
    // 须与 `createRootRouteWithContext<{ queryClient }>()` 声明的 context 对齐。
    context: { queryClient },
    rewrite: docsRewrite(websiteConfig.docs.asHome === true),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
