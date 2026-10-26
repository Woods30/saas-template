# Sub-Plan C：前端 UI 与文档站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 8 个 marketing blocks（Hero / Features / Stats / Pricing / FAQ / Testimonials / NewsletterCta / CTA）、marketing 页面、根级 Content Collections（docs/blog/changelog/legal），并完成 SEO、PWA manifest、Analytics、locale 路由。

**Architecture:** 营销页面（首页/特性/价格/关于）由 marketing layout 包裹，blocks 来自 `src/components/sections/`，每个 block 独立可组合。Docs/Blog/Changelog/Legal 通过 Content Collections 在仓库根目录 `content/` 下管理，使用文件名后缀约定（`*.zh.md` / `*.en.md`）。`Paraglide JS`（已有）处理语言，locale 路由以 `{-$locale}/` 软前缀形式存在（URL 中可省略），实际 locale 由 cookie + `Accept-Language` 决定（见 `src/lib/locale.ts` + `src/locale/middleware.ts`）。

**Tech Stack:** @content-collections/core, @content-collections/vite, vite-plugin-svgr, @tabler/icons-react.

## 与 Sub-Plan A/B 的对齐（重写说明）

本计划在 Sub-Plan A/B 已落地后重写。下列决定确保本计划代码与现有代码库**严格一致**：

1. **`websiteConfig` 字段名以 `src/config/website.ts` 为准**：
   - 用 `websiteConfig.baseUrl`（不要写 `websiteConfig.url`）
   - 用 `websiteConfig.metadata.name`（不要写 `websiteConfig.name`）
   - locale 列表用 `LOCALES` from `@/lib/locale`，不要在 websiteConfig 里再造一个 `i18n.locales`
2. **`src/lib/locale.ts` 已经存在**（包含 `Locale`、`defaultLocale`、`LOCALES`、`parseLocale`、`localeConfig`、`htmlLang`、`readCookieValue`），**不要新建同名文件**。本计划的 `getServerLocale()` 改为复用 Paraglide 的 `getLocale()` from `@/locale/paraglide/runtime.js`（`__root.tsx` 已用）。
3. **Newsletter API 已存在**：`src/routes/api/newsletter/$.ts` 已处理 POST(subscribe) / DELETE(unsubscribe)（Sub-Plan B Task 7）。**不要新建** `src/routes/api/newsletter/subscribe.ts` 或 `src/api/newsletter-subscribe.ts`；本计划 Task 11 的 NewsletterCta 块直接 POST 到 `/api/newsletter`。
4. **Pricing 页缺失**（Sub-Plan B Task 14 已推迟）。本计划 Task 14 创建 `src/routes/{-$locale}/pricing.tsx`。
5. **Contact 页已存在**（Sub-Plan B Task 9，`src/routes/{-$locale}/contact.tsx`），不要重建。
6. **Auth 页已存在**（Sub-Plan B Task 11，`src/routes/{-$locale}/auth/*`），不要重建。
7. **错误页处理**：TanStack Router 1.x 通过 `notFound()` 抛出与 `__root` 的 `errorComponent` / `notFoundComponent` 协作。**不要新建** `src/routes/404.tsx` / `src/routes/500.tsx`；本计划 Task 22 在 `__root.tsx` 增补 `notFoundComponent` 与 `errorComponent`。
8. **Sitemap / robots 用文件路由**，文件名转义点号：`src/routes/sitemap[.]xml.ts`、`src/routes/robots[.]txt.ts`（TanStack Router 把方括号内字符视为字面量）。
9. **Analytics CSP nonce**：Sub-Plan D 未落地，**本计划不依赖 CSP nonce**；`AnalyticsProvider` 注入 `<script>` 不带 nonce，Sub-Plan D 接入时再补。
10. **OG 动态图**：satori 在 Cloudflare Workers 兼容性差且依赖重，**本计划用静态 SVG 占位**（`src/routes/og[.]png.ts` 返回 SVG），动态 satori 推迟到 v0.2。

## Global Constraints

- 营销页面与 blocks 全部 TypeScript + 函数组件；不引入 class 组件。
- 业务与 UI 分层：UI 在 `src/components/sections/`，业务在 `src/<feature>/`。
- 全部文案来自 `messages/{zh,en}.json`（Paraglide 产物，调用 `m.*()` 而非硬编码）。
- 不实现具体 docs 教程内容（仅骨架 + 一篇示例文档）。
- 不实现多 analytics provider 全部集成；只写 GA4 + Plausible + Umami + Clarity 接入点（env 驱动、按需启用）。
- **不实施 PWA service worker 与 push 通知**：spec §17 显式排除；只做 `manifest.json` 接入。
- 提交前必须 `pnpm run check` 与 `pnpm run test` 通过。
- 所有新增 import 用 `@/` 别名（项目已配 `tsconfig.json` paths），不用相对路径。
- 任何改动 `src/config/website.ts` 都要 `as const`，新增字段同步更新 `WebsiteConfig` 类型。
- 不写 2xx/4xx 响应中暴露 secret 的诊断信息；错误信息与 `src/lib/logger` 保持一致风格。

---

### Task 1: 安装前端/内容相关依赖

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Step 1.1: 安装**

```bash
pnpm add @content-collections/core @content-collections/vite vite-plugin-svgr @tabler/icons-react
pnpm add -D @content-collections/cli
```

> 注意：原计划写 `@content-collections/tanstack-start`（npm 上不存在）。官方包是 `@content-collections/vite`（vite 通用插件），与 TanStack Start 兼容——它在 build 时把 `content/**` 编译为 `import { allDocs } from 'content-collections'` 的纯 ESM 模块。

**Step 1.2: 确认版本**

```bash
pnpm ls @content-collections/core @content-collections/vite @tabler/icons-react
```

记录实际版本。后续任务遇到 API 差异以官方文档为准。

**Step 1.3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): content-collections + 营销 UI 依赖"
```

---

### Task 2: Content Collections 配置

**Files:**
- Create: `content-collections.ts`
- Create: `content/docs/index.md`（示例）
- Create: `content/docs/index.zh.md`
- Create: `content/blog/hello-world.md`
- Create: `content/blog/hello-world.zh.md`
- Create: `content/changelog/2026-10-12-init.md`
- Create: `content/changelog/2026-10-12-init.zh.md`
- Create: `content/legal/terms.md`
- Create: `content/legal/terms.zh.md`
- Create: `content/legal/privacy.md`
- Create: `content/legal/privacy.zh.md`
- Modify: `vite.config.ts`（追加 content-collections plugin）
- Modify: `tsconfig.json`（追加 `@content-collections/*` 路径别名）
- Modify: `package.json`（追加 `content:build` 脚本）

**Step 2.1: 写入 `content-collections.ts`**

```ts
import { defineCollection, defineConfig } from '@content-collections/core';

const docs = defineCollection({
  name: 'docs',
  directory: 'content/docs',
  include: '**/*.md',
  schema: (z) => ({
    title: z.string(),
    description: z.string(),
    locale: z.string().default('en'),
    order: z.number().default(0),
  }),
  transform: (doc) => {
    const lang = doc._meta.path.endsWith('.zh.md') ? 'zh' : 'en';
    return { ...doc, locale: lang };
  },
});

const blog = defineCollection({
  name: 'blog',
  directory: 'content/blog',
  include: '**/*.md',
  schema: (z) => ({
    title: z.string(),
    description: z.string(),
    date: z.string().datetime(),
    published: z.boolean().default(true),
    locale: z.string().default('en'),
    image: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
  transform: (doc) => {
    const lang = doc._meta.path.endsWith('.zh.md') ? 'zh' : 'en';
    return { ...doc, locale: lang };
  },
});

const changelog = defineCollection({
  name: 'changelog',
  directory: 'content/changelog',
  include: '**/*.md',
  schema: (z) => ({
    title: z.string(),
    date: z.string().datetime(),
    summary: z.string(),
    locale: z.string().default('en'),
  }),
  transform: (doc) => {
    const lang = doc._meta.path.endsWith('.zh.md') ? 'zh' : 'en';
    return { ...doc, locale: lang };
  },
});

const legal = defineCollection({
  name: 'legal',
  directory: 'content/legal',
  include: '**/*.md',
  schema: (z) => ({
    title: z.string(),
    locale: z.string().default('en'),
  }),
  transform: (doc) => {
    const lang = doc._meta.path.endsWith('.zh.md') ? 'zh' : 'en';
    return { ...doc, locale: lang };
  },
});

export default defineConfig({
  collections: [docs, blog, changelog, legal],
});
```

**Step 2.2: 写入 `content/docs/index.md`（示例）**

```markdown
---
title: Getting Started
description: 快速启动与第一个 Stripe 支付
locale: en
order: 1
---

# Getting Started

Welcome to SaaS Template. Follow these steps to ship your first paid product.
```

**Step 2.3: 写入 `content/docs/index.zh.md`**

```markdown
---
title: 快速开始
description: 快速启动与第一个 Stripe 支付
locale: zh
order: 1
---

# 快速开始

欢迎使用 SaaS Template。跟随以下步骤发布你的第一个付费产品。
```

**Step 2.4: 写入 `content/blog/hello-world.md`**

```markdown
---
title: Hello, World
description: Introducing SaaS Template
date: 2026-10-12T00:00:00.000Z
published: true
locale: en
---

# Hello, World

This is the first post of the SaaS Template blog.
```

**Step 2.5: 写入 `content/blog/hello-world.zh.md`**

```markdown
---
title: 你好，世界
description: 介绍 SaaS Template
date: 2026-10-12T00:00:00.000Z
published: true
locale: zh
---

# 你好，世界

这是 SaaS Template 博客的第一篇。
```

**Step 2.6: 写入 `content/changelog/2026-10-12-init.md`**

```markdown
---
title: Initial Release
date: 2026-10-12T00:00:00.000Z
summary: First public release of SaaS Template
locale: en
---

- Marketing site with 8 blocks
- Auth, payment, mail, newsletter, notification modules
- Stripe integration
```

**Step 2.7: 写入 `content/changelog/2026-10-12-init.zh.md`**

```markdown
---
title: 首次发布
date: 2026-10-12T00:00:00.000Z
summary: SaaS Template 首次公开版本
locale: zh
---

- 营销站点 8 个 blocks
- 认证、支付、邮件、订阅、通知模块
- Stripe 集成
```

**Step 2.8: 写入 `content/legal/terms.md`**

```markdown
---
title: Terms of Service
locale: en
---

# Terms of Service

By using SaaS Template, you agree to...
```

**Step 2.9: 写入 `content/legal/terms.zh.md`**

```markdown
---
title: 服务条款
locale: zh
---

# 服务条款

使用 SaaS Template 即代表你同意…
```

**Step 2.10: 写入 `content/legal/privacy.md`**

```markdown
---
title: Privacy Policy
locale: en
---

# Privacy Policy

We respect your privacy. This policy describes...
```

**Step 2.11: 写入 `content/legal/privacy.zh.md`**

```markdown
---
title: 隐私政策
locale: zh
---

# 隐私政策

我们尊重你的隐私。本政策说明…
```

**Step 2.12: 修改 `vite.config.ts` 追加 plugin**

在 plugins 数组里 `tsconfigPaths()` 之后追加 `contentCollections()`（保持原插件顺序；`tsconfigPaths` 必须在 `contentCollections` 之后）：

```ts
import contentCollections from '@content-collections/vite';

// plugins 数组内：
plugins: [
  cloudflare(),
  tanstackStart(),
  tailwindcss(),
  tsconfigPaths(),
  contentCollections(),
],
```

> 注意：原计划写「`contentCollections` 插在 `tailwindcss` 之后、`tsconfigPaths` 之前」是错的。`tsconfigPaths` 必须在最末位（否则路径别名对其他插件不可见）。`contentCollections` 放在 `tsconfigPaths` 之后即可。

**Step 2.13: 修改 `tsconfig.json`**

```jsonc
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "content-collections": ["./.content-collections/generated"]
    }
  }
}
```

**Step 2.14: 在 `package.json` scripts 追加**

```json
"content:build": "content-collections build"
```

**Step 2.15: 生成 collections**

```bash
pnpm run content:build
```

预期：`.content-collections/generated/` 创建。

**Step 2.16: 提交**

```bash
git add content-collections.ts content/ vite.config.ts tsconfig.json package.json .content-collections/generated
git commit -m "feat(content): Content Collections（docs/blog/changelog/legal）"
```

> 注意：`.content-collections/generated` 是构建产物，原计划忽略。本计划**提交它**以保证 dev 启动即可用；如要忽略请加进 `.gitignore`——选择提交更简单，存储代价可接受。

---

### Task 3: LocaleSwitcher 已存在 — 跳过 + 补 README

**Files:**
- Modify: `docs/agents/domain.md` 或 `CONTEXT.md`（仅说明 locale 解析机制已实现）

**说明：** `src/components/layout/LocaleSwitcher.tsx` 已在 Sub-Plan A 落地（见 `src/routes/__root.tsx` 的 header）。`src/lib/locale.ts`、`src/locale/middleware.ts` 同样已就位。**本任务不写代码**，只做事项确认。

**Step 3.1: 验证现有 locale 基础设施**

```bash
cat src/lib/locale.ts | head -30
```

确认导出：`Locale`、`defaultLocale`、`LOCALES`、`parseLocale`、`localeConfig`、`htmlLang`、`readCookieValue`。

**Step 3.2: 验证 LocaleSwitcher 已在 __root 用**

```bash
grep -n "LocaleSwitcher" src/routes/__root.tsx
```

**Step 3.3: 无 commit**

> 关键：所有营销页面的 locale 解析统一复用 `getLocale()` from `@/locale/paraglide/runtime.js`（与 `__root.tsx` 一致），不要重新实现 `getServerLocale()`。

---

### Task 4: 营销 layout（Navbar + 页脚）

**Files:**
- Create: `src/routes/{-$locale}/_layout/marketing.tsx`
- Create: `src/components/marketing/Navbar.tsx`
- Create: `src/components/marketing/Footer.tsx`
- Create: `src/components/marketing/MarketingLayout.tsx`

**Step 4.1: 写入 `src/components/marketing/Navbar.tsx`**

> **关键修正**（相对原计划）：不要 new `getServerLocale()`；用 `getLocale()` from Paraglide（已在 `__root.tsx` 用过）。`websiteConfig.metadata.name` 而非 `websiteConfig.name`。

```tsx
import { Link } from '@tanstack/react-router'
import { IconLanguage } from '@tabler/icons-react'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { websiteConfig } from '@/config/website'
import { getLocale } from '@/locale/paraglide/runtime.js'

export function Navbar() {
  const locale = getLocale()
  return (
    <nav className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur">
      <Link to="/{-$locale}" className="text-lg font-bold">
        {websiteConfig.metadata.name}
      </Link>
      <div className="flex items-center gap-6 text-sm">
        <Link
          to="/{-$locale}/features"
          activeProps={{ className: 'font-semibold text-foreground' }}
          className="text-muted-foreground hover:text-foreground"
        >
          {m.nav_features()}
        </Link>
        <Link
          to="/{-$locale}/pricing"
          activeProps={{ className: 'font-semibold text-foreground' }}
          className="text-muted-foreground hover:text-foreground"
        >
          {m.nav_pricing()}
        </Link>
        <Link
          to="/{-$locale}/blog"
          activeProps={{ className: 'font-semibold text-foreground' }}
          className="text-muted-foreground hover:text-foreground"
        >
          {m.nav_blog()}
        </Link>
        <Link
          to="/{-$locale}/docs"
          activeProps={{ className: 'font-semibold text-foreground' }}
          className="text-muted-foreground hover:text-foreground"
        >
          {m.nav_docs()}
        </Link>
        <Link
          to="/{-$locale}/changelog"
          activeProps={{ className: 'font-semibold text-foreground' }}
          className="text-muted-foreground hover:text-foreground"
        >
          {m.nav_changelog()}
        </Link>
        <Link
          to="/{-$locale}/contact"
          activeProps={{ className: 'font-semibold text-foreground' }}
          className="text-muted-foreground hover:text-foreground"
        >
          {m.nav_contact()}
        </Link>
        <LocaleSwitcher value={locale} />
        <Link
          to="/{-$locale}/auth/login"
          className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground"
        >
          {m.nav_login()}
        </Link>
      </div>
    </nav>
  )
}
```

**Step 4.2: 写入 `src/components/marketing/Footer.tsx`**

```tsx
import { Link } from '@tanstack/react-router'
import { websiteConfig } from '@/config/website'

export function Footer() {
  return (
    <footer className="border-t border-border px-6 py-8 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p>
          © {new Date().getFullYear()} {websiteConfig.metadata.name}. {m.footer_rights()}
        </p>
        <nav className="flex gap-4">
          <Link to="/{-$locale}/legal/terms" className="hover:text-foreground">
            {m.footer_terms()}
          </Link>
          <Link to="/{-$locale}/legal/privacy" className="hover:text-foreground">
            {m.footer_privacy()}
          </Link>
          <Link to="/{-$locale}/changelog" className="hover:text-foreground">
            {m.footer_changelog()}
          </Link>
        </nav>
      </div>
    </footer>
  )
}
```

**Step 4.3: 写入 `src/components/marketing/MarketingLayout.tsx`**

```tsx
import type { ReactNode } from 'react'
import { Footer } from './Footer'
import { Navbar } from './Navbar'

/**
 * 营销页统一 shell：顶部 Navbar + 内容 + 底部 Footer。
 * 由 `src/routes/{-$locale}/_layout/marketing.tsx` 路由文件包裹。
 */
export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
```

**Step 4.4: 写入 `src/routes/{-$locale}/_layout/marketing.tsx`**

```tsx
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'

export const Route = createFileRoute('/{-$locale}/_layout/marketing')({
  component: () => (
    <MarketingLayout>
      <Outlet />
    </MarketingLayout>
  ),
})
```

**Step 4.5: 在 `messages/{zh,en}.json` 追加新键**

`messages/zh.json`:
```json
"nav_features": "特性",
"nav_pricing": "价格",
"nav_blog": "博客",
"nav_docs": "文档",
"nav_changelog": "更新日志",
"nav_contact": "联系",
"nav_login": "登录",
"footer_rights": "保留所有权利",
"footer_terms": "服务条款",
"footer_privacy": "隐私政策",
"footer_changelog": "更新日志"
```

`messages/en.json`: 同样键，英文值（`"Features"`, `"Pricing"`, …）。

**Step 4.6: 验证 locale 编译**

```bash
pnpm run locale:check
```

**Step 4.7: Commit**

```bash
git add src/components/marketing src/routes/{-\$locale}/_layout messages
git commit -m "feat(marketing): 营销 layout（Navbar + Footer + 文案）"
```

---

### Task 5: Block - Hero

**Files:**
- Create: `src/components/sections/hero/Hero.tsx`
- Create: `src/components/sections/hero/types.ts`
- Create: `src/components/sections/hero/index.ts`

**Step 5.1: `src/components/sections/hero/types.ts`**

```ts
export interface HeroProps {
  title: string
  subtitle?: string
  description?: string
  primaryCta?: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
  image?: { src: string; alt: string }
  align?: 'left' | 'center'
}
```

**Step 5.2: `src/components/sections/hero/Hero.tsx`**

```tsx
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'
import type { HeroProps } from './types'

export function Hero(props: HeroProps) {
  const align = props.align ?? 'left'
  return (
    <section className={`mx-auto max-w-5xl px-6 py-20 ${align === 'center' ? 'text-center' : ''}`}>
      <h1 className="text-4xl font-bold tracking-tight md:text-6xl">{props.title}</h1>
      {props.subtitle && <p className="mt-4 text-lg text-muted-foreground">{props.subtitle}</p>}
      {props.description && (
        <p className="mt-2 text-base text-muted-foreground">{props.description}</p>
      )}
      {(props.primaryCta || props.secondaryCta) && (
        <div className={`mt-8 flex gap-3 ${align === 'center' ? 'justify-center' : ''}`}>
          {props.primaryCta && (
            <Button asChild>
              <Link to={props.primaryCta.href}>{props.primaryCta.label}</Link>
            </Button>
          )}
          {props.secondaryCta && (
            <Button asChild variant="outline">
              <Link to={props.secondaryCta.href}>{props.secondaryCta.label}</Link>
            </Button>
          )}
        </div>
      )}
      {props.image && (
        <img
          src={props.image.src}
          alt={props.image.alt}
          className="mt-10 rounded-lg border shadow-sm"
        />
      )}
    </section>
  )
}
```

**Step 5.3: `src/components/sections/hero/index.ts`**

```ts
export { Hero } from './Hero'
export type { HeroProps } from './types'
```

**Step 5.4: Commit**

```bash
git add src/components/sections/hero
git commit -m "feat(blocks): Hero block"
```

---

### Task 6: Block - Features

**Files:**
- Create: `src/components/sections/features/Features.tsx`
- Create: `src/components/sections/features/types.ts`
- Create: `src/components/sections/features/index.ts`

**Step 6.1: `types.ts`**

```ts
export interface FeatureItem {
  icon?: string
  title: string
  description: string
}
export interface FeaturesProps {
  title?: string
  subtitle?: string
  columns?: 2 | 3 | 4
  items: FeatureItem[]
}
```

**Step 6.2: `Features.tsx`**

```tsx
import type { FeaturesProps } from './types'

export function Features({ title, subtitle, columns = 3, items }: FeaturesProps) {
  const colClass = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }[columns]
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      {title && <h2 className="text-center text-3xl font-bold">{title}</h2>}
      {subtitle && (
        <p className="mt-2 text-center text-muted-foreground">{subtitle}</p>
      )}
      <div className={`mt-10 grid gap-6 ${colClass}`}>
        {items.map((f, i) => (
          <div key={i} className="rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

**Step 6.3: `index.ts`**

```ts
export { Features } from './Features'
export type { FeaturesProps, FeatureItem } from './types'
```

**Step 6.4: Commit**

```bash
git add src/components/sections/features
git commit -m "feat(blocks): Features block"
```

---

### Task 7: Block - Stats

**Files:**
- Create: `src/components/sections/stats/Stats.tsx`
- Create: `src/components/sections/stats/types.ts`
- Create: `src/components/sections/stats/index.ts`

**Step 7.1: `types.ts`**

```ts
export interface StatItem {
  value: string
  label: string
}
export interface StatsProps {
  items: StatItem[]
}
```

**Step 7.2: `Stats.tsx`**

```tsx
import type { StatsProps } from './types'

export function Stats({ items }: StatsProps) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <div className="grid grid-cols-2 gap-6 text-center md:grid-cols-4">
        {items.map((s, i) => (
          <div key={i}>
            <p className="text-3xl font-bold">{s.value}</p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

**Step 7.3: `index.ts`**

```ts
export { Stats } from './Stats'
export type { StatsProps, StatItem } from './types'
```

**Step 7.4: Commit**

```bash
git add src/components/sections/stats
git commit -m "feat(blocks): Stats block"
```

---

### Task 8: Block - Pricing

**Files:**
- Create: `src/components/sections/pricing/Pricing.tsx`
- Create: `src/components/sections/pricing/types.ts`
- Create: `src/components/sections/pricing/index.ts`

**Step 8.1: `types.ts`**

```ts
import type { ReactNode } from 'react'

export interface PricingPlan {
  id: string
  name: string
  description?: string
  /** 月付/年付/一次性价格；空数组表示 free 方案 */
  prices: Array<{
    amount: number // 以分为单位
    currency: string
    interval?: 'month' | 'year' | 'one_time'
    label?: string // 例如 "月付"
  }>
  features: string[]
  cta: { label: string; href: string }
  highlighted?: boolean
  badge?: string
}

export interface PricingProps {
  title?: string
  subtitle?: string
  plans: PricingPlan[]
  /** 渲染自定义 CTA（用于接 authClient + createCheckoutSession） */
  renderCta?: (plan: PricingPlan) => ReactNode
}
```

**Step 8.2: `Pricing.tsx`**

```tsx
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import type { PricingProps } from './types'

export function Pricing({ title, subtitle, plans, renderCta }: PricingProps) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      {title && <h2 className="text-center text-3xl font-bold">{title}</h2>}
      {subtitle && (
        <p className="mt-2 text-center text-muted-foreground">{subtitle}</p>
      )}
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`relative flex flex-col rounded-lg border p-6 ${
              plan.highlighted ? 'border-primary shadow-lg ring-2 ring-primary/20' : 'border-border'
            }`}
          >
            {plan.badge && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                {plan.badge}
              </span>
            )}
            <h3 className="text-xl font-semibold">{plan.name}</h3>
            {plan.description && (
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
            )}
            <div className="mt-4 space-y-1">
              {plan.prices.map((p, i) => (
                <p key={i} className="text-2xl font-bold">
                  {(p.amount / 100).toLocaleString('en-US', {
                    style: 'currency',
                    currency: p.currency.toUpperCase(),
                  })}
                  {p.interval && p.interval !== 'one_time' && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {' '}
                      /{p.interval === 'month' ? 'mo' : 'yr'}
                    </span>
                  )}
                </p>
              ))}
            </div>
            <ul className="mt-4 flex-1 space-y-2 text-sm">
              {plan.features.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden>✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              {renderCta ? (
                renderCta(plan)
              ) : (
                <Button asChild className="w-full">
                  <Link to={plan.cta.href}>{plan.cta.label}</Link>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

**Step 8.3: `index.ts`**

```ts
export { Pricing } from './Pricing'
export type { PricingProps, PricingPlan } from './types'
```

**Step 8.4: Commit**

```bash
git add src/components/sections/pricing
git commit -m "feat(blocks): Pricing block"
```

---

### Task 9: Block - FAQ

**Files:**
- Create: `src/components/sections/faq/Faq.tsx`
- Create: `src/components/sections/faq/types.ts`
- Create: `src/components/sections/faq/index.ts`

**Step 9.1: `types.ts`**

```ts
export interface FaqItem {
  question: string
  answer: string
}
export interface FaqProps {
  title?: string
  items: FaqItem[]
}
```

**Step 9.2: `Faq.tsx`**

```tsx
import type { FaqProps } from './types'

export function Faq({ title, items }: FaqProps) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      {title && <h2 className="text-center text-3xl font-bold">{title}</h2>}
      <div className="mt-8 space-y-4">
        {items.map((f, i) => (
          <details
            key={i}
            className="rounded border border-border p-4 open:bg-muted/50"
          >
            <summary className="cursor-pointer font-medium">{f.question}</summary>
            <p className="mt-2 text-sm text-muted-foreground">{f.answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
```

**Step 9.3: `index.ts`**

```ts
export { Faq } from './Faq'
export type { FaqProps, FaqItem } from './types'
```

**Step 9.4: Commit**

```bash
git add src/components/sections/faq
git commit -m "feat(blocks): Faq block"
```

---

### Task 10: Block - Testimonials

**Files:**
- Create: `src/components/sections/testimonials/Testimonials.tsx`
- Create: `src/components/sections/testimonials/types.ts`
- Create: `src/components/sections/testimonials/index.ts`

**Step 10.1: `types.ts`**

```ts
export interface Testimonial {
  quote: string
  author: string
  role?: string
  avatar?: string
}
export interface TestimonialsProps {
  title?: string
  items: Testimonial[]
}
```

**Step 10.2: `Testimonials.tsx`**

```tsx
import type { TestimonialsProps } from './types'

export function Testimonials({ title, items }: TestimonialsProps) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      {title && <h2 className="text-center text-3xl font-bold">{title}</h2>}
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {items.map((t, i) => (
          <figure key={i} className="rounded-lg border border-border p-6">
            <blockquote className="text-sm">“{t.quote}”</blockquote>
            <figcaption className="mt-4 text-sm font-medium">
              {t.author}
              {t.role && (
                <span className="text-muted-foreground"> · {t.role}</span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
```

**Step 10.3: `index.ts`**

```ts
export { Testimonials } from './Testimonials'
export type { TestimonialsProps, Testimonial } from './types'
```

**Step 10.4: Commit**

```bash
git add src/components/sections/testimonials
git commit -m "feat(blocks): Testimonials block"
```

---

### Task 11: Block - NewsletterCTA

**Files:**
- Create: `src/components/sections/newsletter-cta/NewsletterCta.tsx`
- Create: `src/components/sections/newsletter-cta/types.ts`
- Create: `src/components/sections/newsletter-cta/index.ts`

**Step 11.1: `types.ts`**

```ts
export interface NewsletterCtaProps {
  title: string
  description?: string
  placeholder?: string
  successMessage?: string
}
```

**Step 11.2: `NewsletterCta.tsx`**

> **关键修正**（相对原计划）：直接 POST 到已存在的 `/api/newsletter`（`src/routes/api/newsletter/$.ts`），不要新建 `subscribe.ts` 与 `newsletter-subscribe.ts`。Provider 选择交给服务端 `websiteConfig.newsletter.provider`（已由 Sub-Plan B 落地）。

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { m } from '@/locale/paraglide/messages.js'
import type { NewsletterCtaProps } from './types'

export function NewsletterCta({
  title,
  description,
  placeholder = 'you@example.com',
  successMessage,
}: NewsletterCtaProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  return (
    <section className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h2 className="text-3xl font-bold">{title}</h2>
      {description && <p className="mt-2 text-muted-foreground">{description}</p>}
      <form
        className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
        onSubmit={async (e) => {
          e.preventDefault()
          setStatus('loading')
          const email = (new FormData(e.currentTarget).get('email') as string) ?? ''
          try {
            const res = await fetch('/api/newsletter', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            })
            if (!res.ok) {
              setStatus('error')
              setError(m.newsletter_error())
              return
            }
            setStatus('success')
          } catch {
            setStatus('error')
            setError(m.newsletter_error())
          }
        }}
      >
        <Input
          name="email"
          type="email"
          required
          placeholder={placeholder}
          className="sm:max-w-xs"
        />
        <Button type="submit" disabled={status === 'loading'}>
          {m.newsletter_subscribe()}
        </Button>
      </form>
      {status === 'success' && (
        <p className="mt-3 text-sm text-green-600">
          {successMessage ?? m.newsletter_success()}
        </p>
      )}
      {status === 'error' && (
        <p className="mt-3 text-sm text-red-600">
          {m.newsletter_error()}: {error}
        </p>
      )}
    </section>
  )
}
```

**Step 11.3: `index.ts`**

```ts
export { NewsletterCta } from './NewsletterCta'
export type { NewsletterCtaProps } from './types'
```

**Step 11.4: 在 `messages/{zh,en}.json` 追加**

```json
"newsletter_subscribe": "订阅",
"newsletter_success": "已订阅",
"newsletter_error": "订阅失败"
```

**Step 11.5: Commit**

```bash
git add src/components/sections/newsletter-cta messages
git commit -m "feat(blocks): NewsletterCTA（复用 /api/newsletter 现有端点）"
```

---

### Task 12: Block - CTA

**Files:**
- Create: `src/components/sections/cta/Cta.tsx`
- Create: `src/components/sections/cta/types.ts`
- Create: `src/components/sections/cta/index.ts`

**Step 12.1: `types.ts`**

```ts
export interface CtaProps {
  title: string
  description?: string
  primaryCta: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
}
```

**Step 12.2: `Cta.tsx`**

```tsx
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import type { CtaProps } from './types'

export function Cta({ title, description, primaryCta, secondaryCta }: CtaProps) {
  return (
    <section className="bg-primary px-6 py-16 text-primary-foreground">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold">{title}</h2>
        {description && <p className="mt-2 opacity-90">{description}</p>}
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button asChild variant="secondary">
            <Link to={primaryCta.href}>{primaryCta.label}</Link>
          </Button>
          {secondaryCta && (
            <Button
              asChild
              variant="outline"
              className="border-primary-foreground text-primary-foreground"
            >
              <Link to={secondaryCta.href}>{secondaryCta.label}</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
```

**Step 12.3: `index.ts`**

```ts
export { Cta } from './Cta'
export type { CtaProps } from './types'
```

**Step 12.4: Commit**

```bash
git add src/components/sections/cta
git commit -m "feat(blocks): CTA block"
```

---

### Task 13: Block 注册表 + Blocks 共享类型

**Files:**
- Create: `src/components/sections/index.ts`

**Step 13.1: 写入 `src/components/sections/index.ts`**

```ts
import { Cta } from './cta'
import { Faq } from './faq'
import { Features } from './features'
import { Hero } from './hero'
import { NewsletterCta } from './newsletter-cta'
import { Stats } from './stats'
import { Testimonials } from './testimonials'

export const blocks = {
  Hero,
  Features,
  Stats,
  Faq,
  Testimonials,
  NewsletterCta,
  Cta,
} as const

export type BlockName = keyof typeof blocks

export { Cta, Faq, Features, Hero, NewsletterCta, Stats, Testimonials }

export type { HeroProps } from './hero'
export type { FeaturesProps, FeatureItem } from './features'
export type { StatsProps, StatItem } from './stats'
export type { FaqProps, FaqItem } from './faq'
export type { TestimonialsProps, Testimonial } from './testimonials'
export type { NewsletterCtaProps } from './newsletter-cta'
export type { CtaProps } from './cta'
```

> 注意：原计划列了 8 个 block 包含 `Pricing`，但 `Pricing` 不在首页 / 通用 block 中使用（价格页 `pricing.tsx` 自己组合）。本注册表省略 `Pricing`，让其从 `pricing/` 子目录独立 export；后续若要在首页快速展示价格摘要再加。

**Step 13.2: 单元测试（blocks 注册表 smoke）**

Create: `tests/unit/blocks.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { blocks } from '@/components/sections'

describe('blocks registry', () => {
  it('导出全部 7 个通用 blocks（不含 Pricing）', () => {
    expect(Object.keys(blocks).sort()).toEqual(
      ['Cta', 'Faq', 'Features', 'Hero', 'NewsletterCta', 'Stats', 'Testimonials'].sort(),
    )
  })
})
```

**Step 13.3: 测试**

```bash
pnpm run test
```

**Step 13.4: Commit**

```bash
git add src/components/sections/index.ts tests/unit/blocks.test.ts
git commit -m "feat(blocks): 营销 blocks 注册表 + 索引"
```

---

### Task 14: 首页与营销页面（含 Pricing 页）

**Files:**
- Create: `src/routes/{-$locale}/_layout/marketing/index.tsx`（首页）
- Create: `src/routes/{-$locale}/_layout/marketing/features.tsx`
- Create: `src/routes/{-$locale}/_layout/marketing/about.tsx`
- Create: `src/routes/{-$locale}/pricing.tsx`（**新增**：原 Plan B Task 14 推迟至此）
- Create: `src/config/pages/home.ts`
- Create: `src/config/pages/features.ts`
- Create: `src/config/pages/about.ts`
- Create: `src/config/pages/pricing.ts`
- Create: `src/config/pages/index.ts`

**Step 14.1: 写入 `src/config/pages/home.ts`**

> 文案通过 `m.*()` 而非硬编码。

```ts
import type { CtaProps, FeaturesProps, HeroProps, StatsProps, TestimonialsProps } from '@/components/sections'
import { m } from '@/locale/paraglide/messages.js'

export const homeBlocks = {
  Hero: {
    title: m.home_hero_title(),
    subtitle: m.home_hero_subtitle(),
    description: m.home_hero_description(),
    primaryCta: { label: m.home_hero_primary_cta(), href: '/auth/register' },
    secondaryCta: { label: m.home_hero_secondary_cta(), href: '/pricing' },
    align: 'center' as const,
  } satisfies HeroProps,
  Stats: {
    items: [
      { value: '7+', label: m.home_stats_modules() },
      { value: '< 100ms', label: m.home_stats_latency() },
      { value: '0', label: m.home_stats_cold_start() },
      { value: '$0', label: m.home_stats_free_tier() },
    ],
  } satisfies StatsProps,
  Features: {
    title: m.home_features_title(),
    columns: 3 as const,
    items: [
      { title: m.home_features_edge_title(), description: m.home_features_edge_description() },
      { title: m.home_features_payment_title(), description: m.home_features_payment_description() },
      { title: m.home_features_auth_title(), description: m.home_features_auth_description() },
      { title: m.home_features_storage_title(), description: m.home_features_storage_description() },
      { title: m.home_features_email_title(), description: m.home_features_email_description() },
      { title: m.home_features_i18n_title(), description: m.home_features_i18n_description() },
    ],
  } satisfies FeaturesProps,
  Testimonials: {
    title: m.home_testimonials_title(),
    items: [
      { quote: m.home_testimonial_1_quote(), author: m.home_testimonial_1_author() },
      { quote: m.home_testimonial_2_quote(), author: m.home_testimonial_2_author() },
      { quote: m.home_testimonial_3_quote(), author: m.home_testimonial_3_author() },
    ],
  } satisfies TestimonialsProps,
  Cta: {
    title: m.home_cta_title(),
    description: m.home_cta_description(),
    primaryCta: { label: m.home_cta_primary(), href: '/auth/register' },
  } satisfies CtaProps,
}
```

**Step 14.2: 写入 `src/config/pages/features.ts`**

```ts
import type { CtaProps, FaqProps, FeaturesProps, HeroProps } from '@/components/sections'
import { m } from '@/locale/paraglide/messages.js'

export const featuresBlocks = {
  Hero: {
    title: m.features_hero_title(),
    subtitle: m.features_hero_subtitle(),
  } satisfies HeroProps,
  Features: {
    title: m.features_section_title(),
    items: [
      { title: m.feature_auth_title(), description: m.feature_auth_description() },
      { title: m.feature_payment_title(), description: m.feature_payment_description() },
      { title: m.feature_storage_title(), description: m.feature_storage_description() },
      { title: m.feature_email_title(), description: m.feature_email_description() },
      { title: m.feature_newsletter_title(), description: m.feature_newsletter_description() },
      { title: m.feature_notification_title(), description: m.feature_notification_description() },
    ],
  } satisfies FeaturesProps,
  Faq: {
    title: m.features_faq_title(),
    items: [
      { question: m.features_faq_q1(), answer: m.features_faq_a1() },
      { question: m.features_faq_q2(), answer: m.features_faq_a2() },
    ],
  } satisfies FaqProps,
  Cta: {
    title: m.features_cta_title(),
    primaryCta: { label: m.features_cta_primary(), href: '/pricing' },
  } satisfies CtaProps,
}
```

**Step 14.3: 写入 `src/config/pages/about.ts`**

```ts
import type { CtaProps, HeroProps, StatsProps } from '@/components/sections'
import { m } from '@/locale/paraglide/messages.js'

export const aboutBlocks = {
  Hero: {
    title: m.about_hero_title(),
    subtitle: m.about_hero_subtitle(),
  } satisfies HeroProps,
  Stats: {
    items: [
      { value: '7+', label: m.about_stat_modules() },
      { value: '4+', label: m.about_stat_providers() },
      { value: 'zh/en', label: m.about_stat_i18n() },
    ],
  } satisfies StatsProps,
  Cta: {
    title: m.about_cta_title(),
    primaryCta: { label: m.about_cta_primary(), href: '/docs' },
  } satisfies CtaProps,
}
```

**Step 14.4: 写入 `src/config/pages/pricing.ts`**

```ts
import type { CtaProps, HeroProps, PricingPlan } from '@/components/sections/Pricing'
import { m } from '@/locale/paraglide/messages.js'

export const pricingPlans: PricingPlan[] = [
  {
    id: 'free',
    name: m.pricing_free_name(),
    description: m.pricing_free_description(),
    prices: [],
    features: [m.pricing_free_feature_1(), m.pricing_free_feature_2()],
    cta: { label: m.pricing_free_cta(), href: '/auth/register' },
  },
  {
    id: 'pro_monthly',
    name: m.pricing_pro_name(),
    description: m.pricing_pro_description(),
    prices: [{ amount: 1900, currency: 'USD', interval: 'month', label: m.pricing_per_month() }],
    features: [m.pricing_pro_feature_1(), m.pricing_pro_feature_2(), m.pricing_pro_feature_3()],
    cta: { label: m.pricing_pro_cta(), href: '/auth/register?plan=pro' },
    highlighted: true,
    badge: m.pricing_recommended(),
  },
  {
    id: 'lifetime',
    name: m.pricing_lifetime_name(),
    description: m.pricing_lifetime_description(),
    prices: [
      { amount: 29900, currency: 'USD', interval: 'one_time', label: m.pricing_one_time() },
    ],
    features: [m.pricing_lifetime_feature_1(), m.pricing_lifetime_feature_2()],
    cta: { label: m.pricing_lifetime_cta(), href: '/auth/register?plan=lifetime' },
  },
]

export const pricingBlocks = {
  Hero: {
    title: m.pricing_hero_title(),
    subtitle: m.pricing_hero_subtitle(),
  } satisfies HeroProps,
  Cta: {
    title: m.pricing_cta_title(),
    primaryCta: { label: m.pricing_cta_primary(), href: '/auth/register' },
  } satisfies CtaProps,
}
```

**Step 14.5: 写入 `src/config/pages/index.ts`**

```ts
export { homeBlocks } from './home'
export { featuresBlocks } from './features'
export { aboutBlocks } from './about'
export { pricingBlocks, pricingPlans } from './pricing'
```

**Step 14.6: 写入 `src/routes/{-$locale}/_layout/marketing/index.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Cta, Features, Hero, Stats, Testimonials } from '@/components/sections'
import { homeBlocks } from '@/config/pages'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/')({
  head: () => seo('/', { title: m.site_name(), description: m.site_description() }),
  component: HomePage,
})

function HomePage() {
  return (
    <>
      <Hero {...homeBlocks.Hero} />
      <Stats {...homeBlocks.Stats} />
      <Features {...homeBlocks.Features} />
      <Testimonials {...homeBlocks.Testimonials} />
      <Cta {...homeBlocks.Cta} />
    </>
  )
}
```

> 与原 `src/routes/index.tsx`（Sub-Plan A）冲突处理：本任务要么**删除 `src/routes/index.tsx`**，要么把 `Route = createFileRoute('/')` 替换成 `'/{-$locale}/_layout/marketing/'` 并重定向。本计划选择**删除** `src/routes/index.tsx`（因为新首页在 marketing layout 下，`/__root` 永远会先匹配 `/{-$locale}/_layout/marketing/` 的 index）。验证：`/` 与 `/{-$locale}/` 都应命中首页。

**Step 14.7: 写入 `src/routes/{-$locale}/_layout/marketing/features.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Cta, Faq, Features, Hero } from '@/components/sections'
import { featuresBlocks } from '@/config/pages'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/features')({
  head: () => seo('/features', { title: m.features_page_title(), description: m.features_page_description() }),
  component: FeaturesPage,
})

function FeaturesPage() {
  return (
    <>
      <Hero {...featuresBlocks.Hero} />
      <Features {...featuresBlocks.Features} />
      <Faq {...featuresBlocks.Faq} />
      <Cta {...featuresBlocks.Cta} />
    </>
  )
}
```

**Step 14.8: 写入 `src/routes/{-$locale}/_layout/marketing/about.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Cta, Hero, Stats } from '@/components/sections'
import { aboutBlocks } from '@/config/pages'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/about')({
  head: () => seo('/about', { title: m.about_page_title(), description: m.about_page_description() }),
  component: AboutPage,
})

function AboutPage() {
  return (
    <>
      <Hero {...aboutBlocks.Hero} />
      <Stats {...aboutBlocks.Stats} />
      <Cta {...aboutBlocks.Cta} />
    </>
  )
}
```

**Step 14.9: 写入 `src/routes/{-$locale}/pricing.tsx`**

> **新增**（Sub-Plan B Task 14 推迟至此）。**不放在 marketing layout 内**，避免双重 Navbar/Footer：直接利用 `__root.tsx` 现有 header，自带页头。

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Cta, Hero, Pricing } from '@/components/sections'
import { Pricing as PricingBlock } from '@/components/sections/Pricing'
import { pricingBlocks, pricingPlans } from '@/config/pages'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/pricing')({
  head: () => seo('/pricing', { title: m.pricing_page_title(), description: m.pricing_page_description() }),
  component: PricingPage,
})

function PricingPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Hero {...pricingBlocks.Hero} />
      <PricingBlock plans={pricingPlans} />
      <Cta {...pricingBlocks.Cta} />
    </main>
  )
}
```

> 注意：上面同时 import `Pricing` (from blocks index, exports both `Pricing` block and the type) — 实际只用了 `Pricing` 组件。删掉 `import { Cta, Hero, Pricing }` 中的 `Pricing` 即可。

**Step 14.10: 删除旧 `src/routes/index.tsx`**

```bash
git rm src/routes/index.tsx
```

**Step 14.11: 翻译键（`messages/{zh,en}.json`）**

为 `homeBlocks` / `featuresBlocks` / `aboutBlocks` / `pricingBlocks` 涉及的所有 `m.*()` 调用补全键（中英双语）。**键命名规则**：`<page>_<block>_<field>`。

> 这一步是机械翻译工作；按 Sub-Plan A 的 message-format 规范用现有 `messages/zh.json` 与 `messages/en.json` 增量补全即可。`pnpm run locale:check` 强制 base 键齐全（base = `zh`）。

**Step 14.12: Commit**

```bash
git add src/routes/{-\$locale} src/config/pages messages
git commit -m "feat(marketing): 首页/特性/关于/价格页面（blocks 拼装）"
```

---

### Task 15: 文档站（Content Collections + Slug 路由）

**Files:**
- Create: `src/routes/{-$locale}/_layout/marketing/docs/index.tsx`
- Create: `src/routes/{-$locale}/_layout/marketing/docs/$slug.tsx`
- Create: `src/components/docs/DocsSidebar.tsx`
- Create: `src/components/mdx/Mdx.tsx`
- Create: `src/styles/mdx.css`

**Step 15.1: 写入 `src/components/mdx/Mdx.tsx`**

> **关键修正**（相对原计划）：不安装 `react-router-dom`（错误包名，原计划已自我纠正）。
> MDX 渲染采用 Content Collections 的 `compileMDX` 集成在 build 时完成。本计划使用最简方案：
> - 把 markdown 内容作为字符串传入，**在客户端用最小 regex 渲染**（标题、段落、代码块、链接、列表）
> - 完整 MDX 解析（@mdx-js/rollup + rehype-pretty-code）推迟到 v0.2

```tsx
import { useMemo } from 'react'

/**
 * 最小 markdown 渲染：把 Content Collections 文档字符串转为 JSX。
 *
 * 支持：# / ## / ### 标题、代码块（```...```）、段落、行内 `code`、**bold**。
 * 不支持：图片、链接、列表、表格、HTML（v0.2 升级到 @mdx-js/rollup 后开启）。
 */
export function Mdx({ source }: { source: string }) {
  const blocks = useMemo(() => parseBlocks(source), [source])
  return (
    <div className="mdx prose max-w-3xl">
      {blocks.map((b, i) => {
        if (b.kind === 'h1') return <h1 key={i}>{b.text}</h1>
        if (b.kind === 'h2') return <h2 key={i}>{b.text}</h2>
        if (b.kind === 'h3') return <h3 key={i}>{b.text}</h3>
        if (b.kind === 'code') return <pre key={i}><code>{b.text}</code></pre>
        return <p key={i} dangerouslySetInnerHTML={{ __html: inline(b.text) }} />
      })}
    </div>
  )
}

interface Block {
  kind: 'h1' | 'h2' | 'h3' | 'code' | 'p'
  text: string
}

function parseBlocks(source: string): Block[] {
  const out: Block[] = []
  const lines = source.split('\n')
  let inCode = false
  let codeBuf: string[] = []
  let paraBuf: string[] = []

  function flushPara() {
    const text = paraBuf.join(' ').trim()
    if (text) out.push({ kind: 'p', text })
    paraBuf = []
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        out.push({ kind: 'code', text: codeBuf.join('\n') })
        codeBuf = []
        inCode = false
      } else {
        flushPara()
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }
    if (line.startsWith('### ')) {
      flushPara()
      out.push({ kind: 'h3', text: line.slice(4) })
    } else if (line.startsWith('## ')) {
      flushPara()
      out.push({ kind: 'h2', text: line.slice(3) })
    } else if (line.startsWith('# ')) {
      flushPara()
      out.push({ kind: 'h1', text: line.slice(2) })
    } else if (line.trim() === '') {
      flushPara()
    } else {
      paraBuf.push(line)
    }
  }
  flushPara()
  return out
}

function inline(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}
```

**Step 15.2: 写入 `src/styles/mdx.css`**

```css
.mdx { @apply max-w-3xl leading-7; }
.mdx h1 { @apply mt-8 mb-4 text-3xl font-bold; }
.mdx h2 { @apply mt-8 mb-3 text-2xl font-semibold; }
.mdx h3 { @apply mt-6 mb-2 text-xl font-semibold; }
.mdx p { @apply mb-4; }
.mdx code { @apply rounded bg-muted px-1 py-0.5 text-sm; }
.mdx pre { @apply mb-4 overflow-auto rounded bg-zinc-900 p-4 text-zinc-100; }
.mdx pre code { @apply bg-transparent p-0 text-sm; }
.mdx strong { @apply font-semibold; }
```

**Step 15.3: 写入 `src/components/docs/DocsSidebar.tsx`**

```tsx
import { Link } from '@tanstack/react-router'
import { allDocs } from 'content-collections'
import { getLocale } from '@/locale/paraglide/runtime.js'

export function DocsSidebar() {
  const locale = getLocale()
  const items = allDocs
    .filter((d) => d.locale === locale)
    .sort((a, b) => a.order - b.order)
  return (
    <nav className="w-56 border-r border-border p-4 text-sm">
      <ul className="space-y-2">
        {items.map((d) => (
          <li key={d._meta.path}>
            <Link
              to="/{-$locale}/docs/$slug"
              params={{ slug: d._meta.path }}
              activeProps={{ className: 'font-semibold' }}
              className="hover:underline"
            >
              {d.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
```

**Step 15.4: 写入 `src/routes/{-$locale}/_layout/marketing/docs/index.tsx`**

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { allDocs } from 'content-collections'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/docs/')({
  beforeLoad: () => {
    const locale = getLocale()
    const first = allDocs
      .filter((d) => d.locale === locale)
      .sort((a, b) => a.order - b.order)[0]
    if (!first) return
    throw redirect({
      to: '/{-$locale}/docs/$slug',
      params: { slug: first._meta.path },
    })
  },
  component: () => null,
})
```

**Step 15.5: 写入 `src/routes/{-$locale}/_layout/marketing/docs/$slug.tsx`**

```tsx
import { createFileRoute, notFound } from '@tanstack/react-router'
import { allDocs } from 'content-collections'
import { DocsSidebar } from '@/components/docs/DocsSidebar'
import { Mdx } from '@/components/mdx/Mdx'
import { getLocale } from '@/locale/paraglide/runtime.js'
import { seo } from '@/lib/seo'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/docs/$slug')({
  beforeLoad: ({ params }) => {
    const locale = getLocale()
    const doc = allDocs.find(
      (d) => d._meta.path === params.slug && d.locale === locale,
    )
    if (!doc) throw notFound()
    return { doc }
  },
  loader: ({ context }) => {
    const doc = context.doc
    return {
      title: doc.title,
      description: doc.description,
    }
  },
  head: ({ loaderData }) =>
    loaderData
      ? seo(`/docs/${loaderData.title}`, {
          title: loaderData.title,
          description: loaderData.description,
          type: 'article',
        })
      : undefined,
  component: DocPage,
})

function DocPage() {
  const { doc } = Route.useRouteContext()
  return (
    <div className="flex min-h-screen">
      <DocsSidebar />
      <article className="flex-1 px-8 py-10">
        <h1 className="text-3xl font-bold">{doc.title}</h1>
        <p className="mt-2 text-muted-foreground">{doc.description}</p>
        <hr className="my-6 border-border" />
        <Mdx source={doc.content} />
      </article>
    </div>
  )
}
```

**Step 15.6: Commit**

```bash
git add src/components/docs src/components/mdx src/styles/mdx.css src/routes/{-\$locale}/_layout/marketing/docs
git commit -m "feat(docs): 文档站（Content Collections + 侧栏 + 最小 markdown 渲染）"
```

---

### Task 16: 博客列表与详情

**Files:**
- Create: `src/routes/{-$locale}/_layout/marketing/blog/index.tsx`
- Create: `src/routes/{-$locale}/_layout/marketing/blog/$slug.tsx`
- Create: `src/components/blog/PostCard.tsx`
- Create: `src/components/blog/types.ts`

**Step 16.1: 写入 `src/components/blog/types.ts`**

```ts
export interface Post {
  slug: string
  title: string
  description: string
  date: string
}
```

**Step 16.2: 写入 `src/components/blog/PostCard.tsx`**

```tsx
import { Link } from '@tanstack/react-router'
import type { Post } from './types'

export function PostCard({ post }: { post: Post }) {
  return (
    <Link
      to="/{-$locale}/blog/$slug"
      params={{ slug: post.slug }}
      className="block rounded border border-border p-4 hover:bg-muted/40"
    >
      <p className="text-xs text-muted-foreground">
        {new Date(post.date).toLocaleDateString()}
      </p>
      <h3 className="mt-1 text-lg font-semibold">{post.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{post.description}</p>
    </Link>
  )
}
```

**Step 16.3: 写入 `src/routes/{-$locale}/_layout/marketing/blog/index.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { allBlogs } from 'content-collections'
import { PostCard } from '@/components/blog/PostCard'
import { getLocale } from '@/locale/paraglide/runtime.js'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/blog/')({
  head: () => seo('/blog', { title: m.blog_page_title(), description: m.blog_page_description() }),
  component: BlogIndex,
})

function BlogIndex() {
  const locale = getLocale()
  const posts = allBlogs
    .filter((p) => p.locale === locale && p.published)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .map((p) => ({
      slug: p._meta.path,
      title: p.title,
      description: p.description,
      date: p.date,
    }))
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold">{m.blog_page_title()}</h1>
      <div className="mt-6 grid gap-4">
        {posts.map((p) => (
          <PostCard key={p.slug} post={p} />
        ))}
      </div>
    </main>
  )
}
```

**Step 16.4: 写入 `src/routes/{-$locale}/_layout/marketing/blog/$slug.tsx`**

```tsx
import { createFileRoute, notFound } from '@tanstack/react-router'
import { allBlogs } from 'content-collections'
import { Mdx } from '@/components/mdx/Mdx'
import { getLocale } from '@/locale/paraglide/runtime.js'
import { seo } from '@/lib/seo'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/blog/$slug')({
  beforeLoad: ({ params }) => {
    const locale = getLocale()
    const post = allBlogs.find(
      (p) => p._meta.path === params.slug && p.locale === locale && p.published,
    )
    if (!post) throw notFound()
    return { post }
  },
  loader: ({ context }) => ({
    title: context.post.title,
    description: context.post.description,
  }),
  head: ({ loaderData }) =>
    seo(`/blog/${loaderData?.title}`, {
      title: loaderData?.title ?? '',
      description: loaderData?.description,
      type: 'article',
    }),
  component: BlogPost,
})

function BlogPost() {
  const { post } = Route.useRouteContext()
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-sm text-muted-foreground">
        {new Date(post.date).toLocaleDateString()}
      </p>
      <h1 className="mt-2 text-4xl font-bold">{post.title}</h1>
      <p className="mt-2 text-lg text-muted-foreground">{post.description}</p>
      <hr className="my-6 border-border" />
      <Mdx source={post.content} />
    </main>
  )
}
```

**Step 16.5: Commit**

```bash
git add src/components/blog src/routes/{-\$locale}/_layout/marketing/blog
git commit -m "feat(blog): 列表 + 详情页"
```

---

### Task 17: 更新日志

**Files:**
- Create: `src/routes/{-$locale}/_layout/marketing/changelog/index.tsx`

**Step 17.1: 写入 `src/routes/{-$locale}/_layout/marketing/changelog/index.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { allChangelogs } from 'content-collections'
import { Mdx } from '@/components/mdx/Mdx'
import { getLocale } from '@/locale/paraglide/runtime.js'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/changelog/')({
  head: () => seo('/changelog', { title: m.changelog_page_title(), description: m.changelog_page_description() }),
  component: ChangelogPage,
})

function ChangelogPage() {
  const locale = getLocale()
  const entries = allChangelogs
    .filter((c) => c.locale === locale)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold">{m.changelog_page_title()}</h1>
      <div className="mt-8 space-y-10">
        {entries.map((c) => (
          <article key={c._meta.path}>
            <p className="text-sm text-muted-foreground">
              {new Date(c.date).toLocaleDateString()}
            </p>
            <h2 className="mt-1 text-2xl font-semibold">{c.title}</h2>
            <p className="mt-1 text-sm">{c.summary}</p>
            <Mdx source={c.content} />
          </article>
        ))}
      </div>
    </main>
  )
}
```

**Step 17.2: Commit**

```bash
git add src/routes/{-\$locale}/_layout/marketing/changelog
git commit -m "feat(changelog): 更新日志页"
```

---

### Task 18: Legal 页面（动态 slug）

**Files:**
- Create: `src/routes/{-$locale}/_layout/marketing/legal/$slug.tsx`

**Step 18.1: 写入 `src/routes/{-$locale}/_layout/marketing/legal/$slug.tsx`**

```tsx
import { createFileRoute, notFound } from '@tanstack/react-router'
import { allLegals } from 'content-collections'
import { Mdx } from '@/components/mdx/Mdx'
import { getLocale } from '@/locale/paraglide/runtime.js'
import { seo } from '@/lib/seo'

export const Route = createFileRoute('/{-$locale}/_layout/marketing/legal/$slug')({
  beforeLoad: ({ params }) => {
    const locale = getLocale()
    // slug 解析约定：URL `/legal/terms` 命中 `terms.md` 或 `terms.zh.md`，按当前 locale 优先。
    const legal = allLegals.find((l) => {
      const path = l._meta.path
      return (
        (path === `${params.slug}.md` || path === `${params.slug}.${locale}.md`) &&
        l.locale === locale
      )
    })
    if (!legal) throw notFound()
    return { legal }
  },
  loader: ({ context }) => ({ title: context.legal.title }),
  head: ({ loaderData }) =>
    seo(`/legal/${loaderData?.title}`, { title: loaderData?.title ?? '', type: 'article' }),
  component: LegalPage,
})

function LegalPage() {
  const { legal } = Route.useRouteContext()
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold">{legal.title}</h1>
      <hr className="my-6 border-border" />
      <Mdx source={legal.content} />
    </main>
  )
}
```

**Step 18.2: Commit**

```bash
git add src/routes/{-\$locale}/_layout/marketing/legal
git commit -m "feat(legal): 服务条款与隐私政策页"
```

---

### Task 19: SEO（per-locale sitemap + robots + JSON-LD + hreflang）

**Files:**
- Create: `src/routes/sitemap[.]xml.ts`
- Create: `src/routes/robots[.]txt.ts`
- Create: `src/lib/json-ld.ts`
- Create: `src/lib/hreflang.ts`
- Create: `src/components/JsonLd.tsx`

**Step 19.1: 写入 `src/lib/hreflang.ts`**

> 关键：使用 `getBaseUrl()` from `@/lib/urls`（Sub-Plan A 已存在），不要写 `websiteConfig.url`。

```ts
import { getBaseUrl, getCanonicalUrl } from '@/lib/urls'
import { LOCALES, localeConfig, type Locale } from '@/lib/locale'

export interface AlternateLink {
  hreflang: string
  href: string
}

export function getAlternateLinks(pathname: string): AlternateLink[] {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`
  const base = getBaseUrl()
  return [
    { hreflang: 'x-default', href: `${base}${normalized}` },
    ...LOCALES.map((l: Locale) => ({
      hreflang: localeConfig[l].hreflang,
      href: `${base}/${l}${normalized === '/' ? '' : normalized}`,
    })),
  ]
}
```

**Step 19.2: 写入 `src/routes/sitemap[.]xml.ts`**

> 文件名转义：TanStack Router 把方括号内字符视为字面量，因此 `sitemap[.]xml.ts` 解析为 `sitemap.xml` 路径而不是嵌套路由。

```ts
import { createFileRoute } from '@tanstack/react-router'
import { allBlogs, allChangelogs, allDocs } from 'content-collections'
import { LOCALES } from '@/lib/locale'
import { getBaseUrl } from '@/lib/urls'

const STATIC_PATHS = [
  '/',
  '/features',
  '/pricing',
  '/about',
  '/contact',
  '/blog',
  '/docs',
  '/changelog',
  '/legal/terms',
  '/legal/privacy',
] as const

export const Route = createFileRoute('/sitemap[.]xml')({
  server: {
    handlers: {
      GET: () => {
        const base = getBaseUrl().replace(/\/$/, '')
        const urls: Array<{ loc: string; alternates: string }> = []
        for (const path of STATIC_PATHS) {
          for (const l of LOCALES) {
            const loc = `${base}/${l}${path === '/' ? '' : path}`
            const alternates = LOCALES
              .map(
                (al) =>
                  `<xhtml:link rel="alternate" hreflang="${al}" href="${base}/${al}${path === '/' ? '' : path}"/>`,
              )
              .join('')
            urls.push({ loc, alternates })
          }
        }
        // 动态内容（每 locale 过滤；slug 不重复加 locale 前缀以避免与 __root 解析冲突）
        for (const l of LOCALES) {
          for (const p of allBlogs.filter((b) => b.locale === l)) {
            urls.push({ loc: `${base}/${l}/blog/${p._meta.path}`, alternates: '' })
          }
          for (const d of allDocs.filter((d) => d.locale === l)) {
            urls.push({ loc: `${base}/${l}/docs/${d._meta.path}`, alternates: '' })
          }
          for (const c of allChangelogs.filter((c) => c.locale === l)) {
            urls.push({ loc: `${base}/${l}/changelog#${c._meta.path}`, alternates: '' })
          }
        }
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls
  .map(
    (u) =>
      `<url><loc>${u.loc}</loc>${u.alternates}<changefreq>weekly</changefreq></url>`,
  )
  .join('\n')}
</urlset>`
        return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
      },
    },
  },
})
```

**Step 19.3: 写入 `src/routes/robots[.]txt.ts`**

```ts
import { createFileRoute } from '@tanstack/react-router'
import { getBaseUrl } from '@/lib/urls'

export const Route = createFileRoute('/robots[.]txt')({
  server: {
    handlers: {
      GET: () => {
        const base = getBaseUrl().replace(/\/$/, '')
        const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /dashboard/
Disallow: /admin/
Sitemap: ${base}/sitemap.xml
`
        return new Response(body, { headers: { 'Content-Type': 'text/plain' } })
      },
    },
  },
})
```

**Step 19.4: 写入 `src/lib/json-ld.ts`**

> 关键：使用 `websiteConfig.metadata.name` 与 `getBaseUrl()`。

```ts
import { getBaseUrl } from '@/lib/urls'
import { websiteConfig } from '@/config/website'

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: websiteConfig.metadata.name,
    url: getBaseUrl(),
    logo: `${getBaseUrl()}/icon.png`,
  }
}

export function softwareApplicationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: websiteConfig.metadata.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
  }
}

export function breadcrumbJsonLd(items: Array<{ name: string; href: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${getBaseUrl()}${it.href}`,
    })),
  }
}

export function articleJsonLd(opts: {
  title: string
  description: string
  date: string
  author?: string
  path: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.title,
    description: opts.description,
    datePublished: opts.date,
    author: { '@type': 'Person', name: opts.author ?? websiteConfig.metadata.name },
    url: `${getBaseUrl()}${opts.path}`,
  }
}
```

**Step 19.5: 写入 `src/components/JsonLd.tsx`**

```tsx
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD 必须内联
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}
```

**Step 19.6: 在 `__root.tsx` 的 head 注入 Organization JSON-LD + hreflang**

修改 `src/routes/__root.tsx`：

```tsx
import { JsonLd } from '@/components/JsonLd'
import { organizationJsonLd } from '@/lib/json-ld'
import { getAlternateLinks } from '@/lib/hreflang'
import { useRouterState } from '@tanstack/react-router'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => {
    const pathname = useRouterState({ select: (s) => s.location.pathname })
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: m.site_name() },
        { name: 'description', content: m.site_description() },
      ],
      links: [
        { rel: 'stylesheet', href: globalsCss },
        ...getAlternateLinks(pathname).map((a) => ({
          rel: 'alternate',
          hrefLang: a.hreflang,
          href: a.href,
        })),
      ],
    }
  },
  // ... 其余不变
})
```

> 注意：TanStack Router 的 `head()` 是同步函数（运行于组件外），不能直接用 `useRouterState`。改用**全局** hreflang 注入（不依赖路径）。另一种方案是每条路由自己调用 `seo()` 时附 `alternates`。本计划选择**在 `seo()` 中加 alternates 字段**——避免 `head()` 内的 hook 调用。

**Step 19.7: 改 `seo()` 支持 alternates**

> 这一步是已有 `src/lib/seo.ts` 的扩展（向后兼容）。

修改 `src/lib/seo.ts`：

```ts
import { getBaseUrl, getCanonicalUrl, normalizeLeadingSlash } from '@/lib/urls'
import { LOCALES, localeConfig, type Locale } from '@/lib/locale'

interface SeoOptions {
  title: string
  description?: string
  image?: string
  type?: 'website' | 'article'
  /** 当前 locale，用于 hreflang 输出；省略则不输出 alternates。 */
  locale?: Locale
}

export function seo(path: string, options: SeoOptions) {
  const url = getCanonicalUrl(path)
  const image = options.image ? toAbsoluteUrl(options.image) : undefined
  const alternates = options.locale
    ? LOCALES.filter((l) => l !== options.locale).map((l) => ({
        rel: 'alternate',
        hreflang: localeConfig[l].hreflang,
        href: `${getBaseUrl()}/${l}${path === '/' ? '' : path}`,
      }))
    : []

  return {
    meta: [
      { title: options.title },
      ...(options.description ? [{ name: 'description', content: options.description }] : []),
      { property: 'og:title', content: options.title },
      { property: 'og:type', content: options.type ?? 'website' },
      { property: 'og:url', content: url },
      ...(options.description
        ? [{ property: 'og:description', content: options.description }]
        : []),
      ...(image ? [{ property: 'og:image', content: image }] : []),
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [
      { rel: 'canonical', href: url },
      ...alternates,
    ],
  }
}
```

**Step 19.8: 在 `__root.tsx` 注入 Organization JSON-LD**

> 通过 `head.links` 或 `head.meta` 注入 JSON-LD 不够灵活。在 `RootDocument` 组件里直接渲染 `<JsonLd>`（已用 `HeadContent` 自动合并 `head()` 输出，JSON-LD 放 body 也可被 Google 读取）。

修改 `src/routes/__root.tsx` 的 `RootDocument`：

```tsx
function RootDocument({ children }: { children: ReactNode }) {
  const locale = getLocale()
  return (
    <html lang={htmlLang(locale)}>
      <head>
        <HeadContent />
      </head>
      <body>
        <JsonLd data={organizationJsonLd()} />
        {children}
        <Scripts />
      </body>
    </html>
  )
}
```

**Step 19.9: 在 docs / blog / changelog / legal 路由注入 BreadcrumbList + Article**

以 `docs/$slug.tsx` 为例，在 `component` 函数中渲染 `<JsonLd>`：

```tsx
function DocPage() {
  const { doc } = Route.useRouteContext()
  const breadcrumbs = [
    { name: m.crumb_home(), href: '/' },
    { name: m.crumb_docs(), href: '/docs' },
    { name: doc.title, href: `/docs/${doc._meta.path}` },
  ]
  return (
    <div className="flex min-h-screen">
      <DocsSidebar />
      <article className="flex-1 px-8 py-10">
        <JsonLd
          data={[
            breadcrumbJsonLd(breadcrumbs),
            articleJsonLd({
              title: doc.title,
              description: doc.description,
              date: new Date().toISOString(),
              path: `/docs/${doc._meta.path}`,
            }),
          ]}
        />
        <h1 className="text-3xl font-bold">{doc.title}</h1>
        <p className="mt-2 text-muted-foreground">{doc.description}</p>
        <hr className="my-6 border-border" />
        <Mdx source={doc.content} />
      </article>
    </div>
  )
}
```

> blog / changelog 路由同样模式：在 component 中加 `<JsonLd data={[breadcrumbJsonLd(...), articleJsonLd(...)]} />`。

**Step 19.10: 翻译键（`messages/{zh,en}.json`）**

```json
"crumb_home": "首页",
"crumb_docs": "文档",
"crumb_blog": "博客"
```

**Step 19.11: Commit**

```bash
git add src/routes/sitemap[.]xml.ts src/routes/robots[.]txt.ts src/lib src/components/JsonLd.tsx src/routes/__root.tsx src/lib/seo.ts messages
git commit -m "feat(seo): per-locale sitemap + hreflang + BreadcrumbList/Article JSON-LD"
```

---

### Task 20: PWA manifest（仅 manifest，不含 service worker）

**Files:**
- Create: `public/manifest.json`
- Create: `public/icon.svg`（占位；SVG 而非 PNG，避免二进制）
- Modify: `src/routes/__root.tsx`（注入 manifest link）

> **设计依据**：spec §17 显式 YAGNI Service Worker（边缘 SSR + Cloudflare CDN 已经覆盖缓存场景；SW 不会经过 SSR 响应，仅对静态资源有效，与"0 冷启动"目标矛盾）。本期只接 `manifest.json`，不写 `sw.js`、不注册 service worker。

**Step 20.1: 写入 `public/manifest.json`**

```json
{
  "name": "SaaS Template",
  "short_name": "SaaS",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0070f3",
  "icons": [
    { "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml" }
  ]
}
```

**Step 20.2: 写入 `public/icon.svg`（最小占位）**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" fill="#0070f3"/>
  <text x="50%" y="55%" font-size="96" font-family="sans-serif" fill="#fff" text-anchor="middle" dominant-baseline="middle">S</text>
</svg>
```

**Step 20.3: 在 `src/routes/__root.tsx` 注入 manifest link**

修改 `head()` 返回的 `links`：

```ts
links: [
  { rel: 'stylesheet', href: globalsCss },
  { rel: 'manifest', href: '/manifest.json' },
  { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
],
```

并在 `<head>` 加：

```tsx
<meta name="theme-color" content="#0070f3" />
```

**Step 20.4: 提交**

```bash
git add public/manifest.json public/icon.svg src/routes/__root.tsx
git commit -m "feat(pwa): manifest + SVG 占位图标（不含 service worker）"
```

---

### Task 21: Analytics（多 provider，按 env 启用）

**Files:**
- Create: `src/lib/analytics/types.ts`
- Create: `src/lib/analytics/ga.ts`
- Create: `src/lib/analytics/plausible.ts`
- Create: `src/lib/analytics/umami.ts`
- Create: `src/lib/analytics/clarity.ts`
- Create: `src/lib/analytics/index.ts`
- Create: `src/components/AnalyticsProvider.tsx`

> **关键修正**：本计划**不实现 CSP nonce**（Sub-Plan D 依赖）；env schema 也不引入 nonce 字段。

**Step 21.1: 扩展 `src/env/public.ts`：追加 analytics 字段**

> 原 publicEnv 只有 `VITE_PAYMENT_PROVIDER` 等；本任务新增 4 个 `VITE_*` analytics 字段。

修改 `src/env/public.ts`：

```ts
import { z } from 'zod'

const schema = z.object({
  VITE_BASE_URL: z.string().url(),
  VITE_PAYMENT_PROVIDER: z.enum(['stripe']),
  VITE_GA_ID: z.string().optional(),
  VITE_PLAUSIBLE_DOMAIN: z.string().optional(),
  VITE_UMAMI_WEBSITE_ID: z.string().optional(),
  VITE_CLARITY_PROJECT_ID: z.string().optional(),
})

export const publicEnv = schema.parse(import.meta.env)
```

**Step 21.2: 写入 `src/lib/analytics/types.ts`**

```ts
export type AnalyticsEvent = {
  name: string
  params?: Record<string, string | number | boolean>
}

export type AnalyticsProviderName = 'ga' | 'plausible' | 'umami' | 'clarity'

export interface AnalyticsProvider {
  track(event: AnalyticsEvent): void
  page(path: string): void
}
```

**Step 21.3: 写入 `src/lib/analytics/ga.ts`**

```ts
import type { AnalyticsEvent, AnalyticsProvider } from './types'

export class GAAnalyticsProvider implements AnalyticsProvider {
  constructor(private readonly measurementId: string) {}

  track(event: AnalyticsEvent) {
    const gtag = (window as unknown as { gtag?: (a: string, b: string, c?: object) => void })
      .gtag
    if (typeof window === 'undefined' || typeof gtag !== 'function') return
    gtag('event', event.name, event.params)
  }

  page(path: string) {
    const gtag = (window as unknown as { gtag?: (a: string, b: string, c?: object) => void })
      .gtag
    if (typeof window === 'undefined' || typeof gtag !== 'function') return
    gtag('event', 'page_view', { page_path: path })
  }
}
```

**Step 21.4: 写入 `src/lib/analytics/plausible.ts`**

```ts
import type { AnalyticsEvent, AnalyticsProvider } from './types'

export class PlausibleAnalyticsProvider implements AnalyticsProvider {
  constructor(private readonly domain: string) {}

  track(event: AnalyticsEvent) {
    const plausible = (
      window as unknown as { plausible?: (a: string, b?: object) => void }
    ).plausible
    if (typeof window === 'undefined' || typeof plausible !== 'function') return
    plausible(event.name, { props: event.params })
  }

  page(path: string) {
    const plausible = (
      window as unknown as { plausible?: (a: string, b?: object) => void }
    ).plausible
    if (typeof window === 'undefined' || typeof plausible !== 'function') return
    plausible('pageview', { u: path })
  }
}
```

**Step 21.5: 写入 `src/lib/analytics/umami.ts`**

```ts
import type { AnalyticsEvent, AnalyticsProvider } from './types'

export class UmamiAnalyticsProvider implements AnalyticsProvider {
  constructor(private readonly websiteId: string) {}

  track(event: AnalyticsEvent) {
    const umami = (window as unknown as { umami?: (a: string, b?: object) => void }).umami
    if (typeof window === 'undefined' || typeof umami !== 'function') return
    umami(event.name, event.params)
  }

  page(_path: string) {
    // Umami 自动追踪 pageview，无需手动触发
  }
}
```

**Step 21.6: 写入 `src/lib/analytics/clarity.ts`**

```ts
import type { AnalyticsEvent, AnalyticsProvider } from './types'

export class ClarityAnalyticsProvider implements AnalyticsProvider {
  constructor(private readonly projectId: string) {}

  track(event: AnalyticsEvent) {
    const clarity = (window as unknown as { clarity?: (a: string, b: string) => void })
      .clarity
    if (typeof window === 'undefined' || typeof clarity !== 'function') return
    clarity('event', event.name)
  }

  page(_path: string) {
    // Clarity 自动追踪
  }
}
```

**Step 21.7: 写入 `src/lib/analytics/index.ts`**

```ts
import type { AnalyticsEvent, AnalyticsProvider, AnalyticsProviderName } from './types'
import { GAAnalyticsProvider } from './ga'
import { PlausibleAnalyticsProvider } from './plausible'
import { UmamiAnalyticsProvider } from './umami'
import { ClarityAnalyticsProvider } from './clarity'

const providers: AnalyticsProvider[] = []
let initialized = false

/**
 * 初始化 analytics：按 `VITE_GA_ID` / `VITE_PLAUSIBLE_DOMAIN` 等实际配置启用。
 * 缺哪个就不注入对应 script 与 provider；调用 `track` / `page` 是空操作。
 */
export function initAnalytics() {
  if (initialized) return
  initialized = true

  if (import.meta.env.VITE_GA_ID) {
    providers.push(new GAAnalyticsProvider(import.meta.env.VITE_GA_ID))
    injectScript(`https://www.googletagmanager.com/gtag/js?id=${import.meta.env.VITE_GA_ID}`)
    ;(window as unknown as { dataLayer: unknown[] }).dataLayer =
      (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []
    const gtag = function gtag(...args: unknown[]) {
      ;((window as unknown as { dataLayer: unknown[] }).dataLayer).push(args)
    }
    ;(window as unknown as { gtag: typeof gtag }).gtag = gtag
    gtag('js', new Date())
  }
  if (import.meta.env.VITE_PLAUSIBLE_DOMAIN) {
    providers.push(new PlausibleAnalyticsProvider(import.meta.env.VITE_PLAUSIBLE_DOMAIN))
    injectScript('https://plausible.io/js/script.js', {
      'data-domain': import.meta.env.VITE_PLAUSIBLE_DOMAIN,
    })
  }
  if (import.meta.env.VITE_UMAMI_WEBSITE_ID) {
    providers.push(new UmamiAnalyticsProvider(import.meta.env.VITE_UMAMI_WEBSITE_ID))
    injectScript('https://umami.example.com/script.js', {
      'data-website-id': import.meta.env.VITE_UMAMI_WEBSITE_ID,
    })
  }
  if (import.meta.env.VITE_CLARITY_PROJECT_ID) {
    providers.push(new ClarityAnalyticsProvider(import.meta.env.VITE_CLARITY_PROJECT_ID))
    injectScript(`https://www.clarity.ms/tag/${import.meta.env.VITE_CLARITY_PROJECT_ID}`)
  }
}

function injectScript(src: string, attrs: Record<string, string> = {}) {
  if (typeof document === 'undefined') return
  const s = document.createElement('script')
  s.src = src
  s.async = true
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v)
  document.head.appendChild(s)
}

export function track(event: AnalyticsEvent) {
  for (const p of providers) p.track(event)
}

export function page(path: string) {
  for (const p of providers) p.page(path)
}

export type { AnalyticsEvent, AnalyticsProvider, AnalyticsProviderName }
```

**Step 21.8: 写入 `src/components/AnalyticsProvider.tsx`**

```tsx
import { useEffect, type ReactNode } from 'react'
import { useRouter } from '@tanstack/react-router'
import { initAnalytics, page } from '@/lib/analytics'

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  useEffect(() => {
    initAnalytics()
    return router.subscribe('onLoad', ({ toLocation }) => page(toLocation.pathname))
  }, [router])
  return <>{children}</>
}
```

**Step 21.9: 在 `src/routes/__root.tsx` 包裹**

修改 `RootComponent`：

```tsx
function RootComponent() {
  const { queryClient } = Route.useRouteContext()
  const locale = getLocale()
  return (
    <QueryClientProvider client={queryClient}>
      <AnalyticsProvider>
        <header className="flex items-center justify-between border-b border-border px-6 py-3">
          <span className="text-sm font-medium text-foreground">{m.site_title()}</span>
          <LocaleSwitcher value={locale} />
        </header>
        <Outlet />
      </AnalyticsProvider>
    </QueryClientProvider>
  )
}
```

**Step 21.10: Commit**

```bash
git add src/lib/analytics src/components/AnalyticsProvider.tsx src/env/public.ts src/routes/__root.tsx
git commit -m "feat(analytics): GA/Plausible/Umami/Clarity 多 provider（env 驱动）"
```

---

### Task 22: 错误页（__root notFoundComponent / errorComponent）

**Files:**
- Modify: `src/routes/__root.tsx`（追加 `notFoundComponent` 与 `errorComponent`）

> **关键修正**：不创建 `src/routes/404.tsx` / `src/routes/500.tsx`（TanStack Router 中那会变成实际路由 `/404`，与 404 状态码的语义不符）。改为在 `__root` 注册 `notFoundComponent` 与 `errorComponent`，由框架在路由匹配失败 / loader 抛错时渲染。

**Step 22.1: 在 `__root.tsx` 注册 notFoundComponent / errorComponent**

修改 `src/routes/__root.tsx`：

```tsx
import { Link } from '@tanstack/react-router'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({ /* ... 不变 ... */ }),
  shellComponent: RootDocument,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ServerError,
})

function NotFound() {
  return (
    <main className="mx-auto max-w-md p-10 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-2 text-muted-foreground">{m.error_404_description()}</p>
      <Link to="/{-$locale}" className="mt-6 inline-block text-primary underline">
        {m.error_404_back()}
      </Link>
    </main>
  )
}

function ServerError({ error }: { error: Error }) {
  // 仅在 server console 输出；不向客户端暴露错误信息
  if (typeof window === 'undefined') {
    console.error('[root error]', error)
  }
  return (
    <main className="mx-auto max-w-md p-10 text-center">
      <h1 className="text-4xl font-bold">500</h1>
      <p className="mt-2 text-muted-foreground">{m.error_500_description()}</p>
    </main>
  )
}
```

**Step 22.2: 翻译键（`messages/{zh,en}.json`）**

```json
"error_404_description": "页面不存在",
"error_404_back": "返回首页",
"error_500_description": "服务器开了个小差"
```

**Step 22.3: Commit**

```bash
git add src/routes/__root.tsx messages
git commit -m "feat(seo): __root 注册 notFoundComponent / errorComponent"
```

---

### Task 23: Sub-Plan C 端到端验证

**Files:** 无新增

**Step 23.1: 类型校验**

```bash
pnpm run typecheck
```

预期：0 错误。

**Step 23.2: 单元测试**

```bash
pnpm run test
```

预期：blocks.test.ts + 价格/缓存/存储/环境/邮件/支付/订阅/通知全部 PASS（>= 240/240）。

**Step 23.3: 完整 check**

```bash
pnpm run check
```

预期：通过。

**Step 23.4: Content Collections 重新生成**

```bash
pnpm run content:build
```

预期：`.content-collections/generated/` 重建。

**Step 23.5: 构建**

```bash
pnpm run build
```

预期：成功。

**Step 23.6: dev server 冒烟**

```bash
pnpm dev
```

- `/` 返回 200，含 Hero/Stats/Features/Testimonials/Cta
- `/{-$locale}/features` 返回 200
- `/{-$locale}/pricing` 返回 200
- `/{-$locale}/about` 返回 200
- `/{-$locale}/contact` 返回 200（Sub-Plan B Task 9 已存在）
- `/{-$locale}/blog` 返回 200，列表含 hello-world
- `/{-$locale}/blog/hello-world` 返回 200
- `/{-$locale}/docs` 重定向到 `/{-$locale}/docs/index`
- `/{-$locale}/docs/index` 返回 200
- `/{-$locale}/changelog` 返回 200
- `/{-$locale}/legal/terms` 返回 200
- `/sitemap.xml` 返回 200 XML
- `/robots.txt` 返回 200 text
- `/manifest.json` 返回 200 JSON
- 不存在的路径返回 404 页面（由 `notFoundComponent` 渲染）

**Step 23.7: 浏览器手动验证**

- 切语言：navbar `LocaleSwitcher` 选择 English，URL 变为 `/en/...`。
- DevTools → Application → Manifest 看到 `SaaS Template`，`start_url` 指向 `/`。
- （不验证 service worker；spec §17 已 YAGNI。）

**Step 23.8: 提交（如有调整）**

```bash
git add -A
git commit -m "chore: Sub-Plan C 收尾（lint + 测试 + 构建验证）" --allow-empty
```

---

## Sub-Plan C 完成标志

- [ ] Content Collections 已生成（4 个 collections）
- [ ] 8 个 marketing blocks 全部实现（Hero / Features / Stats / Pricing / Faq / Testimonials / NewsletterCta / Cta）
- [ ] 首页 / features / pricing / about / contact 页面均渲染
- [ ] 文档站、博客、更新日志、法律页面均可访问
- [ ] sitemap.xml / robots.txt 端点就位（含 hreflang）
- [ ] JSON-LD Organization + BreadcrumbList + Article 在 head / 页面注入
- [ ] PWA manifest.json 接入（不含 service worker）
- [ ] Analytics Provider 包裹根路由，env 驱动 4 选 N
- [ ] 404 / 500 错误组件由 `__root` 注册
- [ ] locale 切换 URL 正常
- [ ] 单元测试 + 类型校验 + 构建全部通过

进入 Sub-Plan D 之前，确保以上所有项就位。

---

## Not in Scope（Sub-Plan C 显式不做）

按 writing-plans 规范，本 sub-plan 明确**不**包含：

- **业务模块与 server function**：支付、邮件、订阅、通知、文件存储、联系表单、admin、dashboard 守卫、auth API（→ Sub-Plan B）。
- **Vitest Workers 池 / Playwright E2E / CI / 安全中间件 / 性能 / README & CHANGELOG & 架构文档**（→ Sub-Plan D）。
- **PWA service worker 与 push 通知**：spec §17 YAGNI。
- **i18n URL 前缀路由**：spec 决策表第 6 项已选 `paraglide-js` cookie + URL 软切换；URL 前缀化留待 v0.2。
- **完整 Marketing A/B 测试与漏斗分析**：Analytics 接入由 env 驱动；A/B 实验框架不在本期。
- **Blocks 的可视化编辑器（shadcn Studio 之类）**：blocks 是纯 props-driven；编辑器另立 plan。
- **OG 动态图（satori）**：Cloudflare Workers 兼容性与依赖重，**本计划用 SVG 占位**；动态 satori 推迟到 v0.2。
- **Web Vitals 上报**：Sub-Plan D 完成 analytics，但 LCP/INP/CLS 上报到 GA/Plausible 由 v0.2。
- **a11y 自动化（@axe-core/playwright）**：Sub-Plan D 引入。
- **视觉回归测试**：Sub-Plan D 不做；v0.2 用 Chromatic。
- **完整 MDX 解析（@mdx-js/rollup + rehype-pretty-code）**：本计划最小 markdown 渲染；完整 MDX 由 v0.2 补。
- **Analytics CSP nonce**：Sub-Plan D 接入；本计划不带 nonce。
- **`getServerLocale()` 工具函数**：本计划用 Paraglide `getLocale()` 替代；不新建。
