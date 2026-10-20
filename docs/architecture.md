# 架构

## 模块

| 路径 | 说明 |
|---|---|
| `src/auth/` | Better Auth 集成，Drizzle adapter |
| `src/payment/` | 支付 provider（当前仅 Stripe） |
| `src/mail/` | 邮件 provider（Resend / Cloudflare Email） |
| `src/newsletter/` | Newsletter provider（Resend / Beehiiv） |
| `src/notification/` | 通知 provider（Discord / 飞书） |
| `src/cache/` | KV 缓存抽象 |
| `src/storage/` | R2 对象存储抽象 |
| `src/contact/` | 联系表单 + 投递 |
| `src/db/` | Drizzle ORM schema + D1 client + migrations |
| `src/config/website.ts` | 站点集中配置（元数据、UI、模块开关、社交链接） |
| `src/config/navigation.ts` | 菜单类型、公共链接目标、`filterMenuItems` 过滤 |
| `src/config/navbar-config.ts` | Navbar 链接与右侧 actions |
| `src/config/footer-config.ts` | Footer 分组 |
| `src/config/social-config.ts` | 社交平台映射与 HTTPS 过滤 |
| `src/config/service-status.ts` | 纯配置诊断（`getServiceStatuses` / `validateWebsiteConfig`） |
| `src/config/pages/` | 营销 blocks 配置（pricing、功能开关） |
| `src/components/sections/` | 8 个营销 blocks（Hero / Features / Stats / Pricing / FAQ / Testimonials / NewsletterCTA / CTA） |
| `src/components/layout/` | `MenuLink` / `MenuItems` 等菜单渲染组件 |
| `src/components/mdx/` | 极简 markdown 渲染（标题 / 代码块 / 表格 / 列表 / 引用块 / 链接） |
| `src/components/docs/` | 文档站 shell（`DocsLayout`）、分组侧边栏（`DocsSidebar`）、侧栏搜索（`DocsSearch`）、右侧本页目录（`DocsToc`）、文末「下一步」卡片（`DocNextSteps`）与上一篇/下一篇（`DocPager`） |
| `src/env/` | 两层 Zod 校验（public.ts / server.ts） |
| `src/lib/` | locale、seo、urls、docs、content-locale、module-access、server-context 等 |
| `src/locale/` | Paraglide JS 中间件与生成产物 |
| `src/routes/` | 文件路由（TanStack Router，由 `routeTree.gen.ts` 生成） |
| `content/` | Content Collections（docs / blog / changelog / legal） |

## Provider 注册表

每个 feature 模块的 `index.ts` 暴露 `build*ProviderRegistry`，由 `src/server.ts` 在**每个请求
入口**按当前归一化 env 构建，结果存入 AsyncLocalStorage（`src/lib/server-context.ts`）；业务
代码经 `getServerContext()` 取用。因此同一实例内的多请求之间不存在 provider 状态串扰。

## 模块门禁

| 文件 | 适用 | 行为 |
|---|---|---|
| `src/lib/module-access.ts` | 页面 | 模块关闭时 `beforeLoad` 抛 `notFound()`（404）；纯逻辑，可进入客户端 bundle |
| `src/lib/module-access.server.ts` | API | 关闭 → `404 { error: 'MODULE_DISABLED' }`；已启用但配置不全 → `503 { error: 'SERVICE_UNAVAILABLE' }` |

API 门禁必须早于 body 解析、鉴权、限流与 provider 调用。两个文件与 sitemap、菜单过滤共用
`websiteConfig` 的同一套开关。

## 路由

### 页面路由（TanStack Router 文件路由）

| 路径 | 说明 | 开关 |
|---|---|---|
| `{-$locale}/` | 营销首页 | — |
| `{-$locale}/pricing` | 定价页 | `payment.enabled` |
| `{-$locale}/contact` | 联系页 | `contact.enabled` |
| `{-$locale}/docs/*` | 文档站（独立 layout，无营销 Navbar / Footer） | `docs.enabled` |
| `{-$locale}/marketing/blog/*` | 博客 | `blog.enabled` |
| `{-$locale}/marketing/changelog/*` | 更新日志 | `changelog.enabled` |
| `{-$locale}/marketing/legal/*` | 法律页面 | — |
| `{-$locale}/auth/*` | 认证（login / register / forgot-password / reset-password / error） | — |

关闭的模块其页面在 `beforeLoad` 抛 `notFound()`，以 404 呈现（见
`src/lib/module-access.ts`）。路由文件保留、不做条件注册，保证构建期路由表稳定。

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
