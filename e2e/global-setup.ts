import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium, request } from '@playwright/test'
import { buildRbacSeedSql } from '../scripts/db-seed'

/**
 * 仅 Playwright 的 server 入口安装传输层 mock，不修改产品源码。
 * Workers 内的 fetch 不经过浏览器路由；在 Vite 编译 provider 时给 Resend SDK
 * 注入本地 baseUrl 与 synthetic key，真实 api.resend.com 永远不会收到请求。
 */
async function startTestServer() {
  const base = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3000')
  if (!['localhost', '127.0.0.1'].includes(base.hostname)) {
    throw new Error('E2E server 仅允许 localhost / 127.0.0.1')
  }
  if (existsSync('.dev.vars')) {
    throw new Error('E2E server 不读取 .dev.vars；请移除该本地覆盖后使用 synthetic 邮件配置')
  }
  resetLocalManualPaymentFixtures()
  let captured = 0
  const messages = new Map<string, string>()
  const mail = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/emails') {
      res.writeHead(404).end()
      return
    }
    // 只在内存中捕获邮件，退出即丢弃；没有任何外部转发路径。
    let body = ''
    for await (const chunk of req) body += chunk
    const payload = JSON.parse(body) as { to: string | string[]; html: string }
    for (const email of [payload.to].flat()) messages.set(email, payload.html)
    captured++
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ id: `e2e_${crypto.randomUUID()}` }))
  })
  await new Promise<void>((resolve, reject) => {
    mail.once('error', reject)
    mail.listen(0, '127.0.0.1', resolve)
  })
  const address = mail.address()
  if (!address || typeof address === 'string') throw new Error('邮件捕获服务未启动')
  const mailURL = `http://127.0.0.1:${address.port}`
  Object.assign(process.env, {
    CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
    BETTER_AUTH_URL: base.origin,
    VITE_BASE_URL: base.origin,
  })
  seedRbacCatalog()
  seedE2eSettings()
  const sdkPath = fileURLToPath(import.meta.resolve('resend'))
  const transportModule = '\0e2e:resend-transport'
  let installed = false
  const { createServer: createViteServer } = await import('vite')
  const server = await createViteServer({
    optimizeDeps: { exclude: ['resend'] },
    environments: {
      ssr: {
        optimizeDeps: {
          exclude: ['resend'],
          include: ['resend > standardwebhooks', 'resend > postal-mime'],
        },
      },
    },
    server: {
      host: base.hostname,
      port: Number(base.port || 3000),
      strictPort: true,
    },
    plugins: [
      {
        name: 'e2e-local-resend-transport',
        enforce: 'pre',
        configureServer(vite) {
          vite.middlewares.use('/__e2e/mail-transport', (_req, res) => {
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ transport: 'local-capture', captured }))
          })
          vite.middlewares.use('/__e2e/mail', (req, res) => {
            const email = new URL(req.url ?? '/', base).searchParams.get('email') ?? ''
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ html: messages.get(email) ?? null }))
          })
        },
        resolveId(id) {
          if (id === 'resend') return transportModule
        },
        load(id) {
          if (id !== transportModule) return
          // 模块解析时先替换入口，SDK 源文件仅能通过此 wrapper 到达。
          // 即使 SDK 不再支持 baseUrl，仍通过下面的源码校验拒绝启动。
          return `import { Resend as SDK } from ${JSON.stringify(sdkPath)};
export class Resend extends SDK {
  constructor() { super('re_e2e_synthetic_never_send', { baseUrl: ${JSON.stringify(mailURL)} }); }
}`
        },
        transform(code, id) {
          if (id.split('?')[0] !== sdkPath) return
          const endpoint = 'https://api.resend.com'
          if (!code.includes(endpoint) || !code.includes('this.baseUrl = options?.baseUrl')) {
            throw new Error('Resend SDK 已变化，E2E 无法保证本地传输；拒绝运行')
          }
          // 双重约束：即使 SDK 绕开 wrapper 参数，其默认地址仍只能指向本地。
          installed = true
          return code.replaceAll(endpoint, mailURL)
        },
      },
    ],
  })
  const shutdown = async () => {
    await server.close()
    mail.close()
    process.exit(0)
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  await server.listen()
  // Cloudflare 在启动阶段加载完整 Worker 图；transform 未命中就终止，不进入用例。
  if (!installed) {
    await server.close()
    mail.close()
    throw new Error('Resend 本地传输未安装，拒绝启动 E2E server')
  }
  server.printUrls()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startTestServer().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

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
  '/zh/settings/profile',
  '/zh/settings/sessions',
  '/zh/pricing',
  '/zh/settings/billing',
]

/**
 * 清理本地 D1 里会影响 E2E 结账环境的残留行。
 *
 * 核销详情占尾数池（每账户活跃金额唯一），残留行会让本轮撞
 * `AMOUNT_POOL_EXHAUSTED`。先删详情再删订单：详情的外键指向 `orders`，
 * 反序删除会触发外键约束。只删 `provider='manual_payments'` 的订单，
 * 其它来源（在线结账）的订单不在这里动。
 * 配置行由 {@link seedE2eSettings} 逐字段覆盖，不在这里删。
 */
function resetLocalManualPaymentFixtures(): void {
  try {
    wranglerD1([
      'DELETE FROM manual_payment_details',
      "DELETE FROM orders WHERE provider = 'manual_payments'",
    ])
  } catch {
    // 表不存在（未跑迁移）等情形不算致命，后续用例会给出真正的原因。
  }
}

/** 在仓库根执行一条本地 D1 SQL。 */
function wranglerD1(statements: string[]): void {
  execFileSync('wrangler', ['d1', 'execute', 'DB', '--local', '--command', statements.join('; ')], {
    stdio: 'pipe',
  })
}

/**
 * E2E 依赖的站点配置。
 *
 * 配置只从数据库读（见 ADR-0010），环境变量不再能打开模块或切换结账链路，
 * 所以这里直接写 `settings` 表。只写 E2E 与出厂值不同的字段，其余沿用注册表
 * 默认值。
 *
 * 二维码是站内静态占位图——用例断言 `<img>` 存在与地址，不扫内容；真实收款码
 * 永远不进仓库。
 */
const E2E_SETTINGS: ReadonlyArray<readonly [key: string, value: unknown]> = [
  ['modules.docs', true],
  ['modules.manualPayments', true],
  ['payment.checkoutMode', 'manual_payments'],
  [
    'manualPayments.accounts',
    [
      {
        id: 'alipay-e2e',
        channel: 'alipay',
        displayName: 'E2E 收款账户',
        currency: 'cny',
        qrImageUrl: '/app-icon-512.png',
      },
    ],
  ],
  ['mail.provider', 'resend'],
  ['mail.from', 'e2e@example.invalid'],
  ['resend.apiKey', 're_e2e_synthetic_never_send'],
  // 社交登录可见性：GitHub 需要方法开关与两个凭据齐全才注册（见
  // `socialProviderOptions`）。E2E 只断言按钮出现，不会真的跳转 GitHub。
  ['auth.githubEnabled', true],
  ['github.clientId', 'e2e-github-client-id'],
  ['github.clientSecret', 'e2e-github-client-secret'],
]

/**
 * 保证内置 RBAC 角色 / 权限点存在。
 *
 * `pnpm db:seed` 会写它们，但 E2E 直接起 vite dev、不跑 seed。`editor` 菜单过滤
 * 用例需要 `user_roles → role_editor` 的外键目标存在，所以这里复用 `db-seed` 的
 * 同一份定义（`ON CONFLICT DO NOTHING`，重复执行无副作用）。
 */
function seedRbacCatalog(): void {
  try {
    wranglerD1([buildRbacSeedSql(false, 'sqlite')])
  } catch {
    // 表不存在（未跑迁移）时交给用例暴露真正原因。
  }
}

/** 把 {@link E2E_SETTINGS} 覆盖进本地 D1。 */
function seedE2eSettings(): void {
  try {
    wranglerD1(
      E2E_SETTINGS.map(
        ([key, value]) =>
          `INSERT INTO settings (key, value, updated_at) VALUES ('${key}', '${JSON.stringify(
            value,
          ).replace(
            /'/g,
            "''",
          )}', strftime('%s','now')) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ),
    )
  } catch {
    // 与 reset 同理：表不存在时交给用例暴露真正原因。
  }
}

export default async function globalSetup() {
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

  if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
    throw new Error('E2E fixture 仅允许本地 server')
  }

  resetLocalManualPaymentFixtures()
  const ctx = await request.newContext({ baseURL: base })
  let ready = false
  for (let i = 0; i < 90; i++) {
    try {
      const transport = await ctx.get('/__e2e/mail-transport')
      if (transport.ok() && (await transport.json()).transport === 'local-capture') {
        const res = await ctx.get('/')
        if (res.status() < 500) {
          ready = true
          break
        }
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
