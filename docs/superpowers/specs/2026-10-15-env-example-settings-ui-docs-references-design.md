# env example、个人中心 UI 与文档参考资料设计

日期：2026-10-15。
状态：对话设计已获用户批准；本文件记录实施规格。

## 1. 目标与总体分工

三件事：把 `.env.example` 重新对齐 schema；把个人中心 UI 补齐到可用状态；给文档站加上第三方官方文档的参考链接。三块相互独立，可分别提交。

用户已确定：

- `.env.example` 全量重建，按 schema 声明顺序组织。
- Umami / Clarity 只列主字段，删除兼容字段的示例。
- 个人中心侧边栏采用参考图结构：头部 logo + 主题切换，底部用户卡片（Base UI Menu 下拉）。
- 用户卡片头像接受 `image` 扩展。
- 文档「参考资料」只加在涉及第三方的 8 篇，zh 与 en 两套同步。
- 一篇涉及多家第三方时只列代码实际调用的文档页。

## 2. 当前源码事实

- `.env.example` 已存在，`scripts/setup.ts` 用它 `cp` 出 `.env`（缺失即抛错），但它与
  `src/env/public.ts` / `src/env/server.ts` 已脱节：缺 `VITE_UMAMI_WEBSITE_ID`、
  `VITE_CLARITY_PROJECT_ID`、`BEEHIIV_SEND_WELCOME_EMAIL`、 `ADMIN_EMAILS` 四个键。
- `VITE_UMAMI_WEBSITE_ID ?? VITE_UMAMI_ID`、`VITE_CLARITY_PROJECT_ID ?? VITE_CLARITY_ID`
  是主字段 + 兼容字段并存，读取处为 `src/lib/analytics/index.ts` 与
  `src/config/service-status.ts`。
- `SettingsLayout` 只有一组菜单：无 logo、无面包屑、无用户信息、无退出入口；顶栏当前是
  `SidebarTrigger` + `<h1>` 个人中心 + 「返回站点」链接。用户已登录但**在个人中心内
  无从登出**（只能回首页导航栏的用户菜单）。
- `crumb_home` / `crumb_blog` / `crumb_docs` 三个消息键已编译进 Paraglide 但全仓无
  消费者，是预留键；`Breadcrumb` 组合件已装入 `src/components/ui/`，同样尚无消费者。
- `fetchSession()`（`src/auth/session.ts`）只回 `id` / `name` / `email` / `emailVerified`，
  而 `users` 表有 `image` 字段（Google 登录会写入）。
- `UserMenu`（导航栏）已有「邮箱 + 退出」的等价实现，`signOut` 逻辑写在其组件内部。
- `content/docs/` 下 26 个文件（13 篇 × zh/en），`updated` 字段统一为 `2026-10-14`。
- 文档站 MDX 已支持 markdown 链接（相对路径已在用）。

## 3. 全局约束

沿用 `AGENT.md` 既有规约，重申与本设计相关的几条：

- 业务代码不得直接读 `process.env` / `import.meta.env`，一律经 `src/env/public.ts`、
  `src/env/server.ts`。
- `VITE_` 前缀变量进入客户端 bundle，不得存放 secret；`.env.example` 的分组注释必须
  让读者一眼看出哪层是公开的。
- `src/components/ui/` 是 shadcn 上游原件，不本地修改；需要调整外观在调用处传
  `className` 或包组合件。
- 消息键必须在 `messages/zh.json` 与 `messages/en.json` 同时存在，改完跑
  `pnpm locale:sort`。
- 行为修改先写失败测试；结构整理与行为修改分开提交。
- 不手改 `src/routeTree.gen.ts`、`src/locale/paraglide/**`。
- 文档中文与半角英数字之间加半角空格。

## 4. `.env.example` 重建

### 4.1 组织原则

**保留现有按功能模块分组的风格**（用户选定），不改成 schema 的两段式。理由：配某一
项服务时，它的公开键与 secret 相邻，不必在文件里跳两处。

分组沿用现有 example 的分组，逐个补齐缺口：

| 分组 | 键 |
|---|---|
| Site | `VITE_BASE_URL` |
| Payment（Stripe） | `VITE_PAYMENT_PROVIDER`、`VITE_STRIPE_PRICE_PRO_{MONTHLY,YEARLY,LIFETIME}`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET` |
| Auth | `BETTER_AUTH_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` |
| Cloudflare | `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_EMAIL_SENDER` |
| Email | `RESEND_API_KEY`、`MAIL_FROM` |
| Newsletter | `RESEND_AUDIENCE_ID`、`BEEHIIV_API_KEY`、`BEEHIIV_PUBLICATION_ID`、`BEEHIIV_SEND_WELCOME_EMAIL` |
| Notification | `DISCORD_WEBHOOK_URL`、`FEISHU_WEBHOOK_URL` |
| Analytics | `VITE_GA_ID`、`VITE_PLAUSIBLE_DOMAIN`、`VITE_UMAMI_WEBSITE_ID`、`VITE_UMAMI_SCRIPT_URL`、`VITE_CLARITY_PROJECT_ID` |
| Captcha | `VITE_TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY` |
| Admin | `ADMIN_EMAILS` |
| Runtime | `NODE_ENV` |

「Admin」是新增分组（`ADMIN_EMAILS` 不属于上面任何一组，它约束的是 `/api/email` 的收件人白名单）。

由于分组顺序与 schema 声明顺序不同，缺键不能靠 diff 发现，因此必须靠脚本核对（见 4.7）。

### 4.2 头部注释

保留 `cp .env.example .env` 的指引，并说明生产部署的 secrets 在 Cloudflare 控制台
配置，本地 example 不代表云端已就绪——这与 `README.md` 现有的口径一致，不新增口径。

### 4.3 键的取舍

相对现有 28 个键，净变化是 **+4 / −2**：

| 处理 | 键 |
|---|---|
| 补齐（进 4.1 已有分组） | `VITE_UMAMI_WEBSITE_ID`、`VITE_CLARITY_PROJECT_ID`（→ Analytics 组）、`BEEHIIV_SEND_WELCOME_EMAIL`（→ Newsletter 组）、`ADMIN_EMAILS`（→ 新建 Admin 组） |
| 删除 | `VITE_UMAMI_ID`、`VITE_CLARITY_ID`（兼容字段，schema 仍接受，example 不再展示） |
| 保留 | 其余 26 个键，注释按需校准 |

删除兼容字段是用户明确选择：example 只教主字段。schema 的兼容分支不动——删 schema
字段是行为变更，且会让已有旧配置失效，超出本次范围。

`ADMIN_EMAILS` 补注释说明格式（逗号分隔）与作用（`/api/email` 收件人白名单）。
`BEEHIIV_SEND_WELCOME_EMAIL` 补注释说明取值与默认值 `false`。

### 4.4 注释与参考链接

每组的第三方服务在注释里给官方文档链接，指向「怎么拿这个凭据」而不是产品首页。
URL 全部经过可达性验证（见 4.5）。

### 4.5 已验证的 URL 清单

| 主题 | URL |
|---|---|
| Better Auth 选项参考 | `https://www.better-auth.com/docs/reference/options` |
| Better Auth Google provider | `https://www.better-auth.com/docs/authentication/google` |
| TanStack Start 认证指南 | `https://tanstack.com/start/latest/docs/framework/react/guide/authentication` |
| Cloudflare Wrangler 配置 | `https://developers.cloudflare.com/workers/wrangler/configuration/` |
| Cloudflare Workers Secrets | `https://developers.cloudflare.com/workers/configuration/secrets/` |
| Cloudflare D1 | `https://developers.cloudflare.com/d1/` |
| Cloudflare KV get started | `https://developers.cloudflare.com/kv/get-started/` |
| Cloudflare R2 Workers API | `https://developers.cloudflare.com/r2/get-started/workers-api/` |
| Cloudflare Turnstile | `https://developers.cloudflare.com/turnstile/` |
| Drizzle <> Cloudflare D1 | `https://orm.drizzle.team/docs/connect-cloudflare-d1` |
| Stripe API keys | `https://docs.stripe.com/keys` |
| Google OAuth Web Server | `https://developers.google.com/identity/protocols/oauth2/web-server` |
| Resend API | `https://resend.com/docs/api-reference/introduction` |
| Cloudflare Email Service Workers API | `https://developers.cloudflare.com/email-service/api/send-emails/workers-api/` |
| beehiiv Create API Key | `https://developers.beehiiv.com/welcome/create-an-api-key` |
| Discord Webhooks | `https://docs.discord.com/developers/resources/webhook` |
| 飞书自定义机器人 | `https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN` |

analytics 四家（只用于第 6 节文档，example 的注释不含它们）：

| 服务 | URL |
|---|---|
| Google Analytics Measurement ID | `https://support.google.com/analytics/answer/12270356?hl=en` |
| Plausible tracking script | `https://plausible.io/docs/plausible-script` |
| Umami collect data | `https://docs.umami.is/docs/collect-data` |
| Microsoft Clarity setup | `https://learn.microsoft.com/en-us/clarity/setup-and-installation/` |

### 4.6 不含在 example 中的键

`CLOUDFLARE_DATABASE_ID` 由 `scripts/setup.ts` 写入 `.env`，但不在任一 schema 里，
`wrangler.jsonc` 也不读它（binding 走 `database_id`）。example 不加它——加了会让读者
以为它是契约的一部分。

### 4.7 验收

- `pnpm check:env` 通过（复制出的 `.env` 全部 optional 字段留空可校验）。
- 脚本化对比 example 键集合与两个 schema 键集合，双向为空（见下）。
- `.gitignore` 已有 `.env`，example 可安全入库。

核对命令（实施时执行一次，作为验收证据）：

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

重建后应为：前者只剩两个兼容字段（`VITE_UMAMI_ID`、`VITE_CLARITY_ID`，用户已定不列），
后者为空。这两项之外出现任何键都说明漏抄或多抄。

## 5. 个人中心 UI

### 5.1 目标结构

```
┌──────────────────────────────┐
│ 🚀 Jerbix                    │  ← SidebarHeader: 仅 logo
├──────────────────────────────┤
│ 个人中心                      │  ← SidebarGroupLabel
│ 资料                         │
│ 安全                         │
│ 登录设备                      │
│ 通知偏好（模块开启）           │
├──────────────────────────────┤
│ ◉  woods                  ⌃  │  ← SidebarFooter: 用户卡片
│    woods@example.com         │
└──────────────────────────────┘
┌────────────────────────────────────────────┐
│ [≡]  首页 › 个人中心 › 资料            ☀/🌙 │  ← 顶栏：折叠按钮 + 面包屑 + 主题切换（右上）
├────────────────────────────────────────────┤
│                                            │
│                    内容区                   │
│                                            │
└────────────────────────────────────────────┘
```

主题切换在**顶栏右上角**，不在侧栏头部：侧栏折叠成图标窄条时宽度只剩约 3rem，放按钮
会和 logo 抢位；顶栏右上角是营销站 `Navbar` 的既有位置，用户已形成的预期不会被打断。

顶栏没有标题：面包屑末级（`BreadcrumbPage`，带 `aria-current="page"`）就是当前页名，
再放一个 `<h1>` 会让同一个词在屏幕与无障碍树里各出现一次。

### 5.2 `SettingsLayout` 改动

只做组装，不新增自建折叠/抽屉逻辑——继续用 shadcn `sidebar` 的 Base UI 版：

- `SidebarHeader`：**只有 logo**。用 `websiteConfig.metadata.images.logoLight`，`Link` 到
  首页，`aria-label` 为站点名；沿用 `Navbar` / `DocsLayout` 的 `dark:bg-white` 处理与
  `width` / `height` 属性。主题切换不放这里（见 5.1 的理由）。
- `SidebarFooter`：用户卡片，见 5.3。

折叠成 icon（`collapsible="icon"`）时：logo 缩为图标位居中，用户卡片退化为头像
trigger + tooltip。用 `group-data-[collapsible=icon]:*` 变体处理，与 sidebar 内部
菜单项同一手法（`SidebarMenuButton` 已经这么做）。

#### 顶栏：折叠按钮 + 面包屑

`SidebarInset` 的 `header` 改为两样东西，**不再有 `<h1>` 与「返回站点」链接**：

| 元素 | 组件 | 说明 |
|---|---|---|
| 折叠按钮 | `SidebarTrigger` | 现有件，`toggleSidebar()` + `collapsible="icon"`；点击收起侧栏为图标窄条，再点展开。**宽窄屏都常驻**——窄屏下侧栏以 `Sheet` 抽屉覆盖，同样需要它打开 |
| 面包屑 | `Breadcrumb` 组合件 | 见下 |
| 主题切换 | `ThemeToggle` | 右上角，`ml-auto` 推至右端；`websiteConfig.ui.enableThemeSwitch` 为 false 时组件自身返回 null，无需外层判断，布局自动回收 |

「返回站点」撤掉：侧栏头部的 logo 已是回站点入口，两个语义重复的出口会让用户不确定
点哪个。窄屏下 logo 与折叠按钮同屏可见，不存在没有出口的情况。

撤掉后 `settings_back_home` 消息键失去唯一消费者。删消息键是行为变更（两个 locale 文件
都要删，且要跑 `pnpm locale:sort`），因此**默认保留该键**——与 `crumb_*` 一样作为预留键，
不因一次 UI 调整删产物。若用户明确要求删，则删 `messages/zh.json` 与 `messages/en.json`
各一行并重新编译 locale。

面包屑三级，用 shadcn 的 `Breadcrumb` / `BreadcrumbList` / `BreadcrumbItem` /
`BreadcrumbLink` / `BreadcrumbPage` / `BreadcrumbSeparator` 组装（该组件已随
`components.json` 的 base-nova 风格装入 `src/components/ui/`，全仓尚无消费者，本处是
第一次使用，不手写等价物）：

```
首页 › 个人中心 › 资料
```

| 层级 | 渲染 | 目标 |
|---|---|---|
| 首页 | `BreadcrumbLink` + `Link` | `/{locale}`，文案 `m.crumb_home()` |
| 个人中心 | `BreadcrumbLink` + `Link` | `/{locale}/settings/profile`，文案 `m.settings_title()` |
| 当前板块 | `BreadcrumbPage` | 无链接，文案取 `getSettingsSectionMeta(section).title` |

`crumb_home` 与 `settings_title` 两个消息键均已存在（前者编译进 Paraglide 但全仓无
消费者，正可用于此），因此本次不新增消息键。

当前板块的 id 从路由 pathname 取（`SettingsLayout` 已经在用
`useRouterState({ select: (state) => state.location.pathname })` 做高亮），不新增 props
或 context：以 `/settings/` 之后的一段作为 section，匹配 `SettingsSection` 联合类型的
四个值之一。匹配不到时（如未来的新板块尚未在工厂注册）退化为只渲染前两级，不渲染
末级——比渲染一个空 `BreadcrumbPage` 更诚实。

`Header` 结构：

```tsx
<header className="flex h-14 items-center gap-2 border-b border-border px-4">
  <SidebarTrigger />
  <Breadcrumb>
    <BreadcrumbList>…</BreadcrumbList>
  </Breadcrumb>
  <div className="ml-auto">
    <ThemeToggle />
  </div>
</header>
```

`SidebarTrigger` 自带 `sr-only` 文案，无需另加 `aria-label`。

### 5.3 用户卡片

拆成一个独立组合件 `src/components/settings/SettingsUserCard.tsx`，不塞进
`SettingsLayout`——后者已接近 90 行，且卡片有独立的状态（菜单开合）与独立测试点。

组成：

- `Avatar`（shadcn 现成件）+ `AvatarImage`（有 `image` 时）+ `AvatarFallback`
  （首字母，取 `name` 首字符，无 name 时取 email 首字符；`uppercase`）。
- 名字：`session.user.name`，空则显示 email。
- 邮箱：`truncate`。
- 展开菜单用 Base UI `Menu`，与 `UserMenu` / `ThemeToggle` 同构：`Menu.Trigger`
  包 `SidebarMenuButton`（拿到现成的 hover / focus / active 态与 icon 折叠适配），
  `Menu.Portal` + `Positioner` + `Popup`。
- 菜单内两项：「个人中心」——其实这里就在个人中心内，**不放**；「退出登录」。
  参考图的用户卡片菜单就是登出，不为凑数放已在当前页的入口。

`SessionInfo` 增加 `image: string` 字段（`src/auth/session.ts` 与类型同步）。`users.image`
可为 `null`，故类型为 `string | null`，`Avatar` 侧按 falsy 走 fallback。

### 5.4 登出逻辑抽公共函数

`UserMenu` 与用户卡片都要登出，实现相同的三行（调 `signOut`、失败 `console.warn` 并
留原地、成功 `window.location.assign('/')`）。抽成 `src/auth/sign-out.ts`：

```ts
export async function signOutAndRedirect(): Promise<void>
```

放在客户端模块，`window` 只在回调内引用。两处组件改为调用它，语义不变。
`UserMenu` 现有测试的 mock 需从 mock `signOut` 改为覆盖新模块——这是本次唯一受影响的
既有测试。

### 5.5 测试

- **新增组件测试** `tests/components/settings-user-card.test.tsx`：有 image 渲染
  `AvatarImage`；无 image 渲染首字母 fallback；展开菜单出现「退出登录」；点击登出调用
  `signOutAndRedirect`；登出失败时不跳转只 `console.warn`（照 `user-menu.test.tsx`
  的现有写法）。
- **新增组件测试** `tests/components/settings-layout.test.tsx`：面包屑渲染三级且末级为
  `BreadcrumbPage`（`aria-current="page"`）；「首页」/「个人中心」是带正确 `href` 的
  链接；窄屏断点下的触发按钮存在（jsdom 不做断点，按既有做法只断言元素存在与类名，
  真实断点由 e2e 覆盖）；section 匹配不到时只渲染前两级。
- **更新** `tests/components/user-menu.test.tsx` 适配 `sign-out` 模块。
- **更新** `e2e/settings.spec.ts`：登出入口从首页导航栏的注释说明改为「个人中心底部
  用户卡片」；断言 logo、用户卡片、面包屑三级可见；新增一条：点击顶栏折叠按钮后
  sidebar 收起（`data-state="collapsed"`），再点击恢复。
- **新增/更新** `SessionInfo` 相关的单测（若存在）：补 `image` 字段。

SSR 注意：`SettingsLayout` 的 session 来自路由 context（`beforeLoad`），不是
`useSession()`，因此没有 `UserMenu` 那个「待定态渲染访客入口」的问题——守卫已经保证
未登录进不来。同理，面包屑的末级在 SSR 期即可确定（pathname 来自路由状态），没有
「先渲染空面包屑再补」的闪烁。

Breadcrumb 导航用的是 `m.*()` 求值文案，与侧栏菜单一致地在 render 期求值，随请求语言
变化；不放进 `src/config/settings.ts` 的工厂之外的地方复制一份文案。

### 5.6 验收

- `pnpm check`（locale 编译 + Biome + tsc + env + locale 校验）通过。
- `pnpm test` 与组件测试通过。
- 手动确认：折叠与展开两态下 logo、用户卡片、登出都可用；深浅色 logo 均清晰；
  窄屏下折叠按钮能拉出抽屉；面包屑两个链接都能正确跳转，末级不带链接。

## 6. 文档参考资料

### 6.1 位置与格式

每篇受影响文档的「下一步」小节之前插入「参考资料」小节，一行一条：
`- [名称](URL) —— 链接用途`。只列本篇涉及的第三方，且只列代码实际调用的文档页。

### 6.2 覆盖范围（9 篇 × zh/en = 18 个文件）

| 文档 | 列出的链接 |
|---|---|
| `getting-started` | Cloudflare Wrangler 配置、Cloudflare D1、Cloudflare KV get started、Cloudflare R2 Workers API、Cloudflare Workers Secrets、Drizzle <> Cloudflare D1 |
| `auth` | Better Auth 选项参考、Better Auth Google provider、TanStack Start 认证指南、Google OAuth Web Server |
| `auth-account` | Better Auth 选项参考、TanStack Start 认证指南 |
| `environment` | Better Auth 选项参考、Stripe API keys、Google OAuth Web Server、Cloudflare Workers Secrets、Cloudflare Wrangler 配置、Cloudflare D1、Cloudflare KV get started、Cloudflare R2 Workers API、Drizzle <> Cloudflare D1、飞书自定义机器人、Discord Webhooks、beehiiv Create API Key、Resend API、Cloudflare Turnstile |
| `payment` | Stripe API keys |
| `email` | Resend API、Cloudflare Email Service Workers API |
| `newsletter` | beehiiv Create API Key、Resend API |
| `notifications` | Discord Webhooks、飞书自定义机器人 |
| `analytics` | GA Measurement ID、Plausible tracking script、Umami collect data、Microsoft Clarity setup |

`email` 一篇的 Cloudflare provider 走 `send_email` binding（`wrangler.jsonc` 的
`EMAIL`），链接指向 Email Service 的 Workers API 页——那页说明 `send_email` 的声明与
`send()` 用法，正是本仓库调用的接口；不列 Email Routing（本仓库不经该服务收发信）。

`analytics` 一篇按 `src/lib/analytics/index.ts` 实际读取的四个字段选链接：
`VITE_GA_ID`、`VITE_PLAUSIBLE_DOMAIN`、`VITE_UMAMI_WEBSITE_ID` +
`VITE_UMAMI_SCRIPT_URL`、`VITE_CLARITY_PROJECT_ID`，指向各自「获取 ID / 脚本」页
而非产品首页。Turnstile 不属于 analytics 模块，其链接归 `environment` 一篇。

排除的 3 篇（`configuration` / `navigation` / `forms`）只涉及本仓源码约定与
TanStack / shadcn / Base UI 的用法，没有需要外部凭据的第三方服务。

### 6.3 语言

zh 与 en 的链接名称分别用对应语言表述（如「Better Auth 配置选项」/ "Better Auth
options"），URL 相同。飞书文档同时存在中英文页，en 版指英文页。

### 6.4 其他同步

- 受影响文档的 `updated` 字段改为 `2026-10-15`。
- `content/docs/auth-account.zh.md` 若在本次个人中心 UI 改动后描述失实（如侧边栏结构、
  用户卡片），一并校正——文档与代码同步是本设计的一部分。
- 不新增文档文件；`references` 不单独成篇（用户已选定末尾小节方案）。

## 7. 分步交付顺序

| 提交 | 内容 |
|---|---|
| 1 | `.env.example` 重建（结构变更，无行为变更） |
| 2 | 个人中心 UI（行为变更：新 card、session 带 image、登出抽公共函数） |
| 3 | 文档参考资料 + `auth-account` 描述校正 |

提交 2 内部再分：先抽 `src/auth/sign-out.ts` 并改 `UserMenu`（结构等价重构，测试同步），
再加用户卡片与 session 字段。两个提交都只含单一逻辑变更。

## 8. 不在本次范围

- 不改 `src/env/*.ts` 的 schema（含兼容字段的增删）。
- 不做头像上传功能（`image` 只读取与展示）。
- 不改 `DocsLayout` 的侧栏实现，不与 `SettingsLayout` 抽公共侧栏组件。
- 不动支付、订阅、通知的代码逻辑，只补链接。
- 不新增依赖。
