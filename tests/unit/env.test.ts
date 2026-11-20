import { describe, expect, it } from 'vitest'
import { parsePublicEnv } from '@/core/env/public'
import { parseServerEnv, validateProdServerEnv } from '@/core/env/server'

/**
 * 环境的两个边界：公开 env 只下发浏览器必需项，启动 env 只留「没有它站起不来」的项。
 * 业务凭据（支付 / 邮件 / 分析）在数据库配置里，见 ADR-0010。
 */
describe('parsePublicEnv', () => {
  it('使用默认 VITE_BASE_URL', () => {
    expect(parsePublicEnv({}).VITE_BASE_URL).toBe('http://localhost:3000')
  })

  it('拒绝非法 VITE_BASE_URL', () => {
    expect(() => parsePublicEnv({ VITE_BASE_URL: 'not-a-url' })).toThrow(/url/i)
  })

  it('空串视为未设置：VITE_BASE_URL 回退默认值', () => {
    expect(parsePublicEnv({ VITE_BASE_URL: '' }).VITE_BASE_URL).toBe('http://localhost:3000')
  })

  it('只保留 VITE_BASE_URL：其它键一律丢弃', () => {
    const env = parsePublicEnv({
      VITE_BASE_URL: 'https://example.com',
      VITE_GA_ID: 'G-XXX',
      RESEND_API_KEY: 'test-only',
      MAIL_FROM: 'noreply@jerbix.dev',
    })
    expect(env).toEqual({ VITE_BASE_URL: 'https://example.com' })
  })
})

describe('parseServerEnv', () => {
  it('省略 NODE_ENV 时默认为 development', () => {
    expect(parseServerEnv({}).NODE_ENV).toBe('development')
  })

  it('BETTER_AUTH_URL 可省略或留空', () => {
    // 设了才用于生成回调与重定向的绝对地址。
    expect(parseServerEnv({}).BETTER_AUTH_URL).toBeUndefined()
    expect(parseServerEnv({ BETTER_AUTH_URL: '' }).BETTER_AUTH_URL).toBeUndefined()
  })

  it('接受合法的 BETTER_AUTH_URL', () => {
    const url = 'https://demo.jerbix.workers.dev'
    expect(parseServerEnv({ BETTER_AUTH_URL: url }).BETTER_AUTH_URL).toBe(url)
  })

  it('拒绝非 URL 的 BETTER_AUTH_URL', () => {
    // 必须是绝对 URL，相对路径拼出的回调链接无法访问。
    expect(() => parseServerEnv({ BETTER_AUTH_URL: 'not-a-url' })).toThrow(/BETTER_AUTH_URL/)
  })

  it('DATABASE_PROVIDER 只接受已知方言', () => {
    expect(parseServerEnv({ DATABASE_PROVIDER: 'postgres' }).DATABASE_PROVIDER).toBe('postgres')
    expect(() => parseServerEnv({ DATABASE_PROVIDER: 'mysql' })).toThrow()
  })

  it('CONFIG_ENCRYPTION_KEY 至少 16 字符', () => {
    expect(
      parseServerEnv({ CONFIG_ENCRYPTION_KEY: 'k'.repeat(16) }).CONFIG_ENCRYPTION_KEY,
    ).toHaveLength(16)
    expect(() => parseServerEnv({ CONFIG_ENCRYPTION_KEY: 'short' })).toThrow(
      /CONFIG_ENCRYPTION_KEY/,
    )
  })

  it('拒绝非法 NODE_ENV', () => {
    expect(() => parseServerEnv({ NODE_ENV: 'invalid' })).toThrow()
  })

  it('剥离托管键：服务凭据只来自数据库配置', () => {
    // 旧部署残留的环境变量不得混进运行期形状，否则「env 只作 seed 初值」不成立。
    const env = parseServerEnv({
      RESEND_API_KEY: 're_test',
      MAIL_FROM: 'noreply@jerbix.dev',
      STRIPE_SECRET_KEY: 'sk_test',
      BEEHIIV_SEND_WELCOME_EMAIL: 'invalid',
      ANALYTICS_UMAMI_SCRIPT_URL: 'https://stats.jerbix.dev/script.js',
    })
    expect(env).not.toHaveProperty('RESEND_API_KEY')
    expect(env).not.toHaveProperty('MAIL_FROM')
    expect(env).not.toHaveProperty('STRIPE_SECRET_KEY')
    expect(env).not.toHaveProperty('BEEHIIV_SEND_WELCOME_EMAIL')
  })
})

describe('validateProdServerEnv', () => {
  it('生产模式拒绝缺失 BETTER_AUTH_SECRET', () => {
    expect(() => validateProdServerEnv({ NODE_ENV: 'production' })).toThrow(/BETTER_AUTH_SECRET/)
  })

  it('开发模式允许缺失 BETTER_AUTH_SECRET', () => {
    expect(validateProdServerEnv({ NODE_ENV: 'development' }).NODE_ENV).toBe('development')
  })

  it('生产模式接受 ≥32 字符的 BETTER_AUTH_SECRET', () => {
    const env = validateProdServerEnv({
      NODE_ENV: 'production',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
    })
    expect(env.BETTER_AUTH_SECRET).toHaveLength(32)
  })

  it('空串视为未设置：生产模式空 BETTER_AUTH_SECRET 仍失败', () => {
    expect(() => validateProdServerEnv({ NODE_ENV: 'production', BETTER_AUTH_SECRET: '' })).toThrow(
      /BETTER_AUTH_SECRET/,
    )
  })
})
