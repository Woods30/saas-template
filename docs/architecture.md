# 架构

## 模块

| 路径 | 说明 |
|---|---|
| `src/auth/` | Better Auth 集成，Drizzle adapter |
| `src/payment/` | 支付 provider（Stripe 主线；Creem / Waffo 预留点位） |
| `src/mail/` | 邮件 provider（Resend / Cloudflare Email） |
| `src/newsletter/` | Newsletter provider（Resend / Beehiiv） |
| `src/notification/` | 通知 provider（Discord / 飞书） |
| `src/cache/` | KV 缓存抽象 |
| `src/storage/` | R2 对象存储抽象 |
| `src/contact/` | 联系表单 + 投递 |
| `src/db/` | Drizzle ORM schema + D1 client + migrations |
| `src/config/website.ts` | 站点集中配置（名称、路径、功能开关） |
| `src/config/blocks/` | 营销 blocks 配置（pricing、功能开关） |
| `src/components/blocks/marketing/` | 8 个营销 blocks（Hero / Features / Stats / Pricing / FAQ / Testimonials / NewsletterCTA / CTA） |
| `src/env/` | 两层 Zod 校验（public.ts / server.ts） |
| `src/lib/` | locale、seo、urls、utils |
| `src/locale/` | Paraglide JS 中间件与生成产物 |
| `src/routes/` | 文件路由（TanStack Router，由 `routeTree.gen.ts` 生成） |
| `content/` | Content Collections（docs / blog / changelog / legal） |

## Provider 注册表

每个 feature 模块的 `index.ts` 暴露 `register*Provider`，`src/server.ts` 启动时根据 env 注册实例。业务代码只调用抽象接口。

## 路由

### 页面路由（TanStack Router 文件路由）

| 路径 | 说明 |
|---|---|
| `{-$locale}/` | 营销首页 |
| `{-$locale}/pricing` | 定价页 |
| `{-$locale}/contact` | 联系页 |
| `{-$locale}/_layout/marketing/docs/*` | 文档站 |
| `{-$locale}/_layout/marketing/blog/*` | 博客 |
| `{-$locale}/_layout/marketing/changelog/*` | 更新日志 |
| `{-$locale}/_layout/marketing/legal/*` | 法律页面 |
| `{-$locale}/auth/*` | 认证（login / register / forgot-password / reset-password / error） |

### API 路由

| 路径 | 说明 |
|---|---|
| `/api/auth/$` | Better Auth handler |
| `/api/webhooks/stripe` | Stripe webhook |
| `/api/contact/$` | 联系表单提交 |
| `/api/newsletter/$` | Newsletter 订阅 |
| `/api/email/$` | 邮件发送 |
| `/api/payment/$` | 支付相关 |

### SEO 静态路由

- `/sitemap.xml` — 自动生成
- `/robots.txt` — 自动生成

## 环境变量

- **公开变量**（`VITE_` 前缀）：构建时进入客户端 bundle，任何人均可见，**不得**存放 secret。
- **服务端 secret**：仅从 Workers binding 或服务端读取，**绝不能**设成 `VITE_` 前缀。

详见 [src/env/public.ts](../src/env/public.ts) 与 [src/env/server.ts](../src/env/server.ts)。

## Workers bindings

`wrangler.jsonc` 中配置的 bindings：

| Binding | 用途 |
|---|---|
| `DB` | D1 数据库 |
| `BUCKET` | R2 对象存储 |
| `CACHE` | KV 命名空间 |

详见 [docs/operations/wrangler-bindings.md](operations/wrangler-bindings.md)。
