import { describe, expect, it } from 'vitest'
import { baseConfig, setResolvedConfig, type WebsiteConfig } from '@/config/website'
import { createAuth, getAuth } from '@/core/auth/auth'
import { getAuthProviderAvailability } from '@/core/auth/providers'
import { parseServerEnv, type RuntimeEnv } from '@/core/env/server'
import { gate } from '@/routes/api/auth/$'

/** 运行期 env：启动参数 + 数据库配置（这里直接给出托管键）。 */
function makeEnv(extra: Partial<RuntimeEnv> = {}): RuntimeEnv {
  return { ...parseServerEnv({}), ...extra }
}

/** 登录方式开关覆盖后的独立配置。 */
function makeConfig(flags: {
  emailEnabled?: boolean
  googleEnabled?: boolean
  githubEnabled?: boolean
}): WebsiteConfig {
  return {
    ...baseConfig,
    auth: { ...baseConfig.auth, ...flags },
  }
}

/** 只替换 D1 传输；`createAuth` 的配置构建走真实实现。 */
function fakeD1() {
  return {
    prepare: () => ({}),
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
    dump: async () => new ArrayBuffer(0),
    withSession: () => fakeD1(),
  } as unknown as D1Database
}

function makeAuthEnv(extra: Partial<RuntimeEnv> & { DB?: D1Database } = {}) {
  return {
    DB: fakeD1(),
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
    BETTER_AUTH_URL: 'http://localhost:3000',
    ...extra,
  } as unknown as Env
}

/**
 * 用指定开关创建一份 better-auth 实例并取出 options。
 *
 * 断言真实的注册条件，而不是只看页面展示：页面可见性必须与服务端注册一致。
 */
async function authOptions(config: WebsiteConfig, extra: Partial<RuntimeEnv> = {}) {
  setResolvedConfig(config)
  try {
    const auth = await createAuth(makeAuthEnv(extra))
    return (await auth.$context).options
  } finally {
    setResolvedConfig(baseConfig)
  }
}

/**
 * 社交登录可见性判定。Google / GitHub 凭据属于数据库配置，客户端读不到，故按钮
 * 可见性须在服务端判定后传给组件；判定本身是纯函数，可单独测。
 */
describe('getAuthProviderAvailability', () => {
  it('返回邮箱 / Google / GitHub 三种方式的可用性', () => {
    expect(
      getAuthProviderAvailability(
        makeEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }),
        makeConfig({ emailEnabled: true, googleEnabled: true, githubEnabled: false }),
      ),
    ).toEqual({ email: true, google: true, github: false })
  })

  it('缺少 secret 时为 false（不能只凭 clientId 就显示按钮）', () => {
    expect(
      getAuthProviderAvailability(
        makeEnv({ GOOGLE_CLIENT_ID: 'id' }),
        makeConfig({ emailEnabled: true, googleEnabled: true, githubEnabled: true }),
      ),
    ).toEqual({ email: true, google: false, github: false })
  })

  it('开关关闭时即使凭据齐备也为 false', () => {
    expect(
      getAuthProviderAvailability(
        makeEnv({
          GOOGLE_CLIENT_ID: 'id',
          GOOGLE_CLIENT_SECRET: 'secret',
          GITHUB_CLIENT_ID: 'id',
          GITHUB_CLIENT_SECRET: 'secret',
        }),
        makeConfig({ emailEnabled: false, googleEnabled: false, githubEnabled: false }),
      ),
    ).toEqual({ email: false, google: false, github: false })
  })
})

/**
 * 服务端注册条件：方法开关与凭据缺一不可。
 */
describe('better-auth 登录方式注册', () => {
  it('邮箱关闭时不启用 emailAndPassword', async () => {
    const off = await authOptions(makeConfig({ emailEnabled: false }))
    expect(off.emailAndPassword?.enabled).toBe(false)

    const on = await authOptions(makeConfig({ emailEnabled: true }))
    expect(on.emailAndPassword?.enabled).toBe(true)
  })

  it('Google 未配置凭据时不注册 socialProvider', async () => {
    // 开关打开但凭据缺失：better-auth 注册了只会得到必然失败的流程。
    const missing = await authOptions(makeConfig({ googleEnabled: true }))
    expect(missing.socialProviders?.google).toBeUndefined()

    // 凭据齐备但开关关闭：同样不注册。
    const flagOff = await authOptions(makeConfig({ googleEnabled: false }), {
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
    })
    expect(flagOff.socialProviders?.google).toBeUndefined()
  })

  it('GitHub 配置齐备时注册 socialProvider', async () => {
    const creds = { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' }
    const on = await authOptions(makeConfig({ githubEnabled: true }), creds)
    expect(on.socialProviders?.github).toMatchObject({
      clientId: 'id',
      clientSecret: 'secret',
    })

    const flagOff = await authOptions(makeConfig({ githubEnabled: false }), creds)
    expect(flagOff.socialProviders?.github).toBeUndefined()
  })
})

/**
 * 实例缓存必须跟随配置安装代号重建。
 *
 * 实例把登录方式快照在构造时；只在首次建实例、之后永远命中缓存，会让后台保存后的
 * 可见性与实际注册脱节（页面隐藏了表单，端点却仍然可用）。
 */
describe('认证实例随配置安装重建', () => {
  it('邮箱开关保存后返回新实例，emailAndPassword 跟随变化', async () => {
    const db = fakeD1()
    setResolvedConfig(makeConfig({ emailEnabled: true }))
    try {
      const env = makeAuthEnv({ DB: db })
      const first = await getAuth(env)
      expect((await first.$context).options.emailAndPassword?.enabled).toBe(true)

      // 走安装路径：setResolvedConfig 会 bump 配置代号。
      setResolvedConfig(makeConfig({ emailEnabled: false }))

      const second = await getAuth(env)
      expect(second).not.toBe(first)
      expect((await second.$context).options.emailAndPassword?.enabled).toBe(false)
    } finally {
      setResolvedConfig(baseConfig)
    }
  })

  it('社交开关保存后返回新实例，socialProviders 跟随变化', async () => {
    const db = fakeD1()
    const creds = {
      DB: db,
      GITHUB_CLIENT_ID: 'id',
      GITHUB_CLIENT_SECRET: 'secret',
    }
    setResolvedConfig(makeConfig({ githubEnabled: true }))
    try {
      const env = makeAuthEnv(creds)
      const first = await getAuth(env)
      expect((await first.$context).options.socialProviders?.github).toBeDefined()

      setResolvedConfig(makeConfig({ githubEnabled: false }))

      const second = await getAuth(env)
      expect(second).not.toBe(first)
      expect((await second.$context).options.socialProviders?.github).toBeUndefined()
    } finally {
      setResolvedConfig(baseConfig)
    }
  })
})

describe('userFeatures.apiKeys 门禁', () => {
  it('userFeatures.apiKeys 关闭时 /api/auth/api-key 返回 404', async () => {
    setResolvedConfig({
      ...baseConfig,
      userFeatures: { ...baseConfig.userFeatures, apiKeys: false },
    })
    try {
      const res = gate(new Request('https://jerbix.dev/api/auth/api-key/list'))
      expect(res?.status).toBe(404)
      expect(await res?.json()).toEqual({ error: 'MODULE_DISABLED' })
    } finally {
      setResolvedConfig(baseConfig)
    }
  })
})
