---
title: 环境变量
description: 两层 env 模型、变量清单与生产配置
locale: zh
order: 4
group: config
updated: 2026-11-10
---

环境变量分两层，由两个 Zod schema 分别校验。业务代码**不得**直接读 `process.env` /
`import.meta.env`，一律经这两个模块读取。

| 文件 | 内容 |
|---|---|
| `src/env/public.ts` | `VITE_` 前缀，构建时内联进客户端 bundle |
| `src/env/server.ts` | 服务端 secret，只在 Workers 运行时读取 |

**`VITE_` 变量会出现在浏览器里。** 它在构建时被写死进客户端 JS，任何访客打开页面都能看到。
secret 绝不能带 `VITE_` 前缀：`pnpm check:client-bundle` 会扫描 `dist/client` 的文本产物，
发现服务端字段就失败（它需要先跑 `pnpm build`）。

## 公开变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `VITE_BASE_URL` | `http://localhost:3000` | 站点根地址，用于 canonical、OG 与 sitemap |
| `VITE_PAYMENT_PROVIDER` | — | 支付渠道：`stripe` 或 `creem`；留空沿用配置里的默认值 |
| `VITE_CHECKOUT_MODE` | — | 结账模式：`provider`（托管）或 `collection`（收款码核销）；两条链路互斥 |
| `VITE_COLLECTION_ACCOUNTS` | — | 核销收款账户 JSON 数组，覆盖 `src/config/website.ts` 的源码兜底；非法值整体忽略 |
| `VITE_MODULES` | — | 逗号分隔的模块白名单，覆盖配置里的模块开关 |
| `VITE_FEATURES` | — | 逗号分隔的功能开关白名单，覆盖配置里的 `features` |
| `VITE_DOCS_AS_HOME` | — | `true` 时根路径直接进文档首页 |
| `VITE_GA_ID` | — | Google Analytics 的 `G-…` ID |
| `VITE_PLAUSIBLE_DOMAIN` | — | Plausible 站点域名 |
| `VITE_UMAMI_WEBSITE_ID` / `VITE_UMAMI_ID` | — | Umami 站点 ID，两个写其一 |
| `VITE_UMAMI_SCRIPT_URL` | — | Umami 脚本地址，必须是无凭据的 HTTPS URL |
| `VITE_CLARITY_PROJECT_ID` / `VITE_CLARITY_ID` | — | Microsoft Clarity 项目 ID，两个写其一 |
| `VITE_TURNSTILE_SITE_KEY` | — | Turnstile 站点 key（公开的那一半） |

`VITE_MODULES` / `VITE_FEATURES` 给的是白名单：写了名单就只开名单里的，其余一律关闭；
两个都不写时沿用 `src/config/website.ts` 里的默认值。

## 服务端变量

全部可选。缺失时对应 provider 不注册，而不是拿占位值顶替——**没配的功能就是关着的**，
不会假装能用。

| 变量 | 约束 | 用于 |
|---|---|---|
| `BETTER_AUTH_SECRET` | ≥ 32 字符 | 认证，**生产必填** |
| `BETTER_AUTH_URL` | URL | 认证回调的绝对地址；留空时从请求 origin 推断 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 必须成对 | Google 登录 |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | — | 支付（Stripe） |
| `CREEM_API_KEY` / `CREEM_WEBHOOK_SECRET` | — | 支付（Creem） |
| `CREEM_PRODUCTS` | `引用=prod_xxx` 逗号分隔 | Creem 商品 ID 映射 |
| `CREEM_DEBUG` | `true` / `false` | `true` 时打 Creem 沙箱 API |
| `RESEND_API_KEY` | — | 邮件（Resend） |
| `MAIL_FROM` | 合法邮箱，不带显示名 | 发件地址 |
| `RESEND_AUDIENCE_ID` | — | 订阅（Resend） |
| `BEEHIIV_API_KEY` / `BEEHIIV_PUBLICATION_ID` | — | 订阅（Beehiiv） |
| `BEEHIIV_SEND_WELCOME_EMAIL` | `true` / `false` | 订阅后是否发欢迎邮件 |
| `DISCORD_WEBHOOK_URL` | 须以 `https://discord.com/api/webhooks/` 开头 | 通知（Discord） |
| `FEISHU_WEBHOOK_URL` | 须以 `https://open.feishu.cn/open-apis/bot/v2/hook/` 开头 | 通知（飞书） |
| `TURNSTILE_SECRET_KEY` | — | Turnstile 服务端校验 |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | — | 部署与资源 API |
| `ADMIN_EMAILS` | 逗号分隔 | `/api/email` 的收件人白名单 |
| `NODE_ENV` | `development` / `production` / `test` | 默认 `development` |

空字符串会被归一化为未设置，`.env` 里留空等同于不配。

Workers 的资源 binding（`DB` / `CACHE` / `BUCKET` / `EMAIL`）不走 env schema，由
`wrangler.jsonc` 声明。

## 本地文件与生产文件

本地开发值放 `.env`（从 `.env.example` 复制而来），生产值放 `.env.production`：

```bash
cp .env.example .env.production
```

`pnpm check:env:prod` 在 `.env.production` **存在时**以它为准，不回退 `.env`——否则生产配置
写错会被本地合法值掩盖。`vite build` 则两个文件都加载，同名键以 `.env.production` 为准。
两个文件都已被 git 忽略，不得入库。优先级（高 → 低）：进程 env → `.env.production` →
`.env`，所以 CI 里不必创建该文件，直接用 workflow 的 `env:` 块即可。

## 生产怎么配

两种入口，都不经过仓库里的文件：

- **GitHub Environment。** 在仓库 Settings → Environments → `production` 里放 Secret 与
  Variable，`deploy.yml` 在发布 Release 或手动触发时读取它们，并只把白名单里的运行时字段
  上传到 Worker。启用新服务时要同步往工作流的 `env:` 与上传白名单里加字段，否则配了也不生效。
- **手工部署。** 先在 Worker 上设置运行时 secret：

  ```bash
  printf '%s' "<your-secret>" | pnpm exec wrangler secret put BETTER_AUTH_SECRET
  ```

  构建期变量（`VITE_*`）改了必须**重新构建并部署**才生效；运行时 secret 改完即生效。

配好后可以接着看[部署到 Cloudflare](./cloudflare)。
