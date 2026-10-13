import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AnalyticsProvider } from '@/components/AnalyticsProvider'
import { JsonLd } from '@/components/JsonLd'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { organizationJsonLd } from '@/lib/json-ld'
import { htmlLang } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'
import globalsCss from '../styles/globals.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#0070f3' },
      { title: m.site_name() },
      { name: 'description', content: m.site_description() },
    ],
    links: [
      { rel: 'stylesheet', href: globalsCss },
      { rel: 'manifest', href: '/manifest.json' },
      { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ServerError,
})

// TanStack Start 不会自动生成 HTML 文档；根路由必须通过 `shellComponent` 提供。
function RootDocument({ children }: { children: ReactNode }) {
  // `getLocale()` 在 SSR 阶段读取 Paraglide 的 AsyncLocalStorage，其值由
  // `src/server.ts` 的 paraglideMiddleware 按请求写入；客户端 hydration 复用同一
  // 解析结果，因此不会出现 lang 与内容不一致。
  const locale = getLocale()

  return (
    <html lang={htmlLang(locale)}>
      <head>
        <HeadContent />
      </head>
      <body>
        <JsonLd data={organizationJsonLd()} />
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext()
  const locale = getLocale()

  return (
    <QueryClientProvider client={queryClient}>
      <AnalyticsProvider>
        <header className="flex items-center justify-between border-b border-border px-6 py-3">
          <span className="text-sm font-medium text-foreground">{m.site_title()}</span>
          <LocaleSwitcher value={locale} />
        </header>
        <Outlet />
      </AnalyticsProvider>
    </QueryClientProvider>
  )
}

function NotFound() {
  return (
    <main className="mx-auto max-w-md p-10 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-2 text-muted-foreground">{m.error_404_description()}</p>
      <Link to="/{-$locale}" className="mt-6 inline-block text-primary underline">
        {m.error_404_back()}
      </Link>
    </main>
  )
}

function ServerError({ error }: ErrorComponentProps) {
  // 仅在 server console 输出；不向客户端暴露错误信息
  if (typeof window === 'undefined') {
    console.error('[root error]', error)
  }
  return (
    <main className="mx-auto max-w-md p-10 text-center">
      <h1 className="text-4xl font-bold">500</h1>
      <p className="mt-2 text-muted-foreground">{m.error_500_description()}</p>
    </main>
  )
}
