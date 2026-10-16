---
title: 环境变量
description: 两层 env 校验、VITE_ 规则与生产检查
locale: zh
order: 4
group: config
updated: 2026-10-15
---

环境变量分两层，由两个 Zod schema 分别校验：

| 文件 | 内容 |
|---|---|
| `src/env/public.ts` | `VITE_` 前缀，构建时进入客户端 bundle |
| `src/env/server.ts` | 服务端 secret，只在 Workers 运行时读取 |

```ts
// src/env/public.ts
export const publicEnv: PublicEnv = parsePublicEnv(import.meta.env ?? {})

// src/env/server.ts
export function parseServerEnv(raw: unknown): ServerEnv
```

> **注意事项**：业务代码**不得**直接读 `process.env` / `import.meta.env`，一律经这两个模块的导出。

`publicEnv` 在模块加载期即校验，非法的 `VITE_BASE_URL` 会让导入方直接抛错。`parseServerEnv` 则是**每请求**调用——`src/server.ts` 在请求入口解析后写入 AsyncLocalStorage，供 `getServerContext().env` 读取。

## `VITE_` 规则

`VITE_` 变量在构建时被内联进客户端 bundle，**任何人打开页面都能看到**。

| 前缀 | 含义 |
|---|---|
| `VITE_` | 公开值（站点地址、Stripe Price ID、分析 ID 等） |
| 无前缀 | 服务端 secret，只经 Workers binding 读取 |

> **注意事项**：绝不能把 secret 设成 `VITE_` 前缀。`pnpm check:client-bundle` 会扫描构建产物确认无泄漏。

## 公开变量

| 变量 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `VITE_BASE_URL` | URL | `http://localhost:3000` | 站点基址，用于 canonical、OG、sitemap、robots |
| `VITE_PAYMENT_PROVIDER` | `'stripe'` | — | 支付 provider |
| `VITE_STRIPE_PRICE_PRO_MONTHLY` | `string` | — | 月度订阅 Price ID |
| `VITE_STRIPE_PRICE_PRO_YEARLY` | `string` | — | 年度订阅 Price ID |
| `VITE_STRIPE_PRICE_LIFETIME` | `string` | — | 买断 Price ID |
| `VITE_GA_ID` | `string` | — | Google Analytics 衡量 ID |
| `VITE_PLAUSIBLE_DOMAIN` | `string` | — | Plausible 统计域名 |
| `VITE_UMAMI_WEBSITE_ID` | `string` | — | Umami 站点 ID |
| `VITE_UMAMI_ID` | `string` | — | Umami 站点 ID（兼容字段） |
| `VITE_UMAMI_SCRIPT_URL` | URL | — | Umami 脚本地址，须为无凭据 HTTPS URL |
| `VITE_CLARITY_PROJECT_ID` | `string` | — | Microsoft Clarity 项目 ID |
| `VITE_CLARITY_ID` | `string` | — | Clarity 项目 ID（兼容字段） |
| `VITE_TURNSTILE_SITE_KEY` | `string` | — | Turnstile 站点 key（配套 secret 在服务端） |

## 服务端变量

全部可选；缺失时对应 provider 不注册，而非使用占位值。

| 变量 | 约束 | 说明 |
|---|---|---|
| `BETTER_AUTH_SECRET` | ≥ 32 字符 | 认证密钥；**生产环境必填** |
| `BETTER_AUTH_URL` | URL | 站点根地址，用于生成回调与重定向的绝对 URL；留空时从请求 origin 推断 |
| `STRIPE_SECRET_KEY` | — | Stripe 密钥 |
| `STRIPE_WEBHOOK_SECRET` | — | Stripe webhook 验签密钥 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Google OAuth |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | — | Cloudflare API |
| `CLOUDFLARE_EMAIL_SENDER` | — | Cloudflare Email 兼容发件人字段 |
| `RESEND_API_KEY` | — | Resend 密钥 |
| `MAIL_FROM` | 合法邮箱 | 统一发件地址 |
| `RESEND_AUDIENCE_ID` | — | Resend 受众 ID |
| `BEEHIIV_API_KEY` / `BEEHIIV_PUBLICATION_ID` | — | Beehiiv |
| `BEEHIIV_SEND_WELCOME_EMAIL` | `'true'` / `'false'` | 默认 `'false'` |
| `DISCORD_WEBHOOK_URL` | 须以 `https://discord.com/api/webhooks/` 开头 | Discord 通知 |
| `FEISHU_WEBHOOK_URL` | 须以 `https://open.feishu.cn/open-apis/bot/v2/hook/` 开头 | 飞书通知 |
| `TURNSTILE_SECRET_KEY` | — | Turnstile 服务端校验 |
| `ADMIN_EMAILS` | — | `/api/email` 收件人白名单 |
| `NODE_ENV` | `development` / `production` / `test` | 默认 `development` |

空字符串被归一化为 `undefined`（见 `src/env/normalize.ts` 的 `treatEmptyAsUndefined`），因此 `.env` 里留空的字段等同于未设置。

`GOOGLE_CLIENT_ID` 与 `GOOGLE_CLIENT_SECRET` 必须同时配置，Google 登录才会提供——只配一个时 Better Auth 不会注册该 provider，登录页也不渲染按钮。认证模块的邮件流程复用 `MAIL_FROM` / `RESEND_API_KEY`（或 Cloudflare 对应字段），没有独立的认证发件人。见[身份认证](./auth)。

## Workers binding

资源 binding 不走 env schema，由 `wrangler.jsonc` 声明后经请求参数传入：

| binding | 类型 | 用途 |
|---|---|---|
| `DB` | D1 | Drizzle 数据库 |
| `CACHE` | KV | 缓存与限流 |
| `BUCKET` | R2 | 对象存储 |
| `EMAIL` | SendEmail | Cloudflare Email 发信 |

`src/types/cloudflare.d.ts` 从 `ServerEnv` 派生字符串 binding 的类型，使 schema 变更时类型自动同步。

## 检查命令

| 命令 | 行为 |
|---|---|
| `pnpm check:env` | 校验本地 `.env`；非法字段失败，已启用但不完整的服务输出不含值的诊断 |
| `pnpm check:env:prod` | 生产检查：`VITE_BASE_URL` 必填且必须是真实 HTTPS 域名；已启用服务的缺失字段直接失败 |
| `pnpm check:client-bundle` | 需先 `pnpm build`；确认客户端 bundle 不含服务端 secret |

生产 URL 检查会拒绝：`localhost`、`*.localhost`、`::1`、`127.*`、`0.0.0.0`、内嵌凭据的 URL，以及 `example.com` / `example.net` / `example.org` 及其子域、`*.example`、`*.test`。

```bash
# CI：无 .env 时用进程 env 校验
BETTER_AUTH_SECRET=... VITE_BASE_URL=https://acme.dev pnpm check:env:prod
```

> **注意事项**：`.env` 不存在时回退到进程 env（CI 场景），且进程 env 优先于 `.env` 文件。诊断输出只含字段名与原因，**绝不**回显任何凭据值。

## 本地设置

```bash
cp .env.example .env
pnpm check:env
```

`pnpm run setup` 会交互式创建 D1 / R2 / KV 资源、生成认证密钥并写入 `.env` 与 `wrangler.jsonc`。

> **注意事项**：本地 `.env` **不会**自动成为生产环境的 secret——部署前须另行用 `wrangler secret put` 配置。

## 生产配置：`.env.production`

本地 `.env` 装的是开发值（`VITE_BASE_URL=http://localhost:3000`），生产值另放一份 `.env.production`：

```bash
cp .env.example .env.production
# 至少改两处：VITE_BASE_URL 设为真实 HTTPS 域名、BETTER_AUTH_SECRET 填生产密钥
```

该文件已被 `.gitignore` 忽略，**不得入库**。

| 谁读它 | 用途 |
|---|---|
| `scripts/check-env-prod.ts` | `pnpm deploy` 的第一步，生产校验 |
| Vite（`vite build`） | 把 `VITE_*` 内联进客户端 bundle |

两处读同一份文件是刻意的：若校验读 `.env` 而构建读 `.env.production`，就会出现「校验过的值」与「实际打进 bundle 的值」不一致。

优先级（高 → 低）：**进程 env → `.env.production` → `.env`**。因此 CI 里不必创建该文件，直接把值放进 workflow 的 `env:` 块即可。

> **注意事项**：`check-env-prod.ts` 在 `.env.production` **存在**时以它为准，不回退到 `.env`——否则生产配置写错会被本地合法值掩盖。回退只发生在该文件不存在时。

## 参考资料

- [Better Auth 配置选项](https://www.better-auth.com/docs/reference/options)——`BETTER_AUTH_SECRET` 等配置项
- [Stripe API keys](https://docs.stripe.com/keys)——密钥类型与 webhook 签名密钥
- [Google OAuth 2.0 Web Server](https://developers.google.com/identity/protocols/oauth2/web-server)——`GOOGLE_CLIENT_ID` / `SECRET` 的申请
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)——生产 secret 与本地 `.dev.vars`
- [Cloudflare Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)——binding 声明
- [Cloudflare D1](https://developers.cloudflare.com/d1/)——`DB` binding 对应的资源
- [Cloudflare Workers KV 快速开始](https://developers.cloudflare.com/kv/get-started/)——`CACHE` binding 对应的资源
- [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/get-started/workers-api/)——`BUCKET` binding 对应的资源
- [Drizzle <> Cloudflare D1](https://orm.drizzle.team/docs/connect-cloudflare-d1)——ORM 侧的连接方式
- [Resend API](https://resend.com/docs/api-reference/introduction)——`RESEND_API_KEY` 的用法
- [beehiiv Create an API Key](https://developers.beehiiv.com/welcome/create-an-api-key)——`BEEHIIV_API_KEY` 的申请
- [Discord Webhooks](https://docs.discord.com/developers/resources/webhook)——`DISCORD_WEBHOOK_URL` 的创建
- [飞书自定义机器人](https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN)——`FEISHU_WEBHOOK_URL` 的创建
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)——`VITE_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`

## 下一步

- [网站配置](./configuration)——模块开关与必要配置的对应关系
- [功能集成](./integrations)——各模块所需的 env 字段
- 部署步骤见仓库内 `docs/deployment.md`
