import { createFileRoute } from '@tanstack/react-router'
import { websiteConfig } from '@/config/website'
import { getModuleUnavailableResponse } from '@/lib/module-access.server'
import { getServerContext } from '@/lib/server-context'

/**
 * Better Auth API 路由。
 *
 * 功能开关必须在进入 handler 前拦下（返回 404），否则用户能绕过 UI 直接调用插件端点。
 * 这是页面门禁之外的 API 侧门禁，两者缺一不可。
 * 角色门禁不在此处：由插件自身在 handler 内判定。
 */
function gate(request: Request): Response | undefined {
  const unavailable = getModuleUnavailableResponse('auth')
  if (unavailable) return unavailable
  const path = new URL(request.url).pathname
  const gated = [
    { prefix: '/api/auth/api-key', enabled: websiteConfig.features.enableApiKeys },
    { prefix: '/api/auth/admin', enabled: websiteConfig.features.enableAdmin },
  ]
  if (gated.some(({ prefix, enabled }) => path.startsWith(prefix) && !enabled)) {
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
