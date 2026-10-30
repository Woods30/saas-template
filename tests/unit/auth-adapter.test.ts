import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { websiteConfig } from '@/config/website'

const email = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('@/auth/emails', () => ({ sendAuthEmailForRequest: email.send }))

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

/** 仅替换 D1 传输；SQL、迁移和 Drizzle adapter 均走真实实现。 */
function memoryD1() {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of readdirSync('src/db/migrations')
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(`src/db/migrations/${name}`, 'utf8'))
  }
  function prepare(query: string) {
    const statement = sqlite.prepare(query)
    let values: SQLInputValue[] = []
    return {
      bind(...params: SQLInputValue[]) {
        values = params
        return this
      },
      async all() {
        return { results: statement.all(...values), success: true }
      },
      async raw() {
        return statement.all(...values).map((row) => Object.values(row))
      },
      async run() {
        return { results: [], success: true, meta: statement.run(...values) }
      },
    }
  }
  return { sqlite, binding: { prepare } as unknown as D1Database }
}

describe('邮箱验证完整流程', () => {
  it('注册不创建会话，未验证登录被拒绝，邮件验证后建立会话并保留购买目标', async () => {
    const { sqlite, binding } = memoryD1()
    email.send.mockClear()
    const auth = getAuth({ ...env(), DB: binding })
    const callbackURL = '/zh/auth/verify-email?redirect=%2Fzh%2F%23pricing'
    const credentials = { email: 'buyer@example.com', password: 'StrongPassword123!' }
    const post = (path: string, body: object) =>
      auth.handler(
        new Request(`http://localhost:3000/api/auth/${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
          body: JSON.stringify(body),
        }),
      )
    try {
      const signup = await post('sign-up/email', { ...credentials, name: 'Buyer', callbackURL })
      expect(signup.status).toBe(200)
      expect(signup.headers.get('set-cookie') ?? '').not.toContain('session_token=')
      expect(sqlite.prepare('SELECT count(*) AS count FROM sessions').get()?.count).toBe(0)
      expect(sqlite.prepare('SELECT email_verified FROM users').get()?.email_verified).toBe(0)
      expect(email.send.mock.calls.map(([input]) => input.kind)).toEqual(['verifyEmail'])

      const denied = await post('sign-in/email', { ...credentials, callbackURL })
      expect(denied.status).toBe(403)
      expect(await denied.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' })
      expect(email.send.mock.calls.map(([input]) => input.kind)).toEqual([
        'verifyEmail',
        'verifyEmail',
      ])
      const verificationURL = email.send.mock.calls[1]?.[0].actionUrl as string
      expect(new URL(verificationURL).searchParams.get('callbackURL')).toBe(callbackURL)
      const verified = await auth.handler(new Request(verificationURL))
      expect(verified.status).toBe(302)
      expect(verified.headers.get('location')).toBe(callbackURL)
      expect(verified.headers.get('set-cookie')).toContain('session_token=')
      expect(sqlite.prepare('SELECT email_verified FROM users').get()?.email_verified).toBe(1)
      expect(sqlite.prepare('SELECT count(*) AS count FROM sessions').get()?.count).toBe(1)
      expect(email.send.mock.calls.map(([input]) => input.kind)).toEqual([
        'verifyEmail',
        'verifyEmail',
        'welcome',
      ])
      const login = await post('sign-in/email', credentials)
      expect(login.status).toBe(200)
      expect(login.headers.get('set-cookie')).toContain('session_token=')
    } finally {
      sqlite.close()
    }
  })
})

describe('会话 cookie 缓存', () => {
  it('已开启且缓存窗口不超过 60 秒', async () => {
    const ctx = await getAuth(env()).$context
    const cookieCache = ctx.options.session?.cookieCache
    expect(cookieCache?.enabled).toBe(true)
    // 缓存 cookie 是签名 JWT，撤销会话不会让它立刻失效；
    // 窗口越长，被踢设备仍可访问的时间越久。
    expect(cookieCache?.maxAge).toBeLessThanOrEqual(60)
  })
})

describe('邮箱验证接线', () => {
  it('注册和未验证登录均发验证邮件，验证后自动登录', async () => {
    const auth = getAuth(env())
    const ctx = await auth.$context
    expect(ctx.options.emailAndPassword?.requireEmailVerification).toBe(true)
    expect(ctx.options.emailVerification?.sendOnSignUp).toBe(true)
    expect(ctx.options.emailVerification?.sendOnSignIn).toBe(true)
    expect(ctx.options.emailVerification?.autoSignInAfterVerification).toBe(true)
  })
  it('欢迎邮件只在邮箱验证后发送', async () => {
    const previous = websiteConfig.mail.enabled
    websiteConfig.mail.enabled = true
    email.send.mockClear()
    try {
      const ctx = await getAuth(env()).$context
      const hook = ctx.options.emailVerification?.afterEmailVerification
      expect(hook).toBeTypeOf('function')
      const user = {
        id: 'u1',
        name: 'Buyer',
        email: 'buyer@example.com',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await hook?.(user, new Request('http://localhost:3000/api/auth/verify-email'))
      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'welcome', to: user.email }),
        expect.any(Request),
        expect.any(Object),
      )
      expect('databaseHooks' in ctx.options).toBe(false)
    } finally {
      websiteConfig.mail.enabled = previous
    }
  })
})

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
