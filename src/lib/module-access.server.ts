import { getServiceStatuses } from '@/config/service-status'
import { type ServiceModule, websiteConfig } from '@/config/website'
import { publicEnv } from '@/env/public'
import { parseServerEnv } from '@/env/server'
import { getServerContext } from '@/lib/server-context'

/**
 * API 运行时门禁。
 *
 * 在解析 body、鉴权、限流与 provider 调用**之前**运行：
 *
 * - 模块关闭 → `404 { error: 'MODULE_DISABLED' }`；
 * - 已启用但必要配置缺失（或依赖模块未配置完整）→ `503 { error: 'SERVICE_UNAVAILABLE' }`；
 * - 配置完整 → 返回 `undefined`，调用方继续原有流程。
 *
 * 公开响应只含稳定的错误码，不回显缺失字段或凭据。仅在服务端路由中引入，
 * 使服务端 env 不进入客户端 bundle。
 */
export function getModuleUnavailableResponse(
  module: ServiceModule,
  input?: Parameters<typeof getServiceStatuses>[0],
): Response | undefined {
  const config = input?.config ?? websiteConfig
  if (!config[module].enabled) {
    return Response.json({ error: 'MODULE_DISABLED' }, { status: 404 })
  }

  const env = input ? undefined : getServerContext().env
  const current = input ?? {
    config,
    publicEnv,
    serverEnv: parseServerEnv(env ?? {}),
    bindings: { email: !!env?.EMAIL },
  }

  const state = getServiceStatuses(current)[module].state
  if (state === 'incomplete') {
    return Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 })
  }
  return undefined
}
