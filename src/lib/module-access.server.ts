import { getServiceStatuses } from '@/config/service-status'
import { type ServiceModule, websiteConfig } from '@/config/website'
import { getServerContext } from '@/lib/server-context'

/**
 * API 运行时门禁，须在解析 body、鉴权、限流与 provider 调用**之前**运行。
 *
 * - 模块关闭 → `404 MODULE_DISABLED`
 * - 已启用但必要配置缺失 → `503 SERVICE_UNAVAILABLE`
 * - 配置完整 → `undefined`，调用方继续
 *
 * 公开响应只含稳定的错误码，不回显缺失字段或凭据。
 */
export function getModuleUnavailableResponse(
  module: ServiceModule,
  input?: Parameters<typeof getServiceStatuses>[0],
): Response | undefined {
  const config = input?.config ?? websiteConfig
  if (!config[module].enabled) {
    return Response.json({ error: 'MODULE_DISABLED' }, { status: 404 })
  }

  // 只在没传 input 时才碰请求上下文：单测与脚本可以显式给出配置。
  let current = input
  if (!current) {
    const env = getServerContext().env
    current = { config, serverEnv: env, bindings: { email: !!env.EMAIL } }
  }

  const state = getServiceStatuses(current)[module].state
  if (state === 'incomplete') {
    return Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 })
  }
  return undefined
}
