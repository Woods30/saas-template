import { createFileRoute } from '@tanstack/react-router'
import { getServerContext } from '@/lib/server-context'

/**
 * Better Auth API 路由。
 *
 * 所有 /api/auth/* 请求统一走 Better Auth 的 handler。
 * env 从 ALS server context 获取（由 src/server.ts 注入）。
 */
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAuth } = await import('@/auth/auth')
        const env = getServerContext().env
        return getAuth(env).handler(request)
      },
      POST: async ({ request }) => {
        const { getAuth } = await import('@/auth/auth')
        const env = getServerContext().env
        return getAuth(env).handler(request)
      },
    },
  },
})
