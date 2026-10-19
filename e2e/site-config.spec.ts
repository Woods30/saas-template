import { expect, test } from '@playwright/test'

/**
 * E2E: 模块门禁与公共契约
 *
 * 只保留一条：默认配置下关闭的模块，其 API 在真实 server 上返回 404 而不是假成功。
 * 这是「配置 → 路由 → handler」三层联动的唯一端到端证据，纯函数单测替不掉。
 *
 * 已下沉的内容（不再在 E2E 重复）：
 * - sitemap 内容与关闭模块的排除 → `tests/unit/module-access.test.ts`（直接调用路由 handler）
 * - manifest / theme-color → `tests/unit/theme-colors.test.ts`、`tests/unit/brand-config.test.ts`
 * - 断点横向溢出、Logo 资源、移动端键盘开关 → 纯布局与组件行为，见
 *   `tests/components/navigation.test.tsx`
 * - 首页 hydration 错误 → `e2e/marketing.spec.ts` 已覆盖（含真实主题交互）
 *
 * 启用 / 关闭各分支由纯函数与真实 handler 单测覆盖；E2E 不写真实 `.env` 切换开关。
 */
test.describe('Module gating', () => {
  test('默认关闭的业务入口不会假成功', async ({ request }) => {
    for (const path of [
      'contact/submit',
      'newsletter/subscribe',
      'payment/checkout',
      'email/send',
    ]) {
      const response = await request.post(`/api/${path}`, { data: {} })
      expect(response.status(), `/api/${path} 应为 404`).toBe(404)
      expect(await response.json()).toEqual({ error: 'MODULE_DISABLED' })
    }
  })
})
