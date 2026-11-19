import { createFileRoute } from '@tanstack/react-router'
import { websiteConfig } from '@/config/website'
import { getServerContext } from '@/lib/server-context'

/**
 * Better Auth API 路由。
 *
 * 功能开关必须在进入 handler 前拦下（返回 404），否则用户能绕过 UI 直接调用插件端点。
 * 认证没有模块总闸：是否开放由三个登录方法开关决定，且只影响 UI 与服务端注册，
 * 不应把整个 API 变成 404。
 * 角色门禁不在此处：由插件自身在 handler 内判定。
 */
export function gate(request: Request): Response | undefined {
  const path = new URL(request.url).pathname
  const gated = [
    { prefix: '/api/auth/api-key', enabled: websiteConfig.userFeatures.apiKeys },
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
        const { getAuth } = await import('@/core/auth/auth')
        const env = getServerContext().env
        return (await getAuth(env)).handler(request)
      },
      POST: async ({ request }) => {
        const blocked = gate(request)
        if (blocked) return blocked
        const { getAuth } = await import('@/core/auth/auth')
        const env = getServerContext().env
        return (await getAuth(env)).handler(request)
      },
    },
  },
})
