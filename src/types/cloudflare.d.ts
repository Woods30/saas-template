/**
 * Cloudflare Workers Env 全局类型。
 *
 * Cloudflare 不提供预定义的全局 `Env`，这里手动声明与 `wrangler types`
 * 生成的 `Env` 接口等效。
 */
/// <reference types="@cloudflare/workers-types" />
type ServerEnvBindings = Partial<import('@/core/env/server').ServerEnv>

interface Env extends Omit<ServerEnvBindings, 'NODE_ENV' | 'BEEHIIV_SEND_WELCOME_EMAIL'> {
  DB: D1Database
  CACHE: KVNamespace
  BUCKET: R2Bucket
  EMAIL?: SendEmail
  /**
   * Hyperdrive binding：`DATABASE_PROVIDER=postgres` 时用它连 PostgreSQL。
   *
   * Workers 上没有原生 TCP 出站，PostgreSQL 必须经 Hyperdrive（或外部 HTTP 网关）。
   */
  HYPERDRIVE?: Hyperdrive
  // binding 是未经校验的原始字符串；enum 限制与默认值由 parseServerEnv 处理。
  NODE_ENV?: ServerEnvBindings['NODE_ENV'] | string
  BEEHIIV_SEND_WELCOME_EMAIL?: ServerEnvBindings['BEEHIIV_SEND_WELCOME_EMAIL'] | string
}
