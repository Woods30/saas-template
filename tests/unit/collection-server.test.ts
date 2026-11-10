import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  ADMIN_ORDER_STATUSES,
  COLLECTION_RATE_LIMITS,
  type CollectionGuardDeps,
  createOrderSchema,
  DEFAULT_ADMIN_ORDER_STATUS,
  enforceRateLimit,
  errorResponse,
  errorStatus,
  failureResponse,
  guardCollectionRequest,
  rateLimitAction,
  resolveAdminOrderQuery,
  reviewOrderSchema,
} from '@/collection/server-logic'
import { CollectionError } from '@/collection/types'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

/** 正则里要按字面量匹配的模块路径。 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * server 层的纯逻辑：门禁顺序、错误映射、限流键与参数校验。
 *
 * 不断言 server function 本身 —— 它依赖请求上下文（会话、env、KV），而且
 * `createServerFn` 的实现由 vite 插件改写，单元测试里调用它不会走到 handler。
 * 仓库里既有的做法也是把可测逻辑抽到独立模块去测（见 `src/payment/billing-query.ts`）。
 */

/** 造一份门禁依赖，并记录调用顺序。 */
function makeDeps(overrides: Partial<CollectionGuardDeps> = {}): {
  deps: CollectionGuardDeps
  calls: string[]
} {
  const calls: string[] = []
  const deps: CollectionGuardDeps = {
    ip: overrides.ip ?? '1.2.3.4',
    module: () => {
      calls.push('module')
      return overrides.module ? overrides.module() : undefined
    },
    session: async () => {
      calls.push('session')
      if (overrides.session) return overrides.session()
      return { userId: 'u1', role: 'user' }
    },
    rateLimit: async (opts) => {
      calls.push('rateLimit')
      if (overrides.rateLimit) return overrides.rateLimit(opts)
      return true
    },
  }
  return { deps, calls }
}

describe('错误码 → HTTP 状态', () => {
  it('不存在的订单与关闭的模块都是 404，不泄漏资源是否存在', () => {
    expect(errorStatus('ORDER_NOT_FOUND')).toBe(404)
    expect(errorStatus('MODULE_DISABLED')).toBe(404)
  })

  it('配置不全与存储不可用是 503', () => {
    expect(errorStatus('SERVICE_UNAVAILABLE')).toBe(503)
    expect(errorStatus('STORAGE_UNAVAILABLE')).toBe(503)
  })

  it('状态冲突类错误是 409', () => {
    expect(errorStatus('INVALID_ORDER_STATE')).toBe(409)
    expect(errorStatus('SETTLEMENT_IN_PROGRESS')).toBe(409)
    expect(errorStatus('AMOUNT_POOL_EXHAUSTED')).toBe(409)
    expect(errorStatus('SUBSCRIPTION_SLOT_TAKEN')).toBe(409)
  })

  it('参数不合法类是 400（含两个不在原始码表里的新码）', () => {
    expect(errorStatus('INVALID_OFFER')).toBe(400)
    expect(errorStatus('AMOUNT_MISMATCH')).toBe(400)
    expect(errorStatus('INVALID_PAYER_NOTE')).toBe(400)
    expect(errorStatus('INVALID_REVIEW_NOTE')).toBe(400)
    expect(errorStatus('NO_COLLECTION_ACCOUNT')).toBe(400)
    expect(errorStatus('INVALID_INPUT')).toBe(400)
  })

  it('订单过期是 410', () => {
    expect(errorStatus('ORDER_EXPIRED')).toBe(410)
  })

  it('未登录 401、无权限 403、被限流 429', () => {
    expect(errorStatus('UNAUTHENTICATED')).toBe(401)
    expect(errorStatus('FORBIDDEN')).toBe(403)
    expect(errorStatus('RATE_LIMITED')).toBe(429)
  })

  it('响应体只回稳定错误码，不回显内部细节', async () => {
    const response = errorResponse('ORDER_NOT_FOUND')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toEqual({ error: 'ORDER_NOT_FOUND' })
  })
})

describe('异常 → 错误响应', () => {
  it('领域错误按自带的状态码翻译', async () => {
    const response = failureResponse(new CollectionError('ORDER_EXPIRED', '订单已过期'))
    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual({ error: 'ORDER_EXPIRED' })
  })

  it('参数不合法统一 400', async () => {
    let thrown: unknown
    try {
      createOrderSchema.parse({})
    } catch (error) {
      thrown = error
    }
    const response = failureResponse(thrown)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'INVALID_INPUT' })
  })

  it('其余异常按 500 处理，不回显内部细节', async () => {
    const response = failureResponse(new Error('boom'))
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'INTERNAL_ERROR' })
  })
})

describe('门禁顺序', () => {
  it('模块关闭时 404，且不再查会话', async () => {
    const { deps, calls } = makeDeps({
      module: () => errorResponse('MODULE_DISABLED'),
    })
    const result = await guardCollectionRequest(deps, { limit: 'create-order' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(404)
    // 模块都没开，就不该再查会话、也不该再查限流。
    expect(calls).toEqual(['module'])
  })

  it('配置不全时 503', async () => {
    const { deps } = makeDeps({ module: () => errorResponse('SERVICE_UNAVAILABLE') })
    const result = await guardCollectionRequest(deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(503)
  })

  it('未登录时 401', async () => {
    const { deps, calls } = makeDeps({ session: async () => null })
    const result = await guardCollectionRequest(deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
    expect(calls).toEqual(['module', 'session'])
  })

  it('普通用户调用管理员接口返回 403', async () => {
    const { deps } = makeDeps({ session: async () => ({ userId: 'u1', role: 'user' }) })
    const result = await guardCollectionRequest(deps, { requireAdmin: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it('管理员放行', async () => {
    const { deps } = makeDeps({ session: async () => ({ userId: 'a1', role: 'admin' }) })
    const result = await guardCollectionRequest(deps, { requireAdmin: true })
    expect(result.ok).toBe(true)
  })

  it('被限流时 429', async () => {
    const { deps } = makeDeps({ rateLimit: async () => false })
    const result = await guardCollectionRequest(deps, { limit: 'create-order' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(429)
  })

  it('顺序固定：模块 → 会话 → 角色 → 限流', async () => {
    const { deps, calls } = makeDeps({
      session: async () => ({ userId: 'a1', role: 'admin' }),
    })
    const result = await guardCollectionRequest(deps, { requireAdmin: true, limit: 'review-order' })
    expect(result.ok).toBe(true)
    expect(calls).toEqual(['module', 'session', 'rateLimit'])
  })

  it('角色只认服务端会话：客户端伪造的角色不作数', async () => {
    // 门禁的入参里根本没有 role —— 角色只能来自 session。
    const { deps } = makeDeps({ session: async () => ({ userId: 'u1', role: 'user' }) })
    const result = await guardCollectionRequest(deps, { requireAdmin: true })
    expect(result.ok).toBe(false)
  })
})

describe('限流', () => {
  it('各动作的限额与窗口彼此独立', () => {
    const actions = Object.entries(COLLECTION_RATE_LIMITS)
    expect(COLLECTION_RATE_LIMITS['create-order']).toEqual({ limit: 5, windowSeconds: 900 })
    expect(COLLECTION_RATE_LIMITS['submit-order']).toEqual({ limit: 10, windowSeconds: 60 })
    expect(COLLECTION_RATE_LIMITS['poll-order']).toEqual({ limit: 60, windowSeconds: 60 })
    expect(COLLECTION_RATE_LIMITS['upload-receipt']).toEqual({ limit: 5, windowSeconds: 900 })
    expect(COLLECTION_RATE_LIMITS['review-order']).toEqual({ limit: 30, windowSeconds: 60 })
    // 不同动作的键必须不同，否则共享同一桶。
    expect(new Set(actions.map(([action]) => action)).size).toBe(actions.length)
  })

  it('限流键带上账号 ID：限流工具只有 ip+action 维度', () => {
    expect(rateLimitAction('create-order', 'user-1')).toBe('collection:create-order:user-1')
    expect(rateLimitAction('create-order', 'user-2')).not.toBe(
      rateLimitAction('create-order', 'user-1'),
    )
    expect(rateLimitAction('poll-order')).toBe('collection:poll-order')
  })

  it('放行时返回 undefined，被限流时返回 429', async () => {
    const allowed = vi.fn().mockResolvedValue(true)
    expect(
      await enforceRateLimit(allowed, { ip: '1.2.3.4', action: 'create-order', userId: 'u1' }),
    ).toBeUndefined()
    expect(allowed).toHaveBeenCalledWith({
      ip: '1.2.3.4',
      action: 'collection:create-order:u1',
      limit: 5,
      windowSeconds: 900,
    })

    const blocked = vi.fn().mockResolvedValue(false)
    const response = await enforceRateLimit(blocked, {
      ip: '1.2.3.4',
      action: 'submit-order',
      userId: 'u1',
    })
    expect(response?.status).toBe(429)
  })
})

describe('参数校验', () => {
  it('创建订单必须给出商品与付费方式', () => {
    expect(createOrderSchema.safeParse({ productId: 'template', offerId: 'once' }).success).toBe(
      true,
    )
    expect(createOrderSchema.safeParse({ productId: 'template' }).success).toBe(false)
  })

  it('核验动作只能是三种，金额必须是正整数', () => {
    expect(
      reviewOrderSchema.safeParse({ orderId: 'o1', action: 'approve', observedAmount: 18001 })
        .success,
    ).toBe(true)
    expect(reviewOrderSchema.safeParse({ orderId: 'o1', action: 'nope' }).success).toBe(false)
    expect(
      reviewOrderSchema.safeParse({ orderId: 'o1', action: 'approve', observedAmount: 0 }).success,
    ).toBe(false)
    expect(
      reviewOrderSchema.safeParse({ orderId: 'o1', action: 'approve', observedAmount: 1.5 })
        .success,
    ).toBe(false)
  })
})

describe('管理员订单列表查询', () => {
  it('默认筛选待核验，默认 20 条', () => {
    expect(resolveAdminOrderQuery({})).toEqual({
      status: DEFAULT_ADMIN_ORDER_STATUS,
      limit: 20,
      offset: 0,
    })
  })

  it('limit 越界直接拒绝，而不是静默夹取', () => {
    // 夹取会让调用方以为「就是要 20 条」，从而掩盖调用方的 bug。
    expect(() => resolveAdminOrderQuery({ limit: 101 })).toThrow()
    expect(() => resolveAdminOrderQuery({ limit: 0 })).toThrow()
    expect(resolveAdminOrderQuery({ limit: 50 }).limit).toBe(50)
    expect(resolveAdminOrderQuery({ limit: 100 }).limit).toBe(100)
  })

  it('可以显式指定状态，也可以要全部历史', () => {
    expect(resolveAdminOrderQuery({ status: 'settled' }).status).toBe('settled')
    expect(resolveAdminOrderQuery({ status: 'all' }).status).toBe('all')
  })

  it('筛选状态覆盖订单的全部状态', () => {
    for (const status of ADMIN_ORDER_STATUSES) {
      expect(resolveAdminOrderQuery({ status }).status).toBe(status)
    }
  })
})

describe('页面路由的服务端导入边界', () => {
  /**
   * 回归守卫：页面路由静态导入服务端模块，会把 `node:async_hooks` 之类的
   * 服务端依赖打进浏览器 bundle，运行时直接抛「Module has been externalized」，
   * 整站水合失败 —— 表现是所有页面都白屏，而不是某一个页面报错。
   *
   * 页面要服务端事实（如「有没有对象存储绑定」）时，走 server function 返回，
   * 不在页面里 import 服务端模块。`src/routes/api/**` 是服务端路由，不受此限。
   */
  const SERVER_ONLY_MODULES = [
    '@/lib/server-context',
    '@/lib/module-access.server',
    '@/lib/rate-limit',
    '@/db',
    '@/storage',
    '@/auth/auth',
    '@/mail',
    '@/cache',
    '@/notification',
  ]

  it('页面路由不静态导入服务端专用模块', () => {
    const routesDir = join(repoRoot, 'src/routes')
    const offenders: string[] = []
    for (const file of readdirSync(routesDir, { recursive: true, encoding: 'utf8' })) {
      if (!/\.(ts|tsx)$/.test(file)) continue
      const relativePath = join('src/routes', file)
      // API 路由是服务端路由，本来就在服务端跑。
      if (relativePath.includes(`${sep}api${sep}`)) continue
      const source = readFileSync(join(routesDir, file), 'utf8')
      for (const modulePath of SERVER_ONLY_MODULES) {
        // 只看静态 import：`import type` 编译期擦除，函数内 `await import()` 是惰性加载。
        const pattern = new RegExp(
          `^\\s*import\\s+(?!type\\b)[^\\n]*from\\s+['"]${escapeRegExp(modulePath)}['"]`,
          'm',
        )
        if (pattern.test(source)) offenders.push(`${relativePath} → ${modulePath}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
