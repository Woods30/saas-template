import { createFileRoute } from '@tanstack/react-router'
import { websiteConfig } from '@/config/website'
import { getModuleUnavailableResponse } from '@/lib/module-access.server'
import { getServerContext } from '@/lib/server-context'

/**
 * Better Auth API 路由。
 *
 * 所有 /api/auth/* 请求统一走 Better Auth 的 handler。
 * env 从 ALS server context 获取（由 src/server.ts 注入）。
 *
 * 与其它服务路由一致：`websiteConfig.auth.enabled` 为 false 时在进入 Better Auth
 * 之前返回 404，使页面门禁与 API 门禁同源。
 *
 * `/api/auth/api-key/*` 额外受功能开关 `features.enableApiKeys` 约束：关闭时返回 404，
 * 且**不进入** better-auth handler——否则用户能绕过 UI 直接建 key。这是页面门禁
 * 之外的 API 侧门禁，两者缺一不可。
 */
const API_KEY_PREFIX = '/api/auth/api-key'

function gate(request: Request): Response | undefined {
  const unavailable = getModuleUnavailableResponse('auth')
  if (unavailable) return unavailable
  const path = new URL(request.url).pathname
  if (path.startsWith(API_KEY_PREFIX) && !websiteConfig.features.enableApiKeys) {
    return Response.json({ error: 'MODULE_DISABLED' }, { status: 404 })
  }
  return undefined
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const blocked = gate(request)
        if (blocked) return blocked
        const { getAuth } = await import('@/auth/auth')
        const env = getServerContext().env
        return getAuth(env).handler(request)
      },
      POST: async ({ request }) => {
        const blocked = gate(request)
        if (blocked) return blocked
        const { getAuth } = await import('@/auth/auth')
        const env = getServerContext().env
        return getAuth(env).handler(request)
      },
    },
  },
})
