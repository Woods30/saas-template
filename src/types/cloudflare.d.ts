/**
 * Cloudflare Workers Env 全局类型。
 *
 * Cloudflare 不提供预定义的全局 `Env`，这里手动声明与 `wrangler types`
 * 生成的 `Env` 接口等效。
 */
/// <reference types="@cloudflare/workers-types" />
type ServerEnvBindings = Partial<import('@/env/server').ServerEnv>

interface Env extends Omit<ServerEnvBindings, 'NODE_ENV' | 'BEEHIIV_SEND_WELCOME_EMAIL'> {
  DB: D1Database
  CACHE: KVNamespace
  BUCKET: R2Bucket
  EMAIL?: SendEmail
  // binding 是未经校验的原始字符串；enum 限制与默认值由 parseServerEnv 处理。
  NODE_ENV?: ServerEnvBindings['NODE_ENV'] | string
  BEEHIIV_SEND_WELCOME_EMAIL?: ServerEnvBindings['BEEHIIV_SEND_WELCOME_EMAIL'] | string
}
