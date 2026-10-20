---
title: 环境变量
description: 两层 env 模型、VITE_ 规则与生产配置
locale: zh
order: 4
group: config
updated: 2026-10-21
---

环境变量分两层，由两个 Zod schema 分别校验。业务代码**不得**直接读 `process.env` /
`import.meta.env`，一律经这两个模块。

| 文件 | 内容 |
|---|---|
| `src/env/public.ts` | `VITE_` 前缀，构建时进入客户端 bundle |
| `src/env/server.ts` | 服务端 secret，只在 Workers 运行时读取 |

## 前提条件

无。这一页可以独立阅读，但配置部署前建议先看 [Cloudflare](./cloudflare)。

## 设置

### `VITE_` 规则

`VITE_` 变量在构建时被内联进客户端 bundle，**任何人打开页面都能看到**。

| 前缀 | 含义 | 例子 |
|---|---|---|
| `VITE_` | 公开值 | `VITE_BASE_URL`、`VITE_STRIPE_PRICE_PRO_MONTHLY` |
| 无前缀 | 服务端 secret | `BETTER_AUTH_SECRET`、`STRIPE_SECRET_KEY` |

> **绝不能把 secret 设成 `VITE_` 前缀。** `pnpm check:client-bundle` 会扫描构建产物，
> 发现泄漏即失败。它需要先跑 `pnpm build`。

### 公开变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `VITE_BASE_URL` | `http://localhost:3000` | 站点基址，用于 canonical、OG、sitemap |
| `VITE_PAYMENT_PROVIDER` | — | 支付 provider（目前只有 `stripe`） |
| `VITE_STRIPE_PRICE_PRO_MONTHLY` | — | 月度订阅 Price ID |
| `VITE_STRIPE_PRICE_PRO_YEARLY` | — | 年度订阅 Price ID |
| `VITE_STRIPE_PRICE_LIFETIME` | — | 买断 Price ID |
| `VITE_GA_ID` | — | Google Analytics |
| `VITE_PLAUSIBLE_DOMAIN` | — | Plausible |
| `VITE_UMAMI_WEBSITE_ID` | — | Umami |
| `VITE_UMAMI_SCRIPT_URL` | — | Umami 脚本地址（无凭据 HTTPS） |
| `VITE_CLARITY_PROJECT_ID` | — | Microsoft Clarity |
| `VITE_TURNSTILE_SITE_KEY` | — | Turnstile 站点 key |

### 服务端变量

全部可选。缺失时对应 provider 不注册，而不是用占位值——所以**没配的功能是关着的，
不会假装能用**。

| 变量 | 约束 | 用于 |
|---|---|---|
| `BETTER_AUTH_SECRET` | ≥ 32 字符 | 认证，**生产必填** |
| `BETTER_AUTH_URL` | URL | 认证回调的绝对地址；留空时从请求 origin 推断 |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | — | 支付 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 必须成对 | Google 登录 |
| `RESEND_API_KEY` / `MAIL_FROM` | `MAIL_FROM` 须为合法邮箱 | 邮件 |
| `RESEND_AUDIENCE_ID` | — | 订阅（Resend） |
| `BEEHIIV_API_KEY` / `BEEHIIV_PUBLICATION_ID` | — | 订阅（Beehiiv） |
| `DISCORD_WEBHOOK_URL` | 须以 `https://discord.com/api/webhooks/` 开头 | 通知 |
| `FEISHU_WEBHOOK_URL` | 须以 `https://open.feishu.cn/open-apis/bot/v2/hook/` 开头 | 通知 |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | — | 部署与 API |
| `ADMIN_EMAILS` | — | `/api/email` 收件人白名单 |
| `NODE_ENV` | `development` / `production` / `test` | 默认 `development` |

空字符串会被归一化为未设置，因此 `.env` 里留空等同于不配。

### Workers binding

资源 binding 不走 env schema，由 `wrangler.jsonc` 声明：

| binding | 类型 | 用途 |
|---|---|---|
| `DB` | D1 | Drizzle 数据库 |
| `CACHE` | KV | 缓存与限流 |
| `BUCKET` | R2 | 对象存储 |
| `EMAIL` | SendEmail | Cloudflare Email 发信 |

### 生产配置

本地 `.env` 装开发值，生产值放 `.env.production`：

```bash
cp .env.example .env.production
```

至少改两处：`VITE_BASE_URL` 设为真实 HTTPS 域名，`BETTER_AUTH_SECRET` 填生产密钥。
该文件已被 git 忽略，**不得入库**。

优先级（高 → 低）：**进程 env → `.env.production` → `.env`**。因此 CI 里不必创建该
文件，直接把值放进 workflow 的 `env:` 块即可。

> `check-env-prod.ts` 在 `.env.production` **存在**时以它为准，不回退到 `.env`——否则
> 生产配置写错会被本地合法值掩盖。回退只发生在该文件不存在时。

## 命令

| 命令 | 行为 |
|---|---|
| `pnpm check:env` | 校验本地 `.env`；非法字段失败 |
| `pnpm check:env:prod` | 生产检查：`VITE_BASE_URL` 必须是真实 HTTPS 域名 |
| `pnpm check:client-bundle` | 需先 `pnpm build`；确认 bundle 不含 secret |

生产 URL 检查会拒绝 `localhost`、`127.*`、`0.0.0.0`、内嵌凭据的 URL，以及
`example.com` / `*.test` 这类占位域名。

## 参考资料

- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Better Auth 配置选项](https://www.better-auth.com/docs/reference/options)

## 下一步

- [Cloudflare](./cloudflare)——把变量配到生产环境
- [功能集成](./integrations)——各模块需要哪些变量
- [网站配置](./configuration)——模块开关
