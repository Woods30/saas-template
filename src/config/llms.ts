/**
 * `llms.txt` / `llms-full.txt` 的事实源。
 *
 * 这两个文件面向模型而不是界面：文案随语言走，但**不**走 Paraglide——
 * `m.*()` 按请求 ALS 求值，而 llms 文件的语言由 URL 决定（`/llms.txt` 英文、
 * `/llms.zh.txt` 中文），两者可能不一致。故此处内联双语文案，由渲染函数按传入的
 * locale 取值。
 */

/** 双语文案；键与 `Locale` 对齐。 */
export interface LocalizedText {
  en: string
  zh: string
}

/** 模板包含的一个能力模块。 */
export interface LlmsModule {
  name: LocalizedText
  detail: LocalizedText
}

/** llms 文件的章节标题。 */
export interface LlmsSections {
  about: LocalizedText
  stack: LocalizedText
  modules: LocalizedText
  pricing: LocalizedText
  quickStart: LocalizedText
  documentation: LocalizedText
  blog: LocalizedText
  changelog: LocalizedText
  legal: LocalizedText
}

/** 定价段落文案；`{name}` / `{price}` / `{url}` 由渲染函数替换。 */
export interface LlmsPricingCopy {
  template: LocalizedText
  plans: LocalizedText
}

export interface LlmsConfig {
  /** 一句话定位，作为 llms.txt 的摘要行。 */
  tagline: LocalizedText
  /** 「这是什么」的展开段。 */
  summary: LocalizedText
  /** 技术栈条目：均为专有名词，语言无关。 */
  stack: readonly string[]
  /** 模板包含的模块。 */
  modules: readonly LlmsModule[]
  /** 快速开始步骤；命令与路径语言无关，说明文字双语。 */
  quickStart: readonly LocalizedText[]
  /** 文档分组 key → 标题；与 `content/docs` frontmatter 的 `group` 对应。 */
  docGroupTitles: Readonly<Record<string, LocalizedText>>
  sections: LlmsSections
  pricing: LlmsPricingCopy
  /** llms-full.txt 顶部的说明段；`{name}` 由渲染函数替换。 */
  fullIntro: LocalizedText
  /** 正文里的字段标签。 */
  labels: {
    updated: LocalizedText
  }
}

export const llmsConfig: LlmsConfig = {
  tagline: {
    en: 'Jerbix is a production-ready SaaS starter built with open-source, best-practice technology on Cloudflare Workers. Clone it, rename it, deploy it. The finished template is a one-time purchase: complete source code, lifetime support, free updates.',
    zh: 'Jerbix 是构建在 Cloudflare Workers 上的 SaaS 起步模板，基于开源免费的最佳实践技术栈。克隆、改名、部署。模板成品一次性付费购买，含完整源码、永久支持与免费升级。',
  },
  summary: {
    en: 'Every layer runs on open-source software: TanStack Start on Cloudflare Workers, D1 through Drizzle, Better Auth for accounts, Stripe for billing, Tailwind for the interface. Nothing is a black box — the marketing site, documentation site, authentication, payments, service modules and tests are already wired together. Buy the finished template once and own the source code outright; new template features keep arriving through free updates.',
    zh: '每一层都跑在开源软件上：TanStack Start 跑在 Cloudflare Workers，数据经 Drizzle 访问 D1，认证用 Better Auth，收款用 Stripe，界面用 Tailwind。没有黑盒——营销站、文档站、认证、支付、服务模块与测试都已接好线。成品模板一次付费买断，源码完全归你，之后新增的模板功能持续免费升级。',
  },
  stack: [
    'Framework: TanStack Start / Router / Query, React 19',
    'Runtime: Cloudflare Workers (D1, R2, KV)',
    'Build: Vite 8, pnpm',
    'UI: Tailwind CSS v4 + shadcn/ui (Base UI, Tabler icons)',
    'Internationalization: Paraglide JS (English, Chinese)',
    'Data: Drizzle ORM + D1 (SQLite)',
    'Auth: Better Auth (email sign-in and Google OAuth)',
    'Payments: Stripe (checkout, subscriptions, billing, webhooks)',
    'Quality: TypeScript strict, Biome, Vitest, Playwright',
  ],
  modules: [
    {
      name: { en: 'Marketing site', zh: '营销站' },
      detail: {
        en: 'Landing page, pricing, features, about, roadmap and waitlist',
        zh: '落地页、定价、功能、关于、路线图与候补名单',
      },
    },
    {
      name: { en: 'Documentation site', zh: '文档站' },
      detail: {
        en: 'Markdown content, sidebar navigation, ⌘K search, English and Chinese',
        zh: 'Markdown 内容、侧边栏导航、⌘K 搜索、中英双语',
      },
    },
    {
      name: { en: 'Authentication', zh: '认证' },
      detail: {
        en: 'Better Auth with email sign-in and Google OAuth, profile page, session management',
        zh: 'Better Auth 邮箱密码与 Google OAuth、个人中心、会话管理',
      },
    },
    {
      name: { en: 'Payments', zh: '支付' },
      detail: {
        en: 'Stripe checkout, subscriptions, billing page and webhook handling',
        zh: 'Stripe 结账、订阅、账单页与 webhook 处理',
      },
    },
    {
      name: { en: 'Service modules', zh: '服务模块' },
      detail: {
        en: 'Email, newsletter, notifications, analytics and file storage, each behind a provider abstraction and a toggle',
        zh: '邮件、订阅、通知、分析与文件存储，各自带 provider 抽象与开关',
      },
    },
    {
      name: { en: 'Engineering', zh: '工程' },
      detail: {
        en: 'Two-layer environment validation, module gating, CSP, SEO and GEO metadata, unit, component and E2E tests, CI',
        zh: '两层环境变量校验、模块门禁、CSP、SEO 与 GEO 元数据、单元 / 组件 / E2E 三层测试、CI',
      },
    },
  ],
  quickStart: [
    {
      en: 'Install Node.js 22 or 24 (even LTS only) and pnpm.',
      zh: '安装 Node.js 22 或 24（仅偶数 LTS）与 pnpm。',
    },
    {
      en: 'Run `pnpm install`.',
      zh: '执行 `pnpm install`。',
    },
    {
      en: 'Run `pnpm run setup` — it creates the D1, R2 and KV resources and writes `.env` and `wrangler.jsonc`.',
      zh: '执行 `pnpm run setup`——创建 D1、R2、KV 资源并写入 `.env` 与 `wrangler.jsonc`。',
    },
    {
      en: 'Run `pnpm dev` and open http://localhost:3000.',
      zh: '执行 `pnpm dev` 并打开 http://localhost:3000。',
    },
    {
      en: 'Change `src/config/website.ts` to set your brand, then run `pnpm deploy`.',
      zh: '修改 `src/config/website.ts` 换成自己的品牌，然后执行 `pnpm deploy`。',
    },
  ],
  docGroupTitles: {
    start: { en: 'Start', zh: '开始' },
    config: { en: 'Configuration', zh: '配置' },
    deploy: { en: 'Deployment', zh: '部署' },
    features: { en: 'Feature Modules', zh: '功能模块' },
    develop: { en: 'Development', zh: '开发' },
  },
  sections: {
    about: { en: 'What this is', zh: '这是什么' },
    stack: { en: 'Tech stack', zh: '技术栈' },
    modules: { en: 'What you get', zh: '包含什么' },
    pricing: { en: 'Pricing', zh: '价格' },
    quickStart: { en: 'Quick start', zh: '快速开始' },
    documentation: { en: 'Documentation', zh: '文档' },
    blog: { en: 'Blog', zh: '博客' },
    changelog: { en: 'Changelog', zh: '更新日志' },
    legal: { en: 'Legal', zh: '法务' },
  },
  pricing: {
    template: {
      en: '**{name} template** — one-time {price}. Includes the complete source code, lifetime support, and free updates as new template features ship. Cloudflare, Stripe, Resend and other third-party services are billed separately.',
      zh: '**{name} 模板**——一次性 {price}。含完整源码与永久支持，新模板功能发布后持续免费升级。Cloudflare、Stripe、Resend 等第三方服务另行计费。',
    },
    plans: {
      en: 'Optional paid plans are available for the hosted demo: Pro (monthly or yearly) and Lifetime, alongside a free tier. Current prices: {url}',
      zh: '托管演示另有可选付费套餐：Pro（月付或年付）与 Lifetime，另有免费档。当前价格见 {url}',
    },
  },
  fullIntro: {
    en: 'This file contains the complete documentation of {name} as plain Markdown, organized by topic. Each section is one page of the documentation site, so questions about setup, deployment, configuration and the included feature modules can be answered without fetching pages.',
    zh: '本文件以纯 Markdown 收录 {name} 的完整文档，按主题组织。每节对应文档站的一页，因此关于安装、部署、配置与内置功能模块的问题，无需再抓取网页即可回答。',
  },
  labels: {
    updated: { en: 'Updated', zh: '更新于' },
  },
}
