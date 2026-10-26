import { describe, expect, it } from 'vitest'
import { getAuth } from '@/auth/auth'
import { authClient } from '@/auth/client'
import { schema } from '@/db'

/**
 * better-auth 数据库接线回归：`drizzleAdapter` 必须作为顶层 `database:` 传入。
 * 放进 `plugins:` 时 `options.database` 为 undefined，会静默回退内存适配器——注册看似
 * 成功却一行不落库。另需 sessions 表带 better-auth 要求的 `updatedAt` 列。
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

describe('auth 插件注册', () => {
  it('服务端注册 admin 插件（/api/auth/admin/* 端点由它提供）', async () => {
    const auth = getAuth(env())
    const ctx = await auth.$context
    const ids = (ctx.options.plugins ?? []).map((plugin) => plugin.id)
    expect(ids).toContain('admin')
    expect(ids).toContain('api-key')
  })

  it('客户端暴露 admin 命名空间与 apiKey 命名空间', () => {
    expect(typeof authClient.admin.listUsers).toBe('function')
    expect(typeof authClient.apiKey.list).toBe('function')
  })
})
