# 网站源码配置与公共菜单实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让公共菜单、社交链接、页面与 API 门禁、服务配置检查使用一致的源码配置。

**Architecture:** 公共网站配置只保存语言无关值；菜单工厂按当前语言求值，通过 TanStack 类型安全目标生成站内链接。纯函数计算服务的配置完整性，服务端门禁在业务调用之前执行；外部服务的实际业务闭环由后续子项目完成。

**Tech Stack:** TanStack Start / Router、React 19、TypeScript strict、Paraglide、Tailwind CSS v4、Tabler、Zod、Vitest、Playwright、Cloudflare Workers。

## Global Constraints

- 使用现有 TanStack Start / TanStack Router、React 19、TypeScript strict、Tailwind CSS v4、Base UI、Tabler、Paraglide、Zod 与 pnpm；本子项目不添加依赖。
- 项目文档、注释及中文产品文案使用中文，中文与半角英数字之间添加半角空格。
- 支持 zh / en，默认 zh；复用 `src/lib/locale.ts` 与 Paraglide，不在网站配置复制 locales 清单。
- `websiteConfig` 模块加载期仅保存语言无关的公开值。
- 所有消息在工厂调用、组件 render 或每请求 head 中求值。
- 公开 env 只经 `src/env/public.ts` 读取；服务端 env 只经 `src/env/server.ts` 校验；secret 不得使用 `VITE_` 前缀或进入客户端配置。
- 不直接读取、打印或覆盖真实 `.env`；现有检查命令可按其校验契约读取配置且只输出字段名。不修改 Workers 生产设置，不上传 secret，不执行远程迁移、外部投递、真实支付或部署。
- 不手改 `src/routeTree.gen.ts` 或 Paraglide 生成文件。
- 保留用户指定的 `public/logo-horizontal-transparent.svg` 原图及深色主题浅色底片。
- 行为修改先写失败测试，确认失败原因后实施最小修改；结构整理与行为修改分开交付。
- 本次文档不执行 commit / push；未来提交须获授权，并使用项目规定的 attribution。

规格：[网站源码配置与公共菜单设计](../specs/2026-10-14-site-config-navigation-design.md)。

本计划只执行第一个子项目。账户 Sidebar / Avatar 与其真实路由、会话在第二子项目共同交付。认证、Stripe 数据模型、名单订阅授权和 Analytics 的外部协议不得夹入本计划。

---

## 文件与职责

| 文件 | 操作 | 职责 |
|---|---|---|
| `src/config/website.ts` | 修改 | 显式配置类型与传入 PublicEnv 的工厂 |
| `src/config/navigation.ts` | 创建 | 类型安全目标、菜单类型与递归过滤 |
| `src/config/navbar-config.ts` | 创建 | 公共导航与 actions |
| `src/config/footer-config.ts` | 创建 | 页脚分组 |
| `src/config/social-config.ts` | 创建 | 社交平台映射和链接验证 |
| `src/config/service-status.ts` | 创建 | 无副作用配置诊断 |
| `src/components/layout/MenuLink.tsx` | 创建 | 内外链接渲染 |
| `src/components/layout/MenuItems.tsx` | 创建 | 递归菜单渲染 |
| `src/lib/module-access.ts` | 创建 | 页面功能门禁 |
| `src/lib/module-access.server.ts` | 创建 | API 配置门禁 |
| `src/env/public.ts`、`src/env/server.ts`、`src/types/cloudflare.d.ts`、`.env.example` | 修改 | 新字段与运行时字符串契约 |
| Navbar / Footer / DocsLayout / ThemeToggle / home blocks / theme | 修改 | 配置消费者 |
| `src/server.ts`、provider registries、contact notifications、analytics 初始化 | 修改 | 归一化配置与 provider 选择 |
| 指定页面、API、sitemap、check scripts | 修改 | 配置一致生效 |
| README、双语上手文档 | 修改 | 配置说明与能力边界 |
| `tests/unit/navigation.test.ts`、`service-status.test.ts`、`module-access.test.ts` | 创建 | 独立逻辑契约 |
| `tests/components/navigation.test.tsx`、`e2e/site-config.spec.ts` | 创建 | 真实路由渲染与默认门禁 |
| 现有 brand / env / theme / service / script / marketing 测试 | 修改 | 更新行为与回归覆盖 |

执行前记录 `git status --short` 与当前 diff。现有 Landing Page 修改、`.content-collections` 更新、`.playwright-mcp` 和迁移快照不是本计划独立提交的内容；不得清理它们。无需创建 worktree，用户没有要求。

## Task 1：配置类型、默认值与环境字段

**Files:**
- Modify: `src/config/website.ts`
- Modify: `src/env/public.ts`
- Modify: `src/env/server.ts`
- Modify: `src/types/cloudflare.d.ts`
- Modify: `.env.example`
- Test: `tests/unit/brand-config.test.ts`
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Consumes: `PublicEnv`、`publicEnv`、`parsePublicEnv`、`parseServerEnv`。
- Produces: `WebsiteConfig`、`SiteModule`、`ServiceModule`、`AnalyticsName`、`SocialPlatform`、`createWebsiteConfig(env: PublicEnv): WebsiteConfig`、`websiteConfig`。

- [ ] **Step 1：编写失败测试。** 更新 brand 图片预期；扩展 env 用例，验证 MAIL_FROM 格式、Umami HTTPS URL，以及配置不依赖真实环境。

```ts
it('显式公开 env 决定 baseUrl，默认只开启已有内容模块', () => {
  const config = createWebsiteConfig(parsePublicEnv({ VITE_BASE_URL: 'https://jerbix.dev' }))
  expect(config.baseUrl).toBe('https://jerbix.dev')
  expect(config.docs.enabled).toBe(true)
  expect(config.blog.enabled).toBe(true)
  expect(config.payment.enabled).toBe(false)
  expect(config.newsletter.enabled).toBe(false)
  expect(config.metadata.images.logoLight).toBe('/logo-horizontal-transparent.svg')
})
it('拒绝非法发件地址与非 HTTPS 分析脚本', () => {
  expect(() => parseServerEnv({ MAIL_FROM: 'bad-address' })).toThrow()
  expect(() => parsePublicEnv({ VITE_UMAMI_SCRIPT_URL: 'http://stats.jerbix.dev/script.js' })).toThrow()
})
```

- [ ] **Step 2：运行 Red。** `pnpm exec vitest run tests/unit/brand-config.test.ts tests/unit/env.test.ts`。预期缺失工厂或字段断言失败；先消除测试本身的导入 / fixture 问题。

- [ ] **Step 3：实现显式配置类型与默认值。** `website.ts` 使用下面的完整字段，不保留重复的 docs / newsletter / contact enable 来源。

```ts
import { type PublicEnv, publicEnv } from '@/env/public'

export type AnalyticsName = 'ga' | 'plausible' | 'umami' | 'clarity'
export type SocialPlatform = 'github' | 'x' | 'bluesky' | 'mastodon' | 'discord' |
  'youtube' | 'linkedin' | 'facebook' | 'instagram' | 'tiktok' | 'telegram'
export type ServiceModule = 'mail' | 'contact' | 'newsletter' | 'payment' | 'notification' | 'analytics'
export type SiteModule = 'docs' | 'blog' | 'changelog' | ServiceModule
export interface WebsiteConfig {
  baseUrl: string
  metadata: { name: string; images: { ogImage: string; logoLight: string; logoDark: string; icon: string } }
  ui: { defaultTheme: 'light' | 'dark' | 'system'; enableThemeSwitch: boolean }
  docs: { enabled: boolean }
  blog: { enabled: boolean }
  changelog: { enabled: boolean }
  mail: { enabled: boolean; provider: 'resend' | 'cloudflare'; supportEmail: string }
  contact: { enabled: boolean }
  newsletter: { enabled: boolean; provider: 'resend' | 'beehiiv' }
  payment: { enabled: boolean; provider: 'stripe'; allowedPriceIds: string[] }
  notification: { enabled: boolean }
  analytics: { enabled: boolean; providers: AnalyticsName[] }
  social: Partial<Record<SocialPlatform, string>>
  features: { enableI18n: boolean; enableFileUpload: boolean; enableApiKeys: boolean; enableAdmin: boolean; enableAIGateway: boolean }
}
export function createWebsiteConfig(env: PublicEnv): WebsiteConfig {
  return {
    baseUrl: env.VITE_BASE_URL,
    metadata: { name: 'Jerbix', images: {
      ogImage: '/logo.png', logoLight: '/logo-horizontal-transparent.svg',
      logoDark: '/logo-horizontal-transparent.svg', icon: '/icon-jerboa.svg',
    } },
    ui: { defaultTheme: 'system', enableThemeSwitch: true },
    docs: { enabled: true }, blog: { enabled: true }, changelog: { enabled: true },
    mail: { enabled: false, provider: 'resend', supportEmail: '' },
    contact: { enabled: false }, newsletter: { enabled: false, provider: 'resend' },
    payment: { enabled: false, provider: 'stripe', allowedPriceIds: [] },
    notification: { enabled: false }, analytics: { enabled: false, providers: [] },
    social: {},
    features: { enableI18n: true, enableFileUpload: false, enableApiKeys: false, enableAdmin: false, enableAIGateway: false },
  }
}
export const websiteConfig = createWebsiteConfig(publicEnv)
```

向 public schema 加入：

```ts
VITE_UMAMI_SCRIPT_URL: z.url().refine((value) => {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password
}, { message: 'VITE_UMAMI_SCRIPT_URL 必须为无凭据的 HTTPS URL' }).optional(),
```

向 server schema 加入 `MAIL_FROM: z.email().optional()`。Env 的字符串字段通过 `Partial<ServerEnv>` 类型扩展，保留 DB / CACHE / BUCKET binding，EMAIL 改为可选；如 enum 默认与现有使用冲突，用 `ServerEnv` 字段类型分别声明，避免重复未校验类型。`.env.example` 只增加 `MAIL_FROM=`、`VITE_UMAMI_SCRIPT_URL=` 与中文说明，不改真实 `.env`。

此任务同时把已有 `websiteConfig.notification.enable` 消费和对应测试 fixture 改为 `.enabled`，避免中间类型错误；其余通知行为不变。

- [ ] **Step 4：Green。** 运行上述测试及 `pnpm typecheck`。更新 brand 测试以 `existsSync(new URL('../../public/...', import.meta.url))` 验证资产确实存在，而非仅比较字符串。
- [ ] **Step 5：任务评审。** 检查客户端配置无服务端 env、无模块期消息；记录 diff 和测试证据。没有 commit 授权时保持未提交。

## Task 2：类型安全菜单、过滤和配置工厂

**Files:**
- Create: `src/config/navigation.ts`
- Create: `src/config/navbar-config.ts`
- Create: `src/config/footer-config.ts`
- Create: `src/config/social-config.ts`
- Create: `tests/unit/navigation.test.ts`
- Modify: `messages/zh.json`、`messages/en.json`

**Interfaces:**
- Consumes: Task 1 配置类型、`Locale`、TanStack `linkOptions`、`m`。
- Produces: `getPublicLinkOptions`、`MenuItem`、`MenuContext`、`filterMenuItems`、`getNavbarLinks`、`getNavbarActions`、`getFooterLinks`、`getSocialLinks`、`isSafeSocialUrl`。

- [ ] **Step 1：Red 测试。** 测试 zh → en → zh 不缓存消息、locale 注入、关闭 docs 后清除链接、递归空组和分隔符规范、角色检查、外链校验。

```ts
it('移除空组与连续分隔符且不修改输入', () => {
  const items: MenuItem[] = [
    { kind: 'separator', id: 'first' },
    { kind: 'group', id: 'docs', title: 'Docs', visibility: { module: 'docs' }, items: [] },
    { kind: 'link', id: 'home', title: 'Home', destination: {
      kind: 'internal', options: getPublicLinkOptions('home', 'en'),
    } },
    { kind: 'separator', id: 'last' },
  ]
  const original = structuredClone(items)
  const config = createWebsiteConfig(parsePublicEnv({}))
  config.docs.enabled = false
  expect(filterMenuItems(items, { config, authenticated: false })).toEqual([items[2]])
  expect(items).toEqual(original)
})
it('非法社交地址不输出，合法 HTTPS 与邮箱输出', () => {
  const config = createWebsiteConfig(parsePublicEnv({}))
  config.social = { github: 'https://github.com/jerbix', x: 'javascript:alert(1)' }
  config.mail.supportEmail = ['support', 'jerbix.dev'].join('@')
  expect(getSocialLinks(config, 'zh').map((item) => item.id)).toEqual(['github', 'support'])
})
```

- [ ] **Step 2：运行。** `pnpm exec vitest run tests/unit/navigation.test.ts`；预期工厂尚不存在或行为不满足。
- [ ] **Step 3：实现目标与类型。** `navigation.ts` 先定义有限公共目标；一处注入 locale。法律目标与 slug 绑定，菜单不保存无约束 URL。

```ts
import type { TablerIcon } from '@tabler/icons-react'
import { linkOptions } from '@tanstack/react-router'
import type { WebsiteConfig, SiteModule } from './website'
import type { Locale } from '@/lib/locale'

export type PublicTarget = 'home' | 'docs' | 'blog' | 'changelog' | 'pricing' | 'contact' | 'login' | 'terms' | 'privacy'
export function getPublicLinkOptions(target: PublicTarget, locale: Locale, hash?: string) {
  switch (target) {
    case 'home': return linkOptions({ to: '/{-$locale}', params: { locale }, hash })
    case 'docs': return linkOptions({ to: '/{-$locale}/docs', params: { locale } })
    case 'blog': return linkOptions({ to: '/{-$locale}/marketing/blog', params: { locale } })
    case 'changelog': return linkOptions({ to: '/{-$locale}/marketing/changelog', params: { locale } })
    case 'pricing': return linkOptions({ to: '/{-$locale}/pricing', params: { locale } })
    case 'contact': return linkOptions({ to: '/{-$locale}/contact', params: { locale } })
    case 'login': return linkOptions({ to: '/{-$locale}/auth/login', params: { locale } })
    case 'terms': return linkOptions({ to: '/{-$locale}/marketing/legal/$slug', params: { locale, slug: 'terms' } })
    case 'privacy': return linkOptions({ to: '/{-$locale}/marketing/legal/$slug', params: { locale, slug: 'privacy' } })
  }
}
export type MenuVisibility = { module?: SiteModule; authenticated?: boolean; roles?: readonly string[] }
type Common = { id: string; visibility?: MenuVisibility }
type Label = { title: string; description?: string; icon?: TablerIcon }
export type MenuLinkItem = Common & Label & { kind: 'link'; destination:
  | { kind: 'internal'; options: ReturnType<typeof getPublicLinkOptions> }
  | { kind: 'external'; href: string; newTab: boolean } }
export type MenuItem = MenuLinkItem |
  (Common & Label & { kind: 'group'; items: readonly MenuItem[] }) |
  (Common & { kind: 'separator' })
export type MenuContext = { config: WebsiteConfig; authenticated: boolean; role?: string }
export function filterMenuItems(items: readonly MenuItem[], ctx: MenuContext): MenuItem[] {
  const output: MenuItem[] = []
  for (const item of items) {
    const rule = item.visibility
    if (rule?.module && !ctx.config[rule.module].enabled) continue
    if (rule?.authenticated !== undefined && rule.authenticated !== ctx.authenticated) continue
    if (rule?.roles && (!ctx.authenticated || !ctx.role || !rule.roles.includes(ctx.role))) continue
    const next = item.kind === 'group' ? { ...item, items: filterMenuItems(item.items, ctx) } : item
    if (next.kind === 'group' && next.items.length === 0) continue
    if (next.kind === 'separator' && (!output.length || output.at(-1)?.kind === 'separator')) continue
    output.push(next)
  }
  if (output.at(-1)?.kind === 'separator') output.pop()
  return output
}
```

使用 `linkOptions` 校验扩展目标的 search / params，renderer 直接展开 options，禁止丢弃 search/hash 或强制 `as any`。当前工厂只为首页锚点消费 hash；将来新增 search 参数必须采用对应目标的 route schema。

`navbar-config.ts`：

```ts
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'
import { filterMenuItems, getPublicLinkOptions, type MenuContext, type MenuLinkItem } from './navigation'
export function getNavbarLinks(locale: Locale, ctx: MenuContext) {
  return filterMenuItems([
    { kind: 'link', id: 'features', title: m.nav_features(), destination: { kind: 'internal', options: getPublicLinkOptions('home', locale, 'features') } },
    { kind: 'link', id: 'workflow', title: m.nav_workflow(), destination: { kind: 'internal', options: getPublicLinkOptions('home', locale, 'workflow') } },
    { kind: 'link', id: 'template', title: m.nav_template(), destination: { kind: 'internal', options: getPublicLinkOptions('home', locale, 'pricing') } },
    { kind: 'link', id: 'docs', title: m.nav_docs(), visibility: { module: 'docs' }, destination: { kind: 'internal', options: getPublicLinkOptions('docs', locale) } },
  ], ctx)
}
export function getNavbarActions(locale: Locale, config: MenuContext['config']) {
  return {
    login: { kind: 'link', id: 'login', title: m.nav_login(), destination: { kind: 'internal', options: getPublicLinkOptions('login', locale) } },
    primary: { kind: 'link', id: 'start', title: m.nav_start(), destination: { kind: 'internal', options: getPublicLinkOptions(config.docs.enabled ? 'docs' : 'home', locale, 'features') } },
  } satisfies Record<'login' | 'primary', MenuLinkItem>
}
```

Footer 工厂复用同一套目标，返回两个 group：`product` 标题 `m.footer_product()`，children 为 navbar 前三项和 `changelog`；`resources` 标题 `m.footer_resources()`，children 为 docs、blog、terms、privacy。changelog / docs / blog 各设置其 module，最后调用 `filterMenuItems`。不把 Navbar 是否包含 docs 当作 Footer 的间接配置源，Footer 明确拥有自己的 children。

Social 工厂按规格的 11 个平台固定顺序遍历，平台名称为技术名，不翻译；`support` 标签新增消息 `social_support`（zh：联系邮箱；en：Support email）。图标使用 Tabler 的对应 Brand 图标与 IconMail；选定导出必须由 `pnpm typecheck` 验证，不能猜不存在的导出。

```ts
export function isSafeSocialUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch { return false }
}
// getSocialLinks 的循环主体；platform/icon 来自固定平台映射。
if (href && isSafeSocialUrl(href)) {
  links.push({ kind: 'link', id: platform, title: label, icon,
    destination: { kind: 'external', href, newTab: true } })
}
// supportEmail 经 z.email().safeParse 成功后：
links.push({ kind: 'link', id: 'support', title: m.social_support(), icon: IconMail,
  destination: { kind: 'external', href: `mailto:${config.mail.supportEmail}`, newTab: false } })
```

- [ ] **Step 4：Green / 类型负例。** 添加 TypeScript 编译用函数（不要在运行时执行）：`// @ts-expect-error` 下用 `linkOptions({to:'/{-$locale}/not-a-route',params:{locale:'zh'}})` 和缺 slug 的法律链接。`pnpm typecheck` 必须拒绝这些调用且不出现 unused expect-error。运行导航测试、locale 编译 / 配对校验。
- [ ] **Step 5：任务评审。** 确认未生成 Sidebar / Avatar 死链，消息没有顶层求值，类型断言没有绕过 Router。

## Task 3：公共组件消费菜单与主题配置

**Files:**
- Create: `src/components/layout/MenuLink.tsx`
- Create: `src/components/layout/MenuItems.tsx`
- Create: `tests/components/navigation.test.tsx`
- Modify: `src/components/marketing/Navbar.tsx`、`Footer.tsx`
- Modify: `src/components/docs/DocsLayout.tsx`
- Modify: `src/components/theme/ThemeToggle.tsx`
- Modify: `src/lib/theme.ts`
- Modify: `src/config/blocks/home.ts`
- Test: `tests/unit/theme.test.ts`、`tests/components/theme-toggle.test.tsx`、`tests/components/landing.test.tsx`

**Interfaces:**
- Consumes: Task 2 菜单和 actions。
- Produces: `MenuLink({item,className,onClick,children})`、`MenuItems({items,variant,linkClassName,onNavigate})`，variant 为 navbar / footer；统一主题默认值。

- [ ] **Step 1：Red。** 使用真实 Router 和 memory history 渲染 Navbar / Footer，验证 `/en#workflow`、`/en/docs`、法律 slug、新标签安全属性、移动 Escape 后焦点；mock website 配置时使用完整 `createWebsiteConfig(parsePublicEnv({}))`，禁止缺字段 fixture。

```tsx
const router = getRouter()
router.update({ history: createMemoryHistory({ initialEntries: ['/en'] }) })
await router.load()
render(<RouterProvider router={router} />)
expect(screen.getAllByRole('link', { name: 'Docs' })[0]).toHaveAttribute('href', '/en/docs')
```

另用单独真实 Memory Router 根 route 包含 MenuItems fixture，验证 group 的 summary 可键盘打开。locale 使用真实 `setLocale`，afterEach 恢复；若 SSR 模块需要 `content-collections` alias，复用既有 component config，别 mock整个业务。

- [ ] **Step 2：运行。** `pnpm exec vitest run --config vitest.components.config.ts tests/components/navigation.test.tsx tests/components/theme-toggle.test.tsx`。
- [ ] **Step 3：实现共享 renderer。** MenuLink 使用判别联合直接展开 Router options：

```tsx
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { MenuLinkItem } from '@/config/navigation'
export function MenuLink({ item, className, onClick, children }: {
  item: MenuLinkItem; className?: string; onClick?: () => void; children?: ReactNode
}) {
  const content = children ?? item.title
  if (item.destination.kind === 'internal') {
    return <Link {...item.destination.options} className={className} onClick={onClick}>{content}</Link>
  }
  return <a href={item.destination.href} className={className} onClick={onClick}
    target={item.destination.newTab ? '_blank' : undefined}
    rel={item.destination.newTab ? 'noopener noreferrer' : undefined}>{content}</a>
}
```

MenuItems 以 `items.map` 按 kind 递归：separator → `<hr />`；link → MenuLink；group / navbar → `<details><summary>{title}</summary><MenuItems ... /></details>`；group / footer → `<nav aria-label={title}><h2>{title}</h2><MenuItems ... /></nav>`。每个 key 使用 id，容器样式延续 Navbar / Footer 当前类名。`onNavigate` 透传至每条 MenuLink。

Navbar 在 render 创建访客 context、links、actions，两种断点都使用同一个 links。保留现有 menu state / useId / trigger ref / Escape effect，Escape 同时关闭已展开 details，导航后关闭 mobile 与 details。替换 img src 为 `websiteConfig.metadata.images.logoLight`；dark 地址相同则保留原 img 和 `dark:bg-white`，不同则添加第二张带 `hidden dark:block` 的图，两张的 CSS 与 alt 一致。不读取浏览器 theme 来决定 SSR 图片。

Footer 用 MenuItems 渲染两组，品牌列和 Slogan 保留；social 仅非空时渲染 `<nav aria-label={m.social_links_label()}>`，每项使用 MenuLink、Icon 和 `<span className="sr-only">{title}</span>`。新增 zh / en 消息分别为“社交链接” / “Social links”。页脚 icon 改配置路径。

ThemeToggle 的 Hooks 始终先执行，在返回 JSX 前 `if (!websiteConfig.ui.enableThemeSwitch) return null`。`defaultTheme` 改为 `websiteConfig.ui.defaultTheme`；不改变 cookie 优先、ALS、循环与暂停行为。DocsLayout 返回首页 Link 增加 `params={{locale}}`。

homeBlocks 的两个 docs CTA 修改为：

```ts
href: websiteConfig.docs.enabled ? `/${getLocale()}/docs` : '#features'
```

消息 label 和全页能力示意不改。

- [ ] **Step 4：Green。** 运行 component config、theme 单测、`pnpm typecheck`。补充 config.docs=false 时 actions 和两处 home CTA 都不会指向关闭页面的测试。
- [ ] **Step 5：任务评审。** 检查 desktop / mobile 共源、键盘可用、Logo原图、主题 SSR、不使用会话假数据。

## Task 4：纯服务诊断与归一化 provider 注册

**Files:**
- Create: `src/config/service-status.ts`
- Create: `tests/unit/service-status.test.ts`
- Modify: `src/server.ts`
- Modify: `src/newsletter/index.ts`、`src/payment/index.ts`、`src/notification/index.ts`
- Modify: `src/contact/notifications.ts`
- Modify: `src/routes/api/email/$.ts`
- Modify: `src/lib/analytics/index.ts`
- Test: `tests/unit/newsletter.test.ts`、`payment.test.ts`、`notification.test.ts`、`contact.test.ts`

**Interfaces:**
- Consumes: WebsiteConfig、PublicEnv、ServerEnv、资源 binding 存在性。
- Produces: `ServiceStatus`、`ConfigIssue`、`getServiceStatuses(input)`、`getMailFrom(config,env)`；provider registry 只消费已归一化字段。

- [ ] **Step 1：Red。** 数据驱动测试每个服务分支，关闭时 disabled、缺一个字段 incomplete、完整 configured；全部 issue 不能包含合成 secret。Cloudflare CLI bindings 未提供时只添加 manual 核对项，运行时 `{email:false}` 为 incomplete。

```ts
const config = createWebsiteConfig(parsePublicEnv({}))
config.mail.enabled = true
it('Resend 缺 sender 不能视为配置完整', () => {
  const statuses = getServiceStatuses({ config, publicEnv: parsePublicEnv({}),
    serverEnv: parseServerEnv({ RESEND_API_KEY: 'synthetic-secret' }) })
  expect(statuses.mail.state).toBe('incomplete')
  expect(statuses.mail.issues.map((i) => i.key)).toContain('MAIL_FROM')
  expect(JSON.stringify(statuses)).not.toContain('synthetic-secret')
})
```

- [ ] **Step 2：运行。** `pnpm exec vitest run tests/unit/service-status.test.ts`。
- [ ] **Step 3：实现状态计算。** 类型与 helper：

```ts
export type ConfigIssue = { key: string; reason: string; location: 'src/config/website.ts' | 'env' | 'Cloudflare binding'; manual?: boolean }
export type ServiceStatus = { state: 'disabled' | 'incomplete' | 'configured'; issues: ConfigIssue[] }
export function getMailFrom(config: WebsiteConfig, env: ServerEnv): string | undefined {
  return env.MAIL_FROM ?? (config.mail.provider === 'cloudflare' ? env.CLOUDFLARE_EMAIL_SENDER : undefined)
}
export function getServiceStatuses(input: { config: WebsiteConfig; publicEnv: PublicEnv; serverEnv: ServerEnv; bindings?: { email: boolean } }): Record<ServiceModule, ServiceStatus> {
  const { config, publicEnv: pub, serverEnv: env, bindings } = input
  const result = {} as Record<ServiceModule, ServiceStatus>
  const check = (name: ServiceModule, requirements: Array<[string, boolean, ConfigIssue['location']]>) => {
    const issues = config[name].enabled ? requirements.filter(([, valid]) => !valid).map(([key, , location]) => ({ key, location, reason: '已启用模块缺少必要配置' })) : []
    result[name] = { state: !config[name].enabled ? 'disabled' : issues.length ? 'incomplete' : 'configured', issues }
  }
  check('mail', config.mail.provider === 'resend' ? [
    ['RESEND_API_KEY', !!env.RESEND_API_KEY, 'env'], ['MAIL_FROM', !!env.MAIL_FROM, 'env'],
  ] : [['MAIL_FROM / CLOUDFLARE_EMAIL_SENDER', !!getMailFrom(config, env), 'env'], ['EMAIL', bindings?.email !== false, 'Cloudflare binding']])
  if (config.mail.enabled && config.mail.provider === 'cloudflare' && !bindings) {
    result.mail.issues.push({ key: 'EMAIL', location: 'Cloudflare binding', reason: '部署时核对 binding 与实际收件限制', manual: true })
  }
  check('contact', [
    ['mail.enabled', result.mail.state === 'configured', 'src/config/website.ts'],
    ['mail.supportEmail', z.email().safeParse(config.mail.supportEmail).success, 'src/config/website.ts'],
  ])
  check('newsletter', config.newsletter.provider === 'resend' ? [
    ['RESEND_API_KEY', !!env.RESEND_API_KEY, 'env'], ['RESEND_AUDIENCE_ID', !!env.RESEND_AUDIENCE_ID, 'env'],
  ] : [['BEEHIIV_API_KEY', !!env.BEEHIIV_API_KEY, 'env'], ['BEEHIIV_PUBLICATION_ID', !!env.BEEHIIV_PUBLICATION_ID, 'env']])
  check('payment', [
    ['STRIPE_SECRET_KEY', !!env.STRIPE_SECRET_KEY, 'env'], ['STRIPE_WEBHOOK_SECRET', !!env.STRIPE_WEBHOOK_SECRET, 'env'],
    ['payment.allowedPriceIds', config.payment.allowedPriceIds.some((id) => id.trim().length > 0), 'src/config/website.ts'],
  ])
  check('notification', [['DISCORD_WEBHOOK_URL / FEISHU_WEBHOOK_URL', !!(env.DISCORD_WEBHOOK_URL || env.FEISHU_WEBHOOK_URL), 'env']])
  const analytics: Array<[string, boolean, ConfigIssue['location']]> = [['analytics.providers', config.analytics.providers.length > 0, 'src/config/website.ts']]
  for (const provider of config.analytics.providers) {
    if (provider === 'ga') analytics.push(['VITE_GA_ID', !!pub.VITE_GA_ID, 'env'])
    if (provider === 'plausible') analytics.push(['VITE_PLAUSIBLE_DOMAIN', !!pub.VITE_PLAUSIBLE_DOMAIN, 'env'])
    if (provider === 'umami') analytics.push(['VITE_UMAMI_WEBSITE_ID / VITE_UMAMI_ID', !!(pub.VITE_UMAMI_WEBSITE_ID ?? pub.VITE_UMAMI_ID), 'env'], ['VITE_UMAMI_SCRIPT_URL', !!pub.VITE_UMAMI_SCRIPT_URL, 'env'])
    if (provider === 'clarity') analytics.push(['VITE_CLARITY_PROJECT_ID / VITE_CLARITY_ID', !!(pub.VITE_CLARITY_PROJECT_ID ?? pub.VITE_CLARITY_ID), 'env'])
  }
  check('analytics', analytics)
  return result
}
```

Record 初始化可使用以上一次受控的本地结构断言；不得用断言绕过 Router 或 env。添加 `validateWebsiteConfig`：invalid social 非空 URL、invalid supportEmail 非空、非 root-relative / protocol-relative image 路径产生只含字段名的 issues；schema type 错误由 TypeScript 防守。allowedPriceIds 过滤空字符串不作为“接受所有 Price”的依据。

server request 入口：

```ts
const parsedEnv = parseServerEnv(env as unknown as Record<string, unknown>)
const normalizedEnv = { ...env, ...parsedEnv }
// ALS.env 和所有 registry 都消费 normalizedEnv；DB / CACHE / BUCKET / EMAIL 保留原对象。
```

registry 参数类型改为 `ServerEnv` 或最小 Pick；例如 payment 使用 `Pick<ServerEnv,'STRIPE_SECRET_KEY'|'STRIPE_WEBHOOK_SECRET'>`，newsletter 使用对应五字段 Pick，notification 使用两 webhook Pick。直接单测调用 registry 时先 parseServerEnv，避免尚未归一化的测试绕过边界。

Mail registry 仅在 provider 与 sender 具备时注册，不使用 example.com 回退；保持按请求工厂。email API 使用 `websiteConfig.mail.provider` 和 `getMailFrom`；contact 使用同一 provider 与 supportEmail。这里只统一选项，不加入发送重试、联系表单或授权重构。

analytics 初始化先判断 `typeof window === 'undefined' || !websiteConfig.analytics.enabled`，再将 configured selected adapters 注册。四分支变量改为 publicEnv，Umami 用 `VITE_UMAMI_SCRIPT_URL`，在 URL 缺失时不注入。不修改 CSP 或宣称采集可用；第五子项目解决实际 SDK / 收集端点。

- [ ] **Step 4：Green。** 运行状态与各 registry / contact 测试；所有 fetch / SDK 由现有测试边界 mock，确认没有实际外网调用。
- [ ] **Step 5：任务评审。** 状态不包含凭据，CLI manual 项不会将状态误判为 incomplete，runtime 缺 binding 会失败；邮件选择不会因 EMAIL binding 存在而覆盖 Resend。

## Task 5：页面与 API 门禁、sitemap

**Files:**
- Create: `src/lib/module-access.ts`
- Create: `src/lib/module-access.server.ts`
- Create: `tests/unit/module-access.test.ts`
- Modify: docs 父路由、blog index / $slug、changelog index、pricing、contact
- Modify: contact / newsletter / payment / email API 与 stripe webhook
- Modify: `src/routes/sitemap[.]xml.ts`
- Test: `tests/unit/api/contact.test.ts`、`tests/unit/payment.test.ts`、`tests/unit/newsletter.test.ts`

**Interfaces:**
- Consumes: Task 4 服务状态与 Task 1 开关。
- Produces: `assertPageEnabled(module, config?)`、`getModuleUnavailableResponse(module, input?)`、`getSitemapPaths(config,locale)`。

- [ ] **Step 1：Red。** 验证 disabled 返回 404、incomplete 返回 503、configured 允许；完整 handler 在 disabled 时不调用 auth / body / provider / rate-limit。使用已有 Route.options.server handlers 的真实入口，类型窄化一个 handler 边界；SDK与认证只在边界 mock。

```ts
it('关闭 newsletter 时先返回 404，不读取 body', async () => {
  const request = new Request('https://jerbix.dev/api/newsletter/subscribe', { method: 'POST', body: '{}' })
  const read = vi.spyOn(request, 'json')
  const handler = Route.options.server?.handlers?.POST
  if (typeof handler !== 'function') throw new Error('POST handler 缺失')
  const response = await handler({ request } as Parameters<typeof handler>[0])
  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({ error: 'MODULE_DISABLED' })
  expect(read).not.toHaveBeenCalled()
  expect(mockSubscribe).not.toHaveBeenCalled()
})
```

各 API 按相同方式测试所有本任务支持方法，不只测 helper。

- [ ] **Step 2：运行。** `pnpm exec vitest run tests/unit/module-access.test.ts tests/unit/api/contact.test.ts tests/unit/newsletter.test.ts tests/unit/payment.test.ts`。
- [ ] **Step 3：实现门禁。**

```ts
// src/lib/module-access.ts
import { notFound } from '@tanstack/react-router'
import { websiteConfig, type WebsiteConfig, type SiteModule } from '@/config/website'
export function assertPageEnabled(module: SiteModule, config: WebsiteConfig = websiteConfig) {
  if (!config[module].enabled) throw notFound()
}
```

```ts
// src/lib/module-access.server.ts
import { websiteConfig, type ServiceModule } from '@/config/website'
import { publicEnv } from '@/env/public'
import { parseServerEnv } from '@/env/server'
import { getServerContext } from '@/lib/server-context'
import { getServiceStatuses } from '@/config/service-status'
export function getModuleUnavailableResponse(module: ServiceModule, input?: Parameters<typeof getServiceStatuses>[0]): Response | undefined {
  const config = input?.config ?? websiteConfig
  if (!config[module].enabled) return Response.json({ error: 'MODULE_DISABLED' }, { status: 404 })
  const env = input ? undefined : getServerContext().env
  const current = input ?? { config, publicEnv,
    serverEnv: parseServerEnv(env ?? {}), bindings: { email: !!env?.EMAIL } }
  const state = getServiceStatuses(current)[module].state
  if (state === 'incomplete') return Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 })
}
```

向各目标 handler 首行加下面代码，module 对应 mail/contact/newsletter/payment：

```ts
const unavailable = getModuleUnavailableResponse('newsletter')
if (unavailable) return unavailable
```

页面 beforeLoad 最先 `assertPageEnabled('docs')` 或其模块。已有 blog / docs child beforeLoad 保留内容查找；docs 父路由统一门禁，子 redirect 添加明确 locale params。pricing / contact 默认 404，首页 #pricing 不受影响。

Stripe Webhook 不使用 payment.enabled 门禁，凭据从 parseServerEnv 获取；保留签名验证。补一个 payment.enabled=false 且具备测试凭据时仍调用 parseWebhookEvent 的测试；无签名仍400，无凭据503。现有 processedAt / SQL / event payload 不改。

sitemap 导出纯路径工厂，返回首页、marketing features/about/legal 及启用的 docs/blog/changelog/pricing/contact；按内容 locale 与 published 添加动态项，博客 URL 使用 `/marketing/blog/${post._meta.path}`；alternates 与实际同 slug 已存在语言对应，不伪造缺失翻译。使用 XML 转义 helper 处理 & / < / > / 引号，baseUrl 用 URL 拼装；路由 handler 只把 paths serialize。对每个模块 disabled 断言静态和动态都不含路径。

- [ ] **Step 4：Green。** 运行门禁 / handler / sitemap 测试及 typecheck。现有 contact 成功单测提供 config 与齐全 fake credentials；其 helper 自身仍可测试原限流逻辑。避免删除成功路径测试以适配默认关闭。
- [ ] **Step 5：任务评审。** 服务端配置函数只从 server 路由引入，客户端 bundle 无服务端 env；Webhook 不被 disabled 开关吞掉。

## Task 6：开发 / 生产配置检查与 CI 读取

**Files:**
- Modify: `scripts/lib/env-file.ts`
- Modify: `scripts/check-env.ts`、`scripts/check-env-prod.ts`
- Modify: `tests/unit/check-env-scripts.test.ts`
- Test: `tests/unit/service-status.test.ts`

**Interfaces:**
- Consumes: 解析 public/server env、createWebsiteConfig、validateWebsiteConfig、getServiceStatuses。
- Produces: 同源的逐模块诊断、生产 HTTPS URL 必填、process-only CI。

- [ ] **Step 1：Red。** 扩展现有 subprocess fixtures：生产 URL缺省、空、HTTP、localhost、IPv6 loopback、保留域名失败；合法 `https://jerbix.dev` 通过；无 .env 但完整进程 env 成功；关闭模块不要求 secret；状态函数完整配置判断单独数据驱动测试。旧 `real-site.example.com` 成功例改为真实形状域名，不能留下绕过保留域名的特例。

```ts
it('没有 .env 时允许 CI 使用完整进程配置', () => {
  const result = runScript(makeWorkspace(), checkEnvProd, {
    BETTER_AUTH_SECRET: 'a'.repeat(32), VITE_BASE_URL: 'https://jerbix.dev',
  })
  expect(result.code).toBe(0)
  expect(result.stderr).not.toContain('a'.repeat(32))
})
it('生产缺少公开 URL 不能借默认 localhost 通过', () => {
  const dir = makeWorkspace()
  writeDotEnv(dir, `BETTER_AUTH_SECRET=${'b'.repeat(32)}\n`)
  const result = runScript(dir, checkEnvProd)
  expect(result.code).toBe(1)
  expect(result.stderr).toContain('VITE_BASE_URL')
  expect(result.stderr).not.toContain('b'.repeat(32))
})
```

- [ ] **Step 2：运行。** `pnpm exec vitest run tests/unit/check-env-scripts.test.ts tests/unit/service-status.test.ts`。
- [ ] **Step 3：修改环境读取。** readDotEnvFile 保持 Node parseEnv。resolveRawEnv 只忽略明确 ENOENT，权限 / 语法等错误继续抛出：

```ts
let fromFile: Record<string, string> = {}
try { fromFile = readDotEnvFile(path) }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
return { ...fromFile, ...process.env }
```

两个脚本使用自己的 raw env 解析并调用 createWebsiteConfig，不能直接导入 Vite 下求值的 websiteConfig。共享服务状态输出函数可放现有 `scripts/lib/report-issues.ts`，只打印 name/state/key/reason/location；manual 项用“部署核对”，不冒充成功。

生产 URL validator 用标准 URL，不用正则截 URL：

```ts
function isProductionBaseUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    return url.protocol === 'https:' && !url.username && !url.password &&
      host !== 'localhost' && !host.endsWith('.localhost') && host !== '::1' &&
      host !== '0.0.0.0' && !/^127\./.test(host) &&
      !['example.com', 'example.net', 'example.org'].some((domain) => host === domain || host.endsWith(`.${domain}`)) &&
      !host.endsWith('.example') && !host.endsWith('.test')
  } catch { return false }
}
```

生产必须检查 raw 非空 VITE_BASE_URL，解析后只补格式验证，不接受 schema 默认补值。保留强制 production 和 auth secret ≥32。dev 已启用但缺配置写 stdout 诊断，返回0；prod 同条件输出字段名、返回1。invalid social/image/support config 在两模式均失败。不要让 script main 在 import 时被测试调用；脚本仍由 subprocess 黑盒验证。

- [ ] **Step 4：Green。** 运行脚本测试。测试子进程清理 env 字段集合应包含所有 public/server 字段（包括新字段和 ADMIN_EMAILS/NODE_ENV），只使用合成值，不读取真实 `.env`。使用 `NODE_ENV=production` 的纯 fixture 验证失败，不运行实际部署脚本。
- [ ] **Step 5：任务评审。** 所有日志无原值，普通 check无外部请求，不上传或改变云端设置。

## Task 7：真实浏览器验收与文档同步

**Files:**
- Create: `e2e/site-config.spec.ts`
- Modify: `e2e/marketing.spec.ts`
- Modify: `README.md`
- Modify: `content/docs/getting-started.zh.md`、`content/docs/getting-started.md`
- Test: 所有本计划单元 / 组件测试、marketing / hydration / site-config E2E

**Interfaces:**
- Consumes: 已交付配置和门禁。
- Produces: 第一子项目的配置操作说明、真实 browser 验收证据。

- [ ] **Step 1：Red 浏览器断言。** 在对应功能实现前运行以下行为；已有 pricing 示例显示测试改为默认关闭404，同时保持首页 #pricing scroll 测试。

```ts
import { test, expect } from '@playwright/test'
test('默认关闭的业务入口不会假成功', async ({ request }) => {
  for (const path of ['contact/submit', 'newsletter/subscribe', 'payment/checkout', 'email/send']) {
    const response = await request.post(`/api/${path}`, { data: {} })
    expect(response.status()).toBe(404)
    expect(await response.json()).toEqual({ error: 'MODULE_DISABLED' })
  }
})
test('文档导航保持英文 locale，关闭套餐页面不进入 sitemap', async ({ page, request }) => {
  await page.goto('/en')
  await expect(page.getByRole('navigation').first().getByRole('link', { name: 'Docs', exact: true })).toHaveAttribute('href', '/en/docs')
  const pricing = await request.get('/en/pricing')
  expect(pricing.status()).toBe(404)
  const sitemap = await (await request.get('/sitemap.xml')).text()
  expect(sitemap).not.toContain('/pricing</loc>')
  expect(sitemap).toContain('/en/marketing/blog')
})
```

E2E 不通过写真实 `.env` 切换开关；启用/关闭各分支由纯函数和真实 handler 测试覆盖。浏览器对默认配置验证中英、375 / 1100 / 1440宽度、dark / light、Logo资源、键盘导航、无overflow / hydration error。

- [ ] **Step 2：Green。** `pnpm exec playwright test e2e/site-config.spec.ts e2e/marketing.spec.ts e2e/hydration.spec.ts --workers=2`。如路由 slash handler 不匹配，先核对当前 splat 实际路径，不降低状态码要求或用 mock代替server。真实启动应用，打开 /zh、/en 并点击 docs 和主题、mobile菜单；检查 console。

- [ ] **Step 3：更新现有文档。** README 增加“网站配置”章节，给出实际配置入口与下面的示例，技术标识保持英文；同步双语上手文档对应说明：

```ts
// src/config/website.ts 的 createWebsiteConfig 返回值
social: { github: 'https://github.com/your-org/your-project' },
docs: { enabled: true },
newsletter: { enabled: false, provider: 'resend' },
```

说明 `VITE_` 构建时公开、MAIL_FROM 服务端、Cloudflare binding 收件限制、开启模块必要字段；`configured` 不等于 delivered / paid / collected。列明 Sidebar / Avatar 在账户子项目交付，不声称本次已有账户工作台。README 把 payment provider目录改为 Stripe，移除固定测试数量与虚假的 workers测试完成描述；语言顺序修正为 URL前缀 → cookie → Accept-Language → zh，仅编辑相关现有段落。

- [ ] **Step 4：最终自动检查。** 按顺序执行，避免并行 build 与 E2E 造成资源竞争：

```bash
pnpm check
pnpm test --maxWorkers=2
pnpm exec vitest run --config vitest.components.config.ts
pnpm exec playwright test e2e/site-config.spec.ts e2e/marketing.spec.ts e2e/hydration.spec.ts --workers=2
pnpm build
pnpm check:client-bundle
```

预期全部 exit0；报告实际 test数量与任何构建 warning，不隐藏 chunk size警告。若失败只修本计划引入的问题；原有阻断提供证据，不擅自扩展为账户或支付重构。

- [ ] **Step 5：最终规格对照评审。** 对照规格第9节全部验收点，检查 git diff只新增授权内容、无secret、未手改generated。记录本计划完成项与失败项。没有 commit / push / deploy；若后来获 commit授权，只stage本工作单元，消息末尾 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。

## 计划自检与交付边界

- 配置公开/私密边界：Task1 / 4 / 6。
- 菜单、locale、合法路由、空组、社交、键盘：Task2 / 3 / 7。
- 页面、API、Webhook例外、sitemap：Task5。
- 开发/生产/CI、无网络检查、无值诊断：Task4 / 6。
- 相关文档、检查、真实应用验证：Task7。
- 未创建空 Sidebar / Avatar 文件；未把 service configured视作外部流程完成；未包含认证修复、D1迁移或云端操作。

执行方式默认推荐当前会话逐任务执行、每个任务独立评审；若使用subagent，每次只发送当前Task及Global Constraints、明确禁止commit与生产操作。任务间不重复请求许可；仅在无法从代码和本规格解决的阻断处停下。
