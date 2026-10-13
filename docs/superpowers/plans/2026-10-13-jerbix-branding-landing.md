# Jerbix 品牌化 + Landing 单页 + 主题 / Locale 切换 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把站点接入 Jerbix 品牌资产与配色、把 `/` 改为单页 landing（锚点平滑滚动）、增加图标式主题切换（浅/深/跟随系统）与图标式 locale 切换（真实 URL 前缀）。

**Architecture:** 复用代码库既有的「纯逻辑模块 + SSR cookie/ALS + 客户端直接操作 DOM」模式（对齐 `src/lib/locale.ts` 与 Paraglide 的 locale 处理）。主题以 `data-theme` 属性驱动 CSS token；locale 以 URL 前缀驱动服务端解析，并用 cookie 兜底保持 hydration 一致。

**Tech Stack:** TanStack Start / Router（文件路由）、React 19、Tailwind v4 + shadcn v4 token、`@base-ui/react`（Menu/Button）、`@tabler/icons-react`、Vitest（node + jsdom 两个 config）、Playwright。

## Global Constraints

- 所有新增注释、文档、用户可见文案使用**中文**；中文与半角英数字之间加一个半角空格；使用标准中文全角标点。
- 机器可读字段（路由 id、token 名、函数名、cookie 名）保持英文。
- **不引入任何新依赖**：只用已有的 `@base-ui/react`、`@tabler/icons-react`、`cn`、`@/components/ui/*`。
- 遵循 TDD：每个任务先写失败测试，再实现，再提交。结构变更与行为变更不混在同一次提交。
- 客户端 bundle 不得出现服务端 secret；`VITE_` 前缀只放公开值。
- 测试命令：`pnpm test`（node，`tests/unit/**`）、`pnpm test -- --project ...` 不适用；组件测试由 `vitest.components.config.ts`（jsdom，`tests/components/**`）收集，`pnpm test` 经 workspace 同时跑两者。
- 校验命令：`pnpm check`（locale 编译 + Biome + tsc + env + locale 校验）必须全绿。
- 主题 token 以 OKLCH 表达，取值以本计划为准（已通过 WCAG AA 校验）。

---

### Task 1: 品牌资产接入与站点配置

**Files:**
- Create: `public/favicon.ico`、`public/favicon.svg`、`public/icon-jerboa.svg`、`public/favicon-16.png`、`public/favicon-32.png`、`public/favicon-48.png`、`public/favicon-64.png`、`public/favicon-180.png`、`public/favicon-192.png`、`public/favicon-256.png`、`public/favicon-512.png`、`public/app-icon-light-1024.png`、`public/app-icon-dark-1024.png`、`public/app-icon-purple-1024.png`、`public/mascot.png`、`public/logo.png`
- Modify: `public/icon.svg`、`public/manifest.json`、`src/config/website.ts`
- Test: `tests/unit/brand-config.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `websiteConfig.metadata.name === 'Jerbix'`、`websiteConfig.metadata.images` 指向 `public/` 下真实文件（`ogImage: '/logo.png'`、`logoLight: '/logo.png'`、`logoDark: '/logo.png'`）；`public/icon-jerboa.svg`、`public/mascot.png` 供后续任务引用。

- [ ] **Step 1: 复制品牌资产到 `public/`**

```bash
A="/Users/alvinyao/Downloads/jerbix-brand-assets 2"
cp "$A/favicon.ico" public/favicon.ico
cp "$A/favicon.svg" public/favicon.svg
cp "$A/favicon-jerboa.svg" public/icon-jerboa.svg
for s in 16 32 48 64 180 192 256 512; do cp "$A/favicon-$s.png" "public/favicon-$s.png"; done
cp "$A/app-icon-light-1024.png" public/app-icon-light-1024.png
cp "$A/app-icon-dark-1024.png" public/app-icon-dark-1024.png
cp "$A/app-icon-purple-1024.png" public/app-icon-purple-1024.png
cp "$A/mascot-transparent.png" public/mascot.png
cp "$A/logo-horizontal-transparent.png" public/logo.png
ls -la public/
```

- [ ] **Step 2: 用 jerboa 图标内容替换占位 `public/icon.svg`**

把 `public/icon-jerboa.svg` 的内容原样写入 `public/icon.svg`（两者内容一致；保留 `/icon.svg` 路径，因为 `src/routes/__root.tsx` 的 `links` 与既有 e2e 引用它）：

```bash
cp public/icon-jerboa.svg public/icon.svg
```

- [ ] **Step 3: 更新 `public/manifest.json`**

```json
{
  "name": "Jerbix",
  "short_name": "Jerbix",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FDF9F3",
  "theme_color": "#5D37EF",
  "icons": [
    { "src": "/favicon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/favicon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/app-icon-purple-1024.png", "sizes": "1024x1024", "type": "image/png", "purpose": "any" },
    { "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml" }
  ]
}
```

- [ ] **Step 4: 写失败测试 `tests/unit/brand-config.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { websiteConfig } from '@/config/website'

describe('websiteConfig 品牌信息', () => {
  it('站点名为 Jerbix', () => {
    expect(websiteConfig.metadata.name).toBe('Jerbix')
  })

  it('图片路径指向存在的品牌资产', () => {
    expect(websiteConfig.metadata.images.ogImage).toBe('/logo.png')
    expect(websiteConfig.metadata.images.logoLight).toBe('/logo.png')
    expect(websiteConfig.metadata.images.logoDark).toBe('/logo.png')
  })
})
```

- [ ] **Step 5: 运行测试确认失败**

Run: `pnpm test -- --run tests/unit/brand-config.test.ts`
Expected: FAIL（`name` 仍为 `'SaaS Template'`）

- [ ] **Step 6: 更新 `src/config/website.ts`**

把 `metadata` 段替换为：

```ts
  metadata: {
    name: 'Jerbix',
    images: {
      ogImage: '/logo.png',
      logoLight: '/logo.png',
      logoDark: '/logo.png',
    },
  },
```

- [ ] **Step 7: 运行测试确认通过**

Run: `pnpm test -- --run tests/unit/brand-config.test.ts`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add public src/config/website.ts tests/unit/brand-config.test.ts
git commit -m "feat(brand): 接入 Jerbix 品牌资产与站点配置"
```

---

### Task 2: 主题纯逻辑 `src/lib/theme.ts`

**Files:**
- Create: `src/lib/theme.ts`
- Test: `tests/unit/theme.test.ts`

**Interfaces:**
- Consumes: `readCookieValue`（来自 `@/lib/locale`，已存在）
- Produces:
  - `THEME_COOKIE_NAME: string`（`'THEME'`）
  - `THEMES: readonly ['light','dark','system']`
  - `type Theme = 'light' | 'dark' | 'system'`
  - `defaultTheme: Theme`（`'system'`）
  - `parseTheme(value: string | undefined): Theme | undefined`
  - `nextTheme(theme: Theme): Theme`
  - `setServerThemeGetter(getter: () => Theme): void`
  - `getTheme(): Theme`

- [ ] **Step 1: 写失败测试 `tests/unit/theme.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { nextTheme, parseTheme, THEME_COOKIE_NAME } from '@/lib/theme'

describe('parseTheme', () => {
  it('识别受支持的主题并归一化大小写与空白', () => {
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('DARK')).toBe('dark')
    expect(parseTheme('  System  ')).toBe('system')
  })

  it('对未知、空或缺失取值返回 undefined', () => {
    expect(parseTheme('sepia')).toBeUndefined()
    expect(parseTheme('')).toBeUndefined()
    expect(parseTheme(undefined)).toBeUndefined()
  })
})

describe('nextTheme', () => {
  it('按 light → dark → system → light 循环', () => {
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
    expect(nextTheme('system')).toBe('light')
  })
})

describe('THEME_COOKIE_NAME', () => {
  it('是稳定的 cookie 名', () => {
    expect(THEME_COOKIE_NAME).toBe('THEME')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --run tests/unit/theme.test.ts`
Expected: FAIL（找不到模块 `@/lib/theme`）

- [ ] **Step 3: 实现 `src/lib/theme.ts`**

```ts
/**
 * 主题解析的纯逻辑：不依赖框架、不读写全局可变状态，便于单测。
 *
 * 主题取值：
 * - `light` / `dark`：用户显式选择；
 * - `system`：跟随系统 `prefers-color-scheme`。
 *
 * 服务端通过 ALS 得到请求的 cookie 值；客户端直接读 `document.cookie`。
 * 二者对同一 cookie 得出同一结果，因此 SSR 与 hydration 一致（与 locale 同构）。
 */
import { readCookieValue } from '@/lib/locale'

export const THEME_COOKIE_NAME = 'THEME'

export const THEMES = ['light', 'dark', 'system'] as const

export type Theme = (typeof THEMES)[number]

export const defaultTheme: Theme = 'system'

/** 把任意字符串归一化为受支持的 theme；未知或缺失返回 `undefined`。 */
export function parseTheme(value: string | undefined): Theme | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return THEMES.find((theme) => theme === normalized)
}

/** 点击主题按钮时的下一个状态：light → dark → system → light。 */
export function nextTheme(theme: Theme): Theme {
  if (theme === 'light') return 'dark'
  if (theme === 'dark') return 'system'
  return 'light'
}

/**
 * 服务端主题读取器。`src/server.ts` 在模块加载期注入（读取 ALS），
 * 使本模块保持「无服务端依赖」，可安全进入客户端 bundle。
 */
let serverThemeGetter: () => Theme = () => defaultTheme

export function setServerThemeGetter(getter: () => Theme): void {
  serverThemeGetter = getter
}

/**
 * 读取当前请求 / 会话的主题。
 * - 服务端（无 `document`）：走注入的 ALS 读取器；
 * - 客户端：读 `THEME` cookie，缺失回退 `system`。
 */
export function getTheme(): Theme {
  if (typeof document === 'undefined') return serverThemeGetter()
  return parseTheme(readCookieValue(document.cookie, THEME_COOKIE_NAME)) ?? defaultTheme
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --run tests/unit/theme.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/theme.ts tests/unit/theme.test.ts
git commit -m "feat(theme): 新增主题解析纯逻辑"
```

---

### Task 3: SSR 主题接线（ALS + `data-theme` + 品牌 token）

**Files:**
- Modify: `src/lib/server-context.ts`、`src/server.ts`、`src/routes/__root.tsx`、`src/styles/globals.css`
- Test: `tests/unit/theme-ssr.test.ts`

**Interfaces:**
- Consumes: `Theme`、`defaultTheme`、`getTheme`、`parseTheme`、`setServerThemeGetter`、`THEME_COOKIE_NAME`（Task 2）
- Produces: `ServerContext.theme: Theme`；`getServerContext()` 兜底对象含 `theme`；`__root.tsx` 输出 `<html data-theme={Theme}>`。

- [ ] **Step 1: 写失败测试 `tests/unit/theme-ssr.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { getServerContext } from '@/lib/server-context'
import { defaultTheme } from '@/lib/theme'

describe('ServerContext.theme', () => {
  it('ALS 缺失时兜底为默认主题（不抛错）', () => {
    expect(getServerContext().theme).toBe(defaultTheme)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --run tests/unit/theme-ssr.test.ts`
Expected: FAIL（`theme` 属性不存在，值为 `undefined`）

- [ ] **Step 3: 在 `src/lib/server-context.ts` 增加 `theme`**

在文件顶部导入：

```ts
import { defaultTheme, type Theme } from '@/lib/theme'
```

在 `interface ServerContext` 中 `nonce` 之后增加：

```ts
  /**
   * 请求主题（来自 `THEME` cookie，缺失为 `system`）。由 `src/server.ts` 在
   * 请求入口写入；`__root.tsx` 据此输出 `<html data-theme>`，避免首屏闪烁。
   */
  theme: Theme
```

在 `getServerContext()` 的兜底对象（`nonce: ''` 之后）增加：

```ts
      // 客户端 / 测试环境无 per-request 主题；回退为跟随系统。
      theme: defaultTheme,
```

- [ ] **Step 4: 在 `src/server.ts` 写入并注入主题**

在顶部导入区（与既有 `./lib/locale` 导入相邻）增加：

```ts
import { defaultTheme, parseTheme, setServerThemeGetter, THEME_COOKIE_NAME } from './lib/theme'
```

在 `registerServerLocaleStrategy()` 之后增加：

```ts
// 注入服务端主题读取器：`src/lib/theme.ts` 的 `getTheme()` 在 SSR 时经此读取 ALS，
// 从而不必把 `node:async_hooks` 依赖带入客户端 bundle。
setServerThemeGetter(() => getServerContext().theme)
```

在 `fetch` 内、`als.run(...)` 之前解析主题：

```ts
    // 主题随 `THEME` cookie 变化；无 cookie 时为 `system`（由 CSS 媒体查询决定明暗）。
    const theme = parseTheme(readCookieValue(request.headers.get('cookie'), THEME_COOKIE_NAME)) ?? defaultTheme
```

在 `als.run({ ... })` 的对象里、`nonce,` 之后增加：

```ts
        theme,
```

并把 `readCookieValue` 加入既有 `./lib/locale` 的导入：

```ts
import { LOCALE_COOKIE_NAME, readCookieValue, readLocaleCookie } from './lib/locale'
```

> 说明：服务端**不**下发 `THEME` cookie —— 主题由客户端 `ThemeToggle` 写入，服务端只读取；
> 因此 `applySecurityHeaders` 无需改动（`Vary` 已含 `Cookie`）。

- [ ] **Step 5: 在 `src/routes/__root.tsx` 输出 `data-theme` 与品牌 `theme-color`**

增加导入：

```ts
import { getTheme } from '@/lib/theme'
```

把 `head()` 中的 `theme-color` 一项替换为两项（按系统偏好给出对应浏览器色）：

```ts
      { name: 'theme-color', content: '#FDF9F3', media: '(prefers-color-scheme: light)' },
      { name: 'theme-color', content: '#0B0E20', media: '(prefers-color-scheme: dark)' },
```

在 `RootDocument` 中读取主题并挂到 `<html>`：

```tsx
  // 与 `getLocale()` 同理：SSR 读 ALS（请求 cookie），客户端读 `THEME` cookie，
  // 两侧对同一 cookie 得出同一值，故 `data-theme` 不会在 hydration 时变化。
  const theme = getTheme()

  return (
    <html lang={htmlLang(locale)} data-theme={theme}>
```

- [ ] **Step 6: 重写 `src/styles/globals.css` 为品牌 token**

整体替换为：

```css
@import "tailwindcss";

/*
 * 主题采用 shadcn v4 的两层变量约定：
 *   1. 语义 token 以「裸变量」形式定义（--background、--primary…），组件直接引用；
 *   2. @theme inline 把裸变量映射为 Tailwind 颜色工具类（bg-primary、text-foreground…）。
 * 若缺少裸层，组件里 var(--secondary) 之类会解析为空。
 *
 * 明暗由 `<html data-theme>` 驱动：
 *   - data-theme="light" / "dark"：用户显式选择；
 *   - data-theme="system"：由 @media (prefers-color-scheme: dark) 决定。
 * Tailwind v4 要求 @theme 只能定义在顶层，故明暗覆盖写成普通 :root 规则。
 *
 * 配色取自 Jerbix 品牌（主紫、海军蓝、暖橙、奶油底），取值均通过 WCAG AA 对比度校验。
 */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  /*
   * 圆角派生尺度：由 :root 中的 --radius 基准值推导，
   * 使圆角工具类真正受 --radius 驱动（shadcn v4 约定）。
   */
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

/* ---- 浅色（默认，也用于 data-theme="light"）---- */
:root {
  --background: oklch(0.9835 0.0090 78.28);
  --foreground: oklch(0.2120 0.0513 274.59);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.2120 0.0513 274.59);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.2120 0.0513 274.59);
  --primary: oklch(0.5114 0.2532 282.17);
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.9510 0.0194 302.21);
  --secondary-foreground: oklch(0.2120 0.0513 274.59);
  --muted: oklch(0.9510 0.0194 302.21);
  --muted-foreground: oklch(0.4916 0.0437 276.49);
  --accent: oklch(0.7241 0.1543 53.26);
  --accent-foreground: oklch(0.2120 0.0513 274.59);
  --destructive: oklch(0.5527 0.2100 27.00);
  --border: oklch(0.9208 0.0195 302.19);
  --input: oklch(0.9208 0.0195 302.19);
  --ring: oklch(0.5114 0.2532 282.17);
  --radius: 0.75rem;
}

/* ---- 深色 token（显式 data-theme="dark"）---- */
:root[data-theme="dark"] {
  --background: oklch(0.1717 0.0376 274.61);
  --foreground: oklch(0.9421 0.0162 293.74);
  --card: oklch(0.2220 0.0545 274.95);
  --card-foreground: oklch(0.9421 0.0162 293.74);
  --popover: oklch(0.2220 0.0545 274.95);
  --popover-foreground: oklch(0.9421 0.0162 293.74);
  --primary: oklch(0.6345 0.2104 288.92);
  --primary-foreground: oklch(0.1717 0.0376 274.61);
  --secondary: oklch(0.2604 0.0583 274.71);
  --secondary-foreground: oklch(0.9421 0.0162 293.74);
  --muted: oklch(0.2604 0.0583 274.71);
  --muted-foreground: oklch(0.7253 0.0359 289.14);
  --accent: oklch(0.7837 0.1587 72.99);
  --accent-foreground: oklch(0.1717 0.0376 274.61);
  --destructive: oklch(0.6400 0.1900 25.00);
  --border: oklch(0.2962 0.0587 274.24);
  --input: oklch(0.2962 0.0587 274.24);
  --ring: oklch(0.6345 0.2104 288.92);
}

/* ---- 跟随系统（data-theme="system"）：深色 token 与上面保持一致 ---- */
@media (prefers-color-scheme: dark) {
  :root[data-theme="system"] {
    --background: oklch(0.1717 0.0376 274.61);
    --foreground: oklch(0.9421 0.0162 293.74);
    --card: oklch(0.2220 0.0545 274.95);
    --card-foreground: oklch(0.9421 0.0162 293.74);
    --popover: oklch(0.2220 0.0545 274.95);
    --popover-foreground: oklch(0.9421 0.0162 293.74);
    --primary: oklch(0.6345 0.2104 288.92);
    --primary-foreground: oklch(0.1717 0.0376 274.61);
    --secondary: oklch(0.2604 0.0583 274.71);
    --secondary-foreground: oklch(0.9421 0.0162 293.74);
    --muted: oklch(0.2604 0.0583 274.71);
    --muted-foreground: oklch(0.7253 0.0359 289.14);
    --accent: oklch(0.7837 0.1587 72.99);
    --accent-foreground: oklch(0.1717 0.0376 274.61);
    --destructive: oklch(0.6400 0.1900 25.00);
    --border: oklch(0.2962 0.0587 274.24);
    --input: oklch(0.2962 0.0587 274.24);
    --ring: oklch(0.6345 0.2104 288.92);
  }
}

/* 锚点平滑滚动；用户偏好减少动效时关闭。 */
html {
  scroll-behavior: smooth;
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
}
```

- [ ] **Step 7: 运行测试与类型检查**

Run: `pnpm test -- --run tests/unit/theme-ssr.test.ts && pnpm typecheck`
Expected: 测试 PASS，`tsc` 无错误

- [ ] **Step 8: 提交**

```bash
git add src/lib/server-context.ts src/server.ts src/routes/__root.tsx src/styles/globals.css tests/unit/theme-ssr.test.ts
git commit -m "feat(theme): SSR 接线 data-theme 与品牌配色 token"
```

---

### Task 4: `ThemeToggle` 图标切换组件

**Files:**
- Create: `src/components/theme/ThemeToggle.tsx`
- Modify: `messages/zh.json`、`messages/en.json`、`src/components/marketing/Navbar.tsx`
- Test: `tests/components/theme-toggle.test.tsx`

**Interfaces:**
- Consumes: `Theme`、`THEME_COOKIE_NAME`、`getTheme`、`nextTheme`（Task 2）；`Button`（`@/components/ui/button`）；`m`（Paraglide）
- Produces: `ThemeToggle()` React 组件（无 props），供 Navbar 使用。

- [ ] **Step 1: 增加消息键（`messages/zh.json`）**

在对象中增加（位置随意，保持 JSON 合法）：

```json
  "theme_label": "切换主题",
  "theme_light": "浅色",
  "theme_dark": "深色",
  "theme_system": "跟随系统",
```

- [ ] **Step 2: 增加消息键（`messages/en.json`）**

```json
  "theme_label": "Toggle theme",
  "theme_light": "Light",
  "theme_dark": "Dark",
  "theme_system": "System",
```

- [ ] **Step 3: 写失败测试 `tests/components/theme-toggle.test.tsx`**

```tsx
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  // 清空测试期间写入的 cookie
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`
  }
})

describe('ThemeToggle', () => {
  it('渲染带可访问名的图标按钮', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button')).toHaveAccessibleName()
  })

  it('点击后改写 data-theme 并写入 THEME cookie', () => {
    document.documentElement.dataset.theme = 'system'
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button'))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.cookie).toContain('THEME=light')
  })
})
```

- [ ] **Step 4: 运行测试确认失败**

Run: `pnpm test -- --run tests/components/theme-toggle.test.tsx`
Expected: FAIL（找不到模块 `@/components/theme/ThemeToggle`）

- [ ] **Step 5: 实现 `src/components/theme/ThemeToggle.tsx`**

```tsx
import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { getTheme, nextTheme, THEME_COOKIE_NAME, type Theme } from '@/lib/theme'
import { m } from '@/locale/paraglide/messages.js'

const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

/** 主题 → 图标。`system` 用显示器图标表示「跟随系统」。 */
const THEME_ICON = {
  light: IconSun,
  dark: IconMoon,
  system: IconDeviceDesktop,
} as const satisfies Record<Theme, unknown>

/**
 * 图标式主题切换按钮，循环 light → dark → system。
 *
 * 直接改写 `<html data-theme>` 并写 `THEME` cookie，**不触发整页刷新**，因此不会闪烁。
 * 初始状态经 `getTheme()` 取得：SSR 读 ALS，客户端读 cookie，两侧一致，故 hydration 稳定。
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getTheme())
  const Icon = THEME_ICON[theme]

  function apply(next: Theme) {
    setTheme(next)
    document.documentElement.dataset.theme = next
    document.cookie = `${THEME_COOKIE_NAME}=${next}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={m.theme_label()}
      title={m.theme_label()}
      onClick={() => apply(nextTheme(theme))}
    >
      <Icon aria-hidden />
    </Button>
  )
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm test -- --run tests/components/theme-toggle.test.tsx`
Expected: PASS

- [ ] **Step 7: 在 `src/components/marketing/Navbar.tsx` 挂载**

增加导入：

```ts
import { ThemeToggle } from '@/components/theme/ThemeToggle'
```

在 `<LocaleSwitcher value={locale} />` 之前插入：

```tsx
        <ThemeToggle />
```

- [ ] **Step 8: 提交**

```bash
git add src/components/theme/ThemeToggle.tsx src/components/marketing/Navbar.tsx messages/zh.json messages/en.json tests/components/theme-toggle.test.tsx
git commit -m "feat(theme): 新增图标式主题切换按钮"
```

---

### Task 5: Locale 图标化 + `swapLocale` 真实 URL 前缀

**Files:**
- Create: `src/components/icons/LocaleFlags.tsx`
- Modify: `src/lib/locale.ts`、`src/components/layout/LocaleSwitcher.tsx`、`messages/zh.json`、`messages/en.json`、`tests/setup.ts`
- Test: `tests/unit/locale.test.ts`（追加）、`tests/components/locale-switcher.test.tsx`

**Interfaces:**
- Consumes: `LOCALES`、`Locale`、`localeConfig`、`parseLocale`、`LOCALE_COOKIE_NAME`（已存在）；`Menu`（`@base-ui/react/menu`）；`Button`
- Produces:
  - `localeFromPathname(pathname: string): Locale | undefined`
  - `stripLocalePrefix(pathname: string): string`
  - `swapLocale(pathname: string, next: Locale): string`
  - `LocaleSwitcher({ value }: { value: Locale })`（签名不变）

- [ ] **Step 1: 追加失败测试到 `tests/unit/locale.test.ts`**

在文件末尾追加：

```ts
import { localeFromPathname, stripLocalePrefix, swapLocale } from '@/lib/locale'

describe('localeFromPathname', () => {
  it('提取显式 locale 前缀', () => {
    expect(localeFromPathname('/en')).toBe('en')
    expect(localeFromPathname('/zh/pricing')).toBe('zh')
  })

  it('无前缀或未知前缀返回 undefined', () => {
    expect(localeFromPathname('/')).toBeUndefined()
    expect(localeFromPathname('/pricing')).toBeUndefined()
    expect(localeFromPathname('/fr/x')).toBeUndefined()
  })
})

describe('stripLocalePrefix', () => {
  it('剥离已知前缀并保留其余路径', () => {
    expect(stripLocalePrefix('/zh')).toBe('/')
    expect(stripLocalePrefix('/en/pricing')).toBe('/pricing')
  })

  it('无已知前缀时原样返回', () => {
    expect(stripLocalePrefix('/')).toBe('/')
    expect(stripLocalePrefix('/pricing')).toBe('/pricing')
    expect(stripLocalePrefix('/fr/x')).toBe('/fr/x')
  })
})

describe('swapLocale', () => {
  it('替换已有前缀', () => {
    expect(swapLocale('/zh/pricing', 'en')).toBe('/en/pricing')
    expect(swapLocale('/en', 'zh')).toBe('/zh')
  })

  it('无前缀时补上，根路径得到纯前缀', () => {
    expect(swapLocale('/', 'en')).toBe('/en')
    expect(swapLocale('/pricing', 'en')).toBe('/en/pricing')
  })

  it('未知前缀不剥离，仅前置新前缀', () => {
    expect(swapLocale('/fr/x', 'en')).toBe('/en/fr/x')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --run tests/unit/locale.test.ts`
Expected: FAIL（`localeFromPathname` 等未导出）

- [ ] **Step 3: 在 `src/lib/locale.ts` 末尾追加实现**

```ts
/**
 * 从 pathname 提取显式 locale 前缀（`/en/x` → `en`）；无前缀或未知前缀返回 `undefined`。
 * 仅识别完整的第一段，避免 `/english` 被误判为 `en`。
 */
export function localeFromPathname(pathname: string): Locale | undefined {
  const [, first] = pathname.split('/')
  return parseLocale(first)
}

/**
 * 剥离开头的已知 locale 前缀，返回裸路径。
 * `/en` → `/`；`/en/pricing` → `/pricing`；`/pricing` → `/pricing`；`/fr/x` → `/fr/x`。
 */
export function stripLocalePrefix(pathname: string): string {
  const segments = pathname.split('/')
  if (segments.length >= 2 && parseLocale(segments[1])) {
    const rest = `/${segments.slice(2).join('/')}`
    return rest === '/' ? '/' : rest.replace(/\/$/, '')
  }
  return pathname || '/'
}

/**
 * 把 pathname 的 locale 前缀替换为 `next`，用于语言切换时导航到真实 URL。
 * 未知前缀不会被剥离，只在新前缀后保留原路径（避免丢路径）。
 */
export function swapLocale(pathname: string, next: Locale): string {
  const bare = stripLocalePrefix(pathname)
  return bare === '/' ? `/${next}` : `/${next}${bare}`
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --run tests/unit/locale.test.ts`
Expected: PASS

- [ ] **Step 5: 在 `tests/setup.ts` 增加 `ResizeObserver` 兜底**

Base UI 的 Menu 依赖 `ResizeObserver`，jsdom 未实现。在文件末尾追加：

```ts
// Base UI Menu 依赖 ResizeObserver；jsdom 未实现，补一个空实现避免组件测试报错。
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
```

- [ ] **Step 6: 增加消息键**

`messages/zh.json`：

```json
  "locale_label": "切换语言",
```

`messages/en.json`：

```json
  "locale_label": "Change language",
```

- [ ] **Step 7: 创建 `src/components/icons/LocaleFlags.tsx`**

Tabler 不提供国旗图标，故内联两个精简 SVG（`role="img"` + `aria-label`）：

```tsx
import type { Locale } from '@/lib/locale'

/** 精简国旗图标：Tabler 不含国旗，故内联。仅作视觉标识，语义由外层 `aria-label` 提供。 */
function CnFlag() {
  return (
    <svg viewBox="0 0 24 16" className="h-3.5 w-5 shrink-0" aria-hidden focusable="false">
      <rect width="24" height="16" fill="#DE2910" />
      <path d="M4 3l1.2 3.4H8.6L5.7 8.3l1 3.3L4 9.6 1.3 11.6l1-3.3L-.4 6.4h3.4z" fill="#FFDE00" />
    </svg>
  )
}

function UsFlag() {
  return (
    <svg viewBox="0 0 24 16" className="h-3.5 w-5 shrink-0" aria-hidden focusable="false">
      <rect width="24" height="16" fill="#fff" />
      {[0, 2, 4, 6, 8, 10, 12, 14].map((y) => (
        <rect key={y} y={y} width="24" height="1" fill="#B22234" />
      ))}
      <rect width="10" height="8" fill="#3C3B6E" />
    </svg>
  )
}

const FLAGS = { zh: CnFlag, en: UsFlag } as const satisfies Record<Locale, unknown>

/** 按 locale 渲染对应国旗图标。 */
export function LocaleFlag({ locale }: { locale: Locale }) {
  const Flag = FLAGS[locale]
  return <Flag />
}
```

- [ ] **Step 8: 重写 `src/components/layout/LocaleSwitcher.tsx`**

```tsx
import { Menu } from '@base-ui/react/menu'
import { IconCheck, IconLanguage } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { LocaleFlag } from '@/components/icons/LocaleFlags'
import { LOCALES, LOCALE_COOKIE_NAME, type Locale, localeConfig, swapLocale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'

const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

interface LocaleSwitcherProps {
  /** 当前 locale，由服务端与客户端解析结果一致地传入。 */
  value: Locale
}

/**
 * 图标式语言切换。
 *
 * 选择后导航到**真实 URL 前缀**（`/zh/pricing` ↔ `/en/pricing`），并同步写
 * `NEXT_LOCALE` cookie，使无前缀的 `/` 也能记住选择。用整页导航而非客户端路由，
 * 与既有「locale 变更必须走文档导航」的约束一致，保证 SSR 与 hydration 一致。
 */
export function LocaleSwitcher({ value }: LocaleSwitcherProps) {
  function select(next: Locale) {
    if (next === value) return
    document.cookie = `${LOCALE_COOKIE_NAME}=${next}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
    const { pathname, search, hash } = window.location
    window.location.assign(`${swapLocale(pathname, next)}${search}${hash}`)
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        render={<Button variant="ghost" size="icon" aria-label={m.locale_label()} />}
      >
        <IconLanguage aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={8}>
          <Menu.Popup className="min-w-36 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
            {LOCALES.map((locale) => (
              <Menu.Item
                key={locale}
                onClick={() => select(locale)}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
              >
                <LocaleFlag locale={locale} />
                <span className="flex-1">{localeConfig[locale].name}</span>
                {locale === value && <IconCheck className="size-4" aria-hidden />}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
```

- [ ] **Step 9: 写组件测试 `tests/components/locale-switcher.test.tsx`**

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'

describe('LocaleSwitcher', () => {
  it('渲染带可访问名的图标触发器', () => {
    render(<LocaleSwitcher value="zh" />)
    expect(screen.getByRole('button')).toHaveAccessibleName()
  })
})
```

- [ ] **Step 10: 运行测试确认通过**

Run: `pnpm test -- --run tests/components/locale-switcher.test.tsx tests/unit/locale.test.ts`
Expected: PASS

- [ ] **Step 11: 提交**

```bash
git add src/lib/locale.ts src/components/layout/LocaleSwitcher.tsx src/components/icons/LocaleFlags.tsx messages/zh.json messages/en.json tests/setup.ts tests/unit/locale.test.ts tests/components/locale-switcher.test.tsx
git commit -m "feat(i18n): locale 图标切换并导航到真实 URL 前缀"
```

---

### Task 6: 服务端按 URL 前缀解析 locale

**Files:**
- Modify: `src/lib/locale.ts`
- Test: `tests/unit/locale.test.ts`（追加）

**Interfaces:**
- Consumes: `localeFromPathname`（Task 5）
- Produces: `resolveLocale(request)` 的优先级变为 **path 前缀 → cookie → Accept-Language → 默认**（签名不变）。

> 目的：让 `/en/pricing` 这类显式前缀 URL 渲染英文内容，与既有 sitemap / hreflang 设计一致。
> 既有 `resolveLocale` 测试使用无前缀 URL（`http://localhost/`），故不受影响。

- [ ] **Step 1: 追加失败测试到 `tests/unit/locale.test.ts`**

```ts
describe('resolveLocale 的 URL 前缀优先级', () => {
  function requestWithPath(path: string, headers: Record<string, string> = {}): Request {
    return new Request(`http://localhost${path}`, { headers })
  }

  it('URL 前缀优先于 cookie 与 Accept-Language', () => {
    const request = requestWithPath('/en/pricing', {
      cookie: `${LOCALE_COOKIE_NAME}=zh`,
      'accept-language': 'zh-CN',
    })
    expect(resolveLocale(request)).toBe('en')
  })

  it('无前缀时回退到 cookie（保持既有行为）', () => {
    const request = requestWithPath('/pricing', { cookie: `${LOCALE_COOKIE_NAME}=en` })
    expect(resolveLocale(request)).toBe('en')
  })

  it('未知前缀不生效，继续回退', () => {
    const request = requestWithPath('/fr/x', { 'accept-language': 'en' })
    expect(resolveLocale(request)).toBe('en')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --run tests/unit/locale.test.ts`
Expected: FAIL（首个用例得到 `zh` 而非 `en`）

- [ ] **Step 3: 修改 `src/lib/locale.ts` 的 `resolveLocale`**

把 `resolveLocale` 替换为：

```ts
/**
 * 依据真实请求解析语言，优先级：URL 显式前缀 → cookie → `Accept-Language` → 默认语言。
 *
 * URL 前缀优先级最高，使 `/en/pricing` 这类可分享、可被爬虫抓取的显式前缀 URL 渲染对应
 * 语言内容（与 sitemap / hreflang 输出一致）。无前缀的 `/` 则回退到 cookie / 请求头。
 *
 * 该函数是纯函数，SSR 与 hydration 使用同一实现，保证两侧结果一致。
 */
export function resolveLocale(request: Request): Locale {
  return (
    localeFromPathname(new URL(request.url).pathname) ??
    readLocaleCookie(request.headers.get('cookie')) ??
    parseAcceptLanguage(request.headers.get('accept-language')) ??
    defaultLocale
  )
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --run tests/unit/locale.test.ts`
Expected: PASS（含既有用例）

- [ ] **Step 5: 提交**

```bash
git add src/lib/locale.ts tests/unit/locale.test.ts
git commit -m "feat(i18n): 服务端按 URL 前缀优先解析 locale"
```

---

### Task 7: Landing 单页 + 路由调整 + Navbar 锚点

**Files:**
- Create: `src/components/marketing/LandingPage.tsx`
- Modify: `src/components/blocks/marketing/hero/Hero.tsx`、`src/components/blocks/marketing/hero/types.ts`、`src/config/blocks/home.ts`、`src/routes/{-$locale}/index.tsx`、`src/routes/{-$locale}/_layout/marketing/index.tsx`、`src/components/marketing/Navbar.tsx`、`tests/unit/home-head.test.ts`、`e2e/marketing.spec.ts`、`e2e/hydration.spec.ts`
- Test: `tests/components/landing.test.tsx`

**Interfaces:**
- Consumes: `homeBlocks`、`featuresBlocks`、`pricingPlans`（`@/config/blocks`）；`Hero`/`Stats`/`Features`/`Faq`/`Testimonials`/`Cta`（`@/components/blocks/marketing`）；`Pricing`（`@/components/blocks/marketing/pricing`）；`MarketingLayout`；`seo`；`m`；`getLocale`
- Produces: `LandingPage()` 组件；路由 `/{-$locale}/` 直接渲染 landing；`/{-$locale}/marketing` 重定向到 `/{-$locale}`；`HeroProps` 增加可选 `imageClassName?: string`。

- [ ] **Step 1: 给 `HeroProps` 增加 `imageClassName`**

在 `src/components/blocks/marketing/hero/types.ts` 的 `HeroProps` 中，`image` 之后增加：

```ts
  /** 覆盖图片默认样式（默认 `mt-10 rounded-lg border shadow-sm`）；用于品牌吉祥物等无边框场景。 */
  imageClassName?: string
```

- [ ] **Step 2: 在 `Hero.tsx` 应用 `imageClassName`**

把 `Hero.tsx` 中的图片块替换为：

```tsx
      {props.image && (
        <img
          src={props.image.src}
          alt={props.image.alt}
          className={props.imageClassName ?? 'mt-10 rounded-lg border shadow-sm'}
          decoding="async"
          {...(props.imageClassName ? {} : { width: 800, height: 450 })}
        />
      )}
```

- [ ] **Step 3: 在 `src/config/blocks/home.ts` 的 Hero 增加吉祥物**

在 `homeBlocks.Hero` 对象中、`align: 'center' as const,` 之前增加：

```ts
    image: { src: '/mascot.png', alt: '' },
    imageClassName: 'mx-auto mt-10 h-48 w-auto',
```

- [ ] **Step 4: 写失败测试 `tests/components/landing.test.tsx`**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { LandingPage } from '@/components/marketing/LandingPage'

// LandingPage 依赖 <Link>，测试无需路由上下文
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))

describe('LandingPage', () => {
  it('包含特性 / 价格 / FAQ 三个锚点区段', () => {
    const { container } = render(<LandingPage />)
    expect(container.querySelector('#features')).not.toBeNull()
    expect(container.querySelector('#pricing')).not.toBeNull()
    expect(container.querySelector('#faq')).not.toBeNull()
  })

  it('渲染 hero 主标题', () => {
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: 运行测试确认失败**

Run: `pnpm test -- --run tests/components/landing.test.tsx`
Expected: FAIL（找不到模块 `@/components/marketing/LandingPage`）

- [ ] **Step 6: 实现 `src/components/marketing/LandingPage.tsx`**

```tsx
import {
  Cta,
  Faq,
  Features,
  Hero,
  Stats,
  Testimonials,
} from '@/components/blocks/marketing'
import { Pricing } from '@/components/blocks/marketing/pricing'
import { featuresBlocks, homeBlocks, pricingPlans } from '@/config/blocks'

/**
 * Landing 单页：把营销区块顺序排布在同一页面内，特性 / 价格 / FAQ 作为锚点区段，
 * 供 Navbar 平滑滚动定位（见 `globals.css` 的 `scroll-behavior`）。
 *
 * `scroll-mt-16` 抵消 sticky Navbar 的 `h-16`，避免锚点落点被导航栏遮挡。
 * 独立子页面（`/pricing`、`/marketing/features` 等）仍然保留，此组件不取代它们。
 */
export function LandingPage() {
  return (
    <>
      <Hero {...homeBlocks.Hero} />
      <Stats {...homeBlocks.Stats} />
      <section id="features" className="scroll-mt-16">
        <Features {...homeBlocks.Features} />
      </section>
      <section id="pricing" className="scroll-mt-16">
        <Pricing plans={pricingPlans} />
      </section>
      <section id="faq" className="scroll-mt-16">
        <Faq {...featuresBlocks.Faq} />
      </section>
      <Testimonials {...homeBlocks.Testimonials} />
      <Cta {...homeBlocks.Cta} />
    </>
  )
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `pnpm test -- --run tests/components/landing.test.tsx`
Expected: PASS

- [ ] **Step 8: 改写 `src/routes/{-$locale}/index.tsx` 为 landing 入口**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { LandingPage } from '@/components/marketing/LandingPage'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'
import { seo } from '@/lib/seo'
import { m } from '@/locale/paraglide/messages.js'
import { getLocale } from '@/locale/paraglide/runtime.js'

export const Route = createFileRoute('/{-$locale}/')({
  head: () =>
    seo('/', { title: m.site_name(), description: m.site_description(), locale: getLocale() }),
  component: () => (
    <MarketingLayout>
      <LandingPage />
    </MarketingLayout>
  ),
})
```

- [ ] **Step 9: 把 `_layout/marketing/index.tsx` 改为重定向**

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

// `/marketing` 作为 `/` 的别名保留（避免既有深链断裂），统一重定向到 landing 单页，
// 使同一内容只有一个 URL，canonical 均指向 `/`。
export const Route = createFileRoute('/{-$locale}/_layout/marketing/')({
  beforeLoad: () => {
    throw redirect({ to: '/{-$locale}' })
  },
  component: () => null,
})
```

- [ ] **Step 10: 更新 `tests/unit/home-head.test.ts` 的导入路径**

把：

```ts
  const { Route } = await import('@/routes/{-$locale}/_layout/marketing/index')
```

改为：

```ts
  const { Route } = await import('@/routes/{-$locale}/index')
```

- [ ] **Step 11: 运行首页 head 测试**

Run: `pnpm test -- --run tests/unit/home-head.test.ts`
Expected: PASS

- [ ] **Step 12: 更新 `Navbar.tsx`：logo 与锚点**

把 logo 链接替换为（图标 + 文字，明暗双主题均可见）：

```tsx
      <Link
        to="/{-$locale}"
        className="flex items-center gap-2 text-lg font-bold hover:opacity-80"
      >
        <img src="/icon-jerboa.svg" alt="" className="h-7 w-7" />
        <span>{websiteConfig.metadata.name}</span>
      </Link>
```

把「特性」链接改为锚点：

```tsx
        <Link
          to="/{-$locale}"
          hash="features"
          className="text-muted-foreground hover:text-foreground"
          preload="intent"
        >
          {m.nav_features()}
        </Link>
```

把「价格」链接改为锚点：

```tsx
        <Link
          to="/{-$locale}"
          hash="pricing"
          className="text-muted-foreground hover:text-foreground"
          preload="intent"
        >
          {m.nav_pricing()}
        </Link>
```

> 「博客 / 文档 / 更新日志 / 联系」等链接保持不变。

- [ ] **Step 13: 更新 `e2e/marketing.spec.ts`**

把 `test.describe('Marketing pages', ...)` 内的用例替换为：

```ts
test.describe('Marketing pages', () => {
  test('home renders landing blocks at /zh', async ({ page }) => {
    await page.goto('/zh')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('a[href="/zh/pricing"]')).toBeVisible()
  })

  test('/marketing redirects to landing', async ({ page }) => {
    await page.goto('/zh/marketing')
    await expect(page).toHaveURL(/\/zh\/?$/)
  })

  test('navbar anchor scrolls to pricing section', async ({ page }) => {
    await page.goto('/zh')
    await page.locator('nav a[href="/zh#pricing"]').click()
    await expect(page).toHaveURL(/#pricing$/)
    await expect(page.locator('#pricing')).toBeVisible()
  })

  test('pricing page shows plans', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page.getByRole('heading', { name: '简单透明的定价' })).toBeVisible()
  })

  test('features page lists modules', async ({ page }) => {
    await page.goto('/zh/marketing/features')
    await expect(page.getByText('身份认证')).toBeVisible()
    await expect(page.getByText('支付系统')).toBeVisible()
  })

  test('theme toggle switches data-theme', async ({ page }) => {
    await page.goto('/zh')
    const html = page.locator('html')
    const before = await html.getAttribute('data-theme')
    await page.getByRole('button', { name: '切换主题' }).click()
    await expect(html).not.toHaveAttribute('data-theme', before ?? '')
  })

  test('locale switcher navigates to real /en prefix', async ({ page }) => {
    await page.goto('/zh/pricing')
    await page.getByRole('button', { name: '切换语言' }).click()
    await page.getByRole('menuitem', { name: 'English' }).click()
    await expect(page).toHaveURL(/\/en\/pricing$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('sitemap.xml returns valid XML', async ({ request }) => {
    const res = await request.get('/sitemap.xml')
    expect(res.status()).toBe(200)
    expect(await res.text()).toContain('<urlset')
  })

  test('robots.txt returns expected content', async ({ request }) => {
    const res = await request.get('/robots.txt')
    expect(res.status()).toBe(200)
    expect(await res.text()).toContain('Sitemap')
  })

  test('manifest.json advertises Jerbix', async ({ request }) => {
    const res = await request.get('/manifest.json')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toMatch(/json/)
    expect(await res.text()).toContain('Jerbix')
  })
})
```

- [ ] **Step 14: 更新 `e2e/hydration.spec.ts` 的入口路径**

把 `await page.goto('/zh/marketing')` 改为：

```ts
  await page.goto('/zh')
```

- [ ] **Step 15: 运行单测与类型检查**

Run: `pnpm test -- --run tests/components/landing.test.tsx tests/unit/home-head.test.ts && pnpm typecheck`
Expected: 测试 PASS，`tsc` 无错误

- [ ] **Step 16: 提交**

```bash
git add src/components/marketing/LandingPage.tsx src/components/blocks/marketing/hero src/config/blocks/home.ts "src/routes/{-$locale}/index.tsx" "src/routes/{-$locale}/_layout/marketing/index.tsx" src/components/marketing/Navbar.tsx tests/components/landing.test.tsx tests/unit/home-head.test.ts e2e/marketing.spec.ts e2e/hydration.spec.ts
git commit -m "feat(landing): / 渲染单页 landing 并加入锚点导航"
```

---

### Task 8: 全量验证

**Files:** 无新增（只跑校验；如有失败则就地修复）

**Interfaces:**
- Consumes: 前 7 个任务的全部产物
- Produces: 全绿校验结果

- [ ] **Step 1: 运行完整测试**

Run: `pnpm test`
Expected: 全部 PASS（含 node 与 jsdom 两个 project）

- [ ] **Step 2: 运行完整校验**

Run: `pnpm check`
Expected: Biome / tsc / env / locale 校验全部通过（locale 键在 zh 与 en 一致）

- [ ] **Step 3: 生产构建与客户端 bundle 检查**

Run: `pnpm build && pnpm run check:client-bundle`
Expected: 构建成功；客户端产物无服务端 secret

- [ ] **Step 4: 本地目视确认（可选但推荐）**

Run: `pnpm dev`，然后打开 `http://localhost:3000/`
Expected: `/` 直接显示 landing；Navbar 有 jerboa 图标 + Jerbix、主题按钮、语言图标；点击「价格」平滑滚动到价格区；切换主题后配色变化且不刷新；切换到 English 后 URL 变为 `/en`。

- [ ] **Step 5: 提交修复（如有）**

若上一步暴露问题，就地修复后：

```bash
git add -A
git commit -m "fix: 收口品牌化与 landing 变更的校验问题"
```

---

## 备注与已知取舍

- **Navbar logo 用图标 + 文字**：水平 logo 的字标是深海军蓝，深色主题下不可见，故 Navbar 用彩色 jerboa 图标；水平 logo 保留给 OG 图。
- **深色 token 重复一次**：`:root[data-theme="dark"]` 与 `@media(dark){ :root[data-theme="system"] }` 各写一份，这是 shadcn 的惯例写法（CSS 无法跨媒体查询复用一段声明块）。
- **主题 cookie 仅由客户端写入**：服务端只读取，不下发，故 `applySecurityHeaders` 无需改动。
- **`resolveLocale` 优先级变化**：URL 前缀成为最高优先级；既有测试使用无前缀 URL，不受影响。
- **`{-$locale}` 可选前缀保持**：`/` 与 `/en` 共存；`/` 由 cookie / `Accept-Language` 决定语言。
- **`/pricing`、`/contact` 等顶层页面不含 Navbar / Footer**：这是变更前既有的行为，本计划不处理（不在范围内）。
