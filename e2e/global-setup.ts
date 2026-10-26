import { chromium, request } from '@playwright/test'

/**
 * 预热 dev server：Vite 按需编译 SSR 与客户端两套模块图，冷启动时并发用例会撞上
 * 「页面已出但未水合」，表现为随机失败。用真实浏览器串行走一遍入口即可。
 */
const WARMUP_PATHS = [
  '/zh',
  '/en',
  '/zh/auth/login',
  '/zh/auth/register',
  '/docs/getting-started',
  '/zh/dashboard/profile',
  '/zh/dashboard/sessions',
  '/zh/pricing',
  '/zh/dashboard/billing',
]

export default async function globalSetup() {
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

  const ctx = await request.newContext({ baseURL: base })
  let ready = false
  for (let i = 0; i < 90; i++) {
    try {
      const res = await ctx.get('/')
      if (res.status() < 500) {
        ready = true
        break
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  await ctx.dispose()
  if (!ready) throw new Error(`Server ${base} not ready`)

  // 串行比并发快：并发只会让 Vite 的编译队列排队。
  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL: base })
  for (const path of WARMUP_PATHS) {
    try {
      await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
    } catch {
      // 预热失败不算错：用例自己会给出真正的原因。
    }
  }
  await browser.close()
}
