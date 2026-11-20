import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'

const email = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('@/core/auth/emails', () => ({ sendAuthEmailForRequest: email.send }))

import { getAuth } from '@/core/auth/auth'

type CreateBeforeHook = (
  user: Record<string, unknown>,
  context: { headers?: Headers } | null,
) => Promise<boolean | undefined | { data: Record<string, unknown> }>

function createBeforeHook(auth: Awaited<ReturnType<typeof getAuth>>): CreateBeforeHook {
  const hook = auth.options.databaseHooks?.user?.create?.before
  if (!hook) throw new Error('user.create.before hook 未注册')
  return hook as unknown as CreateBeforeHook
}

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
    BETTER_AUTH_SECRET: 'unit-test-secret-unit-test-secret-1234',
    BETTER_AUTH_URL: 'http://localhost:3000',
  } as unknown as Env
}

/** 仅替换 D1 传输；SQL、迁移和 Drizzle adapter 均走真实实现。 */
function memoryD1() {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of readdirSync('src/core/db/migrations/sqlite')
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(`src/core/db/migrations/sqlite/${name}`, 'utf8'))
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

describe('注册归因写入', () => {
  it('user.create.before 把归因写进 data', async () => {
    const auth = await getAuth({ ...env(), DB: fakeD1() })
    const hook = createBeforeHook(auth)
    const result = await hook(
      { email: 'attr@example.com', name: 'Attr' },
      {
        headers: new Headers({
          cookie: 'utm_source=spring; utm_medium=cpc',
          'cf-ipcountry': 'jp',
          'cf-connecting-ip': '203.0.113.9',
          'accept-language': 'en-US,en;q=0.9',
        }),
      },
    )
    expect(result).toEqual({
      data: expect.objectContaining({
        email: 'attr@example.com',
        utmSource: 'spring',
        utmMedium: 'cpc',
        utmCampaign: '',
        utmTerm: '',
        utmContent: '',
        referrer: '',
        country: 'JP',
        ip: '203.0.113.9',
        locale: 'en',
      }),
    })
  })

  it('ctx 无 headers 时回退空值且不抛错', async () => {
    const auth = await getAuth({ ...env(), DB: fakeD1() })
    const hook = createBeforeHook(auth)
    const user = { email: 'noctx@example.com', name: 'NoCtx' }
    expect(await hook(user, null)).toEqual({
      data: {
        ...user,
        utmSource: '',
        utmMedium: '',
        utmCampaign: '',
        utmTerm: '',
        utmContent: '',
        referrer: '',
        country: '',
        ip: '',
        locale: '',
      },
    })
  })

  it('注册请求把清洗后的归因写进 users 行，客户端传值被忽略', async () => {
    const { sqlite, binding } = memoryD1()
    const auth = await getAuth({ ...env(), DB: binding })
    try {
      const response = await auth.handler(
        new Request('http://localhost:3000/api/auth/sign-up/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'http://localhost:3000',
            Cookie: 'utm_source=spring; utm_medium=cpc; utm_campaign=launch',
            'cf-ipcountry': 'jp',
            'cf-connecting-ip': '198.51.100.7',
            'accept-language': 'en-US,en;q=0.9',
          },
          body: JSON.stringify({
            email: 'attributed@example.com',
            password: 'correct-horse-battery',
            name: 'Attributed',
            utmSource: 'client-forged',
          }),
        }),
      )
      expect(response.status).toBe(200)
      const row = sqlite
        .prepare(
          'SELECT utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, country, ip, locale FROM users',
        )
        .get()
      expect(row).toEqual({
        utm_source: 'spring',
        utm_medium: 'cpc',
        utm_campaign: 'launch',
        utm_term: '',
        utm_content: '',
        referrer: '',
        country: 'JP',
        ip: '198.51.100.7',
        locale: 'en',
      })
    } finally {
      sqlite.close()
    }
  })
})
