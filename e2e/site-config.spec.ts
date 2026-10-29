import { expect, test } from '@playwright/test'

/**
 * E2E: 模块门禁——关闭的模块在真实 server 上返回 404 而不是假成功。
 *
 * payment 默认打开，因此只断言它没被当成关闭模块挡掉（401 或 503 都算放行）。
 */
test.describe('Module gating', () => {
  test('默认关闭的业务入口不会假成功', async ({ request }) => {
    for (const path of ['contact/submit', 'newsletter/subscribe']) {
      const response = await request.post(`/api/${path}`, { data: {} })
      expect(response.status(), `/api/${path} 应为 404`).toBe(404)
      expect(await response.json()).toEqual({ error: 'MODULE_DISABLED' })
    }
  })

  test('已启用且配置完整的 mail 拒绝未认证的发送请求', async ({ request }) => {
    const response = await request.post('/api/email/send', { data: {} })
    expect(response.status()).toBe(401)
    expect(await response.text()).not.toContain('MODULE_DISABLED')
  })

  // 凭据缺失时服务状态检查先返回 503，凭据齐备才走到鉴权返回 401；两者都算门禁放行。
  // 关键是错误体不能是 `MODULE_DISABLED`，该路径返回纯文本，故读文本而非 JSON。
  test('已启用的 payment 不会被当成关闭模块挡掉', async ({ request }) => {
    const response = await request.post('/api/payment/checkout', { data: {} })
    expect([401, 503]).toContain(response.status())
    expect(await response.text()).not.toContain('MODULE_DISABLED')
  })
})
