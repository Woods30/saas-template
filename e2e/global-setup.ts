import { chromium, request } from '@playwright/test'

/**
 * 预热 dev server。
 *
 * `pnpm dev` 是**按需编译**的：第一次访问某条路由时 Vite 才去编译它，SSR 与客户端是
 * 两套模块图，各编译一次。整套 E2E 只有十几个用例、4 个 worker 同时起步，于是冷启动
 * 时所有用例一起撞上「模块还没编译好」——页面看起来出来了但 React 还没水合，表现为
 * 点击不生效、菜单不弹、会话请求还没回来，用例随机失败。
 *
 * 这里用一个真实浏览器把各 spec 的入口先走一遍（不只是 `request`，因为那只会编译
 * SSR 图），让编译与首帧水合都发生一次。之后用例拿到的是编译好的模块，等待时间回到
 * 正常水平，本地首次跑与 CI 干净环境的耗时也就一致了。
 *
 * 只访问、不校验内容——断言是用例的事。路径清单与 `e2e/*.spec.ts` 的入口保持一致，
 * 新增 spec 时同步补上。
 */
const WARMUP_PATHS = [
  '/zh',
  '/en',
  '/zh/auth/login',
  '/zh/auth/register',
  '/docs/getting-started',
  '/zh/dashboard/profile',
  '/zh/dashboard/sessions',
  // 支付 E2E 的两个入口：定价页（点 CTA 走 /api/payment）与账单页（server function）。
  // 不预热的话，冷启动时按钮可能还是 SSR 的静态 DOM，点下去没有处理器。
  '/zh/pricing',
  '/zh/dashboard/billing',
]

export default async function globalSetup() {
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

  // 先等 server 起来：90 次 × 1s，与 `webServer.timeout` 同量级。
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

  // 串行走一遍：并发反而会让 Vite 的编译队列排队，串行更快也更稳。
  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL: base })
  for (const path of WARMUP_PATHS) {
    try {
      await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
    } catch {
      // 预热失败不算错：用例自己会失败并给出真正的原因。
    }
  }
  await browser.close()
}
