# env example 重建、个人中心 UI 与文档参考资料 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `.env.example` 与 env schema 对齐，把个人中心补齐到可用状态（logo、面包屑、用户卡片、登出），并给文档站补上第三方官方文档的参考链接。

**Architecture:** 三块独立交付。`.env.example` 是纯结构变更（无消费者）。个人中心沿用 shadcn Base UI 的 `sidebar` / `breadcrumb` / `avatar` / `menu` 组装，不自建折叠与抽屉；登出逻辑从 `UserMenu` 抽成公共函数供两侧共用。文档只在各篇末尾插「参考资料」小节，不动 MDX 管线。

**Tech Stack:** TanStack Start / Router、React 19、TypeScript strict、Tailwind CSS v4、shadcn/ui（Base UI 基座 / Tabler 图标）、Paraglide JS（zh / en）、Zod、Vitest（node + jsdom 两套 config）、Playwright。

## Global Constraints

以下为 spec 的全局约束，每个任务的要求都隐含包含本节：

- 业务代码**不得**直接读 `process.env` / `import.meta.env`，一律经 `src/env/public.ts`、`src/env/server.ts`。
- `VITE_` 前缀变量构建时进入客户端 bundle，任何人可见，**不得**存放 secret。
- `src/components/ui/` 是 shadcn registry 的原样拷贝，**一律不本地修改**；需要调整外观时在调用处传 `className`，或用组合件包一层。
- 消息键必须在 `messages/zh.json` 与 `messages/en.json` 同时存在；改完跑 `pnpm locale:sort`。
- 不手改 `src/routeTree.gen.ts`、`src/locale/paraglide/**`、`.content-collections/generated/**`。
- 中文与半角英数字之间加一个半角空格；技术专有名词、命令、代码标识符保留英文。
- 行为修改先写失败测试，确认失败原因后再实施最小修改；结构整理与行为修改分开提交。
- 提交消息使用中文，末尾附 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- 不新增依赖。
- Workers runtime 非 Node.js，含 native binding 的包不可用。

**Baseline（本计划开始前已验证全绿，每个任务的验收都以恢复到该状态为准）：**
- `pnpm check` → `✅ 开发环境变量校验通过` + `✅ 所有 locale 键配对一致（base: zh）`
- `pnpm test` → 36 files / 600 tests passed
- `pnpm exec vitest run --config vitest.components.config.ts` → 17 files / 146 tests passed

---

## 文件结构

| 文件 | 责任 | 归属任务 |
|---|---|---|
| `.env.example` | env 模板，按功能模块分组，注释含第三方链接 | Task 1 |
| `src/auth/sign-out.ts` | 登出 + 跳转的公共实现（客户端） | Task 2 |
| `src/auth/session.ts` | `SessionInfo` 增加 `image` 字段 | Task 5 |
| `src/components/settings/SettingsUserCard.tsx` | 侧栏底部用户卡片 + 退出菜单 | Task 5 |
| `src/components/settings/SettingsLayout.tsx` | 个人中心外壳：侧栏头 logo、面包屑顶栏、用户卡片 | Task 4、5、6 |
| `src/components/layout/UserMenu.tsx` | 改为调用 `signOutAndRedirect` | Task 2 |
| `messages/zh.json` / `messages/en.json` | 删 `settings_back_home` | Task 6 |
| `content/docs/*.zh.md` / `*.md` | 9 篇插「参考资料」+ `auth-account` 校正 | Task 7 |
| `e2e/settings.spec.ts` | 登出入口改为用户卡片 + 折叠交互用例 | Task 8 |

`src/components/settings/SettingsBreadcrumb.tsx` **不创建**：面包屑只是 6 个 shadcn 件的
组装，且依赖 `SettingsLayout` 已有的 pathname 派生逻辑，单独拆文件会让「当前板块」的
推导在两个地方各写一遍。直接写在 `SettingsLayout.tsx` 内，与 `sections.map` 的高亮逻辑
共用同一个 `pathname`。

---

### Task 1: `.env.example` 重建

**Files:**
- Modify: `.env.example`（整文件重写）

**Interfaces:**
- Consumes: 无（无代码消费者，`scripts/setup.ts` 只做 `cp`）
- Produces: 与 `src/env/public.ts`（13 键）、`src/env/server.ts`（19 键）的键集合一致，
  仅差两个兼容字段 `VITE_UMAMI_ID` / `VITE_CLARITY_ID`（spec 定不列）

- [ ] **Step 1: 确认 schema 键集合与顺序**

Run:
```bash
node -e "
const fs=require('fs');
const pub=fs.readFileSync('src/env/public.ts','utf8');
const srv=fs.readFileSync('src/env/server.ts','utf8');
console.log([...pub.matchAll(/^  ([A-Z_0-9]+):/gm)].map(m=>m[1]));
console.log([...srv.matchAll(/^  ([A-Z_0-9]+):/gm)].map(m=>m[1]));
"
```
Expected: 两行数组，共 13 + 19 个键；顺序与本任务 Step 3 的写入一致（不同则先核对 spec 4.1 的分组表）。

- [ ] **Step 2: 用上面的清单写新 `.env.example`**

整文件替换为（保留 `cp .env.example .env` 指引与生产 secrets 口径；URL 均来自 spec 4.5 已验证清单）：

```bash
# 环境变量示例。复制为 .env 后按需填写：cp .env.example .env
# 所有 optional 字段留空即可通过开发检查（pnpm check:env）。
# 生产部署所需的 secrets 需在 Cloudflare 另行配置——本地这个文件不代表云端已就绪。

# Site
# 生产部署必须改为实际域名，例如 https://example.com，否则 SEO / OG 全部指向 localhost。
VITE_BASE_URL=http://localhost:3000

# Payment（Stripe）
# 申请密钥与 Price ID：https://docs.stripe.com/keys
VITE_PAYMENT_PROVIDER=
VITE_STRIPE_PRICE_PRO_MONTHLY=
VITE_STRIPE_PRICE_PRO_YEARLY=
VITE_STRIPE_PRICE_LIFETIME=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Auth
# secret 可用 `openssl rand -base64 32` 生成；配置项说明：
# https://www.better-auth.com/docs/reference/options
# Google 凭据：https://www.better-auth.com/docs/authentication/google
# OAuth 流程：https://developers.google.com/identity/protocols/oauth2/web-server
BETTER_AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Cloudflare
# Account ID 与 API Token 用于本地资源管理；binding 在 wrangler.jsonc 声明：
# https://developers.cloudflare.com/workers/wrangler/configuration/
# 生产 secrets 用 wrangler secret put：https://developers.cloudflare.com/workers/configuration/secrets/
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_EMAIL_SENDER=

# Email
# Resend 密钥：https://resend.com/docs/api-reference/introduction
RESEND_API_KEY=
# 发件地址（可选），填写纯邮件地址，例如 noreply@example.com
MAIL_FROM=

# Newsletter
# beehiiv 密钥：https://developers.beehiiv.com/welcome/create-an-api-key
RESEND_AUDIENCE_ID=
BEEHIIV_API_KEY=
BEEHIIV_PUBLICATION_ID=
# true / false，默认 false
BEEHIIV_SEND_WELCOME_EMAIL=

# Notification
# Discord webhook：https://docs.discord.com/developers/resources/webhook
DISCORD_WEBHOOK_URL=
# 飞书自定义机器人：https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN
FEISHU_WEBHOOK_URL=

# Analytics（任填启用）
VITE_GA_ID=
VITE_PLAUSIBLE_DOMAIN=
VITE_UMAMI_WEBSITE_ID=
# Umami 脚本地址（可选），必须为无凭据的 HTTPS URL
VITE_UMAMI_SCRIPT_URL=
VITE_CLARITY_PROJECT_ID=

# Captcha（可选）
# Turnstile：https://developers.cloudflare.com/turnstile/
VITE_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# Admin
# 逗号分隔的收件人白名单，用于 /api/email
ADMIN_EMAILS=

# Runtime
NODE_ENV=development
```

- [ ] **Step 3: 核对键集合双向一致**

Run:
```bash
node -e "
const fs=require('fs');
const pub=fs.readFileSync('src/env/public.ts','utf8');
const srv=fs.readFileSync('src/env/server.ts','utf8');
const schema=[...pub.matchAll(/^  ([A-Z_0-9]+):/gm)].map(m=>m[1])
  .concat([...srv.matchAll(/^  ([A-Z_0-9]+):/gm)].map(m=>m[1]));
const ex=[...fs.readFileSync('.env.example','utf8').matchAll(/^([A-Z_0-9]+)=/gm)].map(m=>m[1]);
console.log('schema 有而 example 缺：',schema.filter(k=>!ex.includes(k)));
console.log('example 有而 schema 无：',ex.filter(k=>!schema.includes(k)));
"
```
Expected: 第一行**只**有 `[ 'VITE_UMAMI_ID', 'VITE_CLARITY_ID' ]`，第二行为 `[]`。
若出现其他键，回到 Step 2 修正后再跑本步。

- [ ] **Step 4: 确认 env 校验通过**

Run: `pnpm check:env`
Expected: 末行 `✅ 开发环境变量校验通过`

- [ ] **Step 5: 确认没有 secret 泄漏进客户端可读集合**

Run: `pnpm run check:client-bundle`
Expected: 输出表明构建产物中无 `VITE_` secret（脚本自身的成功提示）。本任务未改
`src/env/*.ts`，该步骤是回归确认，失败则说明 Step 2 误把 secret 写成了 `VITE_` 前缀。

- [ ] **Step 6: 提交**

```bash
git add .env.example
git commit -m "chore: 重建 .env.example，对齐 env schema 并按分组补充官方文档链接"
```

---

### Task 2: 抽 `signOutAndRedirect` 公共函数

**Files:**
- Create: `src/auth/sign-out.ts`
- Modify: `src/components/layout/UserMenu.tsx`（`onSignOut` 改为调用公共函数）
- Test: `tests/components/user-menu.test.tsx`（更新 mock 目标）

**Interfaces:**
- Consumes: `signOut`（`src/auth/client.ts` 已导出）
- Produces: `signOutAndRedirect(): Promise<void>` —— 成功时 `window.location.assign('/')`，
  失败时 `console.warn('[auth] 登出失败: <message>')` 且**不跳转**。Task 5 的用户卡片调用它。

- [ ] **Step 1: 写失败测试（公共函数）**

Create `tests/unit/auth-sign-out.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * 登出公共函数。
 *
 * 三条行为对应三处调用方的共同需求：
 * - 成功才跳转：整页跳转让用户以为已登出，而会话其实还在——这是最坏的失败模式；
 * - 失败留在原地并留痕：调用方（导航栏菜单、个人中心用户卡片）自己决定是否提示；
 * - 跳转目标是站点根路径：不依赖调用方所在路由，`/` 由服务端按 locale 归一化。
 */
const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
}))

vi.mock('@/auth/client', () => ({
  signOut: (...args: unknown[]) => mocks.signOut(...args),
}))

import { signOutAndRedirect } from '@/auth/sign-out'

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('signOutAndRedirect', () => {
  it('登出成功后整页跳转到站点根路径', async () => {
    mocks.signOut.mockResolvedValue({ error: null })
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })

    await signOutAndRedirect()

    expect(mocks.signOut).toHaveBeenCalled()
    expect(assign).toHaveBeenCalledWith('/')
  })

  it('登出失败时不跳转，只在控制台留痕', async () => {
    mocks.signOut.mockResolvedValue({ error: { message: 'boom' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })

    await signOutAndRedirect()

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('登出失败'))
    expect(assign).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run tests/unit/auth-sign-out.test.ts`
Expected: FAIL，提示无法解析 `@/auth/sign-out`（模块不存在）。

- [ ] **Step 3: 写最小实现**

Create `src/auth/sign-out.ts`：

```ts
import { signOut } from '@/auth/client'

/**
 * 登出并在成功后整页跳转到站点根路径。
 *
 * 从 `UserMenu` 与个人中心用户卡片两处相同实现抽出：语义必须一致，否则用户在一个
 * 入口登出成功后没有反馈、在另一个入口失败后却以为已登出。
 *
 * **失败时留在原地**：整页跳转（`window.location.assign`）会让用户以为已经登出，
 * 而会话其实还在。因此只在 `signOut()` 解析出无错误时才跳转；否则 `console.warn`
 * 留痕，由调用方自行决定是否提示。
 *
 * `window` 只在函数体内引用——本模块被客户端组件导入，SSR 期不会执行到跳转那一行。
 */
export async function signOutAndRedirect(): Promise<void> {
  const { error } = await signOut()
  if (error) {
    console.warn(`[auth] 登出失败: ${error.message ?? 'unknown'}`)
    return
  }
  window.location.assign('/')
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run tests/unit/auth-sign-out.test.ts`
Expected: PASS，2 passed。

若报 `ReferenceError: window is not defined`，在测试文件**首行**加环境声明
（`vitest.config.ts` 的 environment 是 `node`，而本用例 stub 了 `window.location`）：

```ts
// @vitest-environment jsdom
```

只加在这一行，brief 给出的测试代码本身不改。

- [ ] **Step 5: 改 `UserMenu` 调用公共函数**

Modify `src/components/layout/UserMenu.tsx`：
- 删除组件内的 `onSignOut` 函数（第 36-44 行）。
- import 行 `import { signOut, useSession } from '@/auth/client'` 改为
  `import { useSession } from '@/auth/client'`，并新增
  `import { signOutAndRedirect } from '@/auth/sign-out'`。
- 第二处 `<Menu.Item onClick={onSignOut} ...>` 的 `onClick` 改为 `signOutAndRedirect`：

```tsx
            <Menu.Item
              onClick={() => void signOutAndRedirect()}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
            >
```

同时把组件顶部注释里「并提供登出（此前 `signOut` 已导出却无人调用）」更新为
「登出经 `signOutAndRedirect`，与个人中心用户卡片共用」。

- [ ] **Step 6: 更新 `user-menu.test.tsx` 的 mock 目标**

Modify `tests/components/user-menu.test.tsx`：`vi.mock('@/auth/client', ...)` 的
`signOut` 分支保留（`useSession` 仍需它），另加对 `@/auth/sign-out` 的 mock：

```tsx
vi.mock('@/auth/sign-out', () => ({
  signOutAndRedirect: (...args: unknown[]) => mocks.signOutAndRedirect(...args),
}))
```

并把 `mocks` 的 hoisted 定义补一项 `signOutAndRedirect: vi.fn()`：

```tsx
const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  // 保留：`@/auth/client` 仍被 mock（`useSession` 需要它），mock 工厂里引用 `mocks.signOut`，
  // 少这一项会报 TS2339。
  signOut: vi.fn(),
  signOutAndRedirect: vi.fn(),
}))
```

随后把两个登出相关用例的断言从 `mocks.signOut` 改为 `mocks.signOutAndRedirect`：

```tsx
  it('点击登出会调用 signOutAndRedirect', async () => {
    mocks.useSession.mockReturnValue({
      data: { user: { email: 'user@example.com', name: 'Alice' } },
      isPending: false,
    })
    render(<UserMenu />)

    screen.getByRole('button', { name: /Alice/ }).click()
    await waitFor(() => {
      expect(screen.getByText('退出登录')).toBeInTheDocument()
    })
    screen.getByText('退出登录').click()
    await waitFor(() => expect(mocks.signOutAndRedirect).toHaveBeenCalled())
  })

  it('登出由公共函数处理，组件自身不再跳转', async () => {
    mocks.useSession.mockReturnValue({
      data: { user: { email: 'user@example.com', name: 'Alice' } },
      isPending: false,
    })
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    render(<UserMenu />)

    screen.getByRole('button', { name: /Alice/ }).click()
    await waitFor(() => expect(screen.getByText('退出登录')).toBeInTheDocument())
    screen.getByText('退出登录').click()
    await waitFor(() => expect(mocks.signOutAndRedirect).toHaveBeenCalled())
    // 跳转与否是公共函数的职责，组件不应自己动 location。
    expect(assign).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
```

删除原 `登出失败时不跳转，只在控制台留痕` 用例——该行为已由
`tests/unit/auth-sign-out.test.ts` 覆盖，此处再测一遍是在测被 mock 掉的模块。

- [ ] **Step 7: 运行受影响的测试**

Run: `pnpm exec vitest run --config vitest.components.config.ts tests/components/user-menu.test.tsx`
Expected: PASS，**7** passed（Step 6 净变化为 0：删掉被 mock 模块覆盖的「登出失败时不跳转」，
同时新增「登出由公共函数处理」，7 − 1 + 1 = 7）。

- [ ] **Step 8: 跑全量检查**

Run: `pnpm check && pnpm test && pnpm exec vitest run --config vitest.components.config.ts`
Expected: check 末尾 `✅ 所有 locale 键配对一致（base: zh）`；单测 **602** passed
（600 基线 + `auth-sign-out.test.ts` 2 条）；组件测试 **146** passed
（与基线相同：删除 1 条 user-menu 用例，新增 1 条 user-menu 用例，净变化 0）。

- [ ] **Step 9: 提交**

```bash
git add src/auth/sign-out.ts src/components/layout/UserMenu.tsx tests/unit/auth-sign-out.test.ts tests/components/user-menu.test.tsx
git commit -m "refactor: 抽出 signOutAndRedirect，登出语义由导航栏与用户卡片共用"
```

---

### Task 3: 顶栏面包屑 + 折叠按钮 + 主题切换

**Files:**
- Modify: `src/components/settings/SettingsLayout.tsx`（`SidebarInset` 的 `header` 整段重写）
- Test: `tests/components/settings-layout.test.tsx`（新建）

**Interfaces:**
- Consumes: `Breadcrumb*`（`@/components/ui/breadcrumb`）、`SidebarTrigger`（`@/components/ui/sidebar`）、
  `ThemeToggle`（`@/components/theme/ThemeToggle`）、`m.crumb_home()` / `m.settings_title()`、
  `getSettingsSectionMeta(section)`（`@/config/settings`，返回 `{ title, description, icon }`）、
  已有的 `useRouterState({ select: (state) => state.location.pathname })` 与 `locale` prop。
- Produces: 顶栏含 `SidebarTrigger`、三级面包屑、右上角 `ThemeToggle`；无 `<h1>`、
  无「返回站点」链接。Task 6 删 `settings_back_home` 消息键的前提正在于此。

- [ ] **Step 1: 写失败测试**

Create `tests/components/settings-layout.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsLayout } from '@/components/settings/SettingsLayout'
import { setLocale } from '@/locale/paraglide/runtime.js'

/**
 * 个人中心外壳。
 *
 * 关键行为：
 * - 顶栏是「折叠按钮 + 三级面包屑 + 右上角主题切换」：不放 `<h1>`（面包屑末级
 *   带 `aria-current="page"`，就是页面标题），也不放「返回站点」（侧栏头 logo 已是出口）；
 * - 面包屑前两级是链接、末级是当前页；末级文案由 pathname 派生；
 * - `Breadcrumb` 等三组 shadcn 件在此第一次被消费，测试同时确认用的是现成件
 *   （`role="navigation"` + `aria-label="breadcrumb"`）而非手写等价物。
 */
const routerMocks = vi.hoisted(() => ({
  pathname: '/en/settings/profile',
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: routerMocks.pathname } }),
}))

beforeEach(() => {
  clearCookies()
  setLocale('zh', { reload: false })
  routerMocks.pathname = '/en/settings/profile'
})

function clearCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (name) {
      // biome-ignore lint/suspicious/noDocumentCookie: 测试清理，必须同步改写 cookie jar。
      document.cookie = `${name}; Path=/; Max-Age=0`
    }
  }
}

/** 渲染外壳；session 在守卫里已取到，本组件只吃 children 与 locale。 */
function renderLayout() {
  return render(
    <SettingsLayout locale="zh">
      <div>内容区</div>
    </SettingsLayout>,
  )
}

describe('SettingsLayout 顶栏', () => {
  it('渲染折叠按钮（宽窄屏都常驻，窄屏靠它拉出抽屉）', () => {
    renderLayout()
    const trigger = document.querySelector('[data-slot="sidebar-trigger"]')
    expect(trigger).not.toBeNull()
  })

  it('面包屑渲染三级：首页 › 个人中心 › 当前板块', () => {
    renderLayout()
    const nav = screen.getByRole('navigation', { name: 'breadcrumb' })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '首页' })).toHaveAttribute('href', '/zh')
    expect(screen.getByRole('link', { name: '个人中心' })).toHaveAttribute(
      'href',
      '/zh/settings/profile',
    )
    // 末级是当前页，不是链接。
    const page = screen.getByText('资料')
    expect(page.tagName).toBe('SPAN')
    expect(page).toHaveAttribute('aria-current', 'page')
  })

  it('末级文案随 pathname 变化（安全板块 → 安全）', () => {
    routerMocks.pathname = '/zh/settings/security'
    renderLayout()
    expect(screen.getByText('安全')).toHaveAttribute('aria-current', 'page')
  })

  it('pathname 不是已知板块时只渲染前两级，不渲染空末级', () => {
    routerMocks.pathname = '/zh/settings/unknown-future'
    renderLayout()
    expect(screen.getByRole('link', { name: '首页' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '个人中心' })).toBeInTheDocument()
    // 除两级链接与「内容区」外， breadcrumb 里不应再有任何条目。
    const nav = screen.getByRole('navigation', { name: 'breadcrumb' })
    expect(nav.querySelectorAll('[data-slot="breadcrumb-item"]')).toHaveLength(2)
  })

  it('不放标题 h1（末级面包屑已是页面标题）', () => {
    renderLayout()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('不放「返回站点」链接（logo 已是回站点出口）', () => {
    renderLayout()
    expect(screen.queryByRole('link', { name: '返回站点' })).toBeNull()
  })

  it('右上角渲染主题切换按钮', () => {
    renderLayout()
    expect(screen.getByRole('button', { name: /主题/ })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run --config vitest.components.config.ts tests/components/settings-layout.test.tsx`
Expected: FAIL —— 现在的 `header` 仍是 `SidebarTrigger` + `<h1>个人中心</h1>` +
「返回站点」链接，因此「面包屑三级」「不放 h1」「不放返回站点」「右上角主题切换」四条
全部失败。

- [ ] **Step 3: 重写 `header` 并补 `SidebarHeader` logo 与导入**

Modify `src/components/settings/SettingsLayout.tsx`。

导入区改为：

```tsx
import { Link, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { getSettingsSectionMeta, getSettingsSections } from '@/config/settings'
import { websiteConfig } from '@/config/website'
import type { Locale } from '@/lib/locale'
import { m } from '@/locale/paraglide/messages.js'
```

组件体内，`sections` 之后新增当前板块推导与面包屑需要的文案：

```tsx
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const sections = getSettingsSections(locale, {
    config: websiteConfig,
    authenticated: true,
  })
  // 当前板块：取 `/settings/` 之后的一段，与侧栏高亮用的是同一个 pathname。
  // 未注册的新板块（未来加了路由但工厂还没补）匹配不到，此时面包屑退化为两级，
  // 不渲染一个空的末级。
  const currentSection = pathname.split('/settings/')[1]?.split('/')[0]
  const currentMeta = sections.find((item) => item.id === currentSection)
    ? getSettingsSectionMeta(currentSection as Parameters<typeof getSettingsSectionMeta>[0])
    : null
```

`<Sidebar>` 的开口标签之后插入侧栏头（logo）：

```tsx
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link
            to="/{-$locale}"
            params={{ locale }}
            aria-label={websiteConfig.metadata.name}
            className="flex items-center rounded-lg px-2 py-1 transition-opacity hover:opacity-80"
          >
            <img
              src={websiteConfig.metadata.images.logoLight}
              alt=""
              width={1400}
              height={380}
              className="h-auto w-28 dark:bg-white"
            />
          </Link>
        </SidebarHeader>
```

`SidebarInset` 的 `header` 替换为：

```tsx
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b border-border px-4">
          {/* 折叠按钮：点击收起侧栏为图标窄条，再点展开。宽窄屏都常驻——
              窄屏下侧栏是 Sheet 抽屉，同样需要它打开。 */}
          <SidebarTrigger />
          {/* 三级面包屑：末级带 aria-current="page"，即页面标题，
              因此这里不再放 <h1>；回站点入口由侧栏头的 logo 承担，
              因此也不放「返回站点」。 */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link to="/{-$locale}" params={{ locale }} />}>
                  {m.crumb_home()}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={
                    <Link
                      to="/{-$locale}/settings/profile"
                      params={{ locale }}
                    />
                  }
                >
                  {m.settings_title()}
                </BreadcrumbLink>
              </BreadcrumbItem>
              {currentMeta && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{currentMeta.title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
          {/* 主题切换放顶栏右上角而非侧栏头：侧栏折叠后只剩约 3rem，
              按钮会和 logo 抢位；这里与营销站 Navbar 的位置一致。 */}
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
```

并新增导入：

```tsx
import { ThemeToggle } from '@/components/theme/ThemeToggle'
```

最后把组件顶部 doc 注释里关于顶栏的描述更新为面包屑版（原文写的是「个人中心不渲染营销
导航栏……给出回站点的入口」）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run --config vitest.components.config.ts tests/components/settings-layout.test.tsx`
Expected: PASS，7 passed。

若「渲染折叠按钮」失败，检查 `SidebarTrigger` 是否渲染出 `data-slot="sidebar-trigger"`
（该属性由 shadcn 原件自带，不应为 null）。

若两条面包屑链接的 `href` 断言失败，说明 `BreadcrumbLink render={<Link/>}` 的 `href`
没有被透传。此时把 `href` 显式传给 render 目标：

```tsx
<BreadcrumbLink
  render={<Link to="/{-$locale}" params={{ locale }} href="/zh" />}
>
  {m.crumb_home()}
</BreadcrumbLink>
```

但**先试不带 `href` 的 `render` 版**：`UserMenu` 的 `Menu.Item`（
`src/components/layout/UserMenu.tsx:60`）用的就是这个 prop，同一 Base UI 版本下
`Link` 的 `to` / `params` 会被合并进渲染出的 `<a>`；jsdom 测试里 `<a>` 的 `href`
来自 `Link` 的路由计算，断言写死 `/zh` 与 `/zh/settings/profile`（`locale="zh"` 下
的期望值）。换写法前先确认失败确实来自 prop 透传，而不是 mock 的 `useRouterState`
返回值与 `locale` prop 不一致。

- [ ] **Step 5: 跑全量检查**

Run: `pnpm check && pnpm test && pnpm exec vitest run --config vitest.components.config.ts`
Expected: 全部通过；组件测试 **153** passed（146 基线 + 7）。

- [ ] **Step 6: 手动验证折叠交互（可选但建议）**

Run: `pnpm dev`，登录后访问 `http://localhost:3000/zh/settings/profile`：
点击顶栏最左按钮，侧栏应收成图标窄条；再点一次恢复原宽。浅色与深色下 logo 均清晰。

- [ ] **Step 7: 提交**

```bash
git add src/components/settings/SettingsLayout.tsx tests/components/settings-layout.test.tsx
git commit -m "feat: 个人中心顶栏改为折叠按钮加三级面包屑，侧栏头新增站点 logo"
```

---

### Task 4: `SessionInfo` 增加 `image` 字段

**Files:**
- Modify: `src/auth/session.ts`（`SessionInfo` 类型 + `fetchSession` 的返回映射）
- Test: `e2e/settings.spec.ts`（真实注册用户走一遍，见 Step 3）

**Interfaces:**
- Consumes: `getAuth(env).api.getSession()`（返回的 `session.user.image` 为
  `string | null | undefined`，取决于 OAuth provider 是否上传过头像）
- Produces: `SessionInfo.user.image: string | null`。Task 5 的用户卡片消费它：
  falsy 时渲染首字母 fallback，truthy 时渲染 `AvatarImage`。

- [ ] **Step 1: 了解既有测试覆盖状况**

Run: `grep -rln "fetchSession\|SessionInfo" tests/ e2e/`
Expected: 无输出 —— `SessionInfo` 目前没有单测，`fetchSession` 由 e2e 的真实登录流程
覆盖。因此本任务不新增单测，靠 Step 3 的 e2e 与 Task 5 的组件测试（卡片对两种 image
输入各有一条用例）兜住。

- [ ] **Step 2: 改 `SessionInfo` 与 `fetchSession`**

Modify `src/auth/session.ts`。接口定义改为：

```ts
/** 个人中心守卫所需的会话信息（只取页面要用的字段，不回传整个 session）。 */
export interface SessionInfo {
  user: {
    id: string
    name: string
    email: string
    emailVerified: boolean
    /** OAuth 头像地址；邮箱密码注册用户为 `null`，UI 侧回退到首字母。 */
    image: string | null
  }
}
```

`fetchSession` 的返回值改为：

```ts
    if (!session) return null
    return {
      user: {
        id: session.user.id,
        name: session.user.name ?? '',
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        image: session.user.image ?? null,
      },
    }
```

注意 `?? null` 而不是直接透传：`session.user.image` 可能是 `undefined`，把类型收窄成
`string | null` 后，消费方只需判 falsy，不必区分 `undefined` 与 `null` 两种情况。

- [ ] **Step 3: e2e 确认个人中心仍可用（含 image 为 null 的路径）**

在 `e2e/settings.spec.ts` 的 `register()` 之后，`/zh/settings` 用例已有覆盖。先跑现有
settings 套件确认本改动没有破坏守卫链路：

Run: `pnpm exec playwright test e2e/settings.spec.ts`
Expected: 全部通过（该套件注册流程不设头像，因此走的是 `image === null` 路径）。

头像非空的路径需要 Google 登录，本地 e2e 不接真实 OAuth；该路径由 Task 5 的组件测试
用桩数据覆盖（直接渲染有 image 的用户卡片）。

- [ ] **Step 4: 类型检查**

Run: `pnpm typecheck`
Expected: 无错误。若报 `Property 'image' does not exist`，说明 Better Auth 的
`session.user` 类型未含 `image`——检查 `src/auth/auth.ts` 的 `user` 配置是否引用了
`src/db/schema.ts` 的 `users` 表（该表有 `image` 列）。不要用类型断言绕过。

- [ ] **Step 5: 提交**

```bash
git add src/auth/session.ts
git commit -m "feat: 会话信息带上用户头像字段，供个人中心用户卡片展示"
```

---

### Task 5: 侧栏底部用户卡片

**Files:**
- Create: `src/components/settings/SettingsUserCard.tsx`
- Modify: `src/components/settings/SettingsLayout.tsx`（`SidebarFooter` 装配 + 传入 session）
- Modify: `src/routes/{-$locale}/_layout/settings.tsx`（把路由 context 的 session 透给外壳）
- Test: `tests/components/settings-user-card.test.tsx`（新建）

**Interfaces:**
- Consumes: `SessionInfo`（Task 4）、`signOutAndRedirect()`（Task 2）、`SidebarMenuButton`
- Produces: `<SettingsUserCard session={session} />` —— 渲染头像 + 名字 + 邮箱；
  展开菜单含「退出登录」，点击调用 `signOutAndRedirect`。
- **接口变更**：`SettingsLayout` 的 props 由 `{ locale, children }` 扩为
  `{ locale, session, children }`。Task 3 的测试需同步补 `session` prop（见 Step 6）。

- [ ] **Step 1: 写失败测试**

Create `tests/components/settings-user-card.test.tsx`：

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsUserCard } from '@/components/settings/SettingsUserCard'
import { Sidebar, SidebarFooter, SidebarProvider } from '@/components/ui/sidebar'
import type { SessionInfo } from '@/auth/session'
import { setLocale } from '@/locale/paraglide/runtime.js'

/**
 * 个人中心侧栏底部的用户卡片。
 *
 * 关键行为：
 * - 有 `image` 渲染 `<img>`，没有则渲染首字母 fallback（OAuth 用户 vs 邮箱密码用户）；
 * - 展开菜单提供「退出登录」——这是个人中心内唯一的登出入口（`_layout` 路由不渲染营销导航栏）；
 * - 登出委托给 `signOutAndRedirect`，卡片自身不碰 `location`；
 * - 折叠成 icon 时只露头像，菜单仍可打开。
 *
 * 渲染必须包在 `SidebarProvider` 里：`SidebarMenuButton` 内部调 `useSidebar()`
 * （见 `src/components/ui/sidebar.tsx`），在 Provider 外会直接抛错。
 */
const mocks = vi.hoisted(() => ({
  signOutAndRedirect: vi.fn(),
}))

vi.mock('@/auth/sign-out', () => ({
  signOutAndRedirect: (...args: unknown[]) => mocks.signOutAndRedirect(...args),
}))

/** 渲染卡片；包 `SidebarProvider` 是因为 `SidebarMenuButton` 内部调 `useSidebar()`。 */
function renderCard(session: SessionInfo) {
  return render(
    <SidebarProvider>
      <Sidebar>
        <SidebarFooter>
          <SettingsUserCard session={session} />
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>,
  )
}

function sessionWith(overrides: Partial<SessionInfo['user']> = {}): SessionInfo {
  return {
    user: {
      id: 'u_1',
      name: 'woods',
      email: 'woods@example.com',
      emailVerified: true,
      image: null,
      ...overrides,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  clearCookies()
  setLocale('zh', { reload: false })
})

function clearCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (name) {
      // biome-ignore lint/suspicious/noDocumentCookie: 测试清理，必须同步改写 cookie jar。
      document.cookie = `${name}; Path=/; Max-Age=0`
    }
  }
}

describe('SettingsUserCard', () => {
  it('有 image 时渲染头像图片', () => {
    renderCard(sessionWith({ image: 'https://example.com/a.png' }))
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/a.png')
  })

  it('无 image 时渲染 name 首字母作为 fallback', () => {
    renderCard(sessionWith())
    // Avatar 的 fallback 渲染首字母；没有 <img>。
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('w')).toBeInTheDocument()
  })

  it('name 为空时用邮箱首字母', () => {
    renderCard(sessionWith({ name: '' }))
    expect(screen.getByText('w')).toBeInTheDocument()
  })

  it('展示名字与邮箱', () => {
    renderCard(sessionWith())
    expect(screen.getByText('woods@example.com')).toBeInTheDocument()
  })

  it('展开菜单后提供退出登录，点击调用 signOutAndRedirect', async () => {
    renderCard(sessionWith())
    screen.getByRole('button', { name: /woods/ }).click()
    await waitFor(() => expect(screen.getByText('退出登录')).toBeInTheDocument())
    screen.getByText('退出登录').click()
    await waitFor(() => expect(mocks.signOutAndRedirect).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run --config vitest.components.config.ts tests/components/settings-user-card.test.tsx`
Expected: FAIL，无法解析 `@/components/settings/SettingsUserCard`（模块尚不存在）。
这也确认了测试文件的 import 与 `SidebarProvider` 包裹本身没有语法错误——若失败信息
是 `useSidebar must be used within a SidebarProvider`，说明 Provider 包裹没写对，
回到 Step 1 检查。

- [ ] **Step 3: 写最小实现**

Create `src/components/settings/SettingsUserCard.tsx`：

```tsx
import { IconLogout, IconChevronUp } from '@tabler/icons-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import type { SessionInfo } from '@/auth/session'
import { signOutAndRedirect } from '@/auth/sign-out'
import { m } from '@/locale/paraglide/messages.js'

/**
 * 侧栏底部的用户卡片：头像 + 名字 + 邮箱，展开后登出。
 *
 * 个人中心是 `_layout` 路由、**不渲染营销导航栏**，因此导航栏 `UserMenu` 里的登出入口
 * 在这里是不可见的——这张卡片就是个人中心内唯一的登出口。
 *
 * 头像走 shadcn 的 `Avatar`：`image` 为空（邮箱密码注册用户）时自动落到
 * `AvatarFallback`，渲染首字母；`name` 也为空时用邮箱首字母。
 *
 * 登出委托 `signOutAndRedirect`，本组件不碰 `location`。
 */
export function SettingsUserCard({ session }: { session: SessionInfo }) {
  const { name, email, image } = session.user
  const initial = (name.trim() || email).charAt(0).toUpperCase()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar className="size-8">
            {image && <AvatarImage src={image} alt="" />}
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{name || email}</span>
            <span className="truncate text-xs text-muted-foreground">{email}</span>
          </div>
          <IconChevronUp className="ml-auto size-4" />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
```

注意：上面的 `SidebarMenuButton` 版是**静态展示**（无展开菜单）。Step 4 会把它改成
Base UI `Menu` 下拉；先跑一次确认基础渲染（头像 / 名字 / 邮箱 / 首字母四条用例）通过，
再叠加菜单——失败的菜单用例此时应只剩「展开菜单后提供退出登录」一条。

- [ ] **Step 4: 叠加 Menu 下拉（含退出登录）**

把 Step 3 的 `SidebarMenuButton` 包进 Base UI `Menu`，改写成最终形态（`createFileRoute`
无关，此处只展示组件本体）：

```tsx
import { Menu } from '@base-ui/react/menu'
import { IconChevronUp, IconLogout } from '@tabler/icons-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import type { SessionInfo } from '@/auth/session'
import { signOutAndRedirect } from '@/auth/sign-out'
import { m } from '@/locale/paraglide/messages.js'

export function SettingsUserCard({ session }: { session: SessionInfo }) {
  const { name, email, image } = session.user
  const initial = (name.trim() || email).charAt(0).toUpperCase()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Menu.Root>
          <Menu.Trigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label={name || email}
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              />
            }
          >
            <Avatar className="size-8">
              {image && <AvatarImage src={image} alt="" />}
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{name || email}</span>
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            </div>
            <IconChevronUp className="ml-auto size-4" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="top" align="start" sideOffset={8}>
              <Menu.Popup className="min-w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
                <Menu.Item
                  onClick={() => void signOutAndRedirect()}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
                >
                  <IconLogout size={16} aria-hidden />
                  {m.auth_logout()}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
```

`side="top"`：卡片在侧栏底部，菜单向上展开才不会溢出视口。

导入顺序按本仓 Biome 约定（组织导入会自动排序，见 Step 6 的 `pnpm check`）。

- [ ] **Step 5: 运行测试确认全部通过**

Run: `pnpm exec vitest run --config vitest.components.config.ts tests/components/settings-user-card.test.tsx`
Expected: PASS，5 passed。

- [ ] **Step 6: 把卡片装进 `SettingsLayout`**

Modify `src/components/settings/SettingsLayout.tsx`：

1. props 加 `session`：

```tsx
export function SettingsLayout({
  locale,
  session,
  children,
}: {
  locale: Locale
  session: SessionInfo
  children: ReactNode
}) {
```

并新增导入：

```tsx
import type { SessionInfo } from '@/auth/session'
import { SettingsUserCard } from '@/components/settings/SettingsUserCard'
```

2. 在 `</SidebarContent>` 之后、`</Sidebar>` 之前插入：

```tsx
        <SidebarFooter>
          <SettingsUserCard session={session} />
        </SidebarFooter>
```

3. 更新组件顶部 doc 注释：补一句「底部用户卡片是个人中心内唯一的登出入口（该路由不渲染
   营销导航栏）」。

Modify `src/routes/{-$locale}/_layout/settings.tsx`，把 context 里的 session 传下去：

```tsx
function SettingsLayoutRoute() {
  const { session } = Route.useRouteContext()
  return (
    <SettingsLayout locale={getRequestLocale()} session={session}>
      <Outlet />
    </SettingsLayout>
  )
}
```

4. 同步更新 Task 3 的 `tests/components/settings-layout.test.tsx`：`renderLayout()` 里补
   `session` prop。

```tsx
function renderLayout() {
  return render(
    <SettingsLayout locale="zh" session={sessionWith()}>
      <div>内容区</div>
    </SettingsLayout>,
  )
}
```

并在文件顶部加夹具（与 `settings-user-card.test.tsx` 同形的 `sessionWith`，type 导入
`SessionInfo`）：

```tsx
import type { SessionInfo } from '@/auth/session'

function sessionWith(): SessionInfo {
  return {
    user: {
      id: 'u_1',
      name: 'woods',
      email: 'woods@example.com',
      emailVerified: true,
      image: null,
    },
  }
}
```

- [ ] **Step 7: 跑受影响的测试**

Run: `pnpm exec vitest run --config vitest.components.config.ts tests/components/settings-layout.test.tsx tests/components/settings-user-card.test.tsx`
Expected: PASS，7 + 5 = 12 passed。

- [ ] **Step 8: 跑全量检查**

Run: `pnpm check && pnpm test && pnpm exec vitest run --config vitest.components.config.ts`
Expected: 全部通过；组件测试 **158** passed（153 + 5）。

- [ ] **Step 9: 提交**

```bash
git add src/components/settings/SettingsUserCard.tsx src/components/settings/SettingsLayout.tsx "src/routes/{-\$locale}/_layout/settings.tsx" tests/components/settings-user-card.test.tsx tests/components/settings-layout.test.tsx
git commit -m "feat: 个人中心侧栏底部新增用户卡片，提供头像与登出入口"
```

---

### Task 6: 删除 `settings_back_home` 消息键

**Files:**
- Modify: `messages/zh.json`（删一行）
- Modify: `messages/en.json`（删一行）

**Interfaces:**
- Consumes: Task 3 已完成（顶栏不再渲染「返回站点」链接）
- Produces: 无。本任务是纯删除，紧跟 Task 3 / 5 之后、文档任务（Task 7）之前，
  确保「代码无消费者」与「键已删」之间没有中间态。

- [ ] **Step 1: 确认已无消费者**

Run: `grep -rn "settings_back_home" src/ messages/ tests/ e2e/`
Expected: 只剩 `messages/zh.json` 与 `messages/en.json` 两行定义；`src/`、`tests/`、
`e2e/` 无任何引用。
若 `src/` 下仍有引用，说明 Task 3 的 `header` 重写不完整——先回到 Task 3 补完，
不要在这个状态下删键。

- [ ] **Step 2: 删两个 locale 文件里的键**

Modify `messages/zh.json`：删除第 304 行

```json
  "settings_back_home": "返回站点",
```

Modify `messages/en.json`：删除第 304 行

```json
  "settings_back_home": "Back to site",
```

（行号以本计划编写时为准；用 `grep -n settings_back_home messages/*.json` 确认实际行号。）

- [ ] **Step 3: 重排并重新编译 locale**

Run: `pnpm locale:sort`
Expected: 脚本报告排序后的写入结果，无错误。

Run: `pnpm locale:compile`
Expected: `✔ [paraglide-js] Successfully compiled inlang project.`

- [ ] **Step 4: 校验 locale 配对（防漏删一侧）**

Run: `pnpm locale:check`
Expected: `✅ 所有 locale 键配对一致（base: zh）`。
若报两侧键不一致，说明只删了一边——补上另一边，不要靠改 `check-locale.ts` 让校验通过。

- [ ] **Step 5: 跑全量检查**

Run: `pnpm check && pnpm test && pnpm exec vitest run --config vitest.components.config.ts`
Expected: 全部通过。`tsc --noEmit` 会再次确认 `src/` 下没有残留引用
（Paraglide 重新编译后该键不存在，任何引用都会变成类型错误）。

- [ ] **Step 6: 提交**

```bash
git add messages/zh.json messages/en.json
git commit -m "chore: 删除 settings_back_home 消息键，顶栏已改用 logo 作为回站点入口"
```

---

### Task 7: 文档参考资料与 `auth-account` 校正

**Files:**
- Modify: `content/docs/` 下 9 篇的 zh + en（共 18 个文件）：`getting-started`、`auth`、
  `auth-account`、`environment`、`payment`、`email`、`newsletter`、`notifications`、`analytics`
- Modify: `content/docs/auth-account.zh.md` 与 `content/docs/auth-account.md`（结构描述校正，见 Step 5）

**Interfaces:**
- Consumes: Task 1 的 URL 清单（已在 `.env.example` 注释中用过同一批）；Task 3 / 5 的最终 UI 结构
- Produces: 无代码产物。每个文件的 frontmatter `updated` 改为 `2026-10-15`。

- [ ] **Step 1: 先读一篇现有文档的 `updated` 与「下一步」位置**

Run: `sed -n '1,10p' content/docs/auth.zh.md && echo '---' && tail -8 content/docs/auth.zh.md`
Expected: frontmatter 有 `updated: 2026-10-14`；末尾是「## 下一步」小节。
所有任务文件的插入点都是「## 下一步」**之前**，`updated` 改为 `2026-10-15`。

- [ ] **Step 2: 插入「参考资料」（zh 版文案）**

对每篇 zh 文件，在「## 下一步」之前插入下列小节（只贴该篇对应的行；链接名用中文）。
**en 版在 Step 3 单独给出**，URL 完全相同。

`content/docs/getting-started.zh.md`：

```markdown
## 参考资料

- [Cloudflare Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)——`wrangler.jsonc` 的字段与 binding 声明
- [Cloudflare D1](https://developers.cloudflare.com/d1/)——数据库创建与迁移
- [Cloudflare Workers KV 快速开始](https://developers.cloudflare.com/kv/get-started/)——KV namespace 与 binding
- [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/get-started/workers-api/)——从 Worker 读写对象存储
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)——生产环境 secret 的配置方式
- [Drizzle <> Cloudflare D1](https://orm.drizzle.team/docs/connect-cloudflare-d1)——Drizzle 连接 D1 的驱动与初始化
```

`content/docs/auth.zh.md`：

```markdown
## 参考资料

- [Better Auth 配置选项](https://www.better-auth.com/docs/reference/options)——`BETTER_AUTH_SECRET` 等配置项说明
- [Better Auth Google provider](https://www.better-auth.com/docs/authentication/google)——Google 登录的凭据申请与配置
- [Google OAuth 2.0 Web Server](https://developers.google.com/identity/protocols/oauth2/web-server)——授权码流程的完整说明
- [TanStack Start 认证指南](https://tanstack.com/start/latest/docs/framework/react/guide/authentication)——会话、受保护路由与服务端函数
```

`content/docs/auth-account.zh.md`：

```markdown
## 参考资料

- [Better Auth 配置选项](https://www.better-auth.com/docs/reference/options)——账户相关字段与会话配置
- [TanStack Start 认证指南](https://tanstack.com/start/latest/docs/framework/react/guide/authentication)——`beforeLoad` 守卫与整页跳转的取舍
```

`content/docs/environment.zh.md`：

```markdown
## 参考资料

- [Better Auth 配置选项](https://www.better-auth.com/docs/reference/options)——`BETTER_AUTH_SECRET` 等配置项
- [Stripe API keys](https://docs.stripe.com/keys)——密钥类型与 webhook 签名密钥
- [Google OAuth 2.0 Web Server](https://developers.google.com/identity/protocols/oauth2/web-server)——`GOOGLE_CLIENT_ID` / `SECRET` 的申请
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)——生产 secret 与本地 `.dev.vars`
- [Cloudflare Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)——binding 声明
- [Cloudflare D1](https://developers.cloudflare.com/d1/)——`DB` binding 对应的资源
- [Cloudflare Workers KV 快速开始](https://developers.cloudflare.com/kv/get-started/)——`CACHE` binding 对应的资源
- [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/get-started/workers-api/)——`BUCKET` binding 对应的资源
- [Drizzle <> Cloudflare D1](https://orm.drizzle.team/docs/connect-cloudflare-d1)——ORM 侧的连接方式
- [Resend API](https://resend.com/docs/api-reference/introduction)——`RESEND_API_KEY` 的用法
- [beehiiv Create an API Key](https://developers.beehiiv.com/welcome/create-an-api-key)——`BEEHIIV_API_KEY` 的申请
- [Discord Webhooks](https://docs.discord.com/developers/resources/webhook)——`DISCORD_WEBHOOK_URL` 的创建
- [飞书自定义机器人](https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN)——`FEISHU_WEBHOOK_URL` 的创建
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)——`VITE_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`
```

`content/docs/payment.zh.md`：

```markdown
## 参考资料

- [Stripe API keys](https://docs.stripe.com/keys)——密钥类型、webhook 签名密钥与轮换
```

`content/docs/email.zh.md`：

```markdown
## 参考资料

- [Resend API](https://resend.com/docs/api-reference/introduction)——`RESEND_API_KEY` 的用法与限流
- [Cloudflare Email Service Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)——`send_email` binding 的声明与 `send()` 调用
```

`content/docs/newsletter.zh.md`：

```markdown
## 参考资料

- [beehiiv Create an API Key](https://developers.beehiiv.com/welcome/create-an-api-key)——`BEEHIIV_API_KEY` 的申请与权限
- [Resend API](https://resend.com/docs/api-reference/introduction)——`RESEND_API_KEY` 与 `RESEND_AUDIENCE_ID` 的用法
```

`content/docs/notifications.zh.md`：

```markdown
## 参考资料

- [Discord Webhooks](https://docs.discord.com/developers/resources/webhook)——incoming webhook 的创建与调用
- [飞书自定义机器人](https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN)——自定义机器人的 webhook 与安全设置
```

`content/docs/analytics.zh.md`：

```markdown
## 参考资料

- [Google Analytics Measurement ID](https://support.google.com/analytics/answer/12270356?hl=en)——`VITE_GA_ID` 的获取位置
- [Plausible tracking script](https://plausible.io/docs/plausible-script)——`VITE_PLAUSIBLE_DOMAIN` 与脚本注入
- [Umami Collect data](https://docs.umami.is/docs/collect-data)——`VITE_UMAMI_WEBSITE_ID` 与 `VITE_UMAMI_SCRIPT_URL`
- [Microsoft Clarity Setup](https://learn.microsoft.com/en-us/clarity/setup-and-installation/)——`VITE_CLARITY_PROJECT_ID` 的获取位置
```

- [ ] **Step 3: 插入「参考资料」（en 版文案，URL 与 Step 2 完全相同）**

`content/docs/getting-started.md`：

```markdown
## References

- [Cloudflare Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) — keys and bindings in `wrangler.jsonc`
- [Cloudflare D1](https://developers.cloudflare.com/d1/) — database creation and migrations
- [Cloudflare Workers KV get started](https://developers.cloudflare.com/kv/get-started/) — KV namespaces and bindings
- [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/get-started/workers-api/) — object storage from a Worker
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) — production secrets and local `.dev.vars`
- [Drizzle <> Cloudflare D1](https://orm.drizzle.team/docs/connect-cloudflare-d1) — driver and initialization
```

`content/docs/auth.md`：

```markdown
## References

- [Better Auth options](https://www.better-auth.com/docs/reference/options) — `BETTER_AUTH_SECRET` and other settings
- [Better Auth Google provider](https://www.better-auth.com/docs/authentication/google) — Google credentials and setup
- [Google OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server) — the authorization code flow
- [TanStack Start authentication guide](https://tanstack.com/start/latest/docs/framework/react/guide/authentication) — sessions, protected routes, server functions
```

`content/docs/auth-account.md`：

```markdown
## References

- [Better Auth options](https://www.better-auth.com/docs/reference/options) — account fields and session settings
- [TanStack Start authentication guide](https://tanstack.com/start/latest/docs/framework/react/guide/authentication) — `beforeLoad` guards and full-page redirects
```

`content/docs/environment.md`：

```markdown
## References

- [Better Auth options](https://www.better-auth.com/docs/reference/options) — `BETTER_AUTH_SECRET` and other settings
- [Stripe API keys](https://docs.stripe.com/keys) — key types and webhook signing secrets
- [Google OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server) — `GOOGLE_CLIENT_ID` / `SECRET`
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) — production secrets and local `.dev.vars`
- [Cloudflare Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) — binding declarations
- [Cloudflare D1](https://developers.cloudflare.com/d1/) — the resource behind the `DB` binding
- [Cloudflare Workers KV get started](https://developers.cloudflare.com/kv/get-started/) — the resource behind the `CACHE` binding
- [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/get-started/workers-api/) — the resource behind the `BUCKET` binding
- [Drizzle <> Cloudflare D1](https://orm.drizzle.team/docs/connect-cloudflare-d1) — connecting the ORM
- [Resend API](https://resend.com/docs/api-reference/introduction) — `RESEND_API_KEY` usage
- [beehiiv Create an API Key](https://developers.beehiiv.com/welcome/create-an-api-key) — getting a `BEEHIIV_API_KEY`
- [Discord Webhooks](https://docs.discord.com/developers/resources/webhook) — creating a `DISCORD_WEBHOOK_URL`
- [Feishu custom bot](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot) — creating a `FEISHU_WEBHOOK_URL`
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) — `VITE_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`
```

`content/docs/payment.md`：

```markdown
## References

- [Stripe API keys](https://docs.stripe.com/keys) — key types, webhook signing secrets, rotation
```

`content/docs/email.md`：

```markdown
## References

- [Resend API](https://resend.com/docs/api-reference/introduction) — `RESEND_API_KEY` usage and rate limits
- [Cloudflare Email Service Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/) — `send_email` binding and `send()`
```

`content/docs/newsletter.md`：

```markdown
## References

- [beehiiv Create an API Key](https://developers.beehiiv.com/welcome/create-an-api-key) — getting a `BEEHIIV_API_KEY`
- [Resend API](https://resend.com/docs/api-reference/introduction) — `RESEND_API_KEY` and `RESEND_AUDIENCE_ID`
```

`content/docs/notifications.md`：

```markdown
## References

- [Discord Webhooks](https://docs.discord.com/developers/resources/webhook) — creating and calling an incoming webhook
- [Feishu custom bot](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot) — custom bot webhook and security settings
```

`content/docs/analytics.md`：

```markdown
## References

- [Google Analytics Measurement ID](https://support.google.com/analytics/answer/12270356?hl=en) — where to find `VITE_GA_ID`
- [Plausible tracking script](https://plausible.io/docs/plausible-script) — `VITE_PLAUSIBLE_DOMAIN` and script injection
- [Umami Collect data](https://docs.umami.is/docs/collect-data) — `VITE_UMAMI_WEBSITE_ID` and `VITE_UMAMI_SCRIPT_URL`
- [Microsoft Clarity Setup](https://learn.microsoft.com/en-us/clarity/setup-and-installation/) — where to find `VITE_CLARITY_PROJECT_ID`
```

飞书链接两版不同：zh 指中文页 `.../ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN`，en 指英文页
`.../client-docs/bot-v3/add-custom-bot`。

- [ ] **Step 4: 更新 `updated` 字段**

对 18 个文件，把 frontmatter 的 `updated: 2026-10-14` 改为 `updated: 2026-10-15`。

Run: `grep -c "updated: 2026-10-15" content/docs/*.md | grep -v ":1" `
Expected: 无输出（每个文件恰好一行 `updated: 2026-10-15`）。

- [ ] **Step 5: 校正 `auth-account` 的结构描述**

`content/docs/auth-account.zh.md` 与 `.md` 的「侧边栏」小节现在只描述了「直接用 shadcn
的 sidebar」，需要补上 Task 3 / 5 新增的两块。在「## 侧边栏」小节末尾追加（zh 版）：

```markdown
侧栏自底向上分三段：

| 段 | 内容 |
|---|---|
| `SidebarHeader` | 站点 logo，点击回首页；深色主题下加白底片（与营销站 Navbar 同一处理） |
| `SidebarContent` | 上文所述的板块菜单，文案来自 `getSettingsSections` |
| `SidebarFooter` | 用户卡片（`SettingsUserCard`）：头像 + 名字 + 邮箱，展开后登出 |

用户卡片是个人中心内**唯一**的登出入口——`settings` 是 `_layout` 路由，不渲染营销导航栏，
`UserMenu` 在这里不可见。头像取 `SessionInfo.user.image`（`users.image` 列，Google 登录
会写入）；为空时回退到 `name` 或邮箱的首字母。

顶栏（`SidebarInset` 内的 `header`）放三样东西，从左到右：

1. `SidebarTrigger`——折叠按钮，点击把侧栏收成图标窄条，再点展开；宽窄屏都常驻，
   窄屏下侧栏是 `Sheet` 抽屉，同样靠它打开。
2. 三级面包屑——`首页 › 个人中心 › 当前板块`，前两级是 `BreadcrumbLink`，末级是
   `BreadcrumbPage`（带 `aria-current="page"`）。
3. `ThemeToggle`——右上角。放侧栏头会和 logo 抢位（折叠后侧栏只剩约 3rem），
   且营销站 Navbar 就在这个位置，用户预期一致。

顶栏**没有** `<h1>`：面包屑末级已是页面标题，再放一个会让同一个词在屏幕与无障碍树里
各出现一次。也**没有**「返回站点」链接——logo 就是回站点入口。
```

en 版对应：

```markdown
The sidebar has three sections, bottom-up:

| Section | Contents |
|---|---|
| `SidebarHeader` | Site logo, links to home; white plate in dark theme (same treatment as the marketing Navbar) |
| `SidebarContent` | The section menu described above, copy from `getSettingsSections` |
| `SidebarFooter` | User card (`SettingsUserCard`): avatar + name + email, expand to sign out |

The user card is the **only** sign-out entry inside the account area — `settings` is a
`_layout` route that does not render the marketing Navbar, so `UserMenu` is not visible
here. The avatar comes from `SessionInfo.user.image` (the `users.image` column, written by
Google sign-in); when empty it falls back to the first letter of `name` or email.

The top bar (the `header` inside `SidebarInset`) holds three things, left to right:

1. `SidebarTrigger` — the collapse button; click to shrink the sidebar to an icon rail,
   click again to expand. Visible on every breakpoint; on narrow screens the sidebar is a
   `Sheet` drawer and needs this button to open.
2. A three-level breadcrumb — `Home › Account › Current section`. The first two levels are
   `BreadcrumbLink`s, the last is a `BreadcrumbPage` (with `aria-current="page"`).
3. `ThemeToggle` — top right. In the sidebar header it would fight the logo for space (the
   collapsed sidebar is only ~3rem wide), and the marketing Navbar already puts it there.

The top bar has **no** `<h1>`: the last breadcrumb level is already the page title, and
repeating it would surface the same word twice — once visually, once in the accessibility
tree. There is also **no** "Back to site" link — the logo is that entry point.
```

同时更新两版的「下一步」小节，把「侧栏」相关描述指向新结构（若原文提到「资料 / 安全 /
登录设备 / 通知偏好四个板块」等描述与现状仍一致则保留）。

- [ ] **Step 6: 校验文档站能渲染**

Run: `pnpm exec content-collections build 2>&1 | tail -5`
Expected: 构建成功，无 MDX 解析错误（新增的 markdown 链接语法若写错会在此暴露）。

- [ ] **Step 7: 跑全量检查**

Run: `pnpm check && pnpm test && pnpm exec vitest run --config vitest.components.config.ts`
Expected: 全部通过。`tests/components/legal-docs-render.test.tsx` 等文档渲染测试若涉及
`content/docs`，会在此确认新增小节没有破坏渲染。

- [ ] **Step 8: 提交**

```bash
git add content/docs/
git commit -m "docs: 各模块文档补充第三方官方参考资料，并校正个人中心结构描述"
```

---

### Task 8: 更新 e2e settings 套件

**Files:**
- Modify: `e2e/settings.spec.ts`

**Interfaces:**
- Consumes: Task 3 / 5 的最终 UI（顶栏面包屑、侧栏头 logo、底部用户卡片）
- Produces: 无。本任务让 e2e 反映新的登出入口与折叠交互。

- [ ] **Step 1: 确认现有登出用例的位置与内容**

Run: `grep -n "登出\|用户菜单\|个人中心是" e2e/settings.spec.ts`
Expected: 命中最后一个用例 `登出后再次访问个人中心被重定向`，其中有一段注释写着
「个人中心是 `_layout` 路由，不渲染营销导航栏（与 docs 一致），因此登出入口在首页导航栏
的用户菜单里」。

Task 5 之后这段注释**不再成立**：侧栏底部用户卡片就是个人中心内的登出入口。

- [ ] **Step 2: 改登出用例为从用户卡片登出**

把该用例中

```ts
    // 个人中心是 `_layout` 路由，不渲染营销导航栏（与 docs 一致），
    // 因此登出入口在首页导航栏的用户菜单里。
    await page.getByRole('button', { name: '设置用户' }).click()
    await page.getByText('退出登录').click()
```

替换为：

```ts
    // 登出入口在侧栏底部用户卡片：`settings` 是 `_layout` 路由，不渲染营销导航栏，
    // `UserMenu` 在这里不可见。
    await page.getByRole('button', { name: /设置用户/ }).click()
    await page.getByText('退出登录').click()
```

两点差异：按钮定位从首页导航栏改为当前页侧栏卡片；匹配从全等名改为正则，因为此时
卡片触发按钮的可访问名是 `aria-label={name || email}`，而卡片上还显示着邮箱文本，
全等匹配会同时命中两处。

- [ ] **Step 3: 新增折叠按钮用例**

在 `test.describe('Settings', ...)` 内追加一个用例：

```ts
  test('顶栏折叠按钮收起侧栏为图标窄条，再点恢复', async ({ page }) => {
    await register(page)
    await page.goto('/zh/settings/profile')

    // 折叠前：三级面包屑末级是当前板块，且是当前页（非链接）。
    await expect(page.getByRole('navigation', { name: 'breadcrumb' })).toBeVisible()
    await expect(page.getByText('资料')).toHaveAttribute('aria-current', 'page')

    const sidebar = page.locator('[data-slot="sidebar"]')
    await expect(sidebar).toHaveAttribute('data-state', 'expanded')
    await page.locator('[data-slot="sidebar-trigger"]').click()
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed')
    await page.locator('[data-slot="sidebar-trigger"]').click()
    await expect(sidebar).toHaveAttribute('data-state', 'expanded')
  })
```

- [ ] **Step 4: 运行 e2e settings 套件**

Run: `pnpm exec playwright test e2e/settings.spec.ts`
Expected: 全部通过（含新增用例）。本地 D1 会跨运行保留数据，`register()` 用随机邮箱
正是为此，不要改成固定邮箱。

若 `data-state` 断言失败，先确认 `data-slot="sidebar"` 是否命中：该属性由 shadcn 原件
渲染在侧栏容器上；用 `page.locator('aside')` 作等价备选，但优先查 slot 名。

- [ ] **Step 5: 提交**

```bash
git add e2e/settings.spec.ts
git commit -m "test: e2e 改从用户卡片登出，并覆盖顶栏折叠交互"
```

---


## 验收清单（全部任务完成后）

- [ ] `pnpm check` 通过（locale 编译 + Biome + tsc + env 校验 + locale 配对）
- [ ] `pnpm test` 通过（602 tests：600 基线 + `auth-sign-out` 2 条）
- [ ] `pnpm exec vitest run --config vitest.components.config.ts` 通过（158 tests：146 基线 + 布局 7 + 卡片 5）
- [ ] `pnpm exec playwright test e2e/settings.spec.ts` 通过
- [ ] Node 脚本核对 `.env.example` 与 schema 键集合：仅差 `VITE_UMAMI_ID` / `VITE_CLARITY_ID`
- [ ] 手动走查 `/zh/settings/profile`：logo、面包屑、用户卡片、登出、折叠/展开均正常



