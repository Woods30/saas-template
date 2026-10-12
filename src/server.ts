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

import type { KVNamespace } from '@cloudflare/workers-types'
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { KVCacheProvider } from './cache/provider/kv'
import { LOCALE_COOKIE_NAME, readLocaleCookie } from './lib/locale'
import { als } from './lib/server-context'
import { registerServerLocaleStrategy } from './locale/middleware'
import { paraglideMiddleware } from './locale/paraglide/server.js'

// 模块加载期注册自定义策略，早于任何请求进入 paraglideMiddleware。
registerServerLocaleStrategy()

const fetch = createStartHandler(defaultStreamHandler)

const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 将 env 存入 ALS，供 `src/lib/server-context.ts` 的 `getServerContext()` 使用。
    return als.run(
      { env, cacheProvider: new KVCacheProvider(env.CACHE as KVNamespace) },
      async () => {
        // 不使用 URL 前缀策略，中间件不会改写 URL；原样把 request 交给框架处理。
        const response = await paraglideMiddleware(request, async ({ locale }) => {
          const result = await fetch(request)
          return persistLocaleCookie(result, request, locale)
        })
        return response
      },
    )
  },
}

/**
 * 把服务端解析出的 locale 写回 `NEXT_LOCALE` cookie。
 *
 * 首次访问没有 cookie 时，服务端依据 `Accept-Language` 协商，而客户端在 hydration
 * 阶段依据 `navigator.language` 协商，两者可能不一致。回写 cookie 后客户端会优先
 * 读到该 cookie（`cookie` 策略先于 `preferredLanguage`），从而保证 SSR 与 hydration
 * 一致；后续请求也直接命中 cookie。
 */
function persistLocaleCookie(response: Response, request: Request, locale: string): Response {
  // 与 `readLocaleCookie` 共用同一解析（含百分号解码），保证对同一 cookie 的
  // 「比较」与「解析」得出一致结论，避免编码值时每个请求都重复下发 Set-Cookie。
  if (readLocaleCookie(request.headers.get('cookie')) === locale) {
    return response
  }
  const headers = new Headers(response.headers)
  // CDN 缓存需按语言与 cookie 区分响应，否则不同 locale/cookie 的访客会被命中对方的 HTML。
  headers.append('Vary', 'Accept-Language, Cookie')
  headers.append(
    'Set-Cookie',
    `${LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`,
  )
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
