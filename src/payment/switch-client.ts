import { resolveLookupKey } from '@/config/products'
import type { SwitchDirection } from './billing-query'

/**
 * 浏览器端切换方案：POST `/api/payment/switch`。
 *
 * 切换的是**现有那份订阅的价格**（Stripe 的订阅更新），不新开 Checkout、不跳门户：
 * 一个账号最多一份订阅，两份订阅就是两份扣款。
 *
 * 客户端**不传** Price id，与结账同一原则——价格由服务端按 `lookup_key` 解析。
 *
 * 不回显服务端错误体：它可能包含内部路径。错误只回**稳定的分类**，由页面决定提示。
 */

export type SwitchOutcome =
  /** 立即生效（升级 / 同档换周期）。 */
  | { kind: 'switched'; direction: SwitchDirection; productId: string; interval: string }
  /** 已安排，周期末生效（降级）。 */
  | {
      kind: 'scheduled'
      direction: 'downgrade'
      productId: string
      interval: string
      effectiveAt: string | null
    }
  /** 没有变化；`pendingCancelled` 为真表示顺带取消了已安排的降级。 */
  | { kind: 'unchanged'; pendingCancelled: boolean }
  | { kind: 'unauthenticated' }
  /** 目标没配价格，或目标不是订阅。 */
  | { kind: 'not-configured' }
  /** 没有可切换的订阅（没有订阅，或状态不明确）。 */
  | { kind: 'no-subscription' }
  /** 被守卫挡下（买断冲突、多份活跃订阅等）。 */
  | { kind: 'blocked' }
  | { kind: 'error' }

export interface SwitchParams {
  /** 本站产品 id（档位）。 */
  productId: string
  /** 计费周期；买断（`one_time`）不是订阅，切不了。 */
  interval: 'month' | 'year' | 'one_time'
}

export async function startSwitch(params: SwitchParams): Promise<SwitchOutcome> {
  // 没配 lookup key 就别发请求：直接告诉页面「这个目标不可用」。
  if (!resolveLookupKey(params.productId, params.interval)) {
    return { kind: 'not-configured' }
  }

  let response: Response
  try {
    response = await fetch('/api/payment/switch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: params.productId, interval: params.interval }),
    })
  } catch {
    return { kind: 'error' }
  }

  if (response.status === 401) return { kind: 'unauthenticated' }
  if (response.status === 400) return { kind: 'not-configured' }
  if (response.status === 409) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    if (body?.error === 'NO_ACTIVE_SUBSCRIPTION') return { kind: 'no-subscription' }
    // 多份活跃订阅、买断冲突、归属不明：都归到「挡下了」，页面提示去门户处理。
    return { kind: 'blocked' }
  }
  if (!response.ok) return { kind: 'error' }

  const body = (await response.json().catch(() => null)) as {
    status?: string
    direction?: SwitchDirection
    productId?: string
    interval?: string
    effectiveAt?: string | null
    pendingCancelled?: boolean
  } | null

  if (!body) return { kind: 'error' }

  if (body.status === 'scheduled') {
    return {
      kind: 'scheduled',
      direction: 'downgrade',
      productId: body.productId ?? params.productId,
      interval: body.interval ?? params.interval,
      effectiveAt: body.effectiveAt ?? null,
    }
  }
  if (body.status === 'unchanged') {
    return { kind: 'unchanged', pendingCancelled: body.pendingCancelled === true }
  }
  if (body.status === 'switched') {
    return {
      kind: 'switched',
      direction: body.direction ?? 'change',
      productId: body.productId ?? params.productId,
      interval: body.interval ?? params.interval,
    }
  }
  return { kind: 'error' }
}
