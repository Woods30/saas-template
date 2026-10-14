import { createServerFn } from '@tanstack/react-start'
import type { ServerEnv } from '@/env/server'

/** 各社交登录提供方在当前部署中是否可用。 */
export interface AuthProviderAvailability {
  google: boolean
}

/**
 * 判定社交登录的可见性。
 *
 * 纯函数，输入是已解析的服务端 env：`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
 * 都是服务端 secret，**不能**进入客户端 bundle（仓库的 env 两层模型不变量）。
 *
 * 两个凭据缺一不可：只配 clientId 时 better-auth 也不会启用该 provider，
 * 此时显示按钮只会把用户导向一个必然失败的流程。
 */
export function getAuthProviderAvailability(env: ServerEnv): AuthProviderAvailability {
  return { google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) }
}

/**
 * 认证页 `beforeLoad` 用的可见性读取器。
 *
 * 为什么必须是 server function：登录页既能被 SSR 直达，也能由导航栏链接**客户端导航**
 * 进入。客户端导航时 `beforeLoad` 在浏览器里重新执行，此时既没有 ALS 也没有 env；
 * 任何「读服务端状态」的普通函数都会静默退化成「不显示按钮」——用户看到的现象是
 * 「从首页点『登录』进去，Google 按钮不见了」。
 *
 * server function 在 SSR 阶段就地执行（无网络往返），在客户端导航时自动降级为一次
 * RPC，两种路径都拿到真实值。
 *
 * 动态 import 让本模块顶层保持「纯函数 + 类型」，不把服务端模块带进任何静态依赖图。
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
