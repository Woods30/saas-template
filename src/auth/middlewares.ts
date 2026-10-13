import { redirect } from '@tanstack/react-router'
import type { SessionUser } from './types'

export async function requireAuth(getSession: () => Promise<SessionUser | null>) {
  const session = await getSession()
  if (!session)
    // biome-ignore lint/suspicious/noExplicitAny: TanStack Router 在路由注册前需要 as any
    throw redirect({ to: '/auth/login' as any })
  return session
}

export async function requireRole(
  getSession: () => Promise<SessionUser | null>,
  allowed: Array<SessionUser['role']>,
) {
  const session = await requireAuth(getSession)
  if (!allowed.includes(session.role))
    // biome-ignore lint/suspicious/noExplicitAny: TanStack Router 在路由注册前需要 as any
    throw redirect({ to: '/dashboard' as any })
  return session
}
