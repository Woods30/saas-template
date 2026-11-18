import { describe, expect, it } from 'vitest'
import { buildEnvUpdates } from '../../scripts/lib/setup-env'

/**
 * setup 往 `.env` 里写什么。
 *
 * 契约：**只写本次确实要写的 key**，且不覆盖手填好的值。
 * `BETTER_AUTH_SECRET` 被重新生成会让所有已登录会话失效 —— 重跑一次 setup
 * 不该把人踢下线。
 */

const CURRENT = `# 开发用环境变量
BETTER_AUTH_SECRET=hand-written-secret
STRIPE_SECRET_KEY=sk_test_keep_me
`

describe('buildEnvUpdates', () => {
  it('写入本次绑定到的 D1 ID', () => {
    const updates = buildEnvUpdates({
      current: CURRENT,
      dbId: 'new-db-id',
      authSecret: 'generated-secret',
      optional: {},
    })

    expect(updates.CLOUDFLARE_DATABASE_ID).toBe('new-db-id')
  })

  it('.env 里已有 BETTER_AUTH_SECRET 时不覆盖', () => {
    const updates = buildEnvUpdates({
      current: CURRENT,
      dbId: 'new-db-id',
      authSecret: 'generated-secret',
      optional: {},
    })

    expect(updates.BETTER_AUTH_SECRET).toBeUndefined()
  })

  it('.env 里没有 BETTER_AUTH_SECRET 时写入新生成的', () => {
    const updates = buildEnvUpdates({
      current: 'STRIPE_SECRET_KEY=sk_test\n',
      dbId: 'new-db-id',
      authSecret: 'generated-secret',
      optional: {},
    })

    expect(updates.BETTER_AUTH_SECRET).toBe('generated-secret')
  })

  it('.env 里的 BETTER_AUTH_SECRET 为空值时视为未配置', () => {
    const updates = buildEnvUpdates({
      current: 'BETTER_AUTH_SECRET=\n',
      dbId: 'new-db-id',
      authSecret: 'generated-secret',
      optional: {},
    })

    expect(updates.BETTER_AUTH_SECRET).toBe('generated-secret')
  })

  it('交互收集到的可选配置写入，未提供的 key 不写', () => {
    const updates = buildEnvUpdates({
      current: CURRENT,
      dbId: 'new-db-id',
      authSecret: 'generated-secret',
      optional: { RESEND_API_KEY: 're_x', RESEND_AUDIENCE_ID: 'aud_x' },
    })

    expect(updates.RESEND_API_KEY).toBe('re_x')
    expect(updates.RESEND_AUDIENCE_ID).toBe('aud_x')
    expect(updates.DISCORD_WEBHOOK_URL).toBeUndefined()
  })

  it('不把 current 里的既有值搬进 updates —— 未提及的 key 一律不碰', () => {
    const updates = buildEnvUpdates({
      current: CURRENT,
      dbId: 'new-db-id',
      authSecret: 'generated-secret',
      optional: {},
    })

    expect(updates.STRIPE_SECRET_KEY).toBeUndefined()
  })
})
