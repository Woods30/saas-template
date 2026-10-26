# Jerbix 品牌化 + Landing 单页 + 主题 / Locale 切换 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把站点接入 Jerbix 品牌资产与配色、把 `/` 改为单页 landing（锚点平滑滚动）、增加图标式主题切换（浅/深/跟随系统）与图标式 locale 切换（真实 URL 前缀）。

**Architecture:** 复用代码库既有的「纯逻辑模块 + SSR cookie/ALS + 客户端直接操作 DOM」模式（对齐 `src/lib/locale.ts` 与 Paraglide 的 locale 处理）。主题以 `data-theme` 属性驱动 CSS token；locale 以 URL 前缀驱动服务端解析，并用 cookie 兜底保持 hydration 一致。

**Tech Stack:** TanStack Start / Router（文件路由）、React 19、Tailwind v4 + shadcn v4 token、`@base-ui/react`（Menu/Button）、`@tabler/icons-react`、Vitest（node + jsdom 两个 config）、Playwright。

## 2026-10-14 品牌故事与产品价值收口

用户追加要求：呈现跳鼠品牌寓意，头部使用指定横版 Logo；减少重复中文口号，突出技术栈组合与可复用组件工具。优先编辑既有文件，指定 Logo 资源接入由本次明确请求授权。

- [x] 在既有 landing / home-head 测试中先验证双层品牌、旅程选择与短首屏、技术栈工具展示、英文标题语言属性及产品 SEO；运行确认失败。
- [x] 更新双语消息、LandingPage、Hero 与 homeBlocks、Footer 及首页 head；首屏改为跳跃旅程，品牌故事后置，新增技术栈与组件工具展示。
- [x] Navbar 接入 `public/logo-horizontal-transparent.svg`，保留原图与 locale，验证移动与明暗主题。
- [x] 独立 review 并通过失败测试修复 SVG 轨迹暂停、平板登录断点、标题测试与 `lang="en"` 问题；最终 spec / quality 均通过。
- [x] 完整 check / unit / component / marketing / hydration E2E、生产构建、bundle 扫描与布局验收，记录结果。

本轮验收：`pnpm check` 零 error / warning；283 项单元测试、41 项组件测试、17 项 marketing / hydration E2E 通过。单元与组件测试使用 `--maxWorkers=2`，E2E 使用 `--workers=2`；首轮高负载下出现主题按钮交互超时，浏览器实际切换与完整 E2E 复跑均通过。中英文 × 375 / 390 / 768 / 1100 / 1440 px × 明暗主题共 20 组无横向溢出，指定 Logo 加载正常；键盘旅程选择、吉祥物与轨迹暂停、离屏停止、reduced-motion 通过。生产构建成功，客户端 38 个文件无敏感字段；保留主 chunk 546.77 kB 与 auth 混合导入的既有构建警告。截图为 `.playwright-mcp/brand-story-zh-desktop.png`、`.playwright-mcp/brand-story-zh-mobile.png`、`.playwright-mcp/brand-story-en-dark.png`。当前分支保留，未提交、推送或部署。

测试隔离修复：既有邮件脱敏测试错误地将 fake client 当作 API key，导致真实网络请求；已在 SDK 边界 mock 并验证禁止 fetch、精确截断多行错误，不修改邮件生产代码。首页 head 测试改为准备期导入真实 Route，避免冷模块加载占用单个用例超时，保留每请求语言验证。

## 2026-10-13 动态产品实验室实施计划

本轮沿用已确认产品文案与定位，不提交或推送；所有任务仅编辑既有文件。紧密耦合的交互与样式在当前会话实施，最后独立 review。

- [x] 在 `tests/components/landing.test.tsx` 中先增加模块按钮 aria-pressed / 说明变化、暂停恢复、三个 workflow 按钮关联面板切换、语言示意预览测试；运行组件测试确认缺失交互导致失败。
- [x] 修改 `src/components/marketing/LandingPage.tsx`，实现首屏可选择架构、六项场景示意、流程预览及全页暂停；保持小函数职责分离。新增文案追加 `messages/zh.json` 与 `messages/en.json`，始终 render 时调用。
- [x] 修改 `src/styles/globals.css` 和既有 Hero / Features 组件，为 landing 设置作用域样式：网格光晕、轨道、连线、浮动、按钮箭头、卡片 Hover / focus、单次入场；prefers-reduced-motion 全部关闭，暂停与文档隐藏时冻结，IntersectionObserver 不隐藏未执行 JS 的内容。
- [x] 执行完整检查与浏览器交互、responsive / dark / reduced-motion 验证；独立 review 并修复重要缺陷，记录测试与构建警告。

本轮验收记录：281 项单元测试、37 项组件测试、16 项 marketing / hydration E2E 通过；`pnpm check` 零 error / warning。中英文 × 375 / 390 / 768 / 1440 px × 明暗主题共 16 组无横向溢出、模块按钮重叠或文字裁切；窄屏中心标签遮挡问题已通过失败 E2E 复现、修复并回归验证。暂停 / 恢复、离屏停止、reduced-motion 与语言预览交互通过。独立 review 的 spec / quality 均通过，已修复步骤排布、终端离屏暂停和 reduced-motion Hover 位移问题。生产构建成功，客户端扫描 38 个文件无敏感字段；Vite 仍有 542.01 kB 主 chunk 与 auth 混合静态 / 动态导入的既有警告。最终截图位于 `.playwright-mcp/lab-en-dark.png`、`.playwright-mcp/lab-mobile.png` 与 `.playwright-mcp/lab-en-mobile-stage.png`。保留当前分支工作区，未提交、推送或部署。

## 2026-10-13 产品首页改版实施计划

用户已确认定位、文案方向、首页撤下演示价格与无来源评价。以下任务取代历史首页任务；不执行历史计划中的提交、复制资源或创建文件步骤。

### Task A：产品叙事与首页 blocks

修改 `messages/zh.json`、`messages/en.json`、`src/config/pages/home.ts`、`src/components/marketing/LandingPage.tsx`、既有 Hero / Features / Faq / Cta 的组件与 types、`tests/components/landing.test.tsx`。不创建文件或新增依赖。

接口：保留 `homeBlocks` 导出，使用 getter 使消息在读取时求值；Hero 增加可选 ReactNode visual / eyebrow，Features 支持图标与 bento variant，保留旧调用默认行为。LandingPage 内分离技术条、流程与模板说明函数，各函数只读取所需文案。保留 features / pricing / faq 锚点。

- [x] 先在现有 landing 测试增加 zh → en → zh 连续 render 的正文检查、首页无演示套餐和评价、D1 FAQ、主要文档 CTA；执行组件测试确认预期失败。
- [x] 重写双语消息与首页配置，使用具体收益和准确能力边界；替换数字 Stats 和 Testimonials，接入双栏 Hero、技术条、Bento、三步流程、源码能力说明、FAQ 与 CTA。
- [x] 运行 locale:compile、landing 组件测试、typecheck 与定向 Biome，修复错误并交由独立代理复核。

### Task B：响应式导航与资源 Footer

修改 `src/components/marketing/Navbar.tsx`、`Footer.tsx`、已有 `tests/components/landing.test.tsx` 和 `e2e/marketing.spec.ts` / `e2e/hydration.spec.ts`；新文案仅追加到已有 messages 文件。

接口：Navbar 的价格入口改为源码说明入口但仍指向 pricing 锚点；主导航 features / workflow / docs，更多资源进入 Footer。移动菜单 trigger 具有 aria-expanded / aria-controls，支持 Escape 与导航后关闭；主题与语言切换保持现有接口。

- [x] 添加移动菜单开关 / Escape 焦点恢复 / 导航后关闭的失败 E2E，以及首页双语正文、375 px 无溢出和源码锚点 E2E。
- [x] 实现紧凑导航、移动菜单与资源 Footer；保留合法路由与 locale。
- [x] 去除 hydration 测试中对正文语言 mismatch 的忽略，确认真正无 hydration 错误。
- [x] 运行 pnpm check、pnpm test、显式组件测试、marketing / hydration E2E、pnpm build、check:client-bundle；在浏览器验证明暗主题与 375 / 390 / 768 / 桌面布局，独立最终 review 后修复重要问题。

验收记录：281 项单元测试、34 项组件测试、14 项 E2E 通过；静态检查零 error / warning；双语四尺寸明暗主题共 16 组无横向溢出，reduced-motion 使用 auto 滚动；独立最终 review 的 spec / quality 均通过。生产构建成功，客户端 38 个文件无敏感字段；Vite 仍提示 540 KB 主 chunk 与 auth 混合静态 / 动态导入警告，未调整构建阈值或认证结构。本次保留分支工作区，不提交或推送。

约束：中文注释与中英文产品文案、保留用户已有生成物和 migration 修改、不修改认证 / 支付行为或 schema、不提交或推送、不新增依赖、不新增文件。仅改已有设计 / 计划以记录已确认改版。验证完成后勾选本节任务。

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
 *   - data-theme="light" / "dark"：用户显式选择（改写 color-scheme）；
 *   - data-theme="system"：跟随系统 prefers-color-scheme（color-scheme: light dark）。
 * 每个 token 用 `light-dark(明, 暗)` 一次声明两值，由 color-scheme 决定取哪一个，
 * 因此不存在重复的明暗声明块。`light-dark()` 自 2024 起为现代浏览器基线特性。
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

/* ---- 明暗选择：改写 color-scheme，light-dark() 据此取值 ---- */
/* 默认跟随系统；显式选择时覆盖。 */
:root {
  color-scheme: light dark;
}
:root[data-theme="light"] {
  color-scheme: light;
}
:root[data-theme="dark"] {
  color-scheme: dark;
}

/* ---- 品牌 token：每个 token 用 light-dark(明, 暗) 一次声明 ---- */
:root {
  --background: light-dark(oklch(0.9835 0.0090 78.28), oklch(0.1717 0.0376 274.61));
  --foreground: light-dark(oklch(0.2120 0.0513 274.59), oklch(0.9421 0.0162 293.74));
  --card: light-dark(oklch(1 0 0), oklch(0.2220 0.0545 274.95));
  --card-foreground: light-dark(oklch(0.2120 0.0513 274.59), oklch(0.9421 0.0162 293.74));
  --popover: light-dark(oklch(1 0 0), oklch(0.2220 0.0545 274.95));
  --popover-foreground: light-dark(oklch(0.2120 0.0513 274.59), oklch(0.9421 0.0162 293.74));
  --primary: light-dark(oklch(0.5114 0.2532 282.17), oklch(0.6345 0.2104 288.92));
  --primary-foreground: light-dark(oklch(1 0 0), oklch(0.1717 0.0376 274.61));
  --secondary: light-dark(oklch(0.9510 0.0194 302.21), oklch(0.2604 0.0583 274.71));
  --secondary-foreground: light-dark(oklch(0.2120 0.0513 274.59), oklch(0.9421 0.0162 293.74));
  --muted: light-dark(oklch(0.9510 0.0194 302.21), oklch(0.2604 0.0583 274.71));
  --muted-foreground: light-dark(oklch(0.4916 0.0437 276.49), oklch(0.7253 0.0359 289.14));
  --accent: light-dark(oklch(0.7241 0.1543 53.26), oklch(0.7837 0.1587 72.99));
  --accent-foreground: light-dark(oklch(0.2120 0.0513 274.59), oklch(0.1717 0.0376 274.61));
  --destructive: light-dark(oklch(0.5527 0.2100 27.00), oklch(0.6400 0.1900 25.00));
  --border: light-dark(oklch(0.9208 0.0195 302.19), oklch(0.2962 0.0587 274.24));
  --input: light-dark(oklch(0.9208 0.0195 302.19), oklch(0.2962 0.0587 274.24));
  --ring: light-dark(oklch(0.5114 0.2532 282.17), oklch(0.6345 0.2104 288.92));
  --radius: 0.75rem;
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
- Modify: `src/components/sections/hero/Hero.tsx`、`src/components/sections/hero/types.ts`、`src/config/pages/home.ts`、`src/routes/{-$locale}/index.tsx`、`src/routes/{-$locale}/_layout/marketing/index.tsx`、`src/components/marketing/Navbar.tsx`、`tests/unit/home-head.test.ts`、`e2e/marketing.spec.ts`、`e2e/hydration.spec.ts`
- Test: `tests/components/landing.test.tsx`

**Interfaces:**
- Consumes: `homeBlocks`、`featuresBlocks`、`pricingPlans`（`@/config/pages`）；`Hero`/`Stats`/`Features`/`Faq`/`Testimonials`/`Cta`（`@/components/sections`）；`Pricing`（`@/components/sections/Pricing`）；`MarketingLayout`；`seo`；`m`；`getLocale`
- Produces: `LandingPage()` 组件；路由 `/{-$locale}/` 直接渲染 landing；`/{-$locale}/marketing` 重定向到 `/{-$locale}`；`HeroProps` 增加可选 `imageClassName?: string`。

- [ ] **Step 1: 给 `HeroProps` 增加 `imageClassName`**

在 `src/components/sections/hero/types.ts` 的 `HeroProps` 中，`image` 之后增加：

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

- [ ] **Step 3: 在 `src/config/pages/home.ts` 的 Hero 增加吉祥物**

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
} from '@/components/sections'
import { Pricing } from '@/components/sections/Pricing'
import { featuresBlocks, homeBlocks, pricingPlans } from '@/config/pages'

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
git add src/components/marketing/LandingPage.tsx src/components/sections/hero src/config/pages/home.ts "src/routes/{-$locale}/index.tsx" "src/routes/{-$locale}/_layout/marketing/index.tsx" src/components/marketing/Navbar.tsx tests/components/landing.test.tsx tests/unit/home-head.test.ts e2e/marketing.spec.ts e2e/hydration.spec.ts
git commit -m "feat(landing): / 渲染单页 landing 并加入锚点导航"
```

---

### Task 8: 修复仓库基线校验问题 + 全量验证

**背景（已核实）**：`pnpm check` 在**本次变更之前**（`main` 与 `02c56a9`）就已失败，与品牌化 / landing 无关。用户裁定：**把这些既有问题一并修掉**，使 `pnpm check` 真正全绿。

**Files:**
- Modify: `biome.json`、`public/favicon.svg`、`public/icon-jerboa.svg`、`public/icon.svg`、`src/lib/security.ts`、`tests/components/pricing.test.tsx`、`tests/components/analytics.test.ts`、`tests/workers/setup.ts`，以及其余被 `biome check --write` 格式化的既有文件（`e2e/*`、`playwright.config.ts`、`src/lib/content-locale.ts`、`src/lib/docs.ts`、`src/components/docs/DocsLayout.tsx`、`src/routes/{-$locale}/_layout/docs/*`、`tests/setup.ts`、`tests/unit/{security,seo}.test.ts`、`vitest.*.config.ts`）
- Modify: `src/lib/theme.ts`（docstring 修正）、`tests/unit/theme.test.ts`（补 `getTheme`/`setServerThemeGetter` 覆盖）、`src/components/theme/ThemeToggle.tsx`（让 aria-label 反映下一主题，使 3 个消息键生效）
- Test: 复用既有测试文件

**Interfaces:**
- Consumes: 前 7 个任务的全部产物
- Produces: `pnpm check` 全绿；`pnpm test` 全绿；`pnpm build` + `check:client-bundle` 通过

**注意（提交纪律）**：结构变更（格式化 / import 排序）与行为变更（移除未用变量、非空断言改写、aria-label 语义）**分两次提交**，不要混在一起。

- [ ] **Step 1: 把 `.tanstack/` 加入 `.gitignore`**

在 `.gitignore` 末尾追加：

```
.tanstack
playwright-report
test-results
```

- [ ] **Step 2: 结构变更 —— 格式化与 import 排序（单独提交）**

Run: `npx biome check --write .`
Expected: 大多数 `format` 与 `assist/source/organizeImports` 错误被自动修复（约 31 → 5 errors）。

- [ ] **Step 3: 确认测试仍全绿，提交结构变更**

Run: `pnpm test`
Expected: 全绿（格式化不应改变行为）。

```bash
git add .gitignore biome.json e2e playwright.config.ts src tests vitest.*.config.ts
git commit -m "style: 应用 Biome 格式化与 import 排序（仓库基线）"
```

- [ ] **Step 4: 行为变更 —— 手工修复剩余 lint 错误**

剩余的 5 个错误需人工判断：

1. `public/favicon.svg`、`public/icon-jerboa.svg`、`public/icon.svg` — `lint/a11y/noSvgWithoutTitle`。
   这三个是**装饰性品牌图标**（经 `<link rel="icon">` / `<img>` 使用，无内联语义）。
   在 `biome.json` 的 `linter.rules.a11y` 中为 `public/**/*.svg` 关闭该规则，或给每个 SVG 加 `<title>`。
   **选择**：在 `biome.json` 增加 override，对 `public/*.svg` 关闭 `noSvgWithoutTitle`（图标不应带 `<title>`，否则会被读屏器朗读为噪音）。例如：

```json
  "overrides": [
    {
      "includes": ["public/**/*.svg"],
      "linter": { "rules": { "a11y": { "noSvgWithoutTitle": "off" } } }
    }
  ]
```

2. `src/lib/security.ts:209` — `lint/suspicious/noAssignInExpressions`。
   把赋值表达式拆成独立语句（先赋值、再用变量），不改变逻辑。

3. `tests/components/pricing.test.tsx` — `lint/a11y/useButtonType`。
   给该 `<button>` 加 `type="button"`。

- [ ] **Step 5: 修复 `pnpm typecheck` 的 5 个既有类型错误**

`tests/components/pricing.test.tsx` 的 `noUncheckedIndexedAccess` 报错（`pro.prices[0]` 可能为 undefined）。
在测试内用局部变量 + 显式断言替代索引访问，例如：

```ts
const [proPrice] = pro.prices
expect(proPrice?.amount).toBe(1900)
```

对 `lifetime.prices[0]` 同理。改完 `pnpm typecheck` 应无错误。

- [ ] **Step 6: 修正 `src/lib/theme.ts` 的 docstring**

把模块头部「不依赖框架、不读写全局可变状态」改为「不依赖框架、便于单测」（模块确实持有并改写 `serverThemeGetter`，原措辞不准确）。

- [ ] **Step 7: 补充 `tests/unit/theme.test.ts` 覆盖**

增加两个用例（当前 `getTheme`/`setServerThemeGetter` 无覆盖）：

```ts
describe('getTheme / setServerThemeGetter', () => {
  it('服务端路径返回注入的 getter 值', () => {
    setServerThemeGetter(() => 'dark')
    // node 环境无 document，走 serverThemeGetter
    expect(getTheme()).toBe('dark')
    setServerThemeGetter(() => defaultTheme) // 复位，避免影响其他用例
  })

  it('默认 getter 返回 defaultTheme', () => {
    expect(getTheme()).toBe(defaultTheme)
  })
})
```

同时补充 `defaultTheme` 与 `THEMES` 的断言。

- [ ] **Step 8: 让 `ThemeToggle` 的 aria-label 反映下一个主题**

把静态 `m.theme_label()` 改为「动作 + 目标主题」，使 `theme_light` / `theme_dark` / `theme_system` 三个键真正生效。例如：

```tsx
const NEXT_LABEL = {
  light: m.theme_dark,
  dark: m.theme_system,
  system: m.theme_light,
} as const
// aria-label={NEXT_LABEL[theme]()}  title 同理
```

> 若担心消息键文案（「浅色/深色/跟随系统」）作为按钮标签不够明确，可改为组合文案；保持三个键都被使用即可。

- [ ] **Step 9: 运行完整校验，确认全绿**

Run: `pnpm check`
Expected: Biome 0 error / 0 warning、tsc 0 error、env 校验通过、locale 键一致。

Run: `pnpm test`
Expected: 全绿（含 node 与 jsdom 两个 project）。

- [ ] **Step 10: 生产构建与客户端 bundle 检查**

Run: `pnpm build && pnpm run check:client-bundle`
Expected: 构建成功；客户端产物无服务端 secret。

- [ ] **Step 11: 提交行为变更**

```bash
git add -A
git commit -m "fix: 修复仓库基线的 lint 与类型错误，并补齐主题测试覆盖"
```

- [ ] **Step 12: 本地目视确认（可选但推荐）**

Run: `pnpm dev`，然后打开 `http://localhost:3000/`
Expected: `/` 直接显示 landing；Navbar 有 jerboa 图标 + Jerbix、主题按钮、语言图标；点击「价格」平滑滚动到价格区；切换主题后配色变化且不刷新；切换到 English 后 URL 变为 `/en`。

---

## 备注与已知取舍

- **Navbar logo 用图标 + 文字**：水平 logo 的字标是深海军蓝，深色主题下不可见，故 Navbar 用彩色 jerboa 图标；水平 logo 保留给 OG 图。
- **明暗用 `light-dark()` 单次声明**：每个 token 一行 `light-dark(明, 暗)`，由 `color-scheme` 决定取值；`system` 天然跟随系统，无需媒体查询，也不存在重复的深色声明块。浏览器基线支持自 2024 起。
- **主题 cookie 仅由客户端写入**：服务端只读取，不下发，故 `applySecurityHeaders` 无需改动。
- **`resolveLocale` 优先级变化**：URL 前缀成为最高优先级；既有测试使用无前缀 URL，不受影响。
- **`{-$locale}` 可选前缀保持**：`/` 与 `/en` 共存；`/` 由 cookie / `Accept-Language` 决定语言。
- **`/pricing`、`/contact` 等顶层页面不含 Navbar / Footer**：这是变更前既有的行为，本计划不处理（不在范围内）。
