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
import { Toaster } from '@/components/ui/toast'
import { websiteConfig } from '@/config/website'
import { organizationJsonLd } from '@/lib/json-ld'
import { htmlLang } from '@/lib/locale'
import { getTheme } from '@/lib/theme'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'
import globalsCss from '../styles/globals.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      {
        name: 'theme-color',
        content: websiteConfig.ui.themeColor.light,
        media: '(prefers-color-scheme: light)',
      },
      {
        name: 'theme-color',
        content: websiteConfig.ui.themeColor.dark,
        media: '(prefers-color-scheme: dark)',
      },
      { title: m.site_name() },
      { name: 'description', content: m.site_description() },
    ],
    links: [
      { rel: 'stylesheet', href: globalsCss },
      { rel: 'manifest', href: '/manifest.json' },
      // 图标按浏览器能力分级：SVG 优先（矢量、随系统深浅色切换），
      // 不认 SVG 的退回 ICO，iOS 主屏用 180px PNG（它不读 manifest 的 icons）。
      { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/favicon.ico', sizes: '16x16 32x32 48x48 64x64' },
      { rel: 'apple-touch-icon', href: '/favicon-180.png', sizes: '180x180' },
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

  // 与 `getLocale()` 同理：SSR 读 ALS（请求 cookie），客户端读 `THEME` cookie，
  // 两侧对同一 cookie 得出同一值，故 `data-theme` 不会在 hydration 时变化。
  const theme = getTheme()

  return (
    <html lang={htmlLang(locale)} data-theme={theme}>
      <head>
        <HeadContent />
      </head>
      <body>
        <JsonLd data={organizationJsonLd()} />
        {/* 全局唯一的 toast 出口：所有页面把「操作结果」交给它，不再各自在页面里
            找位置渲染提示。挂在 `children` 之后、`Scripts` 之前，让 portal 的
            宿主节点在 hydration 前就存在于文档里。 */}
        <Toaster>{children}</Toaster>
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext()

  return (
    <QueryClientProvider client={queryClient}>
      <AnalyticsProvider>
        {/* 顶部导航由各 layout 自行提供（如 `MarketingLayout` 的 Navbar），
            root 不再渲染全局 header，避免与 layout 内的 Navbar 重复。 */}
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
