import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { htmlLang, type Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'
import globalsCss from '../styles/globals.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: m.site_name() },
      { name: 'description', content: m.site_description() },
    ],
    links: [{ rel: 'stylesheet', href: globalsCss }],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
})

// TanStack Start 不会自动生成 HTML 文档；根路由必须通过 `shellComponent` 提供。
function RootDocument({ children }: { children: ReactNode }) {
  // `getLocale()` 在 SSR 阶段读取 Paraglide 的 AsyncLocalStorage，其值由
  // `src/server.ts` 的 paraglideMiddleware 按请求写入；客户端 hydration 复用同一
  // 解析结果，因此不会出现 lang 与内容不一致。
  const locale = getLocale() as Locale

  return (
    <html lang={htmlLang(locale)}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext()
  const locale = getLocale() as Locale

  return (
    <QueryClientProvider client={queryClient}>
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <span className="text-sm font-medium text-foreground">{m.site_title()}</span>
        <LocaleSwitcher value={locale} />
      </header>
      <Outlet />
    </QueryClientProvider>
  )
}
