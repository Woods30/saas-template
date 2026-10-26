import { describe, expect, it } from 'vitest'
import { parsePublicEnv } from '@/env/public'
import { parseServerEnv, validateProdServerEnv } from '@/env/server'

describe('parsePublicEnv', () => {
  it('使用默认 VITE_BASE_URL', () => {
    const env = parsePublicEnv({})
    expect(env.VITE_BASE_URL).toBe('http://localhost:3000')
  })

  it('拒绝非法 VITE_BASE_URL', () => {
    expect(() => parsePublicEnv({ VITE_BASE_URL: 'not-a-url' })).toThrow(/url/i)
  })

  it('仅接受 stripe 作为支付 provider', () => {
    expect(() => parsePublicEnv({ VITE_PAYMENT_PROVIDER: 'creem' })).toThrow()
  })

  it('空串视为未设置：VITE_BASE_URL 回退默认值', () => {
    const env = parsePublicEnv({ VITE_BASE_URL: '' })
    expect(env.VITE_BASE_URL).toBe('http://localhost:3000')
  })

  it('空串视为未设置：optional enum 不报错', () => {
    const env = parsePublicEnv({ VITE_PAYMENT_PROVIDER: '', VITE_GA_ID: '' })
    expect(env.VITE_PAYMENT_PROVIDER).toBeUndefined()
    expect(env.VITE_GA_ID).toBeUndefined()
  })

  it('接受无凭据的 HTTPS Umami 脚本 URL', () => {
    const url = 'https://stats.jerbix.dev/script.js'
    expect(parsePublicEnv({ VITE_UMAMI_SCRIPT_URL: url }).VITE_UMAMI_SCRIPT_URL).toBe(url)
  })

  it.each([
    'not-a-url',
    'http://stats.jerbix.dev/script.js',
    new URL('script.js', 'https://stats.jerbix.dev')
      .toString()
      .replace('https://', 'https://user@'),
    new URL('script.js', 'https://stats.jerbix.dev')
      .toString()
      .replace('https://', 'https://:password@'),
  ])('拒绝非法或含凭据的 Umami 脚本 URL：%s', (url) => {
    expect(() => parsePublicEnv({ VITE_UMAMI_SCRIPT_URL: url })).toThrow(/VITE_UMAMI_SCRIPT_URL/)
  })

  it('Umami 脚本 URL 可省略或留空', () => {
    expect(parsePublicEnv({}).VITE_UMAMI_SCRIPT_URL).toBeUndefined()
    expect(parsePublicEnv({ VITE_UMAMI_SCRIPT_URL: '' }).VITE_UMAMI_SCRIPT_URL).toBeUndefined()
  })

  it('公开 env 不保留服务端 secret 或 MAIL_FROM', () => {
    const env = parsePublicEnv({ RESEND_API_KEY: 'test-only', MAIL_FROM: 'noreply@jerbix.dev' })
    expect(env).not.toHaveProperty('RESEND_API_KEY')
    expect(env).not.toHaveProperty('MAIL_FROM')
  })
})

describe('parseServerEnv', () => {
  it('省略 NODE_ENV 时默认为 development', () => {
    const env = parseServerEnv({})
    expect(env.NODE_ENV).toBe('development')
  })

  it('接受合法 MAIL_FROM 邮件地址', () => {
    expect(parseServerEnv({ MAIL_FROM: 'noreply@jerbix.dev' }).MAIL_FROM).toBe('noreply@jerbix.dev')
  })

  it.each(['bad-address', 'Jerbix <noreply@jerbix.dev>'])('拒绝非法 MAIL_FROM：%s', (MAIL_FROM) => {
    expect(() => parseServerEnv({ MAIL_FROM })).toThrow(/MAIL_FROM/)
  })

  it('MAIL_FROM 可省略或留空', () => {
    expect(parseServerEnv({}).MAIL_FROM).toBeUndefined()
    expect(parseServerEnv({ MAIL_FROM: '' }).MAIL_FROM).toBeUndefined()
  })

  it.each([{ NODE_ENV: 'invalid' }, { BEEHIIV_SEND_WELCOME_EMAIL: 'invalid' }])(
    '在解析边界拒绝非法原始 enum binding：%o',
    (raw) => {
      expect(() => parseServerEnv(raw)).toThrow()
    },
  )

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

  it('空串视为未设置：生产模式空 BETTER_AUTH_SECRET 仍失败', () => {
    expect(() => validateProdServerEnv({ NODE_ENV: 'production', BETTER_AUTH_SECRET: '' })).toThrow(
      /BETTER_AUTH_SECRET/,
    )
  })
})
