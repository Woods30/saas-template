import { describe, expect, it } from 'vitest'
import { getAuthProviderAvailability } from '@/core/auth/providers'
import { parseServerEnv, type RuntimeEnv } from '@/core/env/server'

/** 运行期 env：启动参数 + 数据库配置（这里直接给出托管键）。 */
function makeEnv(extra: Partial<RuntimeEnv> = {}): RuntimeEnv {
  return { ...parseServerEnv({}), ...extra }
}

/**
 * 社交登录可见性判定。Google 凭据属于数据库配置，客户端读不到，故按钮可见性须在
 * 服务端判定后传给组件；判定本身是纯函数，可单独测。
 */
describe('getAuthProviderAvailability', () => {
  it('两个凭据齐全时 google 为 true', () => {
    expect(
      getAuthProviderAvailability(
        makeEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }),
      ),
    ).toEqual({ google: true })
  })

  it('缺少 secret 时为 false（不能只凭 clientId 就显示按钮）', () => {
    expect(getAuthProviderAvailability(makeEnv({ GOOGLE_CLIENT_ID: 'id' }))).toEqual({
      google: false,
    })
  })

  it('缺少 clientId 时为 false', () => {
    expect(getAuthProviderAvailability(makeEnv({ GOOGLE_CLIENT_SECRET: 'secret' }))).toEqual({
      google: false,
    })
  })

  it('都未配置时为 false', () => {
    expect(getAuthProviderAvailability(makeEnv({}))).toEqual({ google: false })
  })
})
