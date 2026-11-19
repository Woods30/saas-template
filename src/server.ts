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
import {
  DOCS_SIDEBAR_COOKIE_NAME,
  docsLegacyRedirect,
  parseSidebarCollapsed,
  setServerSidebarGetter,
} from '@/modules/docs/service'
import { getMailFrom } from './config/service-status'
import { websiteConfig } from './config/website'
import { KVCacheProvider } from './core/cache/provider/kv'
import { getRuntimeServerEnv, loadSettings, settingsCacheFresh } from './core/config/service'
import { CloudflareEmailProvider } from './core/email'
import { ResendMailProvider } from './core/email/provider/resend'
import { parseServerEnv, type RuntimeEnv } from './core/env/server'
import { buildNotificationProviderRegistry } from './core/notify/service'
import { buildPaymentProviderRegistry } from './core/payment'
import { R2StorageProvider } from './core/storage/provider/r2'
import { attributionCookieHeaders } from './lib/attribution'
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
import { buildNewsletterProviderRegistry } from './modules/newsletter/service'

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
    // 文档站的对外地址没有 `/docs` 这一层：历史地址 301 过去，
    // 否则同一篇文档会同时存在两个可索引的 URL。
    if (websiteConfig.docs.asHome === true) {
      const url = new URL(request.url)
      const target = docsLegacyRedirect(url.pathname, true)
      if (target !== undefined) {
        url.pathname = target
        return Response.redirect(url.toString(), 301)
      }
    }
    // 每个请求生成新的 nonce，与 CSP header 同步。
    const nonce = generateNonce()
    // 无 cookie 时为 `system`（由 CSS 媒体查询决定明暗）。
    const theme =
      parseTheme(readCookieValue(request.headers.get('cookie'), THEME_COOKIE_NAME)) ?? defaultTheme
    // secret 只经 `parseServerEnv` 校验后才进入 registry；资源 binding 保留原始对象。
    const parsedEnv = parseServerEnv(env as unknown as Record<string, unknown>)
    // 站点配置来自数据库（品牌、模块开关等）：30 秒 TTL 内复用缓存，
    // 过期才查库。读不到配置不该让请求失败，退回出厂配置继续服务。
    if (!settingsCacheFresh()) {
      const { createDbFromEnv } = await import('./core/db')
      await loadSettings(await createDbFromEnv(env as unknown as Env), {
        baseEnv: parsedEnv,
        encryptionKey: parsedEnv.CONFIG_ENCRYPTION_KEY,
      })
    }
    // 数据库配置派生成服务凭据形状；启动参数（secret / DB / 部署 token）仍来自 env。
    const runtimeEnv = getRuntimeServerEnv(parsedEnv)
    const normalizedEnv: Env & RuntimeEnv = { ...env, ...runtimeEnv }
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
        return withAttributionCookies(response, request)
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
  env: Env & RuntimeEnv,
): Record<string, (() => import('./core/email').MailProvider) | undefined> {
  const registry: Record<string, (() => import('./core/email').MailProvider) | undefined> = {}
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

/**
 * 追加首次触达归因 cookie。
 *
 * `attributionCookieHeaders` 自己判断「同名 cookie 是否已存在」，因此这里只负责把
 * 需要下发的 `Set-Cookie` 合进响应。中间件返回的响应头可能是不可变的，先复制一份
 * 再 `append`；同时保留原始 body（SSR 是流式响应，不能读取后再重建文本）。
 */
function withAttributionCookies(response: Response, request: Request): Response {
  const cookies = attributionCookieHeaders(request)
  if (cookies.length === 0) return response

  const headers = new Headers(response.headers)
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
