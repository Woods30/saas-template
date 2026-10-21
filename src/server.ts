/**
 * 自定义 server entry：TanStack Start 构建期会在 `src/` 下探测 `server.ts`，
 * 存在时取代默认的 `@tanstack/react-start/server-entry`。
 *
 * 包一层 `paraglideMiddleware`，让 SSR 与 hydration 拿到同一 locale。
 * 注意 `wrangler.jsonc` 的 `main` 需同步指向本文件。
 */

import type { KVNamespace, R2Bucket } from '@cloudflare/workers-types'
import type { AnyRouter } from '@tanstack/react-router'
import {
  createStartHandler,
  defaultStreamHandler,
  type HandlerCallback,
} from '@tanstack/react-start/server'
import { KVCacheProvider } from './cache/provider/kv'
import { getMailFrom } from './config/service-status'
import { websiteConfig } from './config/website'
import { publicEnv } from './env/public'
import { parseServerEnv, type ServerEnv } from './env/server'
import { DOCS_SIDEBAR_COOKIE_NAME, parseSidebarCollapsed, setServerSidebarGetter } from './lib/docs'
import { LOCALE_COOKIE_NAME, readCookieValue, readLocaleCookie } from './lib/locale'
import {
  addNonceToInlineScripts,
  buildCspHeader,
  generateNonce,
  getAnalyticsScriptOrigins,
} from './lib/security'
import { als, getServerContext } from './lib/server-context'
import { defaultTheme, parseTheme, setServerThemeGetter, THEME_COOKIE_NAME } from './lib/theme'
import { registerServerLocaleStrategy } from './locale/middleware'
import { paraglideMiddleware } from './locale/paraglide/server.js'
import { CloudflareEmailProvider } from './mail'
import { ResendMailProvider } from './mail/provider/resend'
import { buildNewsletterProviderRegistry } from './newsletter'
import { buildNotificationProviderRegistry } from './notification'
import { buildPaymentProviderRegistry } from './payment'
import { R2StorageProvider } from './storage/provider/r2'

// 模块加载期注册，早于任何请求进入 paraglideMiddleware。
registerServerLocaleStrategy()

// 注入服务端读取器：SSR 时经 ALS 取值，避免把 `node:async_hooks` 带进客户端 bundle。
setServerThemeGetter(() => getServerContext().theme)

// 同一手法注入文档侧边栏偏好，让 `DocsLayout` 首屏状态与客户端一致。
setServerSidebarGetter(() => getServerContext().docsSidebarCollapsed)

/**
 * Wrap the default stream handler so the per-request CSP nonce reaches
 * `router.options.ssr.nonce`. Without it the streaming bootstrap scripts carry no
 * `nonce` and CSP blocks them, so `window.$_TSR` stays empty and hydration fails.
 *
 * The nonce comes from the request-scoped ALS because the callback doesn't see the
 * outer closure. Return value must keep the `SsrResponse` wrapper (not `.response`):
 * the framework uses `isSsrResponse()` to detect streaming and call `dispose()`.
 */
const streamHandlerWithNonce: HandlerCallback<AnyRouter> = async (ctx) => {
  const { nonce } = getServerContext()
  if (nonce) {
    ctx.router.options.ssr = { ...ctx.router.options.ssr, nonce }
  }
  return defaultStreamHandler(ctx)
}

const fetch = createStartHandler(streamHandlerWithNonce)

const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 每个请求生成新的 nonce，与 CSP header 同步。
    const nonce = generateNonce()
    // 无 cookie 时为 `system`（由 CSS 媒体查询决定明暗）。
    const theme =
      parseTheme(readCookieValue(request.headers.get('cookie'), THEME_COOKIE_NAME)) ?? defaultTheme
    // secret 只经 `parseServerEnv` 校验后才进入 registry；资源 binding 保留原始对象。
    const parsedEnv = parseServerEnv(env as unknown as Record<string, unknown>)
    // 显式覆盖两个 `string` enum 字段以满足 `ServerEnv`，其余字段由 `...parsedEnv` 提供。
    const normalizedEnv: Env & ServerEnv = {
      ...env,
      ...parsedEnv,
      NODE_ENV: parsedEnv.NODE_ENV,
      BEEHIIV_SEND_WELCOME_EMAIL: parsedEnv.BEEHIIV_SEND_WELCOME_EMAIL,
    }
    // env 与 nonce 一起存入 ALS，供 `getServerContext()` 与 `streamHandlerWithNonce` 读取。
    return als.run(
      {
        env: normalizedEnv,
        cacheProvider: new KVCacheProvider(env.CACHE as KVNamespace),
        storageProvider: new R2StorageProvider(env.BUCKET as unknown as R2Bucket),
        mailProviderRegistry: buildMailProviderRegistry(normalizedEnv),
        newsletterProviderRegistry: buildNewsletterProviderRegistry(normalizedEnv),
        notificationProviderRegistry: buildNotificationProviderRegistry(normalizedEnv),
        paymentProviderRegistry: buildPaymentProviderRegistry(normalizedEnv),
        nonce,
        theme,
        docsSidebarCollapsed: parseSidebarCollapsed(
          readCookieValue(request.headers.get('cookie'), DOCS_SIDEBAR_COOKIE_NAME),
        ),
      },
      async () => {
        // 不使用 URL 前缀策略，中间件不会改写 URL。
        const response = await paraglideMiddleware(request, async ({ locale }) => {
          const result = await fetch(request)
          return applySecurityHeaders(result, request, locale, nonce)
        })
        return response
      },
    )
  },
}

/**
 * Build per-request mail provider registry from normalized env bindings.
 * Returns a plain object (not a Map) matching the registry shape.
 *
 * 缺失发件人时对应 provider 不注册（不使用 `example.com` 回退）。
 */
function buildMailProviderRegistry(
  env: Env & ServerEnv,
): Record<string, (() => import('./mail').MailProvider) | undefined> {
  const registry: Record<string, (() => import('./mail').MailProvider) | undefined> = {}
  const mailFrom = getMailFrom(websiteConfig, env)
  if (env.EMAIL && mailFrom) {
    const email = env.EMAIL
    registry.cloudflare = () => new CloudflareEmailProvider(email, mailFrom)
  }
  if (env.RESEND_API_KEY && mailFrom) {
    registry.resend = () => new ResendMailProvider(env.RESEND_API_KEY ?? '', mailFrom)
  }
  return registry
}

/**
 * Apply security headers (CSP + locale cookie) to the response.
 *
 * CSP restricts script-src to 'self' + nonce + enabled analytics origins; analytics
 * scripts are injected at runtime by `injectScript()` after the nonce is serialised,
 * so their origins must be allowed explicitly or production analytics gets blocked.
 * Also applies frame-ancestors 'none'.
 *
 * Locale cookie is written only when the negotiated locale differs from the cookie,
 * so SSR and client hydration agree on the language.
 */
function applySecurityHeaders(
  response: Response,
  request: Request,
  locale: string,
  nonce: string,
): Response {
  // Re-stream the body so every inline `<script>` carries the nonce. TanStack Router's
  // streaming bootstrap and post-render cleanup scripts are serialized outside the
  // React tree, so `router.options.ssr.nonce` never reaches them.
  const withNonce = addNonceToInlineScripts(response, nonce)

  const headers = new Headers(withNonce.headers)

  // Only providers that will actually inject a script get their origin into script-src.
  const analyticsScriptOrigins = getAnalyticsScriptOrigins({
    analytics: websiteConfig.analytics,
    publicEnv,
  })

  // Always set CSP — nonce is regenerated per request so caching is safe.
  headers.set('Content-Security-Policy', buildCspHeader(nonce, analyticsScriptOrigins))

  // 与 `readLocaleCookie` 共用同一解析（含百分号解码），避免编码值时重复下发 Set-Cookie。
  if (readLocaleCookie(request.headers.get('cookie')) === locale) {
    return new Response(withNonce.body, {
      status: withNonce.status,
      statusText: withNonce.statusText,
      headers,
    })
  }

  // CDN 需按语言与 cookie 区分缓存，否则访客会被命中他人的 HTML。
  headers.append('Vary', 'Accept-Language, Cookie')
  headers.append(
    'Set-Cookie',
    `${LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`,
  )
  return new Response(withNonce.body, {
    status: withNonce.status,
    statusText: withNonce.statusText,
    headers,
  })
}
