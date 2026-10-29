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
