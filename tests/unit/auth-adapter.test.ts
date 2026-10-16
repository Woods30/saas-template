import { describe, expect, it } from 'vitest'
import { getAuth } from '@/auth/auth'
import { schema } from '@/db'

/**
 * better-auth 的数据库接线回归测试。
 *
 * 背景：`drizzleAdapter(db, ...)` 是**适配器工厂**（`(db, config) => (options) => DBAdapter`），
 * 必须作为顶层 `database:` 传入。此前它被放在 `plugins:` 里并 cast 成 `BetterAuthPlugin`，
 * 而 better-auth 在 `createAuthContext` 之前就调用 `getBaseAdapter(options)`，
 * 该函数**只读 `options.database`**——插件 `init` 那时还没跑。结果 `options.database`
 * 为 undefined，better-auth 静默回退到内存适配器：注册/登录看似 200，实际一行都不落库，
 * api-key 创建必然 401。这个 bug 从 `2e91ec6` 起就在 main 上。
 *
 * 这组断言钉住两件事：适配器是 drizzle（不是 memory），以及 sessions 表具备
 * better-auth 1.7.10 要求的 `updatedAt` 列——两者任一缺失都会让落库静默失效。
 */
function fakeD1() {
  return {
    prepare: () => ({}),
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
    dump: async () => new ArrayBuffer(0),
    withSession: () => fakeD1(),
  } as unknown as D1Database
}

function env() {
  return {
    DB: fakeD1(),
    BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
    BETTER_AUTH_URL: 'http://localhost:3000',
  } as unknown as Env
}

describe('getAuth 数据库接线', () => {
  it('使用 drizzle 适配器，而非回退到内存适配器', async () => {
    const auth = getAuth(env())
    const ctx = await auth.$context
    expect(ctx.adapter.id).toBe('drizzle')
  })

  it('sessions 表含 better-auth 要求的 updatedAt 列', () => {
    expect(schema.sessions.updatedAt).toBeDefined()
  })
})
