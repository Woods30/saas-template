# Jerbix 品牌化 + Landing 单页 + 主题 / Locale 切换 设计文档

## 2026-10-14 品牌故事与产品价值收口

本节按用户最新要求取代此前首屏工程示意与品牌旅程长文案。

- 品牌为 Jerbix，产品为 Jerbix Starter。品牌 Slogan 为 `Small Steps. Big Leaps.`，产品 Slogan 为 `Leap from Idea to Launch.`。
- 中英文首屏均使用英文产品 Slogan，并标注 `lang="en"`。正文用一句简短价值说明，强调 TanStack Start + Cloudflare、组件复用与业务基础；不重复展示品牌口号或长篇中文译句。
- 首屏图从工程模块拓扑改为跳鼠沿着小／大跳跃弧线向前的旅程。灵感、构建、上线三个原生按钮切换吉祥物位置及简短说明，支持键盘、暂停、reduced-motion、离屏与文档隐藏停止。
- 技术栈与组件工具置于首页主体前部：TanStack Start / Router / Query + TypeScript；Workers / D1 / R2 / KV + Drizzle；Tailwind CSS v4 / shadcn/ui / Base UI / Tabler。展示已有 UI、营销 Blocks、文档内容与 setup / env / locale / Biome / Vitest / Playwright 工具，不将需要凭据的服务宣传为零配置。
- 品牌故事移至源码说明之后，浓缩为两段，讲述跳鼠小巧、敏捷、善于跳跃与一个人／小团队创造产品的联系。品牌 Slogan 在故事与 Footer 展示。
- Navbar 使用用户指定的 `logo-horizontal-transparent.svg` 原图，保留完整跳鼠与字标、locale 链接和可访问名称。深色主题使用 Logo 专用浅色底片，移动端保持紧凑。
- 页面顺序：Hero → 技术条 → 技术栈与工具 → 业务模块 Bento → 开发流程 → 源码说明 → 品牌故事 → FAQ → CTA。沿用既有锚点，不新增依赖，不修改认证、支付、数据库或生产设置。

## 2026-10-13 动态产品实验室增强（用户已确认）

- 首屏加入轨道、品牌吉祥物、可点击模块节点与能力说明；模块按钮使用 aria-pressed，桌面轻微视差仅在细指针且用户允许动效时启用。
- 六张 Bento 提供登录、支付流程、Cloudflare 架构、文件、邮件、语言场景示意。示意不请求服务，不使用虚构业务指标，全部标明演示；语言示意仅切换预览文案。
- workflow 使用三个可点击步骤，右侧切换配置、业务代码、检查部署示意；按钮使用 aria-pressed，面板与当前步骤通过 aria-labelledby 关联。
- CSS 负责轨道、连线、吉祥物浮动、卡片反馈和进入视口的短动画；React 负责模块与步骤选择、暂停控制和 IntersectionObserver。无新增依赖或文件，保持中英、明暗主题与既有锚点。
- 持续动画支持显式暂停；reduced-motion 时禁用动画与视差，文档隐藏与区块离开视口时停止持续动画；正文在无 JS / 无 observer 时仍可见。
- 验收：先编写模块选择、暂停与恢复、workflow 切换、双语预览的失败测试；浏览器验证键盘、375 / 390 / 768 / 桌面、明暗主题、暂停与 reduced-motion；完整 check / unit / component / marketing / hydration E2E / build / bundle 检查。
- 交付状态：已实现并验证，详细测试结果与既有构建警告见同日期实施计划中的「本轮验收记录」。

## 2026-10-13 产品首页改版（用户已确认）

本节取代下方历史设计中的首页内容顺序；路由、品牌资产与主题机制继续沿用。

- 产品定位：面向独立开发者与创业者的 TanStack Start + Cloudflare Workers SaaS Starter，交付可修改的起步工程。
- 价值主线：把时间花在产品上，减少常用基础模块的重复接线。
- 参考：Tailark 仅作 blocks 视觉参考；TanStarter 的收益与技术依据表达、ShipAny 的启动流程与场景表达作为内容参考。
- 顺序：双栏 Hero → 技术基础条 → 核心优势 Bento（features）→ 三步启动流程（workflow）→ 模板能力与上手入口（pricing，保留旧锚点兼容）→ FAQ（faq）→ CTA。
- Hero 主标题：把时间花在产品上，让 Jerbix 打好 SaaS 的基础。按钮为了解如何开始、探索内置能力；工程能力示意必须标为示意，不使用虚构业务数据或声称为实际后台。
- 能力依据：Workers / D1 / R2 / KV、TypeScript、认证基础、Stripe Checkout / Portal / Webhook、事务邮件模板、中英双语与内容站点、setup 与检查工具。明确需要配置自己的资源、服务凭据并接入产品业务。
- 撤下首页演示套餐、用户配额、未经核实的性能数字和用户评价；保留独立定价页，首页不以注册账号模拟购买模板。
- FAQ 明确数据库为 D1（SQLite）与 Drizzle；不宣称现成 PostgreSQL / MySQL、MFA、Magic Link、退款全流程、送达追踪、AI 工作流或后台已交付。
- 视觉：奶油底、海军蓝文字、品牌紫与暖橙点缀；统一 max-w-6xl，细边框与适量留白，桌面非对称布局、移动端单栏。导航折叠并支持键盘操作，保留明暗主题和 reduced-motion。
- 数据与组件：优先修改现有文件，首页配置在 render 时读取消息，复用既有 Hero / Features / Faq / Cta；首页专属流程和技术条放在 LandingPage 内的独立函数中，不引入依赖。
- 验收：中英文首页文案与 SEO 一致，跨语言切换不固化；旧 pricing 锚点可达；375 / 390 / 768 / 桌面宽度无横向溢出；移动导航可展开、关闭；明暗主题、FAQ、CTA、锚点正常；pnpm check、单元与组件测试、marketing / hydration E2E、build 和 bundle 检查通过。


- **日期**：2026-10-13
- **状态**：Approved（待实现）
- **范围**：Sub-Plan C 之后的品牌与交互收口（Landing 路由、品牌资产、主题系统、locale 路由）

## 背景与动机

Sub-Plan A / C 落地后，站点骨架、marketing blocks、docs / blog / changelog / legal、
SEO / PWA / Analytics 均已可用，但存在四个待修复项：

1. `marketing` 路由实际承载的是 landing page 内容，但根路径 `/{locale}/` 仅做
   `redirect → /{locale}/marketing`，用户期望在 `/` 直接看到 landing page，且特性、
   价格等区块在同一页面内以平滑滚动锚点形式呈现（单页 SPA 观感）。
2. 站点仍使用占位品牌（`SaaS Template`、占位 `public/icon.svg` 的 "S"、指向不存在文件的
   `logoLight` / `logoDark` / `ogImage`）。实际品牌资产（Jerbix）已提供但未接入。
3. 前端配色为通用蓝色 `#0070f3`，与品牌无关；且无主题切换入口（深色仅跟随系统）。
4. `LocaleSwitcher` 为原生文本 `<select>`，且切换依赖 cookie + 整页重载，未使用真实 URL
   前缀，SEO 与可分享性不佳。

本设计一次性收口上述四项，并明确不引入的复杂度（见「非目标」）。

## 现状事实（已核对代码）

- `src/routes/{-$locale}/index.tsx`：`beforeLoad` 抛 `redirect({ to: '/{-$locale}/marketing' })`。
- `src/routes/{-$locale}/_layout/marketing/index.tsx`：渲染
  `Hero → Stats → Features → Testimonials → Cta`，`head()` 调用 `seo('/', ...)`。
- `src/routes/{-$locale}/pricing.tsx`：独立价格页，渲染 `Hero → Pricing → Cta`。
- `src/components/marketing/Navbar.tsx`：`Link to="/{-$locale}"` 作 logo，另有
  features / pricing / blog / docs / changelog / contact / login 链接与 `LocaleSwitcher`。
- `src/components/layout/LocaleSwitcher.tsx`：原生 `<select>`，`setLocale()` 写 cookie 并重载。
- `src/styles/globals.css`：shadcn v4 两层 token；`:root` 浅色 + `@media(prefers-color-scheme:dark)`
  深色；无 `.dark` / `data-theme` 变体。
- `src/server.ts`：`als.run` 存 `env / nonce / providers`；`paraglideMiddleware` 解析 locale，
  并按需下发 `NEXT_LOCALE` cookie（含 `Vary: Accept-Language, Cookie`）。
- `src/lib/locale.ts`：`LOCALES`、`defaultLocale`、`LOCALE_COOKIE_NAME`、`resolveLocale()`、
  `readLocaleCookie()`、`compareMessageKeys()` 等纯逻辑（框架无关，已单测）。
- `public/`：仅 `icon.svg`（占位 "S"）与 `manifest.json`（`name: "SaaS Template"`）。
- 品牌资产目录：`/Users/alvinyao/Downloads/jerbix-brand-assets 2`。

### 品牌色实测（用于配色，非猜测）

用 PIL 对 PNG 采样、对 SVG 提取十六进制，得到：

| 名称 | 值 | 来源 |
|---|---|---|
| 主紫 | `#5D37EF` / `#673DE8` | `app-icon-purple-1024.png` 背景、`favicon-jerboa.svg` 披风 |
| 海军蓝（字标） | `#121630` | `wordmark-dark-transparent.png` |
| 深底 | `#10132A` / `#0B0E20` | `app-icon-dark-1024.png` 背景 |
| 橙（毛发） | `#EF873B` / `#F5A623` | `favicon.svg` 耳朵渐变 |
| 奶油 | `#FEE7CD` / `#FDF9F3` | `app-icon-light-1024.png` 底、腹部 |

水平 / 垂直 logo 与 mascot 的 `.svg` 是 base64 位图包装（`<image href="data:image/png;base64,...">`），
并非矢量路径；真正的矢量是 `favicon-jerboa.svg`。

### 对比度实测（WCAG，已计算）

| 组合 | 比值 | 结论 |
|---|---|---|
| `#121630` on `#FFFFFF` | 17.75:1 | AA/AAA |
| `#5D37EF` on `#FFFFFF` | 6.45:1 | AA（正文级） |
| `#8B6BFF` on `#0B0E20` | 5.14:1 | AA |
| `#ECEAF6` on `#0B0E20` | 16.09:1 | AA/AAA |
| `#F5A623` on `#0B0E20` | 9.44:1 | AA/AAA |
| `#A5A3BC` on `#0B0E20` | 7.80:1 | AA/AAA |

## 非目标（YAGNI）

- 不引入 `next-themes` 或任何主题库；复用既有 cookie + ALS 模式。
- 不做横向滑块 / scroll-snap 整屏吸附（用户已否决，选择平滑滚动锚点）。
- 不合并 / 删除独立子页面（`/pricing`、`/marketing/features` 等全部保留）。
- 不改动 `{-$locale}` 可选前缀机制、不改动 Paraglide 策略配置。
- 不做 `/en` 强制前缀重定向（保持 `/` 与 `/en` 共存，见「风险」）。
- 不新增 satori 动态 OG 图（沿用 Sub-Plan C 的静态占位决定）。

## 设计

### 1. Landing 单页与路由

**路由调整**

- `src/routes/{-$locale}/index.tsx`：不再 redirect，改为直接渲染 landing 单页，
  由 `MarketingLayout`（Navbar + Footer）包裹，`head()` 保持 `seo('/', ...)` 不变。
- `src/routes/{-$locale}/_layout/marketing/index.tsx`：改为
  `beforeLoad` 抛 `redirect({ to: '/{-$locale}' })`，使 `/marketing` 成为 `/` 的别名，
  避免同一内容出现在两个 URL 上产生重复内容（canonical 均指向 `/`）。
- 其余子路由（`pricing`、`marketing/features`、`marketing/about`、`blog`、`changelog`、
  `legal/$slug`、`docs/*`、`contact`）保持不变。

**Landing 段落与锚点**

新增 `src/components/marketing/LandingPage.tsx`，按序组合：

| 顺序 | 区块 | 锚点 id | 数据来源 |
|---|---|---|---|
| 1 | Hero（含 mascot 图） | — | `homeBlocks.Hero` |
| 2 | Stats | — | `homeBlocks.Stats` |
| 3 | Features | `features` | `homeBlocks.Features` |
| 4 | Pricing | `pricing` | `pricingPlans` |
| 5 | Faq | `faq` | `featuresBlocks.Faq` |
| 6 | Testimonials | — | `homeBlocks.Testimonials` |
| 7 | Cta | — | `homeBlocks.Cta` |

每个锚点段用 `<section id="..." className="scroll-mt-16">` 包裹（`scroll-mt-16` 抵消
sticky Navbar 的 `h-16`，避免锚点落点被遮挡）。

**导航**

- `Navbar` 的「特性」「价格」由路由跳转改为锚点：`<Link to="/{-$locale}" hash="features">`
  与 `hash="pricing"`。在子页面点击时，TanStack Router 会导航回 `/` 并定位锚点。
- `globals.css` 增加 `html { scroll-behavior: smooth }`，并在
  `@media (prefers-reduced-motion: reduce)` 下改为 `auto`（可访问性）。

### 2. 品牌资产接入

从品牌目录复制到 `public/`：

| 源文件 | 目标 | 用途 |
|---|---|---|
| `favicon.ico` | `public/favicon.ico` | 浏览器默认图标 |
| `favicon.svg` | `public/favicon.svg` | SVG 图标（现代浏览器） |
| `favicon-jerboa.svg` | `public/icon-jerboa.svg` | Navbar logo 图标 |
| `favicon-{16,32,48,64,180,192,256,512}.png` | `public/` 同名 | 多尺寸图标 / PWA / Apple Touch |
| `app-icon-{light,dark,purple}-1024.png` | `public/` 同名 | PWA `manifest.json` 图标 |
| `mascot-transparent.png` | `public/mascot.png` | Hero 主视觉 |
| `logo-horizontal-transparent.png` | `public/logo.png` | OG 图 / 浅底场景 |

**Navbar logo 决策**：水平 logo 的 "Jerbix" 字标为深海军蓝 `#121630`，在深色主题下不可见。
因此 Navbar 采用 **jerboa 图标（彩色，明暗双主题均可见）+ `text-foreground` 文字 "Jerbix"**；
水平 logo 仅用于 OG 图与浅底场景。

**配置更新**（`src/config/website.ts`）：

- `metadata.name`: `'SaaS Template'` → `'Jerbix'`
- `metadata.images.logoLight` / `logoDark`: 修正为 `'/logo.png'`（当前指向不存在的文件）
- `metadata.images.ogImage`: `'/og.png'`（不存在）→ `'/logo.png'`

**`public/manifest.json`**：`name` / `short_name` 改 Jerbix，`theme_color` 改主紫
`#5D37EF`，`background_color` 改 `#FDF9F3`，`icons` 换为 Jerbix 图标集合。

**`public/icon.svg`**：用 `favicon-jerboa.svg` 的内容替换占位 "S"（两者内容一致）。
保留 `/icon.svg` 路径，因为 `__root.tsx` 的 `links` 与既有 e2e 引用它。

### 3. 主题配色与切换

**配色 token（shadcn v4 两层约定，OKLCH）**

浅色 `:root`：

| Token | 值 | 说明 |
|---|---|---|
| `--background` | `oklch(0.9835 0.0090 78.28)` | 奶油白 `#FDF9F3` |
| `--foreground` | `oklch(0.2120 0.0513 274.59)` | 海军蓝 `#121630` |
| `--card` / `--popover` | `oklch(1 0 0)` | 白 |
| `--primary` | `oklch(0.5114 0.2532 282.17)` | 品牌紫 `#5D37EF` |
| `--primary-foreground` | `oklch(1 0 0)` | 白 |
| `--secondary` | `oklch(0.9510 0.0194 302.21)` | 淡紫 `#F1ECFA` |
| `--muted` | `oklch(0.9510 0.0194 302.21)` | 同上 |
| `--muted-foreground` | `oklch(0.4916 0.0437 276.49)` | `#5A5F7A` |
| `--accent` | `oklch(0.7241 0.1543 53.26)` | 橙 `#EF873B` |
| `--accent-foreground` | `oklch(0.2120 0.0513 274.59)` | 海军蓝 |
| `--destructive` | 保持 `oklch(0.55 0.22 27)` 系红 | 与品牌无关 |
| `--border` | `oklch(0.9208 0.0195 302.19)` | `#E7E2F0` |
| `--input` | 同 `--border` | — |
| `--ring` | `oklch(0.5114 0.2532 282.17)` | 主紫 |
| `--radius` | `0.75rem` | 略圆润，呼应 mascot |

深色：

| Token | 值 | 说明 |
|---|---|---|
| `--background` | `oklch(0.1717 0.0376 274.61)` | `#0B0E20` |
| `--foreground` | `oklch(0.9421 0.0162 293.74)` | `#ECEAF6` |
| `--card` | `oklch(0.2220 0.0545 274.95)` | `#141834` |
| `--primary` | `oklch(0.6345 0.2104 288.92)` | 提亮紫 `#8B6BFF`（深底对比 5.14:1） |
| `--primary-foreground` | `oklch(0.1717 0.0376 274.61)` | 深底 |
| `--secondary` | `oklch(0.2604 0.0583 274.71)` | `#1C2140` |
| `--muted-foreground` | `oklch(0.7253 0.0359 289.14)` | `#A5A3BC` |
| `--accent` | `oklch(0.7837 0.1587 72.99)` | 亮橙 `#F5A623`（深底对比 9.44:1） |
| `--border` | `oklch(0.2962 0.0587 274.24)` | `#242A4A` |
| `--ring` | `oklch(0.6345 0.2104 288.92)` | — |

> 上述值在实现阶段以 tweakcn.com/editor/theme 的 shadcn v4 导出格式复核并保持一致；
> 若 tweakcn 导出与上表有细微差异，以上表（已通过对比度校验）为准。

**主题切换机制（无闪烁、CSP 安全）**

- 新增 `src/lib/theme.ts`（纯逻辑，可单测，模式对齐 `src/lib/locale.ts`）：
  - `THEME_COOKIE_NAME = 'THEME'`
  - `type Theme = 'light' | 'dark' | 'system'`
  - `parseTheme(value: string | undefined): Theme | undefined`
  - `nextTheme(theme: Theme): Theme`（点击循环 `light → dark → system`）
- `src/server.ts`：读取 `THEME` cookie 写入 ALS 的 `theme` 字段（与 locale 同一 `als.run`，
  不新增中间件）。`THEME` cookie 的下发与 `NEXT_LOCALE` 不同：主题可被客户端在无刷新情况下
  改写，服务端无需感知，因此**服务端只在请求解析到 `theme === 'dark' | 'light'` 且与 cookie
  不一致时补发**，`system` 不下发（视为未设置）。`Vary` 已含 `Cookie`，无需追加。
- `src/lib/server-context.ts`：`ServerContext` 增加 `theme` 字段。
- `src/routes/__root.tsx`：`<html data-theme={theme}>`（`theme` 为 `light` / `dark` / `system`）。
- `src/styles/globals.css`：
  - `:root` 设 `color-scheme: light dark`（跟随系统）；`:root[data-theme='light'|'dark']`
    分别覆盖为 `color-scheme: light|dark`（显式选择）；
  - 每个 token 用 `light-dark(明, 暗)` 一次声明两值，由 `color-scheme` 决定取值——
    不存在重复的深色声明块，`system` 天然跟随系统，无需媒体查询。
- 新增 `src/components/theme/ThemeToggle.tsx`：
  - Tabler `IconSun` / `IconMoon` / `IconDeviceDesktop`，用既有 `Button`（`variant="ghost"`,
    `size="icon"`）包裹，`aria-label` 描述当前与下一个状态；
  - 点击循环 `light → dark → system`，**直接改**
    `document.documentElement.dataset.theme` 并写 `THEME` cookie（`Path=/; Max-Age=1y; SameSite=Lax`），
    **不刷新页面**，避免闪烁；
  - 挂载到 `Navbar`（与 `LocaleSwitcher` 相邻）。
- `theme-color` meta：`__root.tsx` 的 `theme-color` 由 `#0070f3` 改为品牌紫，并按
  `theme` 输出对应值（浅色 `#5D37EF` / 深色 `#0B0E20`）。

### 4. Locale 图标化 + 真实 URL 前缀

- 新增 `src/components/icons/LocaleFlags.tsx`：内联 SVG 国旗（CN / US）。Tabler 无国旗图标
  （刻意如此），故自建；每个 SVG 带 `role="img"` + `aria-label`。
- `src/components/layout/LocaleSwitcher.tsx` 重写：
  - 触发器为 `IconLanguage` 图标按钮（`Button` `variant="ghost" size="icon"`）；
  - 面板用 `@base-ui/react` 的 menu（与既有 `Button` 同一 primitive 家族），选项含
    国旗 + 母语名（`localeConfig[locale].name`），选中项带 `aria-checked`；
  - 选择后调用 `swapLocale` 导航到真实前缀，并写 `NEXT_LOCALE` cookie（供无前缀 `/` 使用）。
- 新增纯函数（放入 `src/lib/locale.ts` 或新 `src/lib/locale-url.ts`，便于单测）：

  ```ts
  /** 把 pathname 中的 locale 前缀替换为 next；无前缀时补上。 */
  export function swapLocale(pathname: string, next: Locale): string
  ```

  规则：剥离开头的 `/{已知 locale}`（若有）→ 得到裸路径（可能为 `/`）→ 拼接 `/{next}`。
  例：`/zh/pricing` → `/en/pricing`；`/pricing` → `/en/pricing`；`/` → `/en`。

- 导航使用 TanStack Router 的 `router.navigate({ to })`（或 `<Link>`），并保留
  `hash` / `search`（若存在）。

## 数据流

```
请求 → src/server.ts
  ├─ als.run({ env, nonce, providers, theme })      ← 新增 theme（读 THEME cookie）
  └─ paraglideMiddleware(request)                   ← 解析 locale（cookie → Accept-Language → 默认）
       └─ createStartHandler → TanStack Router SSR
            ├─ __root.tsx: <html lang data-theme>   ← lang 来自 locale，data-theme 来自 theme
            └─ 路由 head() / 组件
  ← applySecurityHeaders: CSP(nonce) + NEXT_LOCALE / THEME cookie + Vary
```

客户端交互：

```
ThemeToggle   → documentElement.dataset.theme + cookie THEME   （无刷新）
LocaleSwitcher → swapLocale(pathname) → router.navigate() + cookie NEXT_LOCALE
```

## 错误处理与边界

- `THEME` cookie 取值非法 → `parseTheme` 返回 `undefined` → 视作 `system`。
- `data-theme` 缺失（如极早期 SSR / 静态回退）→ 浅色 token 生效（`:root` 默认），可接受。
- `swapLocale` 遇到未知前缀（如 `/fr/x`）→ 不剥离（`fr` 非受支持 locale），仅在前面补
  `/{next}`，不丢路径。
- 锚点 id 不存在（用户手改 URL）→ 浏览器行为为不滚动，无异常。
- 无 JS 时：主题按钮失效，回退为系统主题（可接受）；锚点链接为原生 `<a href="#features">`
  语义（`Link` 渲染为 `<a>`），仍可跳转。

## 测试策略

**单元测试（新增 / 更新）**

- `tests/unit/theme.test.ts`：`parseTheme`（合法 / 非法 / 空）、`nextTheme`（循环）。
- `tests/unit/locale.test.ts`：新增 `swapLocale` 用例（有前缀 / 无前缀 / 根路径 / 未知前缀）。
- `tests/unit/home-head.test.ts`：更新动态导入路径（首页路由文件变更后）。
- `tests/unit/blocks.test.ts`：若 registry 无变化则不动。

**E2E（更新 `e2e/marketing.spec.ts`）**

- 首页在 `/`（与 `/zh`）直接渲染全部区块（不再依赖 `/zh/marketing`）。
- 点击 Navbar「价格」锚点后 URL hash 为 `#pricing` 且价格区块可见。
- 主题按钮：点击后 `html[data-theme]` 变化，且 `document.cookie` 记录新的 `THEME` 值。
- locale 切换：选择 English 后 URL 变为 `/en/...`，`<html lang>` 为 `en`。
- 保留 sitemap / robots / manifest 断言；`manifest.json` 断言 `name` 含 `Jerbix`。

**门槛**

- `pnpm check`（locale 编译 + Biome + tsc + env + locale 校验）全绿
- `pnpm test` 全绿
- `pnpm build` 成功；`pnpm run check:client-bundle` 通过（无 secret 进入客户端）

## 风险与权衡

1. **重复内容**：`/` 与 `/marketing` 若同时渲染 landing，会产生重复内容。已通过
   `/marketing` → `/` 重定向解决，canonical 统一指向 `/`。
2. **`/` 与 `/en` 共存**：`{-$locale}` 为可选前缀，`/` 由 cookie / `Accept-Language` 决定语言。
   `getAlternateLinks` 的 `x-default` 指向无前缀路径，与现状一致；本设计不改该行为。
   locale 切换按钮会导航到显式前缀，属于「用户显式选择」，与 SEO 的 `x-default` 不冲突。
3. **主题 cookie 与 CDN 缓存**：`Vary: Accept-Language, Cookie` 已存在，主题随 cookie 变化
   会被正确区分，无需新增 `Vary`。
4. **e2e 既有断言**：`e2e/marketing.spec.ts` 明确依赖 `/zh/marketing`、`select[aria-label="切换语言"]`
   与 `/contact` 的占位文案，本次变更需同步更新（已在测试策略中列出）。
5. **深色下的 Cta 区块**：`Cta` 使用 `bg-primary text-primary-foreground`，深色下为亮紫底 +
   深字，对比 5.14:1，符合 AA，无需特判。

## 交付清单

**新增**

- `src/lib/theme.ts`
- `src/components/theme/ThemeToggle.tsx`
- `src/components/marketing/LandingPage.tsx`
- `src/components/icons/LocaleFlags.tsx`
- `public/` 品牌资产（favicon 系列、app-icon 系列、mascot.png、logo.png）
- `tests/unit/theme.test.ts`

**修改**

- `src/routes/{-$locale}/index.tsx`（渲染 landing）
- `src/routes/{-$locale}/_layout/marketing/index.tsx`（改为重定向）
- `src/components/marketing/Navbar.tsx`（logo、锚点、ThemeToggle）
- `src/components/layout/LocaleSwitcher.tsx`（图标 + 真实 URL）
- `src/styles/globals.css`（品牌 token、data-theme、smooth scroll）
- `src/server.ts`、`src/lib/server-context.ts`（theme 进 ALS）
- `src/routes/__root.tsx`（data-theme、theme-color）
- `src/config/website.ts`（品牌名与图片路径）
- `src/config/pages/home.ts`（Hero 加 mascot 图）
- `public/manifest.json`、`public/icon.svg`
- `messages/{zh,en}.json`（主题 / locale 相关文案）
- `src/lib/locale.ts` 或新增 `src/lib/locale-url.ts`（`swapLocale`）
- `tests/unit/home-head.test.ts`、`tests/unit/locale.test.ts`、`e2e/marketing.spec.ts`
