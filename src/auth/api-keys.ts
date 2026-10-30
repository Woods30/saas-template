import { createServerFn } from '@tanstack/react-start'

/**
 * API 密钥列表的 server function。
 *
 * 不用 `authClient.apiKey.list()`：那是客户端 SDK，会在组件挂载后才发请求——
 * 侧栏点击后 URL 先变、内容要等一个来回才出现。放进路由 loader 后数据随路由就绪，
 * 与 TanStack Start 推荐的服务端数据流一致。
 *
 * 权限由插件自身校验：`listApiKeys` 只返回当前会话所属用户的密钥。
 */

/** `list` 返回的密钥条目（**不含**明文 `key`，只有 `start` 前几位）。 */
export interface ApiKeyEntry {
  id: string
  name?: string | null
  start?: string | null
  prefix?: string | null
  enabled?: boolean | null
  createdAt: Date | string
  expiresAt?: Date | string | null
}

export const fetchApiKeys = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ApiKeyEntry[]> => {
    const [{ getServerContext }, { getAuth }, { getRequestHeaders }] = await Promise.all([
      import('@/lib/server-context'),
      import('@/auth/auth'),
      import('@tanstack/react-start/server'),
    ])
    const result = await getAuth(getServerContext().env).api.listApiKeys({
      headers: getRequestHeaders(),
    })
    return ((result as { apiKeys?: ApiKeyEntry[] } | null)?.apiKeys ?? []) as ApiKeyEntry[]
  },
)
