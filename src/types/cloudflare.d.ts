/**
 * Cloudflare Workers Env 全局类型。
 *
 * 在 D1 binding（Task 16）落地前，`DB` 字段类型上存在，
 * 运行时为 undefined；Task 16 会通过 wrangler.jsonc 的
 * `d1_databases` 正式注入，届时本文件无需改动。
 *
 * 注意：Cloudflare 不提供预定义的全局 `Env`，这里手动声明
 * 与 `wrangler types` 生成的 `Env` 接口等效，供全项目使用。
 */
interface Env {
  DB: D1Database
}
