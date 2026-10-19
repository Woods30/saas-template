/**
 * 自定义 server entry：TanStack Start 的构建期会在 `src/` 下探测 `server.ts`
 * （见 start-plugin-core 的 resolve-entries，默认入口 `server`，非必需），存在时
 * 取代 `@tanstack/react-start/server-entry` 的默认实现。
 *
 * 这里包一层 Paraglide 的 `paraglideMiddleware`，使每个请求的语言解析结果写入
 * Paraglide 的 AsyncLocalStorage，SSR 渲染与后续 hydration 因此拿到同一 locale。
 *
 * 注意 `wrangler.jsonc` 的 `main` 需要同步指向本文件。
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

// 模块加载期注册自定义策略，早于任何请求进入 paraglideMiddleware。
registerServerLocaleStrategy()

// 注入服务端主题读取器：`src/lib/theme.ts` 的 `getTheme()` 在 SSR 时经此读取 ALS，
// 从而不必把 `node:async_hooks` 依赖带入客户端 bundle。
setServerThemeGetter(() => getServerContext().theme)

// 同一手法注入文档侧边栏偏好读取器，让 `DocsLayout` 的首屏状态与客户端一致。
setServerSidebarGetter(() => getServerContext().docsSidebarCollapsed)

/**
 * Wrap the default stream handler so the per-request CSP nonce reaches TanStack
 * Router's `router.options.ssr.nonce`. Without this, the streaming bootstrap
 * scripts emitted into the response body carry no `nonce` attribute and the
 * browser's CSP blocks them — `window.$_TSR` is never populated and hydration
 * fails with "Expected to find bootstrap data on window.$_TSR, but we did not."
 *
 * We read the nonce from the request-scoped ALS (populated by `als.run` below)
 * because the handler callback only receives the router, request, and headers —
 * not the outer `server.ts` closure.
 *
 * The result must preserve `SsrResponse` wrapping (not just `.response`) —
 * the framework uses `isSsrResponse()` to detect streaming responses and call
 * the cleanup `dispose()` once the request finishes.
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
    // 每个请求生成新的 nonce，与 CSP header 同步；提前生成以便注入 ALS。
    const nonce = generateNonce()
    // 主题随 `THEME` cookie 变化；无 cookie 时为 `system`（由 CSS 媒体查询决定明暗）。
    const theme =
      parseTheme(readCookieValue(request.headers.get('cookie'), THEME_COOKIE_NAME)) ?? defaultTheme
    // 归一化服务端 env：secret 只经 `parseServerEnv` 校验后才进入 registry；
    // 资源 binding（DB / CACHE / BUCKET / EMAIL）保留原始对象，供 provider 与框架使用。
    const parsedEnv = parseServerEnv(env as unknown as Record<string, unknown>)
    // 显式覆盖两个原始类型为 `string` 的 enum 字段，令归一化结果满足 `ServerEnv`；
    // 其余字段由 `...parsedEnv` 提供，`DB / CACHE / BUCKET / EMAIL` 保留原 binding 对象。
    const normalizedEnv: Env & ServerEnv = {
      ...env,
      ...parsedEnv,
      NODE_ENV: parsedEnv.NODE_ENV,
      BEEHIIV_SEND_WELCOME_EMAIL: parsedEnv.BEEHIIV_SEND_WELCOME_EMAIL,
    }
    // 将 env 与 nonce 一起存入 ALS，供 `src/lib/server-context.ts` 的
    // `getServerContext()` 与 `streamHandlerWithNonce` 各自读取。
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
        // 不使用 URL 前缀策略，中间件不会改写 URL；原样把 request 交给框架处理。
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
 * 归一化后 provider 只消费已校验字段；默认发件人由 `getMailFrom` 统一决定，
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
 * CSP:
 * - Uses a per-request nonce injected into inline script tags.
 * - Restricts script-src to 'self' + nonce + the analytics origins enabled for
 *   this request; no unsafe-inline. External analytics scripts are injected at
 *   runtime by `injectScript()` (after the nonce is serialised), so their origin
 *   must be allowed explicitly — otherwise every production analytics script is
 *   blocked by the browser.
 * - Applies frame-ancestors 'none' to prevent clickjacking.
 *
 * Locale cookie: same behaviour as the prior persistLocaleCookie — write
 * `NEXT_LOCALE` when the negotiated locale differs from the cookie value,
 * so SSR and client hydration agree on the language.
 */
function applySecurityHeaders(
  response: Response,
  request: Request,
  locale: string,
  nonce: string,
): Response {
  // Re-stream the response body so every inline `<script>` tag carries the
  // per-request CSP nonce. `streamHandlerWithNonce` already passes the nonce
  // into `router.options.ssr.nonce` for React-rendered scripts, but TanStack
  // Router's streaming bootstrap (`<script data-tsr-stream-part>`) and the
  // post-render cleanup `<script>` are serialized outside the React tree
  // and therefore never see the nonce — they would otherwise be blocked by
  // CSP and `window.$_TSR` would never be populated, breaking hydration.
  const withNonce = addNonceToInlineScripts(response, nonce)

  const headers = new Headers(withNonce.headers)

  // Only the analytics providers that will actually inject a script get their
  // origin into script-src; a disabled or unconfigured module keeps the strict
  // `'self' 'nonce-…'` policy.
  const analyticsScriptOrigins = getAnalyticsScriptOrigins({
    analytics: websiteConfig.analytics,
    publicEnv,
  })

  // Always set CSP — nonce is regenerated per request so caching is safe.
  headers.set('Content-Security-Policy', buildCspHeader(nonce, analyticsScriptOrigins))

  // 与 `readLocaleCookie` 共用同一解析（含百分号解码），保证对同一 cookie 的
  // 「比较」与「解析」得出一致结论，避免编码值时每个请求都重复下发 Set-Cookie。
  if (readLocaleCookie(request.headers.get('cookie')) === locale) {
    return new Response(withNonce.body, {
      status: withNonce.status,
      statusText: withNonce.statusText,
      headers,
    })
  }

  // CDN 缓存需按语言与 cookie 区分响应，否则不同 locale/cookie 的访客会被命中对方的 HTML。
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
