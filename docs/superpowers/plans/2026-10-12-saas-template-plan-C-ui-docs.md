# Sub-Plan C：前端 UI 与文档站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 8 个 marketing blocks、marketing 页面、根级 Content Collections（docs/blog/changelog/legal），并完成 SEO、PWA、Analytics、locale 路由。

**Architecture:** 营销页面（首页/特性/价格/关于/联系/法务）由 marketing layout 包裹，blocks 来自 `src/blocks/marketing/`，每个 block 独立可组合。Docs/Blog/Changelog/Legal 通过 Content Collections 在仓库根目录 `content/` 下管理，使用文件名后缀约定（`*.zh.md` / `*.en.md`）。`Paraglide JS` 处理 URL 中的可选 locale 前缀。

**Tech Stack:** @content-collections/core, @content-collections/tanstack-start, vite-plugin-svgr, lucide-react, web-push.

## Global Constraints（继承自 Sub-Plan A/B）

- 营销页面与 blocks 全部 TypeScript + 函数组件；不引入 class 组件。
- 业务与 UI 分层：UI 在 `src/components/` 与 `src/blocks/`，业务在 `src/<feature>/`。
- 全部文案来自 `messages/{zh,en}.json`（Paraglide 产物）。
- 不实现具体 docs 教程内容（仅骨架 + 一篇示例文档）。
- 不实现多 analytics provider 全部集成；只写 GA4 + Plausible + Umami + Clarity 集成点位。
- 不实施 PWA push 通知；只做 manifest + service worker 缓存策略。
- 提交前必须 `pnpm run check` 与 `pnpm run test` 通过。

---

### Task 1: 安装前端/内容相关依赖

**Files:**
- Modify: `package.json`

**Step 1.1: 安装**

```bash
pnpm add @content-collections/core @content-collections/tanstack-start vite-plugin-svgr lucide-react
pnpm add -D @content-collections/cli
```

**Step 1.2: 确认版本**

```bash
pnpm ls @content-collections/core @content-collections/tanstack-start lucide-react
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

```ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
// ... 已有 import 保留
```

在 plugins 数组里追加：

```ts
const contentCollections = (await import('@content-collections/tanstack-start')).default();

plugins: [
  // ... 已有
  contentCollections,
  // ...
]
```

> 若 `@content-collections/tanstack-start` 提供具名导出 `default`，使用上述写法；
> 否则按官方 README 切换为：

```ts
import contentCollections from '@content-collections/tanstack-start';
```

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
git add content-collections.ts content/ vite.config.ts tsconfig.json package.json
git commit -m "feat(content): Content Collections（docs/blog/changelog/legal）"
```

---

### Task 3: locale 路由 + middleware

**Files:**
- Create: `src/lib/i18n.ts`
- Create: `src/lib/locale.ts`
- Create: `src/lib/get-server-locale.ts`
- Create: `src/components/LocaleSwitcher.tsx`
- Modify: `src/routes/__root.tsx`（追加 locale context）

**Step 3.1: 写入 `src/lib/locale.ts`**

```ts
export type Locale = 'zh' | 'en';
export const DEFAULT_LOCALE: Locale = 'zh';
export const SUPPORTED_LOCALES: Locale[] = ['zh', 'en'];

export function isSupportedLocale(value: string | undefined): value is Locale {
  return value === 'zh' || value === 'en';
}

export function parseLocale(value: string | undefined): Locale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}
```

**Step 3.2: 写入 `src/lib/i18n.ts`**

```ts
import { websiteConfig } from '@/config/website';
import { parseLocale, type Locale } from './locale';

export function getDirection(_locale: Locale): 'ltr' | 'rtl' {
  return 'ltr';
}

export function getHtmlLangAttr(locale: Locale): string {
  return locale;
}

export function getAlternateLinks(pathname: string) {
  return websiteConfig.i18n.locales.map((l) => ({
    hrefLang: l,
    href: `/${l}${pathname.startsWith('/') ? pathname : `/${pathname}`}`,
  }));
}

export { parseLocale, DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from './locale';
```

**Step 3.3: 写入 `src/lib/get-server-locale.ts`**

```ts
import { parseLocale, type Locale } from './locale';
import { getRequestEvent } from 'solid-js/web';

export function getServerLocale(): Locale {
  const event = getRequestEvent();
  if (!event) return 'zh';
  const url = new URL(event.request.url);
  const seg = url.pathname.split('/')[1] ?? '';
  return parseLocale(seg);
}
```

**Step 3.4: 写入 `src/components/LocaleSwitcher.tsx`**

```tsx
import { useRouter } from '@tanstack/react-router';
import { SUPPORTED_LOCALES, type Locale } from '@/lib/locale';

const labels: Record<Locale, string> = { zh: '中文', en: 'English' };

export function LocaleSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  return (
    <select
      value={current}
      onChange={(e) => {
        const target = e.target.value as Locale;
        const path = window.location.pathname;
        const segs = path.split('/');
        if (SUPPORTED_LOCALES.includes(segs[1] as Locale)) {
          segs[1] = target;
        } else {
          segs.splice(1, 0, target);
        }
        router.navigate({ to: segs.join('/') || '/' });
      }}
      className="rounded border bg-white px-2 py-1 text-sm"
    >
      {SUPPORTED_LOCALES.map((l) => (
        <option key={l} value={l}>{labels[l]}</option>
      ))}
    </select>
  );
}
```

**Step 3.5: 在 `src/routes/__root.tsx` 注入 locale context**

```tsx
import { createContext, useContext } from 'react';
import { parseLocale, type Locale } from '@/lib/locale';

const LocaleContext = createContext<Locale>('zh');
export const useLocale = () => useContext(LocaleContext);

// 在 beforeLoad 注入：
beforeLoad: async ({ location }) => {
  const seg = location.pathname.split('/')[1] ?? '';
  return { locale: parseLocale(seg) };
},
```

**Step 3.6: Commit**

```bash
git add src/lib src/components/LocaleSwitcher.tsx src/routes/__root.tsx
git commit -m "feat(i18n): locale 路由与 LocaleSwitcher"
```

---

### Task 4: 营销 layout（导航 + 页脚）

**Files:**
- Create: `src/routes/{-$locale}/_layout/marketing.tsx`
- Create: `src/components/marketing/Navbar.tsx`
- Create: `src/components/marketing/Footer.tsx`

**Step 4.1: 写入 `src/components/marketing/Navbar.tsx`**

```tsx
import { Link } from '@tanstack/react-router';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { websiteConfig } from '@/config/website';
import { getServerLocale } from '@/lib/get-server-locale';

export function Navbar() {
  const locale = getServerLocale();
  return (
    <nav className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-white/80 px-6 backdrop-blur">
      <Link to="/{-$locale}" className="text-lg font-bold">
        {websiteConfig.name}
      </Link>
      <div className="flex items-center gap-6 text-sm">
        <Link to="/{-$locale}/features" activeProps={{ className: 'font-semibold' }}>特性</Link>
        <Link to="/{-$locale}/pricing" activeProps={{ className: 'font-semibold' }}>价格</Link>
        <Link to="/{-$locale}/blog" activeProps={{ className: 'font-semibold' }}>博客</Link>
        <Link to="/{-$locale}/docs" activeProps={{ className: 'font-semibold' }}>文档</Link>
        <Link to="/{-$locale}/changelog" activeProps={{ className: 'font-semibold' }}>更新日志</Link>
        <Link to="/{-$locale}/contact" activeProps={{ className: 'font-semibold' }}>联系</Link>
        <LocaleSwitcher current={locale} />
        <Link to="/{-$locale}/auth/login" className="rounded bg-blue-500 px-3 py-1 text-white">登录</Link>
      </div>
    </nav>
  );
}
```

**Step 4.2: 写入 `src/components/marketing/Footer.tsx`**

```tsx
import { Link } from '@tanstack/react-router';
import { websiteConfig } from '@/config/website';

export function Footer() {
  return (
    <footer className="border-t px-6 py-8 text-sm text-muted-foreground">
      <div className="mx-auto max-w-5xl flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} {websiteConfig.name}. All rights reserved.</p>
        <nav className="flex gap-4">
          <Link to="/{-$locale}/legal/terms">服务条款</Link>
          <Link to="/{-$locale}/legal/privacy">隐私政策</Link>
          <Link to="/{-$locale}/changelog">更新日志</Link>
        </nav>
      </div>
    </footer>
  );
}
```

**Step 4.3: 写入 `src/routes/{-$locale}/_layout/marketing.tsx`**

```tsx
import { Outlet, createFileRoute } from '@tanstack/react-router';
import { Navbar } from '@/components/marketing/Navbar';
import { Footer } from '@/components/marketing/Footer';

export const Route = createFileRoute('/{-$locale}/_layout/marketing')({
  component: MarketingLayout,
});

function MarketingLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <Outlet />
      <Footer />
    </div>
  );
}
```

**Step 4.4: Commit**

```bash
git add src/components/marketing src/routes/{-\$locale}/_layout
git commit -m "feat(marketing): 营销 layout（Navbar + Footer）"
```

---

### Task 5: Block - Hero

**Files:**
- Create: `src/blocks/marketing/hero/Hero.tsx`
- Create: `src/blocks/marketing/hero/types.ts`
- Create: `src/blocks/marketing/hero/index.ts`

**Step 5.1: `src/blocks/marketing/hero/types.ts`**

```ts
export interface HeroProps {
  title: string;
  subtitle?: string;
  description?: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  image?: { src: string; alt: string };
  align?: 'left' | 'center';
}
```

**Step 5.2: `src/blocks/marketing/hero/Hero.tsx`**

```tsx
import { Link } from '@tanstack/react-router';
import type { HeroProps } from './types';

export function Hero(props: HeroProps) {
  const align = props.align ?? 'left';
  return (
    <section className={`mx-auto max-w-5xl px-6 py-20 ${align === 'center' ? 'text-center' : ''}`}>
      <h1 className="text-4xl font-bold tracking-tight md:text-6xl">{props.title}</h1>
      {props.subtitle && <p className="mt-4 text-lg text-muted-foreground">{props.subtitle}</p>}
      {props.description && <p className="mt-2 text-base text-muted-foreground">{props.description}</p>}
      {(props.primaryCta || props.secondaryCta) && (
        <div className={`mt-8 flex gap-3 ${align === 'center' ? 'justify-center' : ''}`}>
          {props.primaryCta && (
            <Link to={props.primaryCta.href} className="rounded bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700">
              {props.primaryCta.label}
            </Link>
          )}
          {props.secondaryCta && (
            <Link to={props.secondaryCta.href} className="rounded border px-5 py-3 font-medium hover:bg-muted">
              {props.secondaryCta.label}
            </Link>
          )}
        </div>
      )}
      {props.image && (
        <img src={props.image.src} alt={props.image.alt} className="mt-10 rounded-lg border shadow-sm" />
      )}
    </section>
  );
}
```

**Step 5.3: `src/blocks/marketing/hero/index.ts`**

```ts
export { Hero } from './Hero';
export type { HeroProps } from './types';
```

**Step 5.4: Commit**

```bash
git add src/blocks/marketing/hero
git commit -m "feat(blocks): Hero block"
```

---

### Task 6: Block - Features

**Files:**
- Create: `src/blocks/marketing/features/Features.tsx`
- Create: `src/blocks/marketing/features/types.ts`
- Create: `src/blocks/marketing/features/index.ts`

**Step 6.1: `types.ts`**

```ts
export interface FeatureItem {
  icon?: string;
  title: string;
  description: string;
}
export interface FeaturesProps {
  title?: string;
  subtitle?: string;
  columns?: 2 | 3 | 4;
  items: FeatureItem[];
}
```

**Step 6.2: `Features.tsx`**

```tsx
import type { FeaturesProps } from './types';

export function Features({ title, subtitle, columns = 3, items }: FeaturesProps) {
  const colClass = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }[columns];
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      {title && <h2 className="text-3xl font-bold text-center">{title}</h2>}
      {subtitle && <p className="mt-2 text-center text-muted-foreground">{subtitle}</p>}
      <div className={`mt-10 grid gap-6 ${colClass}`}>
        {items.map((f, i) => (
          <div key={i} className="rounded-lg border p-6">
            <h3 className="text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

**Step 6.3: `index.ts`**

```ts
export { Features } from './Features';
export type { FeaturesProps, FeatureItem } from './types';
```

**Step 6.4: Commit**

```bash
git add src/blocks/marketing/features
git commit -m "feat(blocks): Features block"
```

---

### Task 7: Block - Stats

**Files:**
- Create: `src/blocks/marketing/stats/Stats.tsx`
- Create: `src/blocks/marketing/stats/types.ts`
- Create: `src/blocks/marketing/stats/index.ts`

**Step 7.1: `types.ts`**

```ts
export interface StatItem { value: string; label: string }
export interface StatsProps { items: StatItem[] }
```

**Step 7.2: `Stats.tsx`**

```tsx
import type { StatsProps } from './types';

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
  );
}
```

**Step 7.3: `index.ts`**

```ts
export { Stats } from './Stats';
export type { StatsProps, StatItem } from './types';
```

**Step 7.4: Commit**

```bash
git add src/blocks/marketing/stats
git commit -m "feat(blocks): Stats block"
```

---

### Task 8: Block - FAQ

**Files:**
- Create: `src/blocks/marketing/faq/Faq.tsx`
- Create: `src/blocks/marketing/faq/types.ts`
- Create: `src/blocks/marketing/faq/index.ts`

**Step 8.1: `types.ts`**

```ts
export interface FaqItem { question: string; answer: string }
export interface FaqProps { title?: string; items: FaqItem[] }
```

**Step 8.2: `Faq.tsx`**

```tsx
import type { FaqProps } from './types';

export function Faq({ title, items }: FaqProps) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      {title && <h2 className="text-3xl font-bold text-center">{title}</h2>}
      <div className="mt-8 space-y-4">
        {items.map((f, i) => (
          <details key={i} className="rounded border p-4 open:bg-muted/50">
            <summary className="cursor-pointer font-medium">{f.question}</summary>
            <p className="mt-2 text-sm text-muted-foreground">{f.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
```

**Step 8.3: `index.ts`**

```ts
export { Faq } from './Faq';
export type { FaqProps, FaqItem } from './types';
```

**Step 8.4: Commit**

```bash
git add src/blocks/marketing/faq
git commit -m "feat(blocks): Faq block"
```

---

### Task 9: Block - Testimonials

**Files:**
- Create: `src/blocks/marketing/testimonials/Testimonials.tsx`
- Create: `src/blocks/marketing/testimonials/types.ts`
- Create: `src/blocks/marketing/testimonials/index.ts`

**Step 9.1: `types.ts`**

```ts
export interface Testimonial { quote: string; author: string; role?: string; avatar?: string }
export interface TestimonialsProps { title?: string; items: Testimonial[] }
```

**Step 9.2: `Testimonials.tsx`**

```tsx
import type { TestimonialsProps } from './types';

export function Testimonials({ title, items }: TestimonialsProps) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      {title && <h2 className="text-3xl font-bold text-center">{title}</h2>}
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {items.map((t, i) => (
          <figure key={i} className="rounded-lg border p-6">
            <blockquote className="text-sm">“{t.quote}”</blockquote>
            <figcaption className="mt-4 text-sm font-medium">
              {t.author}{t.role && <span className="text-muted-foreground"> · {t.role}</span>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
```

**Step 9.3: `index.ts`**

```ts
export { Testimonials } from './Testimonials';
export type { TestimonialsProps, Testimonial } from './types';
```

**Step 9.4: Commit**

```bash
git add src/blocks/marketing/testimonials
git commit -m "feat(blocks): Testimonials block"
```

---

### Task 10: Block - NewsletterCTA

**Files:**
- Create: `src/blocks/marketing/newsletter-cta/NewsletterCta.tsx`
- Create: `src/blocks/marketing/newsletter-cta/types.ts`
- Create: `src/blocks/marketing/newsletter-cta/index.ts`
- Create: `src/api/newsletter-subscribe.ts`

**Step 10.1: `types.ts`**

```ts
export interface NewsletterCtaProps {
  title: string;
  description?: string;
  placeholder?: string;
  successMessage?: string;
  endpoint: 'resend' | 'beehiiv';
}
```

**Step 10.2: `NewsletterCta.tsx`**

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { NewsletterCtaProps } from './types';

export function NewsletterCta({ title, description, placeholder = 'you@example.com', successMessage, endpoint }: NewsletterCtaProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h2 className="text-3xl font-bold">{title}</h2>
      {description && <p className="mt-2 text-muted-foreground">{description}</p>}
      <form
        className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
        onSubmit={async (e) => {
          e.preventDefault();
          setStatus('loading');
          const email = (new FormData(e.currentTarget).get('email') as string) ?? '';
          const res = await fetch('/api/newsletter/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, endpoint }),
          });
          if (!res.ok) {
            setStatus('error');
            setError((await res.json().catch(() => ({ error: 'failed' }))).error ?? 'failed');
            return;
          }
          setStatus('success');
        }}
      >
        <Input name="email" type="email" required placeholder={placeholder} className="sm:max-w-xs" />
        <Button type="submit" disabled={status === 'loading'}>订阅</Button>
      </form>
      {status === 'success' && <p className="mt-3 text-sm text-green-600">{successMessage ?? '已订阅'}</p>}
      {status === 'error' && <p className="mt-3 text-sm text-red-600">订阅失败：{error}</p>}
    </section>
  );
}
```

**Step 10.3: `index.ts`**

```ts
export { NewsletterCta } from './NewsletterCta';
export type { NewsletterCtaProps } from './types';
```

**Step 10.4: 写入 `src/api/newsletter-subscribe.ts`**

```ts
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { websiteConfig } from '@/config/website';
import { subscribe } from '@/newsletter';

const schema = z.object({ email: z.string().email(), endpoint: z.enum(['resend', 'beehiiv']) });

export const newsletterSubscribe = createServerFn({ method: 'POST' })
  .validator(schema)
  .handler(async ({ data }) => {
    const provider = data.endpoint ?? websiteConfig.newsletter.provider ?? 'resend';
    const result = await subscribe(provider, { email: data.email });
    return { ok: result };
  });
```

**Step 10.5: 写入 `src/routes/api/newsletter/subscribe.ts`**

```ts
import { createFileRoute } from '@tanstack/react-router';
import { newsletterSubscribe } from '@/api/newsletter-subscribe';

export const Route = createFileRoute('/api/newsletter/subscribe')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json();
        const result = await newsletterSubscribe({ data: body });
        return Response.json(result);
      },
    },
  },
});
```

**Step 10.6: Commit**

```bash
git add src/blocks/marketing/newsletter-cta src/api/newsletter-subscribe.ts src/routes/api/newsletter
git commit -m "feat(blocks): NewsletterCTA + 订阅 API"
```

---

### Task 11: Block - CTA

**Files:**
- Create: `src/blocks/marketing/cta/Cta.tsx`
- Create: `src/blocks/marketing/cta/types.ts`
- Create: `src/blocks/marketing/cta/index.ts`

**Step 11.1: `types.ts`**

```ts
export interface CtaProps {
  title: string;
  description?: string;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
}
```

**Step 11.2: `Cta.tsx`**

```tsx
import { Link } from '@tanstack/react-router';
import type { CtaProps } from './types';

export function Cta({ title, description, primaryCta, secondaryCta }: CtaProps) {
  return (
    <section className="bg-blue-600 px-6 py-16 text-white">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold">{title}</h2>
        {description && <p className="mt-2 opacity-90">{description}</p>}
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link to={primaryCta.href} className="rounded bg-white px-5 py-3 font-medium text-blue-600">
            {primaryCta.label}
          </Link>
          {secondaryCta && (
            <Link to={secondaryCta.href} className="rounded border border-white px-5 py-3 font-medium">
              {secondaryCta.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
```

**Step 11.3: `index.ts`**

```ts
export { Cta } from './Cta';
export type { CtaProps } from './types';
```

**Step 11.4: Commit**

```bash
git add src/blocks/marketing/cta
git commit -m "feat(blocks): CTA block"
```

---

### Task 12: Block 注册表 + Blocks 共享类型

**Files:**
- Create: `src/blocks/marketing/index.ts`

**Step 12.1: 写入 `src/blocks/marketing/index.ts`**

```ts
import { Hero } from './hero';
import { Features } from './features';
import { Stats } from './stats';
import { Faq } from './faq';
import { Testimonials } from './testimonials';
import { NewsletterCta } from './newsletter-cta';
import { Cta } from './cta';

export const blocks = { Hero, Features, Stats, Faq, Testimonials, NewsletterCta, Cta } as const;
export type BlockName = keyof typeof blocks;

export { Hero, Features, Stats, Faq, Testimonials, NewsletterCta, Cta };

export type { HeroProps } from './hero';
export type { FeaturesProps, FeatureItem } from './features';
export type { StatsProps, StatItem } from './stats';
export type { FaqProps, FaqItem } from './faq';
export type { TestimonialsProps, Testimonial } from './testimonials';
export type { NewsletterCtaProps } from './newsletter-cta';
export type { CtaProps } from './cta';
```

**Step 12.2: 单元测试（blocks 注册表 smoke）**

Create: `tests/unit/blocks.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { blocks } from '@/blocks/marketing';

describe('blocks registry', () => {
  it('导出全部 7 个 blocks', () => {
    expect(Object.keys(blocks)).toEqual(['Hero', 'Features', 'Stats', 'Faq', 'Testimonials', 'NewsletterCta', 'Cta']);
  });
});
```

**Step 12.3: 测试**

```bash
pnpm run test
```

**Step 12.4: Commit**

```bash
git add src/blocks/marketing/index.ts tests/unit/blocks.test.ts
git commit -m "feat(blocks): 营销 blocks 注册表 + 索引"
```

---

### Task 13: 首页与营销页面

**Files:**
- Create: `src/routes/{-$locale}/_layout/marketing/index.tsx`
- Create: `src/routes/{-$locale}/_layout/marketing/features.tsx`
- Create: `src/routes/{-$locale}/_layout/marketing/pricing.tsx`
- Create: `src/routes/{-$locale}/_layout/marketing/about.tsx`
- Create: `src/routes/{-$locale}/_layout/marketing/contact.tsx`
- Create: `src/config/blocks/home.ts`
- Create: `src/config/blocks/features.ts`
- Create: `src/config/blocks/about.ts`
- Create: `src/config/blocks/index.ts`

**Step 13.1: 写入 `src/config/blocks/home.ts`**

```ts
import type { HeroProps, FeaturesProps, StatsProps, TestimonialsProps, CtaProps } from '@/blocks/marketing';

export const homeBlocks = {
  Hero: {
    title: '快速构建你的 SaaS 产品',
    subtitle: 'TanStack Start + Cloudflare Workers + Stripe',
    description: '所有基础功能开箱即用，让开发者专注业务。',
    primaryCta: { label: '立即开始', href: '/dashboard' },
    secondaryCta: { label: '查看价格', href: '/pricing' },
    align: 'center' as const,
  } satisfies HeroProps,
  Stats: {
    items: [
      { value: '7+', label: '内置模块' },
      { value: '< 100ms', label: '边缘响应' },
      { value: '0 冷启动', label: 'Workers 全球' },
      { value: '$0/月', label: '免费层起步' },
    ],
  } satisfies StatsProps,
  Features: {
    title: '为什么选择 SaaS Template',
    columns: 3 as const,
    items: [
      { title: '边缘部署', description: 'Cloudflare Workers 全球边缘，冷启动近零。' },
      { title: '订阅与发票', description: 'Stripe Checkout + Customer Portal 集成。' },
      { title: '内置认证', description: 'Better Auth 支持邮箱密码 + Google OAuth。' },
      { title: '文件存储', description: 'R2 提供 S3 兼容对象存储。' },
      { title: '邮件模板', description: 'React Email + Cloudflare/Resend 双 provider。' },
      { title: '多语言', description: '内置 zh / en 双语切换。' },
    ],
  } satisfies FeaturesProps,
  Testimonials: {
    title: '用户怎么说',
    items: [
      { quote: '我在一周内上线了产品。', author: '开发者 A', role: '独立开发者' },
      { quote: 'Cloudflare + Stripe 这套太爽了。', author: '开发者 B', role: '创业者' },
      { quote: 'SaaS 模板必备。', author: '开发者 C', role: '工程师' },
    ],
  } satisfies TestimonialsProps,
  Cta: {
    title: '立即开始',
    description: '运行 `pnpm run setup` 即可创建 Cloudflare 资源并启动。',
    primaryCta: { label: '开始', href: '/auth/register' },
  } satisfies CtaProps,
};
```

**Step 13.2: 写入 `src/config/blocks/features.ts`**

```ts
import type { HeroProps, FeaturesProps, FaqProps, CtaProps } from '@/blocks/marketing';

export const featuresBlocks = {
  Hero: {
    title: '特性总览',
    subtitle: '从认证到支付，从邮件到通知，模块化设计。',
  } satisfies HeroProps,
  Features: {
    items: [
      { title: '认证', description: '邮箱密码 + Google OAuth + 邮箱验证。' },
      { title: '订阅', description: 'Stripe Checkout + Customer Portal。' },
      { title: '文件', description: 'R2 对象存储 + 预签名下载。' },
      { title: '邮件', description: 'React Email + Cloudflare/Resend。' },
      { title: '订阅', description: 'Resend Audiences + Beehiiv。' },
      { title: '通知', description: 'Discord + 飞书 webhook。' },
    ],
  } satisfies FeaturesProps,
  Faq: {
    title: '常见问题',
    items: [
      { question: '支持中文吗？', answer: '内置 zh / en 双语。' },
      { question: '能自托管吗？', answer: '可以，所有依赖可替换。' },
    ],
  } satisfies FaqProps,
  Cta: {
    title: '想看更多？',
    primaryCta: { label: '查看价格', href: '/pricing' },
  } satisfies CtaProps,
};
```

**Step 13.3: 写入 `src/config/blocks/about.ts`**

```ts
import type { HeroProps, StatsProps, CtaProps } from '@/blocks/marketing';

export const aboutBlocks = {
  Hero: { title: '关于 SaaS Template', subtitle: '为 SaaS 开发者打造的快速起步模板' } satisfies HeroProps,
  Stats: {
    items: [
      { value: '7+', label: '内置模块' },
      { value: '4+', label: '支付/邮件/通知 provider' },
      { value: 'zh/en', label: '多语言' },
    ],
  } satisfies StatsProps,
  Cta: {
    title: '开始构建',
    primaryCta: { label: '查看文档', href: '/docs' },
  } satisfies CtaProps,
};
```

**Step 13.4: 写入 `src/config/blocks/index.ts`**

```ts
export { homeBlocks } from './home';
export { featuresBlocks } from './features';
export { aboutBlocks } from './about';
```

**Step 13.5: 写入 `src/routes/{-$locale}/_layout/marketing/index.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { Hero, Stats, Features, Testimonials, Cta } from '@/blocks/marketing';
import { homeBlocks } from '@/config/blocks';

export const Route = createFileRoute('/{-$locale}/_layout/marketing/')({
  component: HomePage,
});

function HomePage() {
  return (
    <main>
      <Hero {...homeBlocks.Hero} />
      <Stats {...homeBlocks.Stats} />
      <Features {...homeBlocks.Features} />
      <Testimonials {...homeBlocks.Testimonials} />
      <Cta {...homeBlocks.Cta} />
    </main>
  );
}
```

**Step 13.6: 写入 `src/routes/{-$locale}/_layout/marketing/features.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { Hero, Features, Faq, Cta } from '@/blocks/marketing';
import { featuresBlocks } from '@/config/blocks';

export const Route = createFileRoute('/{-$locale}/_layout/marketing/features')({
  component: FeaturesPage,
});

function FeaturesPage() {
  return (
    <main>
      <Hero {...featuresBlocks.Hero} />
      <Features {...featuresBlocks.Features} />
      <Faq {...featuresBlocks.Faq} />
      <Cta {...featuresBlocks.Cta} />
    </main>
  );
}
```

**Step 13.7: 写入 `src/routes/{-$locale}/_layout/marketing/about.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { Hero, Stats, Cta } from '@/blocks/marketing';
import { aboutBlocks } from '@/config/blocks';

export const Route = createFileRoute('/{-$locale}/_layout/marketing/about')({
  component: AboutPage,
});

function AboutPage() {
  return (
    <main>
      <Hero {...aboutBlocks.Hero} />
      <Stats {...aboutBlocks.Stats} />
      <Cta {...aboutBlocks.Cta} />
    </main>
  );
}
```

> Pricing 页在 Sub-Plan B Task 14 已创建 `src/routes/{-$locale}/pricing.tsx`（不在 marketing layout 内以避免双重 navbar）。
> Contact 页在 Sub-Plan B Task 9 已创建 `src/routes/{-$locale}/contact.tsx`，同上。

**Step 13.8: Commit**

```bash
git add src/config/blocks src/routes/{-\$locale}/_layout/marketing/index.tsx src/routes/{-\$locale}/_layout/marketing/features.tsx src/routes/{-\$locale}/_layout/marketing/about.tsx
git commit -m "feat(marketing): 首页/特性/关于页面（blocks 拼装）"
```

---

### Task 14: 文档站（Content Collections + Slug 路由）

**Files:**
- Create: `src/routes/{-$locale}/_layout/marketing/docs/index.tsx`
- Create: `src/routes/{-$locale}/_layout/marketing/docs/$slug.tsx`
- Create: `src/components/docs/DocsSidebar.tsx`
- Create: `src/components/mdx/Mdx.tsx`
- Create: `src/styles/mdx.css`

**Step 14.1: 安装 MDX 渲染器**

```bash
pnpm add react-router-dom@^7
pnpm add -D @types/react-router-dom
```

> 实际 MDX 方案以 TanStack Start 1.x 推荐为准（如 `@mdx-js/rollup` + `remark-gfm` + `rehype-pretty-code`）；若 runtime 兼容可调整。

**Step 14.2: 写入 `src/components/mdx/Mdx.tsx`**

```tsx
import { MDXProvider } from '@mdx-js/react';
import { useEffect, useState } from 'react';
import '@/styles/mdx.css';

export function Mdx({ children }: { children: string }) {
  const [Component, setComponent] = useState<React.ComponentType<{ components?: Record<string, React.ComponentType<{ children?: React.ReactNode }>> }> | null>(null);

  useEffect(() => {
    // 运行时 MDX 编译：开发期通过 Vite 插件 / 构建期通过 ?mdx 后缀
    setComponent(() => () => <pre>{children}</pre>);
  }, [children]);

  if (!Component) return <div>Loading…</div>;
  return (
    <MDXProvider>
      <Component />
    </MDXProvider>
  );
}
```

> 实际 Sub-Plan C 落地建议使用 Content Collections + `compileMDX` 预编译：
>
> ```ts
> import { compileMDX } from 'next-mdx-remote/rsc';
> ```
> 选用 TanStack Start 兼容的方案。文档站以预编译为骨架。

**Step 14.3: 写入 `src/styles/mdx.css`**

```css
.mdx { @apply prose max-w-3xl; }
.mdx h1 { @apply text-3xl font-bold mb-4; }
.mdx h2 { @apply text-2xl font-semibold mt-8 mb-3; }
.mdx p { @apply leading-7 mb-4; }
.mdx code { @apply rounded bg-muted px-1 py-0.5 text-sm; }
.mdx pre { @apply rounded bg-zinc-900 text-zinc-100 p-4 overflow-auto; }
```

**Step 14.4: 写入 `src/components/docs/DocsSidebar.tsx`**

```tsx
import { Link } from '@tanstack/react-router';
import { allDocs } from 'content-collections';
import { parseLocale } from '@/lib/locale';

export function DocsSidebar({ locale }: { locale: 'zh' | 'en' }) {
  const items = allDocs
    .filter((d) => d.locale === parseLocale(locale))
    .sort((a, b) => a.order - b.order);
  return (
    <nav className="w-56 border-r p-4 text-sm">
      <ul className="space-y-2">
        {items.map((d) => (
          <li key={d._meta.path}>
            <Link to="/docs/$slug" params={{ slug: d._meta.path }} className="hover:underline">
              {d.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

**Step 14.5: 写入 `src/routes/{-$locale}/_layout/marketing/docs/index.tsx`**

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { allDocs } from 'content-collections';
import { getServerLocale } from '@/lib/get-server-locale';

export const Route = createFileRoute('/{-$locale}/_layout/marketing/docs/')({
  beforeLoad: () => {
    const locale = getServerLocale();
    const first = allDocs.filter((d) => d.locale === locale).sort((a, b) => a.order - b.order)[0];
    if (!first) return;
    throw redirect({ to: '/docs/$slug', params: { slug: first._meta.path } });
  },
  component: () => null,
});
```

**Step 14.6: 写入 `src/routes/{-$locale}/_layout/marketing/docs/$slug.tsx`**

```tsx
import { createFileRoute, notFound } from '@tanstack/react-router';
import { allDocs } from 'content-collections';
import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { Mdx } from '@/components/mdx/Mdx';
import { getServerLocale } from '@/lib/get-server-locale';

export const Route = createFileRoute('/{-$locale}/_layout/marketing/docs/$slug')({
  beforeLoad: ({ params }) => {
    const locale = getServerLocale();
    const doc = allDocs.find((d) => d._meta.path === params.slug && d.locale === locale);
    if (!doc) throw notFound();
    return { doc };
  },
  component: DocPage,
});

function DocPage() {
  const { doc } = Route.useRouteContext();
  return (
    <div className="flex min-h-screen">
      <DocsSidebar locale={doc.locale as 'zh' | 'en'} />
      <article className="flex-1 px-8 py-10">
        <Mdx>{doc.content}</Mdx>
      </article>
    </div>
  );
}
```

**Step 14.7: Commit**

```bash
git add src/components/docs src/components/mdx src/styles/mdx.css src/routes/{-\$locale}/_layout/marketing/docs
git commit -m "feat(docs): 文档站（Content Collections + 侧栏）"
```

---

### Task 15: 博客列表与详情

**Files:**
- Create: `src/routes/{-$locale}/_layout/marketing/blog/index.tsx`
- Create: `src/routes/{-$locale}/_layout/marketing/blog/$slug.tsx`
- Create: `src/components/blog/PostCard.tsx`

**Step 15.1: 写入 `src/components/blog/PostCard.tsx`**

```tsx
import { Link } from '@tanstack/react-router';
import type { Post } from './types';

export function PostCard({ post }: { post: Post }) {
  return (
    <Link to="/blog/$slug" params={{ slug: post.slug }} className="block rounded border p-4 hover:bg-muted/40">
      <p className="text-xs text-muted-foreground">{new Date(post.date).toLocaleDateString()}</p>
      <h3 className="mt-1 text-lg font-semibold">{post.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{post.description}</p>
    </Link>
  );
}
```

Create: `src/components/blog/types.ts`

```ts
export interface Post {
  slug: string;
  title: string;
  description: string;
  date: string;
}
```

**Step 15.2: 写入 `src/routes/{-$locale}/_layout/marketing/blog/index.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { allBlogs } from 'content-collections';
import { PostCard } from '@/components/blog/PostCard';
import { getServerLocale } from '@/lib/get-server-locale';

export const Route = createFileRoute('/{-$locale}/_layout/marketing/blog/')({
  component: BlogIndex,
});

function BlogIndex() {
  const locale = getServerLocale();
  const posts = allBlogs
    .filter((p) => p.locale === locale && p.published)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .map((p) => ({ slug: p._meta.path, title: p.title, description: p.description, date: p.date }));
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold">博客</h1>
      <div className="mt-6 grid gap-4">
        {posts.map((p) => <PostCard key={p.slug} post={p} />)}
      </div>
    </main>
  );
}
```

**Step 15.3: 写入 `src/routes/{-$locale}/_layout/marketing/blog/$slug.tsx`**

```tsx
import { createFileRoute, notFound } from '@tanstack/react-router';
import { allBlogs } from 'content-collections';
import { Mdx } from '@/components/mdx/Mdx';
import { getServerLocale } from '@/lib/get-server-locale';

export const Route = createFileRoute('/{-$locale}/_layout/marketing/blog/$slug')({
  beforeLoad: ({ params }) => {
    const locale = getServerLocale();
    const post = allBlogs.find((p) => p._meta.path === params.slug && p.locale === locale && p.published);
    if (!post) throw notFound();
    return { post };
  },
  component: BlogPost,
});

function BlogPost() {
  const { post } = Route.useRouteContext();
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-sm text-muted-foreground">{new Date(post.date).toLocaleDateString()}</p>
      <h1 className="mt-2 text-4xl font-bold">{post.title}</h1>
      <p className="mt-2 text-lg text-muted-foreground">{post.description}</p>
      <hr className="my-6" />
      <Mdx>{post.content}</Mdx>
    </main>
  );
}
```

**Step 15.4: Commit**

```bash
git add src/components/blog src/routes/{-\$locale}/_layout/marketing/blog
git commit -m "feat(blog): 列表 + 详情页"
```

---

### Task 16: 更新日志

**Files:**
- Create: `src/routes/{-$locale}/_layout/marketing/changelog/index.tsx`

**Step 16.1: 写入 `src/routes/{-$locale}/_layout/marketing/changelog/index.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { allChangelogs } from 'content-collections';
import { Mdx } from '@/components/mdx/Mdx';
import { getServerLocale } from '@/lib/get-server-locale';

export const Route = createFileRoute('/{-$locale}/_layout/marketing/changelog/')({
  component: ChangelogPage,
});

function ChangelogPage() {
  const locale = getServerLocale();
  const entries = allChangelogs
    .filter((c) => c.locale === locale)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold">更新日志</h1>
      <div className="mt-8 space-y-10">
        {entries.map((c) => (
          <article key={c._meta.path}>
            <p className="text-sm text-muted-foreground">{new Date(c.date).toLocaleDateString()}</p>
            <h2 className="mt-1 text-2xl font-semibold">{c.title}</h2>
            <p className="mt-1 text-sm">{c.summary}</p>
            <Mdx>{c.content}</Mdx>
          </article>
        ))}
      </div>
    </main>
  );
}
```

**Step 16.2: Commit**

```bash
git add src/routes/{-\$locale}/_layout/marketing/changelog
git commit -m "feat(changelog): 更新日志页"
```

---

### Task 17: Legal 页面（动态 slug）

**Files:**
- Create: `src/routes/{-$locale}/_layout/marketing/legal/$slug.tsx`

**Step 17.1: 写入 `src/routes/{-$locale}/_layout/marketing/legal/$slug.tsx`**

```tsx
import { createFileRoute, notFound } from '@tanstack/react-router';
import { allLegals } from 'content-collections';
import { Mdx } from '@/components/mdx/Mdx';
import { getServerLocale } from '@/lib/get-server-locale';

export const Route = createFileRoute('/{-$locale}/_layout/marketing/legal/$slug')({
  beforeLoad: ({ params }) => {
    const locale = getServerLocale();
    const legal = allLegals.find((l) => l._meta.path === `${params.slug}.${locale === 'zh' ? 'zh' : ''}` || l._meta.path.startsWith(`${params.slug}.`));
    if (!legal) throw notFound();
    return { legal };
  },
  component: LegalPage,
});

function LegalPage() {
  const { legal } = Route.useRouteContext();
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold">{legal.title}</h1>
      <hr className="my-6" />
      <Mdx>{legal.content}</Mdx>
    </main>
  );
}
```

> slug 解析约定：URL `/legal/terms` 命中 `terms.md` 或 `terms.zh.md`，按当前 locale 优先。

**Step 17.2: Commit**

```bash
git add src/routes/{-\$locale}/_layout/marketing/legal
git commit -m "feat(legal): 服务条款与隐私政策页"
```

---

### Task 18: SEO（sitemap + robots + JSON-LD + OG image）

**Files:**
- Create: `src/routes/sitemap.xml.ts`
- Create: `src/routes/robots.txt.ts`
- Create: `src/lib/json-ld.ts`
- Create: `src/components/JsonLd.tsx`
- Create: `src/routes/api/og.tsx`

**Step 18.1: 写入 `src/routes/sitemap.xml.ts`**

```ts
import { createFileRoute } from '@tanstack/react-router';
import { websiteConfig } from '@/config/website';
import { allBlogs, allDocs, allChangelogs } from 'content-collections';

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () => {
        const base = websiteConfig.url;
        const urls = [
          '',
          '/features',
          '/pricing',
          '/about',
          '/contact',
          '/blog',
          '/docs',
          '/changelog',
          '/legal/terms',
          '/legal/privacy',
        ];
        const blog = allBlogs.map((p) => `/blog/${p._meta.path}`);
        const docs = allDocs.map((d) => `/docs/${d._meta.path}`);
        const changelog = allChangelogs.map((c) => `/changelog#${c._meta.path}`);

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls, ...blog, ...docs, ...changelog]
  .map(
    (u) => `<url><loc>${base}${u}</loc><changefreq>weekly</changefreq></url>`,
  )
  .join('\n')}
</urlset>`;
        return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
      },
    },
  },
});
```

**Step 18.2: 写入 `src/routes/robots.txt.ts`**

```ts
import { createFileRoute } from '@tanstack/react-router';
import { websiteConfig } from '@/config/website';

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () => {
        const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /dashboard/
Disallow: /admin/
Sitemap: ${websiteConfig.url}/sitemap.xml
`;
        return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
      },
    },
  },
});
```

**Step 18.3: 写入 `src/lib/json-ld.ts`**

```ts
import { websiteConfig } from '@/config/website';

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: websiteConfig.name,
    url: websiteConfig.url,
    logo: `${websiteConfig.url}/icon.png`,
    sameAs: [websiteConfig.social?.twitter, websiteConfig.social?.github].filter(Boolean),
  };
}

export function softwareApplicationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: websiteConfig.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'USD',
    },
  };
}
```

**Step 18.4: 写入 `src/components/JsonLd.tsx`**

```tsx
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
```

**Step 18.5: 在 `src/routes/__root.tsx` 注入 JSON-LD**

```tsx
import { JsonLd } from '@/components/JsonLd';
import { organizationJsonLd } from '@/lib/json-ld';

<head>
  <JsonLd data={organizationJsonLd()} />
</head>
```

**Step 18.6: 写入 `src/routes/api/og.tsx`（使用 satori 动态生成 OG 图）**

```bash
pnpm add satori @resvg/resvg-js
```

```tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/og')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const title = url.searchParams.get('title') ?? 'SaaS Template';
        const subtitle = url.searchParams.get('subtitle') ?? '';
        const { default: satori } = await import('satori');
        const { Resvg } = await import('@resvg/resvg-js');
        const fontData = await fetch('https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.0/files/inter-latin-400-normal.woff').then((r) => r.arrayBuffer());
        const svg = await satori(
          { type: 'div', props: { style: { width: 1200, height: 630, display: 'flex', flexDirection: 'column', justifyContent: 'center', background: '#0f172a', color: 'white', padding: 64 }, children: [
            { type: 'h1', props: { style: { fontSize: 72, fontWeight: 700 }, children: title } },
            subtitle && { type: 'p', props: { style: { fontSize: 36, opacity: 0.8, marginTop: 24 }, children: subtitle } },
          ].filter(Boolean) } },
          { width: 1200, height: 630, fonts: [{ name: 'Inter', data: fontData, weight: 400, style: 'normal' }] },
        );
        const png = new Resvg(svg).render().asPng();
        return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' } });
      },
    },
  },
});
```

**Step 18.7: Commit**

```bash
git add src/routes/sitemap.xml.ts src/routes/robots.txt.ts src/lib/json-ld.ts src/components/JsonLd.tsx src/routes/api/og.tsx src/routes/__root.tsx package.json pnpm-lock.yaml
git commit -m "feat(seo): sitemap/robots/JSON-LD/OG 图"
```

---

### Task 19: PWA（manifest + service worker）

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/sw.js`
- Create: `public/icon-192.png`（占位，README 中说明后续替换）
- Create: `public/icon-512.png`（占位）
- Modify: `src/routes/__root.tsx`（注册 SW）

**Step 19.1: 写入 `public/manifest.webmanifest`**

```json
{
  "name": "SaaS Template",
  "short_name": "SaaS",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0070f3",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Step 19.2: 写入 `public/sw.js`**

```js
const CACHE = 'saas-template-v1';
const PRECACHE = ['/', '/pricing', '/blog', '/docs', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
```

**Step 19.3: 在 `src/routes/__root.tsx` 注册 SW**

```tsx
useEffect(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  }
}, []);
```

**Step 19.4: 在 `<head>` 注入 manifest link**

```tsx
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#0070f3" />
```

**Step 19.5: 占位图标说明**

> 真实图标替换：在 `public/icon-192.png` 与 `public/icon-512.png` 放入设计稿（默认生成两份 1×1 PNG 占位，运行期可正常加载）。

```bash
mkdir -p public
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > public/icon-192.png
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x02\x00\x00\x00\x02\x08\x06\x00\x00\x00\xfd\x87\x65\x32\x00\x00\x00\x16IDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > public/icon-512.png
```

**Step 19.6: Commit**

```bash
git add public/manifest.webmanifest public/sw.js public/icon-192.png public/icon-512.png src/routes/__root.tsx
git commit -m "feat(pwa): manifest + service worker + 占位图标"
```

---

### Task 20: Analytics（多 provider）

**Files:**
- Create: `src/lib/analytics/types.ts`
- Create: `src/lib/analytics/ga.ts`
- Create: `src/lib/analytics/plausible.ts`
- Create: `src/lib/analytics/umami.ts`
- Create: `src/lib/analytics/clarity.ts`
- Create: `src/lib/analytics/index.ts`
- Create: `src/components/AnalyticsProvider.tsx`

**Step 20.1: 写入 `src/lib/analytics/types.ts`**

```ts
export type AnalyticsEvent = { name: string; params?: Record<string, string | number | boolean> };
export type AnalyticsProviderName = 'ga' | 'plausible' | 'umami' | 'clarity';

export interface AnalyticsProvider {
  track(event: AnalyticsEvent): void;
  page(path: string): void;
}
```

**Step 20.2: 写入 `src/lib/analytics/ga.ts`**

```ts
import type { AnalyticsEvent, AnalyticsProvider } from './types';

export class GAAnalyticsProvider implements AnalyticsProvider {
  constructor(private readonly measurementId: string) {}

  track(event: AnalyticsEvent) {
    if (typeof window === 'undefined' || typeof (window as unknown as { gtag?: (a: string, b: string, c?: object) => void }).gtag !== 'function') return;
    (window as unknown as { gtag: (a: string, b: string, c?: object) => void }).gtag('event', event.name, event.params);
  }

  page(path: string) {
    if (typeof window === 'undefined' || typeof (window as unknown as { gtag?: (a: string, b: string, c?: object) => void }).gtag !== 'function') return;
    (window as unknown as { gtag: (a: string, b: string, c?: object) => void }).gtag('event', 'page_view', { page_path: path });
  }
}
```

**Step 20.3: 写入 `src/lib/analytics/plausible.ts`**

```ts
import type { AnalyticsEvent, AnalyticsProvider } from './types';

export class PlausibleAnalyticsProvider implements AnalyticsProvider {
  constructor(private readonly domain: string) {}

  track(event: AnalyticsEvent) {
    if (typeof window === 'undefined' || typeof (window as unknown as { plausible?: (a: string, b?: object) => void }).plausible !== 'function') return;
    (window as unknown as { plausible: (a: string, b?: object) => void }).plausible(event.name, { props: event.params });
  }

  page(path: string) {
    if (typeof window === 'undefined' || typeof (window as unknown as { plausible?: (a: string, b?: object) => void }).plausible !== 'function') return;
    (window as unknown as { plausible: (a: string, b?: object) => void }).plausible('pageview', { u: path });
  }
}
```

**Step 20.4: 写入 `src/lib/analytics/umami.ts`**

```ts
import type { AnalyticsEvent, AnalyticsProvider } from './types';

export class UmamiAnalyticsProvider implements AnalyticsProvider {
  constructor(private readonly websiteId: string) {}

  track(event: AnalyticsEvent) {
    if (typeof window === 'undefined' || typeof (window as unknown as { umami?: (a: string, b?: object) => void }).umami !== 'function') return;
    (window as unknown as { umami: (a: string, b?: object) => void }).umami(event.name, event.params);
  }

  page(_path: string) {
    // Umami 自动追踪 pageview，无需手动触发
  }
}
```

**Step 20.5: 写入 `src/lib/analytics/clarity.ts`**

```ts
import type { AnalyticsEvent, AnalyticsProvider } from './types';

export class ClarityAnalyticsProvider implements AnalyticsProvider {
  constructor(private readonly projectId: string) {}

  track(event: AnalyticsEvent) {
    if (typeof window === 'undefined' || typeof (window as unknown as { clarity?: (a: string, b?: object) => void }).clarity !== 'function') return;
    (window as unknown as { clarity: (a: string, b?: object) => void }).clarity('event', event.name);
  }

  page(_path: string) {
    // Clarity 自动追踪
  }
}
```

**Step 20.6: 写入 `src/lib/analytics/index.ts`**

```ts
import type { AnalyticsProvider, AnalyticsProviderName, AnalyticsEvent } from './types';
import { GAAnalyticsProvider } from './ga';
import { PlausibleAnalyticsProvider } from './plausible';
import { UmamiAnalyticsProvider } from './umami';
import { ClarityAnalyticsProvider } from './clarity';

const providers: AnalyticsProvider[] = [];

export function initAnalytics(publicEnv: { VITE_ANALYTICS?: string; VITE_GA_MEASUREMENT_ID?: string; VITE_PLAUSIBLE_DOMAIN?: string; VITE_UMAMI_WEBSITE_ID?: string; VITE_CLARITY_PROJECT_ID?: string }) {
  providers.length = 0;
  const enabled = (publicEnv.VITE_ANALYTICS ?? '').split(',').map((s) => s.trim()).filter(Boolean) as AnalyticsProviderName[];

  if (enabled.includes('ga') && publicEnv.VITE_GA_MEASUREMENT_ID) {
    providers.push(new GAAnalyticsProvider(publicEnv.VITE_GA_MEASUREMENT_ID));
    injectScript(`https://www.googletagmanager.com/gtag/js?id=${publicEnv.VITE_GA_MEASUREMENT_ID}`);
    window.dataLayer = window.dataLayer ?? [];
    (window as unknown as { gtag: (a: string, b: string, c?: object) => void }).gtag = function gtag(...args: unknown[]) { (window.dataLayer as unknown[]).push(args); };
    (window as unknown as { gtag: (a: string, b: string, c?: object) => void }).gtag('js', new Date());
  }
  if (enabled.includes('plausible') && publicEnv.VITE_PLAUSIBLE_DOMAIN) {
    providers.push(new PlausibleAnalyticsProvider(publicEnv.VITE_PLAUSIBLE_DOMAIN));
    injectScript('https://plausible.io/js/script.js', { 'data-domain': publicEnv.VITE_PLAUSIBLE_DOMAIN });
  }
  if (enabled.includes('umami') && publicEnv.VITE_UMAMI_WEBSITE_ID) {
    providers.push(new UmamiAnalyticsProvider(publicEnv.VITE_UMAMI_WEBSITE_ID));
    injectScript('https://umami.example.com/script.js', { 'data-website-id': publicEnv.VITE_UMAMI_WEBSITE_ID });
  }
  if (enabled.includes('clarity') && publicEnv.VITE_CLARITY_PROJECT_ID) {
    providers.push(new ClarityAnalyticsProvider(publicEnv.VITE_CLARITY_PROJECT_ID));
    injectScript(`https://www.clarity.ms/tag/${publicEnv.VITE_CLARITY_PROJECT_ID}`);
  }
}

function injectScript(src: string, attrs: Record<string, string> = {}) {
  if (typeof document === 'undefined') return;
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  document.head.appendChild(s);
}

export function track(event: AnalyticsEvent) {
  providers.forEach((p) => p.track(event));
}

export function page(path: string) {
  providers.forEach((p) => p.page(path));
}

export type { AnalyticsEvent, AnalyticsProvider, AnalyticsProviderName };
```

**Step 20.7: 写入 `src/components/AnalyticsProvider.tsx`**

```tsx
import { useEffect } from 'react';
import { useRouter } from '@tanstack/react-router';
import { initAnalytics, page } from '@/lib/analytics';
import { publicEnv } from '@/env/public';

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    initAnalytics(publicEnv);
    const unsub = router.subscribe('onLoad', ({ toLocation }) => page(toLocation.pathname));
    return unsub;
  }, [router]);
  return <>{children}</>;
}
```

**Step 20.8: 在 `src/routes/__root.tsx` 包裹**

```tsx
import { AnalyticsProvider } from '@/components/AnalyticsProvider';

<AnalyticsProvider>
  <Outlet />
</AnalyticsProvider>
```

**Step 20.9: Commit**

```bash
git add src/lib/analytics src/components/AnalyticsProvider.tsx src/routes/__root.tsx
git commit -m "feat(analytics): GA/Plausible/Umami/Clarity 多 provider"
```

---

### Task 21: 错误页（404/500）

**Files:**
- Create: `src/routes/404.tsx`
- Create: `src/routes/500.tsx`

**Step 21.1: 写入 `src/routes/404.tsx`**

```tsx
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/404')({
  component: NotFound,
});

function NotFound() {
  return (
    <main className="mx-auto max-w-md p-10 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-2 text-muted-foreground">页面不存在</p>
      <Link to="/{-$locale}" className="mt-6 inline-block text-blue-500 underline">返回首页</Link>
    </main>
  );
}
```

**Step 21.2: 写入 `src/routes/500.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/500')({
  component: ServerError,
});

function ServerError() {
  return (
    <main className="mx-auto max-w-md p-10 text-center">
      <h1 className="text-4xl font-bold">500</h1>
      <p className="mt-2 text-muted-foreground">服务器开了个小差</p>
    </main>
  );
}
```

**Step 21.3: Commit**

```bash
git add src/routes/404.tsx src/routes/500.tsx
git commit -m "feat(seo): 404 / 500 错误页"
```

---

### Task 22: Sub-Plan C 端到端验证

**Files:** 无新增

**Step 22.1: 类型校验**

```bash
pnpm run typecheck
```

预期：0 错误。

**Step 22.2: 单元测试**

```bash
pnpm run test
```

预期：blocks.test.ts + 价格/缓存/存储/环境全部 PASS。

**Step 22.3: 完整 check**

```bash
pnpm run check
```

预期：通过。

**Step 22.4: Content Collections 重新生成**

```bash
pnpm run content:build
```

预期：`.content-collections/generated/` 重建。

**Step 22.5: 构建**

```bash
pnpm run build
```

预期：成功。

**Step 22.6: dev server 冒烟**

```bash
pnpm dev
```

- `/` 返回 200，含 Hero/Stats/Features/Testimonials/Cta
- `/features` 返回 200
- `/pricing` 返回 200
- `/about` 返回 200
- `/blog` 返回 200，列表含 hello-world
- `/blog/hello-world` 返回 200
- `/docs` 重定向到 `/docs/index`
- `/docs/index` 返回 200
- `/changelog` 返回 200
- `/legal/terms` 返回 200
- `/sitemap.xml` 返回 200 XML
- `/robots.txt` 返回 200 text
- `/manifest.webmanifest` 返回 200 JSON
- `/sw.js` 返回 200 JS
- `/api/og?title=Hello&subtitle=Test` 返回 200 PNG
- `/404` 返回 200

**Step 22.7: 浏览器手动验证**

使用 Playwright 浏览器：

- 切语言：navbar `LocaleSwitcher` 选择 English，URL 变为 `/en/...`。
- Service worker 在 DevTools → Application → Service Workers 可见并 `activated`。
- 切到 Offline 刷新 `/`，仍能看到缓存的首页。

**Step 22.8: 提交（如有调整）**

```bash
git add -A
git commit -m "chore: Sub-Plan C 收尾（lint + 测试 + 构建验证）" --allow-empty
```

---

## Sub-Plan C 完成标志

- [ ] Content Collections 已生成（4 个 collections）
- [ ] 8 个 marketing blocks 全部实现
- [ ] 首页 / features / pricing / about / contact 页面均渲染
- [ ] 文档站、博客、更新日志、法律页面均可访问
- [ ] sitemap.xml / robots.txt / OG image 端点就位
- [ ] JSON-LD organization 在 head 注入
- [ ] PWA manifest + service worker 注册成功
- [ ] Analytics Provider 包裹根路由，env 驱动 4 选 N
- [ ] locale 切换 URL 正常
- [ ] 单元测试 + 类型校验 + 构建全部通过

进入 Sub-Plan D 之前，确保以上所有项就位。