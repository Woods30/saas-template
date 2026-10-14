import { describe, expect, it } from 'vitest'
import { getAuthProviderAvailability } from '@/auth/providers'
import { parseServerEnv } from '@/env/server'

/**
 * 社交登录的**可见性**判定。
 *
 * `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 是服务端 env，客户端 bundle 里读不到
 * （两层 env 模型的不变量）。因此「是否显示 Google 按钮」必须在服务端判定后传给组件，
 * 而判定逻辑本身是纯函数，可以在这里单测。
 */
describe('getAuthProviderAvailability', () => {
  it('两个凭据齐全时 google 为 true', () => {
    expect(
      getAuthProviderAvailability(
        parseServerEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }),
      ),
    ).toEqual({ google: true })
  })

  it('缺少 secret 时为 false（不能只凭 clientId 就显示按钮）', () => {
    expect(getAuthProviderAvailability(parseServerEnv({ GOOGLE_CLIENT_ID: 'id' }))).toEqual({
      google: false,
    })
  })

  it('缺少 clientId 时为 false', () => {
    expect(getAuthProviderAvailability(parseServerEnv({ GOOGLE_CLIENT_SECRET: 'secret' }))).toEqual(
      {
        google: false,
      },
    )
  })

  it('都未配置时为 false', () => {
    expect(getAuthProviderAvailability(parseServerEnv({}))).toEqual({ google: false })
  })
})
