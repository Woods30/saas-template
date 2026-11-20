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
import { getResolvedConfig, websiteConfig } from '@/config/website'
import { serializeSiteConfig } from '@/core/config/serialize'
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
      // 标题与描述取数据库配置（品牌 / SEO 分组）；未装载时回退出厂值。
      { title: getResolvedConfig().metadata.name },
      {
        name: 'description',
        content: getResolvedConfig().seo.default.description || m.site_description(),
      },
    ],
    links: [
      { rel: 'stylesheet', href: globalsCss },
      { rel: 'manifest', href: '/manifest.json' },
      // iOS 主屏不读 manifest 的 icons，必须单独给 apple-touch-icon。
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
  // SSR 读 ALS，客户端读同一 cookie，故 hydration 时 lang / theme 不会跳变。
  const locale = getLocale()

  const theme = getTheme()

  return (
    <html lang={htmlLang(locale)} data-theme={theme}>
      <head>
        <HeadContent />
        {/* 生效配置（品牌、模块开关…）：客户端在 hydration 前读它装上，
            保证 SSR 与 hydration 读到同一份。type 用 application/json，
            不会被 script-src 拦，也不必带 nonce。 */}
        <script
          id="site-config"
          type="application/json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: 配置必须内联，客户端要读回来
          dangerouslySetInnerHTML={{ __html: serializeSiteConfig(getResolvedConfig()) }}
        />
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
  // 仅在 server console 输出，不向客户端暴露错误信息。
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
