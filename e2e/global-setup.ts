import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium, request } from '@playwright/test'

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
    RESEND_API_KEY: 're_e2e_synthetic_never_send',
    MAIL_FROM: 'e2e@example.invalid',
    BETTER_AUTH_URL: base.origin,
    VITE_BASE_URL: base.origin,
  })
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
  '/zh/dashboard/profile',
  '/zh/dashboard/sessions',
  '/zh/pricing',
  '/zh/dashboard/billing',
]

export default async function globalSetup() {
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

  if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
    throw new Error('E2E fixture 仅允许本地 server')
  }
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
