import { QueryClient } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

// 框架通过虚拟模块 `#tanstack-router-entry` 消费本文件，且只认具名导出 `getRouter`
// （见 @tanstack/start-server-core 的 createStartHandler：`entries.routerEntry.getRouter()`）。
export function getRouter() {
  const queryClient = new QueryClient()

  return createTanStackRouter({
    routeTree,
    // 与 `createRootRouteWithContext<{ queryClient: QueryClient }>()` 声明的 context 对齐。
    context: { queryClient },
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
