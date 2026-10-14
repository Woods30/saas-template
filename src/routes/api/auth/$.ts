import { createFileRoute } from '@tanstack/react-router'
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
 */
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unavailable = getModuleUnavailableResponse('auth')
        if (unavailable) return unavailable
        const { getAuth } = await import('@/auth/auth')
        const env = getServerContext().env
        return getAuth(env).handler(request)
      },
      POST: async ({ request }) => {
        const unavailable = getModuleUnavailableResponse('auth')
        if (unavailable) return unavailable
        const { getAuth } = await import('@/auth/auth')
        const env = getServerContext().env
        return getAuth(env).handler(request)
      },
    },
  },
})
