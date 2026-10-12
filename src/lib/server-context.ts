/**
 * 服务端请求上下文。
 *
 * 使用 AsyncLocalStorage（ALS）在整个请求生命周期内存储 env，
 * 使业务代码无需逐层透传即可访问 Cloudflare bindings。
 *
 * 在 `src/server.ts` 的 fetch handler 中通过 `als.run({ env }, ...)`
 * 注入，每个请求相互隔离。
 */
import { AsyncLocalStorage } from 'node:async_hooks'

interface ServerContext {
  env: Env
}

const als = new AsyncLocalStorage<ServerContext>()

/**
 * 获取当前请求的 env。仅在 server-side 代码中有效，
 * 客户端调用会得到 undefined。
 */
export function getServerContext(): ServerContext {
  const ctx = als.getStore()
  if (!ctx) {
    // 客户端调用或 outside of ALS context
    return { env: undefined as unknown as Env }
  }
  return ctx
}

export { als }
