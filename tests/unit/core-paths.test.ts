import { describe, expect, it } from 'vitest'
import { CORE_PATHS, isCorePath } from '../../scripts/core-paths'

/**
 * 核心区判定：命中则本地与 CI 跑全量回归 + e2e。
 */
describe('isCorePath', () => {
  it('认证 / 支付 / env / 门禁 / 数据库 / server / api 路由属于核心区', () => {
    expect(isCorePath('src/auth/auth.ts')).toBe(true)
    expect(isCorePath('src/payment/index.ts')).toBe(true)
    expect(isCorePath('src/env/server.ts')).toBe(true)
    expect(isCorePath('src/lib/module-access.ts')).toBe(true)
    expect(isCorePath('src/db/schema.ts')).toBe(true)
    expect(isCorePath('src/server.ts')).toBe(true)
    expect(isCorePath('src/routes/api/contact/index.ts')).toBe(true)
    expect(isCorePath('src/config/website.ts')).toBe(true)
    expect(isCorePath('src/lib/locale.ts')).toBe(true)
    expect(isCorePath('wrangler.jsonc')).toBe(true)
  })

  it('营销组件 / 样式 / 文案不属于核心区', () => {
    expect(isCorePath('src/components/blocks/marketing/hero/Hero.tsx')).toBe(false)
    expect(isCorePath('src/styles/globals.css')).toBe(false)
    expect(isCorePath('messages/zh.json')).toBe(false)
    expect(isCorePath('docs/architecture.md')).toBe(false)
  })

  it('清单非空且无重复', () => {
    expect(CORE_PATHS.length).toBeGreaterThan(0)
    expect(new Set(CORE_PATHS).size).toBe(CORE_PATHS.length)
  })
})
