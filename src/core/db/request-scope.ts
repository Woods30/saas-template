/**
 * 每请求作用域。
 *
 * PostgreSQL 连接不能跨请求复用：Workers 的 isolate 可能在请求之间被冻结，
 * 冻结期间持有的 TCP 连接会失效，下一个请求拿到的是坏连接。因此 PG 侧的
 * 客户端与依赖它的实例（better-auth 等）都挂在请求作用域上，请求结束即丢弃。
 *
 * D1 不需要这套机制——binding 本身是 isolate 级稳定对象。
 */
import { AsyncLocalStorage } from 'node:async_hooks'

interface RequestScope {
  /** 每请求缓存：键 → 实例。 */
  cache: Map<string, unknown>
}

const als = new AsyncLocalStorage<RequestScope>()

/** 在请求作用域内执行回调。 */
export function runWithRequestScope<T>(fn: () => T): T {
  return als.run({ cache: new Map() }, fn)
}

/** 当前请求作用域；不在请求内（脚本、单测）时为 undefined。 */
export function getRequestScope(): RequestScope | undefined {
  return als.getStore()
}

/**
 * 取（并在必要时创建）请求作用域内的实例。
 *
 * 不在请求作用域内时直接新建——脚本与单测里没有「跨请求复用」的需求，
 * 反而复用会留下坏连接。
 */
export function getRequestScoped<T>(key: string, create: () => T): T {
  const scope = getRequestScope()
  if (!scope) {
    return create()
  }
  const cached = scope.cache.get(key)
  if (cached !== undefined) {
    return cached as T
  }
  const created = create()
  scope.cache.set(key, created)
  return created
}
