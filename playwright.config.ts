import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 本地固定 4：默认的 CPU 核数一半会让多个浏览器在 `vite dev` 按需编译上排队，
  // 导致与代码无关的偶发超时。
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    /**
     * 固定浏览器时区为 UTC，与 wrangler dev（Workers 运行时固定 UTC）一致。
     *
     * 不一致时 `toLocaleDateString` 等在 SSR 与客户端产生不同文本（如本机
     * UTC+8 在 UTC 午夜后的 8 小时内差一天），React 18 水合失败后整树重生成，
     * 页面短暂不可交互——表现为随机性的「点击被吞」。日期渲染统一化是产品
     * 级任务，在 E2E 层先把两端时区对齐。
     */
    timezoneId: 'UTC',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: 'pnpm exec tsx e2e/global-setup.ts',
        url: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
        // 现有 dev server 可能接真实 Resend，必须使用测试专属传输层。
        reuseExistingServer: false,
        timeout: 120_000,
      },
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
})
