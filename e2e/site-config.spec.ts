import { expect, test } from '@playwright/test'

/**
 * E2E: 模块门禁与公共契约
 *
 * 只保留一条：关闭的模块，其 API 在真实 server 上返回 404 而不是假成功。
 * 这是「配置 → 路由 → handler」三层联动的唯一端到端证据，纯函数单测替不掉。
 *
 * 断言只覆盖**仍默认关闭**的模块（contact / newsletter / mail）。`payment` 已从
 * 这条断言里移除：本仓为本地联调把它默认打开，此时未登录调用应返回 401 而不是
 * 404——门禁顺序（404 早于鉴权）仍由 `tests/unit/payment.test.ts` 覆盖。
 * 不要为了留住这条断言把 payment 改回关闭。
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
    for (const path of ['contact/submit', 'newsletter/subscribe', 'email/send']) {
      const response = await request.post(`/api/${path}`, { data: {} })
      expect(response.status(), `/api/${path} 应为 404`).toBe(404)
      expect(await response.json()).toEqual({ error: 'MODULE_DISABLED' })
    }
  })

  // 该路径的未登录分支返回的是纯文本 `Unauthorized`（不是 JSON），因此只断言状态码：
  // 关键是「401 而不是 404」——说明模块门禁放行后请求确实走到了鉴权这一层。
  test('已启用的 payment 对未登录调用返回 401，而不是 404 或假成功', async ({ request }) => {
    const response = await request.post('/api/payment/checkout', { data: {} })
    expect(response.status()).toBe(401)
  })
})
