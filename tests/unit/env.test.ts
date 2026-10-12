import { describe, expect, it } from 'vitest'
import { parsePublicEnv } from '@/env/public'
import { parseServerEnv, validateProdServerEnv } from '@/env/server'

describe('parsePublicEnv', () => {
  it('使用默认 VITE_BASE_URL', () => {
    const env = parsePublicEnv({})
    expect(env.VITE_BASE_URL).toBe('http://localhost:3000')
  })

  it('拒绝非法 VITE_BASE_URL', () => {
    expect(() => parsePublicEnv({ VITE_BASE_URL: 'not-a-url' })).toThrow()
  })

  it('仅接受 stripe 作为支付 provider', () => {
    expect(() => parsePublicEnv({ VITE_PAYMENT_PROVIDER: 'creem' })).toThrow()
  })
})

describe('parseServerEnv', () => {
  it('省略 NODE_ENV 时默认为 development', () => {
    const env = parseServerEnv({})
    expect(env.NODE_ENV).toBe('development')
  })
})

describe('validateProdServerEnv', () => {
  it('生产模式拒绝缺失 BETTER_AUTH_SECRET', () => {
    expect(() => validateProdServerEnv({ NODE_ENV: 'production' })).toThrow(/BETTER_AUTH_SECRET/)
  })

  it('开发模式允许缺失 BETTER_AUTH_SECRET', () => {
    const env = validateProdServerEnv({ NODE_ENV: 'development' })
    expect(env.NODE_ENV).toBe('development')
  })

  it('生产模式接受 ≥32 字符的 BETTER_AUTH_SECRET', () => {
    const env = validateProdServerEnv({
      NODE_ENV: 'production',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
    })
    expect(env.BETTER_AUTH_SECRET).toHaveLength(32)
  })
})
