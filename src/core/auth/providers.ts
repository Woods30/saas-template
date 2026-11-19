import { createServerFn } from '@tanstack/react-start'
import { type WebsiteConfig, websiteConfig } from '@/config/website'
import type { RuntimeEnv } from '@/core/env/server'
import { emailPasswordEnabled } from './flow'
import { socialProviderOptions } from './social-providers'

/** 各登录方式在当前部署中是否可用。 */
export interface AuthProviderAvailability {
  email: boolean
  google: boolean
  github: boolean
}

/**
 * 判定各登录方式的可见性。
 *
 * 必须与 `getAuth` 的注册条件一致：页面按钮显示一个注册时不会启用的 provider，
 * 只会把用户导向必然失败的流程。
 *
 * - 邮箱：只看方法开关；
 * - Google / GitHub：方法开关与两个凭据缺一不可（只配 clientId 时 better-auth
 *   也不会注册该 provider）。
 */
export function getAuthProviderAvailability(
  env: RuntimeEnv,
  config: WebsiteConfig = websiteConfig,
): AuthProviderAvailability {
  const providers = socialProviderOptions(config, env)
  return {
    email: emailPasswordEnabled(config),
    google: providers.google !== undefined,
    github: providers.github !== undefined,
  }
}

/**
 * 认证页 `beforeLoad` 用的可见性读取器。
 *
 * 必须是 server function：客户端导航时 `beforeLoad` 在浏览器里执行，没有 ALS / env，
 * 普通函数会静默退化成「不显示按钮」。动态 import 让本模块顶层不引入服务端依赖。
 */
export const fetchAuthProviderAvailability = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AuthProviderAvailability> => {
    const { getServerContext } = await import('@/lib/server-context')
    return getAuthProviderAvailability(getServerContext().env)
  },
)
