import { describe, expect, it } from 'vitest'
import { getAuthProviderAvailability } from '@/auth/providers'
import { parseServerEnv } from '@/env/server'

/**
 * 社交登录可见性判定。Google 凭据是服务端 env，客户端读不到，故按钮可见性须在服务端
 * 判定后传给组件；判定本身是纯函数，可单独测。
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
