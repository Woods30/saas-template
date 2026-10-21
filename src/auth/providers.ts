import { createServerFn } from '@tanstack/react-start'
import type { ServerEnv } from '@/env/server'

/** 各社交登录提供方在当前部署中是否可用。 */
export interface AuthProviderAvailability {
  google: boolean
}

/**
 * 判定社交登录的可见性。
 *
 * 两个凭据缺一不可：只配 clientId 时 better-auth 也不会启用该 provider，
 * 显示按钮只会把用户导向必然失败的流程。
 */
export function getAuthProviderAvailability(env: ServerEnv): AuthProviderAvailability {
  return { google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) }
}

/**
 * 认证页 `beforeLoad` 用的可见性读取器。
 *
 * 必须是 server function：客户端导航时 `beforeLoad` 在浏览器里执行，没有 ALS / env，
 * 普通函数会静默退化成「不显示按钮」。动态 import 让本模块顶层不引入服务端依赖。
 */
export const fetchAuthProviderAvailability = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AuthProviderAvailability> => {
    const [{ getServerContext }, { parseServerEnv }] = await Promise.all([
      import('@/lib/server-context'),
      import('@/env/server'),
    ])
    return getAuthProviderAvailability(parseServerEnv(getServerContext().env ?? {}))
  },
)
