# SaaS Template 设计稿

- **日期**：2026-10-12
- **作者**：saas-template 团队
- **状态**：Draft，待用户 review

## 1. 目标与范围

### 1.1 目标
提供一个构建在 **Cloudflare Workers** 上的 **TanStack Start SaaS 起步模板**。开发者 `git clone` → `pnpm run setup` → 修改 `src/config/website.ts` → 部署。常见 SaaS 必备能力（认证、订阅、邮件、文件、文档站、Newsletter、Admin、分析、SEO、PWA）开箱即用。

### 1.2 范围边界（MVP）
- ✅ 包含：参考 TanStarter 的核心功能模块，但仅实现 Stripe 作为支付 provider，AI 模块延后
- ❌ 不包含：AI playground、TanStack AI 适配、Creem/Waffo 实现、CLI 自定义域自动化、Sentry、PostHog、组织/多租户、邀请推荐系统、用量额度计量

### 1.3 与参考 TanStarter 的关键偏离
| 主题 | 参考 | 本项目 |
|---|---|---|
| 默认 baseLocale | `en` | `zh`（与项目级 CLAUDE.md 中文文档规约一致） |
| 支付 provider 数量 | 3（Stripe/Creem/Waffo） | 1（仅 Stripe，注册表预留 Creem/Waffo 点位） |
| AI 模块 | 内置 10+ 卡片 | 留 `website.features.enableAIGateway` 配置开关，不内置 |

## 2. 原则

- **单一可定制入口**：所有面向用户的配置集中在 `src/config/website.ts` 一处
- **单一环境来源**：所有环境变量经 `src/env/` 校验后使用，业务代码禁止直接读 `process.env` 或 `import.meta.env`
- **可插拔 provider**：所有外部服务（mail/payment/newsletter/notification/cache/storage）走 `providerRegistry`，MVP 仅注册一家，其余预留接口与文档
- **文档即代码**：`/docs` 内容随代码仓库版本，文件名后缀约定实现双语化，不构建期从外部 i18n 服务拉取
- **零幻数**：定价金额、客服邮箱、social 链接均在 `websiteConfig` 内显式声明，不在组件中硬编码
- **范围纪律**：MVP 不实现但**不删除扩展点**——所有后续模块（AI、Creem/Waffo、Sentry）都有 config 开关与 README 引导

## 3. 技术栈与依赖

| 类别 | 选型 | 备注 |
|---|---|---|
| 全栈框架 | TanStack Start | 文件路由 + server functions |
| 构建工具 | Vite | latest stable |
| 边缘运行时 | Cloudflare Workers | latest stable |
| 数据库 | Cloudflare D1（SQLite） + Drizzle ORM | 类型安全 |
| 缓存 | Cloudflare KV | 绑定名 `CACHE` |
| 对象存储 | Cloudflare R2 | 绑定名 `BUCKET` |
| 认证 | Better Auth | credentials + Google OAuth + 删除账户 |
| UI 组件 | Shadcn UI（CLI）+ Base UI + Tailwind CSS v4 | latest stable |
| 表单 | React Hook Form + Zod | 校验 |
| 数据 | TanStack Query + TanStack Router | 与框架原生集成 |
| 邮件 | React Email + Cloudflare Email Service（主）+ Resend（备） | `pnpm email:dev` 本地预览 |
| 支付 | Stripe（Checkout + Webhook + Customer Portal） | 订阅 + 单次 + 终身 + 发票 |
| Newsletter | Resend Audiences（主）+ Beehiiv（预留） | providerRegistry 模式 |
| Notification | Discord Webhook（主）+ Feishu（预留） | providerRegistry 模式 |
| Content/Docs | Content Collections + Fumadocs（轻） | 根 `content-collections.ts` |
| i18n | Paraglide JS（Inlang） | `project.inlang/`，编译期 tree-shake |
| SEO | 自建 `seo()` helper + OG/Twitter/canonical/hreflang/JSON-LD | |
| Analytics | GA / Plausible / Umami / Clarity（env 驱动） | 设置即生效 |
| Lint/Format | Biome | 取代 ESLint+Prettier |
| 测试 | Vitest（单元/集成）+ Playwright（E2E） | |
| CLI | `@inquirer/prompts` + Zod | `pnpm run setup` |
| 包管理 | pnpm | |
| 类型 | TypeScript strict | |

**实现阶段**：通过 context7 拉取各库的最新稳定版本并固化到 `package.json`。

## 4. 项目目录结构

```
saas-template/
├── AGENTS.md                            # 与 CLAUDE.md 内容一致，供其他代理使用
├── CLAUDE.md                            # 已存在
├── README.md                            # 中文
├── CONTRIBUTING.md                      # 中文
├── LICENSE
├── EditorConfig
├── biome.json
├── content-collections.ts               # ★ 根目录（与参考一致）
├── drizzle.config.ts                    # 远程（生产）数据库
├── drizzle.config.local.ts              # 本地 DB
├── vitest.config.ts
├── playwright.config.ts                 # 本地 E2E
├── playwright.production.config.ts      # 生产 E2E（对部署后 URL）
├── vite.config.ts
├── wrangler.jsonc                       # D1/KV/R2/Email/AI bindings
├── tsconfig.json
├── package.json
├── pnpm-lock.yaml
├── .env.example
├── .gitignore
├── docs/                                # 设计/规格/ADR（中文）
│   └── superpowers/specs/
├── public/                              # 静态资源（favicon、og-image、logo）
│   ├── manifest.json
│   ├── apple-touch-icon.png
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   ├── favicon.ico
│   ├── logo-light.png
│   ├── logo-dark.png
│   └── og.png
├── content/                             # ★ 长内容，根级
│   ├── docs/                            # /docs 站源
│   │   ├── index.md                     # 英文源
│   │   ├── index.zh.md                  # 中文版
│   │   ├── getting-started/
│   │   │   ├── index.md
│   │   │   ├── environment.md
│   │   │   ├── environment.zh.md
│   │   │   ├── deployment.md
│   │   │   ├── deployment.zh.md
│   │   │   ├── upgrade.md
│   │   │   └── upgrade.zh.md
│   │   ├── features/
│   │   │   ├── authentication.md / .zh.md
│   │   │   ├── payment.md / .zh.md
│   │   │   ├── email.md / .zh.md
│   │   │   ├── storage.md / .zh.md
│   │   │   ├── newsletter.md / .zh.md
│   │   │   ├── contact.md / .zh.md
│   │   │   ├── analytics.md / .zh.md
│   │   │   ├── admin.md / .zh.md
│   │   │   └── i18n.md / .zh.md
│   │   ├── customization/
│   │   │   ├── website-config.md / .zh.md
│   │   │   ├── theming.md / .zh.md
│   │   │   ├── blocks.md / .zh.md
│   │   │   ├── adding-pages.md / .zh.md
│   │   │   └── adding-providers.md / .zh.md
│   │   ├── reference/
│   │   │   ├── cli.md / .zh.md
│   │   │   ├── env-variables.md / .zh.md
│   │   │   ├── architecture.md / .zh.md
│   │   │   ├── seo.md / .zh.md
│   │   │   └── faq.md / .zh.md
│   │   └── adr/                         # 架构决策记录
│   ├── blog/                            # 博客（开关）
│   │   └── welcome.md / .zh.md
│   ├── changelog/                       # 更新日志
│   │   └── v0.1.0.md / .zh.md
│   └── legal/                           # 法律页（隐私/服务条款/Cookie）
│       ├── privacy.md / .zh.md
│       ├── terms.md / .zh.md
│       └── cookies.md / .zh.md
├── project.inlang/                      # ★ Inlang 配置
│   ├── settings.json                    # baseLocale: 'zh'；locales: ['zh', 'en']
│   └── messages/
│       ├── zh.json                      # 中文（项目级规约要求的源）
│       └── en.json
├── src/
│   ├── api/                             # server functions（按功能切分）
│   │   ├── auth.ts
│   │   ├── payment.ts
│   │   ├── files.ts
│   │   ├── newsletter.ts
│   │   ├── notification.ts
│   │   ├── contact.ts
│   │   └── users.ts                     # 仅管理员 server functions
│   ├── auth/                            # ★ Better Auth 顶层模块
│   │   ├── auth.ts
│   │   ├── client.ts
│   │   ├── types.ts
│   │   └── middlewares.ts               # requireAuth、requireRole
│   ├── cache/                           # ★ KV 缓存
│   │   ├── constants.ts                 # CACHE_TTL.*
│   │   ├── provider/
│   │   │   └── kv.ts
│   │   └── index.ts                     # getOrSetCache、deleteCache、deleteCacheByPrefix、createCacheKey
│   ├── components/                      # 按功能再分组
│   │   ├── ui/                          # shadcn
│   │   ├── layout/                      # Header、Footer、LocaleSwitcher、ThemeToggle
│   │   ├── blocks/                      # ★ 营销 block
│   │   │   ├── hero.tsx
│   │   │   ├── features.tsx
│   │   │   ├── stats.tsx
│   │   │   ├── pricing.tsx
│   │   │   ├── faq.tsx
│   │   │   ├── testimonials.tsx
│   │   │   ├── newsletter-cta.tsx
│   │   │   └── cta.tsx
│   │   ├── shared/
│   │   ├── auth/
│   │   ├── payment/
│   │   ├── pricing/
│   │   ├── dashboard/
│   │   ├── settings/
│   │   ├── admin/
│   │   ├── blog/
│   │   ├── changelog/
│   │   ├── contact/
│   │   └── analytics/                   # 各家 analytics 注入组件
│   ├── config/                          # 配置文件
│   │   ├── website.ts                   # ★ 核心配置（单 TS）
│   │   ├── blocks.ts                    # 首页 block 顺序与变体
│   │   ├── footer.ts                    # 页脚链接
│   │   └── navigation.ts                # 主导航
│   ├── contact/                         # ★ 联系表单模块
│   │   ├── schema.ts
│   │   ├── server.ts
│   │   └── notifications.ts
│   ├── db/                              # Drizzle
│   │   ├── schema.ts                    # Better Auth + 业务表
│   │   ├── index.ts                     # 客户端
│   │   └── migrations/
│   ├── hooks/                           # ★ 自定义 React hooks
│   │   ├── use-media-query.ts
│   │   ├── use-copy.ts
│   │   └── ...
│   ├── lib/                             # 通用工具
│   │   ├── utils.ts
│   │   ├── seo.ts                       # ★ seo(path, options)
│   │   ├── urls.ts
│   │   ├── routes.ts                    # 类型化路径
│   │   ├── price-plan.ts
│   │   ├── locale.ts                    # ★ localeConfig、URL helpers
│   │   ├── markdown.ts
│   │   ├── formatter.ts
│   │   ├── pages.ts
│   │   └── sitemap.ts
│   ├── locale/                          # ★ Paraglide 中间件与运行时
│   │   ├── middleware.ts
│   │   └── paraglide/                   # 生成的代码（gitignore）
│   ├── mail/                            # ★ React Email + provider registry
│   │   ├── components/                  # EmailLayout、EmailButton 等
│   │   ├── provider/
│   │   │   ├── cloudflare.ts
│   │   │   └── resend.ts
│   │   ├── templates/
│   │   │   ├── verify-email.tsx
│   │   │   ├── forgot-password.tsx
│   │   │   ├── newsletter-subscription.tsx
│   │   │   └── contact-message.tsx
│   │   ├── types.ts                     # MailProvider、EmailTemplate 联合
│   │   ├── render.ts                    # 模板注册表
│   │   └── index.ts                     # providerRegistry、sendEmail()
│   ├── middlewares/                     # ★ TanStack Start 中间件
│   │   ├── auth.ts
│   │   └── locale.ts
│   ├── newsletter/                      # ★ Newsletter 模块
│   │   ├── provider/
│   │   │   ├── resend.ts
│   │   │   └── beehiiv.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── notification/                    # ★ Notification 模块
│   │   ├── provider/
│   │   │   ├── discord.ts
│   │   │   └── feishu.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── payment/                         # ★ Stripe + 注册表
│   │   ├── provider/
│   │   │   └── stripe.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── routes/                          # 文件路由
│   │   ├── __root.tsx
│   │   ├── index.tsx                    # /（中文）
│   │   ├── sitemap.xml.ts
│   │   ├── robots.txt.ts
│   │   ├── manifest.webmanifest.ts
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── $.ts                 # Better Auth catch-all
│   │   │   └── webhooks/
│   │   │       └── stripe.ts
│   │   ├── {-$locale}/                  # ★ locale 段（默认 zh）
│   │   │   ├── index.tsx                # /
│   │   │   ├── pricing.tsx
│   │   │   ├── about.tsx
│   │   │   ├── contact.tsx
│   │   │   ├── blog/
│   │   │   │   ├── index.tsx
│   │   │   │   └── $slug.tsx
│   │   │   ├── changelog/
│   │   │   │   ├── index.tsx
│   │   │   │   └── $slug.tsx
│   │   │   ├── docs/
│   │   │   │   ├── index.tsx
│   │   │   │   └── $.tsx                # catch-all
│   │   │   ├── (pages)/                 # 静态内容页
│   │   │   │   └── ...
│   │   │   ├── (legals)/                # 法律页
│   │   │   │   ├── privacy.tsx
│   │   │   │   ├── terms.tsx
│   │   │   │   └── cookies.tsx
│   │   │   ├── auth/
│   │   │   │   ├── login.tsx
│   │   │   │   ├── register.tsx
│   │   │   │   ├── forgot-password.tsx
│   │   │   │   ├── reset-password.tsx
│   │   │   │   └── error.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── __layout.tsx         # 受保护布局
│   │   │   │   ├── index.tsx
│   │   │   │   ├── billing.tsx
│   │   │   │   ├── files.tsx
│   │   │   │   ├── api-keys.tsx
│   │   │   │   └── settings.tsx
│   │   │   └── admin/
│   │   │       ├── __layout.tsx         # 需 superadmin 角色
│   │   │       ├── index.tsx
│   │   │       └── users.tsx
│   │   └── ...
│   ├── storage/                         # ★ R2 文件存储
│   │   ├── provider/
│   │   │   └── r2.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── env/                             # ★ 顶层 env 校验（替代 src/lib/env.ts）
│   │   ├── public.ts                    # publicEnv（client + server）
│   │   └── server.ts                    # serverEnv（仅 server）
│   ├── types/                           # ★ 全局类型
│   │   └── index.ts
│   ├── styles/
│   │   └── globals.css
│   └── worker.ts                        # Cloudflare Worker 入口
├── tests/
│   ├── unit/
│   └── e2e/
└── scripts/
    ├── setup.ts                         # pnpm run setup 入口
    ├── check-docs-i18n.ts               # 双语文档配对校验
    └── locale-sort.ts
```

### 4.1 顶层目录设计原则

- **`src/<feature>/`**：每个业务功能独立成目录（`auth/`, `payment/`, `mail/`, `storage/`, `cache/`, `newsletter/`, `notification/`, `contact/`）。每个目录至少包含 `types.ts` + `provider/`（如果有多实现）+ `index.ts`（注册表与对外 API）。
- **`src/lib/`**：仅放**真正通用、无业务领域语义**的工具：`utils`, `locale`, `seo`, `routes`, `price-plan`, `markdown`, `formatter`, `pages`, `urls`, `sitemap`。
- **`src/components/`**：按用途分（`ui`、`layout`、`shared`）和按功能分（`auth`、`payment`、`dashboard`、`admin`、`blog`、`changelog`、`contact`、`analytics`）。
- **`src/components/blocks/`**：营销首页的 block 组件，按 `src/config/pages.ts` 顺序拼装。

## 5. 配置系统

### 5.1 环境变量两层模型（`src/env/`）

```ts
// src/env/public.ts
import { z } from 'zod';

export const publicEnv = z.object({
  VITE_BASE_URL: z.string().url().default('http://localhost:3000'),
  VITE_PAYMENT_PROVIDER: z.enum(['stripe']).optional(),  // MVP 仅允许 'stripe'
  VITE_STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  VITE_STRIPE_PRICE_PRO_YEARLY: z.string().optional(),
  VITE_STRIPE_PRICE_LIFETIME: z.string().optional(),
  VITE_GA_ID: z.string().optional(),
  VITE_PLAUSIBLE_DOMAIN: z.string().optional(),
  VITE_UMAMI_ID: z.string().optional(),
  VITE_CLARITY_ID: z.string().optional(),
  VITE_TURNSTILE_SITE_KEY: z.string().optional(),
}).parse(import.meta.env);

// src/env/server.ts
export const serverEnv = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, '必须 ≥32 字符'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_EMAIL_SENDER: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_AUDIENCE_ID: z.string().optional(),
  BEEHIIV_API_KEY: z.string().optional(),
  BEEHIIV_PUBLICATION_ID: z.string().optional(),
  DISCORD_WEBHOOK_URL: z.string().optional(),
  FEISHU_WEBHOOK_URL: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  // bindings
  DB: z.any(),
  CACHE: z.any(),
  BUCKET: z.any(),
}).parse(process.env);
```

**约束**：`website.ts` 与所有业务文件**禁止**直接读 `process.env` 或 `import.meta.env`，必须从 `publicEnv`/`serverEnv` 导入。

### 5.2 `src/config/website.ts` 形态

```ts
import { publicEnv } from '@/env/public';

export const websiteConfig: WebsiteConfig = {
  metadata: {
    name: m.site_name,
    title: m.site_title,
    description: m.site_description,
    images: {
      ogImage: '/og.png',
      logoLight: '/logo-light.png',
      logoDark: '/logo-dark.png',
    },
  },
  social: {
    github: 'https://github.com/your-org/saas-template',
    discord: '',
    twitter: '',
    youtube: '',
  },
  baseUrl: publicEnv.VITE_BASE_URL,
  auth: {
    enable: true,
    enableGoogleLogin: true,
    enableCredentialLogin: true,
    enableDeleteAccount: true,
  },
  payment: {
    enable: !!publicEnv.VITE_PAYMENT_PROVIDER,
    provider: publicEnv.VITE_PAYMENT_PROVIDER, // 仅 'stripe'
    price: {
      currency: 'USD',
      plans: {
        free: { id: 'free', isFree: true, prices: [] },
        pro: {
          id: 'pro', popular: true, isFree: false, isLifetime: false,
          prices: [
            { type: 'subscription', priceId: publicEnv.VITE_STRIPE_PRICE_PRO_MONTHLY ?? '', amount: 990, currency: 'USD', interval: 'month' },
            { type: 'subscription', priceId: publicEnv.VITE_STRIPE_PRICE_PRO_YEARLY ?? '', amount: 9900, currency: 'USD', interval: 'year' },
          ],
        },
        lifetime: {
          id: 'lifetime', isFree: false, isLifetime: true,
          prices: [
            { type: 'one_time', priceId: publicEnv.VITE_STRIPE_PRICE_LIFETIME ?? '', amount: 19900, currency: 'USD', allowPromotionCode: true },
          ],
        },
      },
    },
  },
  mail: {
    enable: true,
    provider: publicEnv.CLOUDFLARE_EMAIL_SENDER ? 'cloudflare' : 'resend',
    fromEmail: 'SaaS Template <support@example.com>',
    supportEmail: 'SaaS Template <support@example.com>',
  },
  storage: {
    enable: true,
    provider: 'r2',
    maxFileSize: 10 * 1024 * 1024,
    allowedTypes: [],
    userFilesFolder: 'userfiles',
  },
  newsletter: {
    enable: true,
    provider: publicEnv.RESEND_AUDIENCE_ID ? 'resend' : 'beehiiv',
    autoSubscribeAfterSignUp: true,
  },
  notification: {
    enable: !!publicEnv.DISCORD_WEBHOOK_URL,
    provider: publicEnv.DISCORD_WEBHOOK_URL ? 'discord' : undefined,
  },
  cache: {
    enable: true,
    provider: 'kv',
  },
  analytics: {
    ga: { enable: !!publicEnv.VITE_GA_ID, id: publicEnv.VITE_GA_ID },
    plausible: { enable: !!publicEnv.VITE_PLAUSIBLE_DOMAIN, domain: publicEnv.VITE_PLAUSIBLE_DOMAIN },
    umami: { enable: !!publicEnv.VITE_UMAMI_ID, id: publicEnv.VITE_UMAMI_ID },
    clarity: { enable: !!publicEnv.VITE_CLARITY_ID, id: publicEnv.VITE_CLARITY_ID },
  },
  features: {
    enableFileUpload: true,
    enableApiKeys: true,
    enableDocs: true,
    enableI18n: true,
    enableNewsletter: true,
    enableContact: true,
    enableAdmin: true,
    enableAIGateway: false,         // MVP 默认关闭；预留
    enableCache: true,
  },
  captcha: {
    enable: !!publicEnv.VITE_TURNSTILE_SITE_KEY,
    siteKey: publicEnv.VITE_TURNSTILE_SITE_KEY,
  },
};
```

### 5.3 `src/config/pages.ts`

```ts
export const homeBlocksConfig = [
  { id: 'hero', component: 'Hero', props: { badge: '...', title: ... } },
  { id: 'logo-cloud', component: 'LogoCloud', props: {} },
  { id: 'features', component: 'Features', props: { items: [...] } },
  { id: 'stats', component: 'Stats', props: { items: [...] } },
  { id: 'pricing', component: 'Pricing', props: {} },
  { id: 'testimonials', component: 'Testimonials', props: { items: [...] } },
  { id: 'faq', component: 'FAQ', props: { items: [...] } },
  { id: 'newsletter-cta', component: 'NewsletterCTA', props: {} },
  { id: 'cta', component: 'CTA', props: {} },
] as const;
```

`/` 页面按此数组顺序渲染对应 block，开发者可注释/调整/编写新组件。

### 5.4 i18n Messages 文件

- `project.inlang/settings.json`：`{ "baseLocale": "zh", "locales": ["zh", "en"] }`
- `project.inlang/messages/zh.json` 与 `en.json` 包含：
  - `site.{name,title,description}`
  - `nav.*`、`footer.*`、`auth.*`、`pricing.*`、`dashboard.*`、`admin.*`、`docs.*`
  - `mail.*.subject`（邮件主题）
  - `errors.*`、`toast.*`、`form.*`
  - 邮件正文内容（`mail.*.body.*`）由 React Email 模板独立渲染，仅 subject 来自 messages

**注意**：`zh.json` 是源（项目级 CLAUDE.md 中文文档规约），CI 缺失键构建失败。

## 6. 数据模型（Drizzle Schema 草案）

```ts
// src/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// —— Better Auth 自动生成 ——
users              { id, email, emailVerified, name, image, role, banned, banReason, banExpires, deletedAt, createdAt, updatedAt }
sessions           { id, userId, expiresAt, ipAddress, userAgent, ... }
accounts           { id, userId, providerId, accountId, ... }
verifications      { id, identifier, value, expiresAt, ... }
passkeys           { ... }
twoFactor          { ... }

// —— 业务表 ——
subscriptions {
  id, userId (FK), customerId, subscriptionId,
  status (active|canceled|incomplete|...),
  priceId, amount, currency, interval (month|year|once),
  currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd,
  createdAt, updatedAt
}

payments {
  id, userId, type (subscription|invoice|one_time),
  stripeInvoiceId, stripeChargeId,
  status, amount, currency,
  description, paidAt, refundedAt,
  createdAt
}

files {
  id, userId, r2Key, filename, contentType, size,
  folder, visibility (private|public),
  createdAt
}

apiKeys {
  id, userId, name, hashedKey, prefix,
  lastUsedAt, expiresAt,
  createdAt
}

newsletterSubscriptions {  // 可选缓存（KV 也可）
  id, email, provider, providerListId,
  status, createdAt
}
```

## 7. 关键流程

### 7.1 开发者启动流程（`pnpm run setup`）

1. 校验依赖：`pnpm`、`git`、`gh`（可选）、`wrangler`
2. 检查 `wrangler whoami`
3. 询问项目名、Cloudflare 资源名（D1 数据库名、R2 bucket 名）
4. 创建 D1 → 写入 `wrangler.jsonc` 与 `.env`
5. 创建 R2 bucket → 写入 `wrangler.jsonc`
6. 创建 KV namespace → 写入 `wrangler.jsonc`
7. 生成 `BETTER_AUTH_SECRET` → 写入 `.env`
8. 询问 Stripe 是否配置；若选 `yes`，引导输入 `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`（提供 stripe listen 命令提示）
9. 询问 Email provider：Cloudflare（需 onboarding domain）或 Resend
10. 询问是否启用 Discord Webhook（可选）
11. 可选：询问是否启用 Resend Audiences / Beehiiv
12. 复制 `.env.example` → `.env`
14. **跳过**自定义域绑定（README 说明手动配置）
15. **跳过** Stripe product 创建（README 说明）
16. 输出下一步：`pnpm run db:migrate:local && pnpm dev`

CLI 不创建 GitHub repo（用户自行 fork）。

### 7.2 认证流程

- 注册 → Better Auth → 触发验证邮件（React Email 模板，Cloudflare Email Service / Resend）
- 邮箱链接激活（Cloudflare Email Routing 可选接收回复邮件）
- 登录支持 credentials + Google OAuth（开关来自 `website.auth`）
- `/dashboard` 通过 `middlewares/auth.ts` 服务端守卫（`beforeLoad`）
- 软删除账户：标记 `users.deletedAt`，cron 任务（后续扩展）清理

### 7.3 支付流程

- `/pricing` 从 `website.payment.price.plans` 派生卡片
- 选计划 → `createCheckoutSession()` server function
  - 通过 `payment/provider/stripe.ts` 调用 Stripe Checkout API
  - 传 `customer_email`、`locale`（Stripe locale），`success_url`/`cancel_url` 跟随当前 locale
- 成功 → `/dashboard/billing?success=1`
- Webhook `/api/webhooks/stripe` 监听：
  - `checkout.session.completed`
  - `invoice.paid`
  - `customer.subscription.created` / `updated` / `deleted`
  - `charge.refunded`
- 处理后更新 `subscriptions` / `payments` 表
- `/dashboard/billing` "Manage Subscription" → Stripe Customer Portal（locale 透传）
- 注册表预留 Creem/Waffo 点位，仅注册 `stripe`

### 7.4 文件上传流程

1. 客户端 → `getUploadUrl(filename, contentType, folder)` server function
2. server function 返回 R2 预签名上传 URL
3. 客户端 PUT 到 R2
4. 上传完成 → `confirmUpload(metadata)` 写入 `files` 表
5. 下载：`/api/files/:id` 受权 → 返回签名读 URL

### 7.5 邮件流程

- `sendMail(templateName, { to, locale, context })` → `mail/index.ts` 统一入口
- 根据 `website.mail.provider` 选择 provider
- 模板渲染：
  1. 从 messages 读 `mail.<template>.subject`（locale 决定 zh/en）
  2. 调用 `renderTemplate(name, context)`（React Email 渲染 HTML）
  3. provider 发送
- 本地预览：`pnpm email:dev`（React Email dev server）

### 7.6 Newsletter 流程

- 用户填邮箱 → `subscribeNewsletter(email)` server function
- 选择 provider（`resend` Audiences 或 `beehiiv`）
- 通过后写缓存 `newsletter:status:<email>` 到 KV
- `autoSubscribeAfterSignUp: true` 时注册成功后自动调用
- 检查状态：先读 KV，TTL 后回源

### 7.7 Notification 流程

- `notify(event, payload)` → 根据 `event` 映射到 channel（订阅、联系、管理员操作）
- 选择 provider（`discord` 或 `feishu`）发送 webhook
- 失败不阻塞主流程，写 console warning

### 7.8 Contact 流程

- `/contact` 提交 → `submitContact()` server function
- 校验（Turnstile 可选）
- 调用 `mail/sendMail('contact-message', { to: websiteConfig.mail.supportEmail, ... })`
- 同时调用 `notify('contact:received', payload)`（若启用）
- 返回成功 toast

### 7.9 Admin 流程

- `/admin/users` 仅 `role: 'admin' | 'superadmin'` 可见
- 中间件 `requireRole(['admin','superadmin'])`
- 操作：列表 + 搜索 + 筛选；禁用/启用；修改角色（仅 superadmin）
- 不实现：批量操作、CSV 导出、详细审计日志（后续迭代）

## 8. SEO 系统

### 8.1 `src/lib/seo.ts`

```ts
export function seo(path: string, options: { title: string; description?: string; image?: string; type?: 'website'|'article'; locale?: Locale }) {
  const url = getCanonicalUrl(path, options.locale);
  const image = options.image ?? getOgImage();
  return {
    meta: [
      { title: options.title },
      { name: 'description', content: options.description },
      { property: 'og:title', content: options.title },
      { property: 'og:description', content: options.description },
      { property: 'og:image', content: image },
      { property: 'og:url', content: url },
      { property: 'og:locale', content: getOgLocale(options.locale) },
      { name: 'twitter:card', content: 'summary_large_image' },
      ...alternateLocaleAlts(path),
    ],
    links: [
      { rel: 'canonical', href: url },
      ...alternateHreflangs(path),
    ],
    scripts: [
      { type: 'application/ld+json', children: jsonLdBreadcrumb(path) },
    ],
  };
}
```

### 8.2 `src/routes/sitemap.xml.ts`

根据当前域名 + content-collections（docs、blog、changelog、legal）+ routes 静态表自动生成。

### 8.3 `src/routes/robots.txt.ts`

生成 robots.txt，引用 sitemap。

### 8.4 JSON-LD 结构化数据

- 首页：`Organization`、`WebSite`、`FAQPage`
- 博客文章：`BlogPosting`、`BreadcrumbList`
- 产品/价格：`Product`、`Offer`
- 法律页：`WebPage`

## 9. PWA

- `public/manifest.json`：name、short_name、theme_color、background_color、icons（192/512/maskable）
- `src/routes/__root.tsx` 包含 manifest 链接、apple-touch-icon、theme-color
- MVP 不内置 Service Worker（README 说明后续可加 Workbox）

## 10. Analytics（4 选 N env 驱动）

```ts
// src/components/analytics/index.tsx
export function Analytics() {
  const cfg = websiteConfig.analytics;
  return (
    <>
      {cfg.ga.enable && <GoogleAnalytics id={cfg.ga.id} />}
      {cfg.plausible.enable && <Plausible domain={cfg.plausible.domain} />}
      {cfg.umami.enable && <Umami id={cfg.umami.id} />}
      {cfg.clarity.enable && <Clarity id={cfg.clarity.id} />}
    </>
  );
}
```

`__root.tsx` 仅在 production 渲染。

## 11. i18n

### 11.1 Paraglide JS

- `project.inlang/settings.json`：`baseLocale: 'zh'`，`locales: ['zh', 'en']`
- `src/locale/middleware.ts`：TanStack Start 中间件解析 locale（URL > cookie > 默认 `zh`）
- `src/locale/paraglide/`：生成的运行时（gitignore）
- `src/lib/locale.ts`：localeConfig（name、flag、hreflang）、URL helpers
- `src/components/layout/LocaleSwitcher.tsx`：写 cookie + router.navigate

### 11.2 Locale 路由

- `/{-$locale}/` 可选段（TanStack Router 语法）
- 路径映射：
  - `/` → 默认 `zh`
  - `/zh`、`/zh/docs`、`/zh/pricing`
  - `/en`、`/en/docs`、`/en/pricing`
- 路由中间件在 `beforeLoad` 注入 locale 到 context

### 11.3 国际化文档

- `content/docs/**`：英文源 + `*.zh.md` 中文版
- `content/blog/**`、`content/changelog/**`、`content/legal/**` 同样约定
- `scripts/check-docs-i18n.ts` 构建时比对，缺失中文即失败

### 11.4 命令

- `pnpm locale:sort`：排序 message keys
- `pnpm locale:check`：检查 locale 间键对等
- `pnpm locale:compile`：手动编译 Paraglide 运行时

## 12. CLI 工具（`pnpm run setup`）

基于 `@inquirer/prompts` + Zod，入口 `scripts/setup.ts`。流程见 §7.1。

## 13. 测试策略

| 层 | 工具 | 覆盖 |
|---|---|---|
| 单元 | Vitest | env 校验、config 推导、providerRegistry、i18n 工具、price-plan 助手 |
| 组件 | Vitest + Testing Library | 表单、按钮、卡片、block |
| 集成 | Vitest + Miniflare/@cloudflare/vitest-pool-workers | server functions、D1 CRUD、webhook handler（mock fetch） |
| E2E（本地） | Playwright | 注册→邮箱验证→登录→dashboard→pricing→checkout (mock)→webhook→订阅入库 |
| E2E（生产） | `playwright.production.config.ts` | 对部署 URL 跑 smoke（首页、定价、注册页 200） |

CI 在 MVP 范围外（README 标注 GitHub Actions 示例 workflow）。

## 14. 错误处理与可观测性

- `src/env/{public,server}.ts` 启动时校验，缺失/无效立即退出（dev 友好提示）
- server function 统一 `try/catch` + `AppError` 基类（带 i18n message key）
- 关键操作（webhook、订单、邮件投递）写结构化 `console.log`（CF Workers logpush 友好）
- 后续可接 Sentry adapter（不在 MVP）

## 15. 部署与 CI

### 15.1 部署（开发者执行）

```bash
pnpm run deploy
# 内部：validate-prod-env → pnpm build → pnpm check:client-bundle → wrangler deploy
```

`scripts/validate-prod-env.ts`：拒绝占位 `BETTER_AUTH_SECRET`（`better-auth-secret` 或长度 <32）。

### 15.2 CI（README 提供示例，不强制）

- GitHub Actions：`pnpm run check`（Biome + 类型 + env 校验 + 文档配对 + bundle check）→ `pnpm test` → `pnpm test:e2e:build`

### 15.3 `check:client-bundle`

构建后扫描 `dist/client`，禁止出现 `STRIPE_SECRET_KEY`、`BETTER_AUTH_SECRET` 等明文。

## 16. 文档体系

| 文档 | 语言 | 位置 | 用途 |
|---|---|---|---|
| README.md | 中文 | 根 | 项目介绍、快速开始、命令清单、文档导航 |
| CONTRIBUTING.md | 中文 | 根 | 贡献流程（必须同步中英文档） |
| AGENTS.md | 中文 | 根 | 与 CLAUDE.md 内容一致，供其他代理使用 |
| CLAUDE.md | 中文 | 根 | 项目级规则（已存在） |
| docs/superpowers/specs/*.md | 中文 | docs/superpowers/specs/ | 设计/规格 |
| docs/superpowers/specs/adr/*.md | 中文 | docs/superpowers/specs/adr/ | 架构决策记录（≥1 份 "为什么选 Cloudflare Workers"） |
| `/docs` 文档站 | 中英 | `content/docs/**` | 入门/功能/定制/参考四大类目 |
| `/blog` | 中英 | `content/blog/**` | 博客（开关） |
| `/changelog` | 中英 | `content/changelog/**` | 更新日志 |
| `/privacy` `/terms` `/cookies` | 中英 | `content/legal/**` | 法律页 |

## 17. YAGNI（显式排除）

- ❌ AI playground、TanStack AI、Workers AI 集成（保留 `enableAIGateway` 开关占位）
- ❌ Creem / Waffo Pancake 实现（注册表点位保留）
- ❌ 团队/组织/多租户
- ❌ 邀请码、推荐系统
- ❌ SaaS 用量/额度计量（仅订阅模式）
- ❌ Sentry / PostHog
- ❌ Service Worker（PWA 离线增强）
- ❌ Stripe 通过 CLI 自动创建 product
- ❌ CLI 自动绑定自定义域
- ❌ GitHub Actions CI 配置（README 示例）
- ❌ 文档站全文搜索
- ❌ 文档站版本切换

## 18. 范围与里程碑

为避免单次 spec 失焦，实施阶段将拆分为 4 个 sub-plan（每个独立的 spec → plan → 实施循环）：

1. **Sub-plan A：基础设施** — 项目骨架、TanStack Start + Vite + Workers 配置、Drizzle、env、Biome、shadcn/ui、基础 Tailwind、locale、Paraglide、CLI 骨架
2. **Sub-plan B：核心业务模块** — auth、payment、storage、mail、newsletter、notification、cache、contact、admin
3. **Sub-plan C：前端 UI 与文档站** — blocks、组件、路由、文档站、内容集合、SEO、PWA、Analytics
4. **Sub-plan D：测试与部署打磨** — Playwright、Vitest、生产校验、文档完善

每个 sub-plan 完成后回到 spec 检查是否仍对齐本设计；若有偏差，更新本 spec 后再启下一 sub-plan。

## 19. 待用户 review 的关键决策

| 决策 | 本设计选择 | 用户确认 |
|---|---|---|
| 默认 baseLocale | `zh` | ✅ |
| 范围 | 精简 MVP（含完整模块） | ✅ |
| 部署目标 | Cloudflare Workers | ✅ |
| 支付 provider | 仅 Stripe | ✅ |
| i18n | 内置 zh/en | ✅ |
| 文档站 | 内置 + 双语 | ✅ |
| CLI | 内置 | ✅ |
| 配置形态 | 单 TS 文件 | ✅ |
| Newsletter | 内置 Resend Audiences | ✅ |
| Notification | Discord（Feishu 预留） | ✅ |
| Contact | 内置 server function | ✅ |
| Admin | 最小版 | ✅ |
| Analytics | 4 选 N env 驱动 | ✅ |
| PWA | 内置 manifest + 图标 | ✅ |
| 首页 blocks | 内置 8 个 | ✅ |
| 邮件 | React Email + `pnpm email:dev` | ✅ |
| 双 drizzle/playwright 配置 | 双配置 | ✅ |
| AGENTS.md | 与 CLAUDE.md 并存 | ✅ |

---

**审阅要点**（请重点检查）：

1. §4 目录树是否覆盖所有要实现的模块
2. §5 `websiteConfig` 字段是否就是你希望开发者改一处配置能改的范围
4. §7 各流程是否符合你的预期（特别是 Newsletter autoSubscribeAfterSignUp、Admin 最小版范围）
5. §17 YAGNI 排除是否过激或过宽
6. §18 拆分为 4 个 sub-plan 是否合理，或你希望一次性出完整 plan