# 邮件 / 通知 / 密钥管理 / Admin 对齐 tanstarter 设计

日期：2026-10-16
状态：待评审（已过一轮 builder check，修正已并入；admin 部分已并入）
参考：https://docs.tanstarter.dev/zh/pages/（`/zh/email`、`/zh/notification`、`/zh/apikeys-management`、`/zh/user-management`）

## 意图

把仓库的「邮件 / 通知 / 密钥管理 / Admin 管理」四个可配置模块对齐 tanstarter 的结构与文档
深度，使其作为 SaaS 模板的通用能力可直接复用。其中 Admin 部分附带一次 `/settings/*` →
`/dashboard/*` 的路由重构，使个人中心与用户管理同处一个受保护外壳下。

## 现状盘点（探索结论）

| 模块 | 实现 | 文档 | 与 tanstarter 的差距 |
|---|---|---|---|
| 邮件 | 完整：ALS provider 注册表、`sendMail()` 3 次重试、4 个 React Email 模板、`render.ts` per-template Zod strict schema + `actionUrl` 主机白名单 | `content/docs/email.md` / `.zh.md` | 缺 `pnpm email:dev` 本地预览脚本 |
| 通知 | 完整：`discord` + `feishu` provider、`buildNotificationProviderRegistry(env)`、`notify()` 永不抛错 | `content/docs/notifications.md` / `.zh.md` | **`notification` 无 `provider` 字段**，provider 靠「哪个 webhook 配了」隐式决定 |
| 密钥管理 | **仅数据层占位**：`api_keys` 表（`src/db/schema.ts:117`），零消费者 | 无 | 缺全部：逻辑、UI、端点、文档 |
| Admin | **仅 schema 占位**：`users` 表已有 `role`/`banned`/`banReason`/`banExpires`；`features.enableAdmin` 零消费者；`robots.txt` 已预留 `/admin/` | 无 | 缺插件接入、`sessions.impersonatedBy` 列、`fetchSession` 的 role、UI、CLI、文档 |

### 探索中发现的既有缺陷

1. **通知 provider 选择失效**（真 bug）：`notify()` 的唯一调用点
   `src/contact/notifications.ts:41` 硬编码 `notify('discord', ...)`。`feishu` provider
   虽已注册、env 也已校验，但**永远选不到**。根因是配置模型缺 `provider` 字段。
2. **迁移账本不一致**：`src/db/migrations/meta/_journal.json` 只登记了 idx 0，
   `0001_orange_sue_storm.sql` 未登记。这是所有 schema 变更的前置阻塞项，详见 D7。
3. **`SessionInfo` 不含 `role`**：`src/auth/session.ts` 的 `fetchSession` 返回值无 role，
   `SettingsLayout.tsx:52` 也未传 role。admin 可见性门禁的前置改动。

## 目标

- **密钥管理**：用 `@better-auth/api-key` 插件实现，dashboard 新增「API 密钥」板块。
- **Admin**：接入 `better-auth` admin 插件，dashboard 新增「用户管理」板块
  （列表 / 搜索 / 分页 / 改角色 / 封禁解封 / 删除），配 CLI 提权脚本。
- **路由重构**：`/settings/*` → `/dashboard/*`，admin 落在 `/dashboard/admin/*`。
- **通知**：补显式 `provider` 配置，修掉 feishu 选不到的 bug。
- **邮件**：补 `email:dev` 预览脚本 + 文档。
- **文档**：`email` / `notifications` / `api-keys` / `user-management` 各一页。

## 非目标

- 不新增邮件 provider（SendGrid 无实际需求）。
- 不做 API key 的 permissions / rateLimit 的 UI 配置界面。
- **不做 impersonate（模拟登录）**——用户明确选择范围不含此项。`sessions.impersonatedBy`
  列仍要加（插件 schema 要求，且 `list-sessions` 响应过滤依赖它），但不暴露入口。
- 不新建「功能页面」总览页（`pages.md`）。
- 不改动 `features.enableFileUpload` / `enableAIGateway`。
- **不做 `/settings/*` → `/dashboard/*` 的重定向**（用户确认：直接移，旧路径 404）。
  已部署 demo 站上的 `/settings` 书签会失效，这是接受的代价。

## 反目标（即使技术可用也算失败）

- 为了对齐而引入 Node-only 依赖，破坏 Workers 运行时约束。
- 把 API key 的明文或哈希写进日志 / 客户端 bundle。
- 让密钥管理或 admin 绕过既有的模块门禁、会话校验与 role 判定。
- **把 `ADMIN_EMAILS` 当作「谁是管理员」的真相来源**——它是 `/api/email` 的收件人邮箱
  白名单，与 role 无关（详见 D8）。
- 在同一个提交里混合「结构整理」（路由重构、迁移账本修复）与「行为变更」（新功能）。

## 关键决策

### D1. 密钥管理用 Better Auth 插件（用户已确认）

装 `@better-auth/api-key`，走插件的 `apikey` 表，**弃用并删除**现有 `api_keys` 表。
理由：tanstarter 原方案；白送 `verifyApiKey` 校验、限流、过期、`permissions`；现有
`api_keys` 表零消费者、无写入路径，生产库该表为空，删除安全。

### D2. 依赖 bump：better-auth `1.7.7` → `1.7.10`

`@better-auth/api-key@1.7.10` 的 peer 要求 `better-auth ^1.7.10`，
`@better-auth/drizzle-adapter@1.7.10` 的 peer 要求 `@better-auth/core ^1.7.10`。
三者必须同步升到 `1.7.10`（patch 级，无 breaking）。

**机制（实测修正）**：保留 `^1.7.7` 时 pnpm 解析出 `better-auth@1.7.9`，
`pnpm peers check` 报 unmet peer。显式写 `1.7.10` 后通过。

**连带文件**：`pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 会被 pnpm **自动追加**
约 9 条 `@better-auth/*@1.7.10` 与 `better-auth@1.7.10`。这些条目**应当提交**，但实现者
需知道会出现这个意料外的文件改动。

**admin 插件不需要新依赖**：`better-auth/plugins/admin` 是 in-tree 子路径（与
`@better-auth/api-key` 这个独立包不同）。

### D3. 通知补显式 `provider` 字段

```ts
notification: { enabled: boolean; provider: 'discord' | 'feishu' }
```

**默认值必须是 `'discord'`**——`tests/unit/contact.test.ts` 有 3 处硬断言
`toHaveBeenCalledWith('discord', ...)`（行 201/291/339）。`website.ts:99` 写为
`{ enabled: false, provider: 'discord' }`。

改动点（**不止一行**）：

- `src/contact/notifications.ts:41`：硬编码 `'discord'` → `websiteConfig.notification.provider`。
- `src/contact/notifications.ts:36`：`websiteConfig.notification?.enabled` 的 `?.` 冗余
  （`notification` 非可选），顺手去掉。
- `src/contact/notifications.ts:34`：注释「2. Discord 通知」随 provider 泛化。
- `src/config/service-status.ts`：notification 检查项由
  `!!(env.DISCORD_WEBHOOK_URL || env.FEISHU_WEBHOOK_URL)` 改为**按所选 provider 取对应
  webhook**，key 名改为单个变量名。否则「选 feishu 却只配了 discord」会误判 `configured`。

### D4. 密钥管理门禁：启用 `features.enableApiKeys`，默认 `true`（用户已确认）

**实现方式**：扩展现有门禁模型。

1. `MenuVisibility` 增加 `feature?: keyof WebsiteConfig['features']`。
   `filterMenuItems()` 新分支**必须**写成
   `if (rule.feature && !ctx.config.features[rule.feature]) continue`——
   **不能**复用 `rule.module` 分支的 `ctx.config[rule.module].enabled` 写法（`features`
   的值是裸 `boolean`，`SiteModule` 的值是 `{ enabled: boolean }`）。
2. `src/lib/module-access.ts` 增加 `assertFeatureEnabled(feature)`，抛 `notFound()`。
3. **API 侧也要拦**：`src/routes/api/auth/$.ts` 当前只做
   `getModuleUnavailableResponse('auth')`，**不认** `features.enableApiKeys`。在 GET/POST
   两个 handler 里、better-auth handler 之前，对 pathname 前缀 `/api/auth/api-key` 追加判定：
   flag 关闭 → `404 { error: 'MODULE_DISABLED' }`。否则 flag 关闭时 UI 隐藏、端点仍可用，
   违反反目标。
4. 页面 `beforeLoad` 调 `assertFeatureEnabled('enableApiKeys')`。

**连带改动（必须）**：

- `tests/unit/brand-config.test.ts:56`：`enableApiKeys: false` → `true`。
- `content/docs/configuration.md:106` 与 `.zh.md:106`（表格行）→ `true`。
- `content/docs/configuration.md:143` 与 `.zh.md:143`（完整示例代码块）→ `true`。
  **两处都要改**。

### D5. Admin：接入 admin 插件 + role 门禁 + CLI 提权（用户已确认）

#### D5.1 插件接入

```ts
// src/auth/auth.ts
import { admin } from 'better-auth/plugins/admin'
// plugins: [..., drizzleAdapter, apiKey({ defaultPrefix: 'key_' }), admin()]
```

- 默认 `defaultRole: 'user'`、`adminRoles: ['admin']`，与本仓 `users.role` 默认值一致，
  **无需传 options**。
- drizzleAdapter 的 schema 显式映射**新增**：`apikey: schema.apikey`、
  `user`/`session` 已登记但需确认含新列（见 D5.2）。
- **`sessions` 表补 `impersonatedBy`**（`text('impersonated_by')`，可空）。`users` 表的
  `role`/`banned`/`banReason`/`banExpires` **已存在**，无需改动。

#### D5.2 客户端

```ts
// src/auth/client.ts
import { createAuthClient } from 'better-auth/react'      // ← 保持现状，勿改成 better-auth/client
import { adminClient } from 'better-auth/client/plugins'  // ← 注意路径
export const authClient = createAuthClient({ ..., plugins: [apiKeyClient(), adminClient()] })
```

> **导入路径陷阱**：`better-auth/plugins/admin/client` **在 package exports 里不存在**。
> `adminClient` 必须从 `better-auth/client/plugins` 导入。
>
> **第二个陷阱**：本仓 `src/auth/client.ts:1` 用的是 **`better-auth/react`**（不是
> `better-auth/client`）。必须保持这个导入源——混用 `better-auth/react` 与
> `better-auth/client` 会产出**两个不兼容的 client 实例**，`useSession` 等 React hook
> 会失效。插件从 `better-auth/client/plugins` 导入是正确的（插件本身与框架无关），
> 但 `createAuthClient` 的来源不能动。

#### D5.3 `fetchSession` 补 role（前置改动）

`src/auth/session.ts` 的 `SessionInfo` 增加 `role: string`，`fetchSession` 返回值补
`role: session.user.role`。这是 role 门禁与菜单可见性的数据来源。

**连带测试改动（初稿漏列）**：`SessionInfo` 是**必填字段**，两个测试夹具构造了
`SessionInfo` 字面量，加字段会编译失败：

- `tests/components/settings-layout.test.tsx:77` 的 `sessionWith()`
- `tests/components/settings-user-card.test.tsx:78` 的 `sessionWith()`

两处都要补 `role`（后者已有 `overrides` 参数，可顺手加默认值）。

#### D5.4 门禁三层

1. **菜单可见性**：dashboard 导航的 admin 项加 `visibility: { roles: ['admin'] }`。
   `filterMenuItems` 的 `roles` 分支**已实现**（`navigation.ts:78`），**无需改**
   `filterMenuItems`（`filterMenuItems` 也会丢弃空 group，`navigation.ts:80`，故分组安全）。
   但调用方必须传 role——`DashboardLayout` 当前调 `getSettingsSections(locale,
   { config, authenticated: true })`（`SettingsLayout.tsx:62`）**未传 role**，
   需补 `role: session.user.role`。

   **分组结构会改变返回值形状**：`getSettingsSections` 现在返回**扁平数组**，
   `tests/unit/settings-config.test.ts:25/34` 断言 `.map(item => item.id)` 的扁平
   `toEqual([...])`。改成 group 结构后这两个断言与行 47-52 的 `destinations` 断言都要
   **重写为新形状**（group 内嵌套 items），不是简单「加一项」。实现时需先确定新形状
   （建议返回 `MenuItem[]` 含 `kind: 'group'`，与 `navigation.ts` 的 `MenuItem` 联合一致），
   再据此重写断言。
2. **页面门禁**：`/dashboard/admin/*` 的 `beforeLoad` 校验 `session.user.role` 属于
   admin 角色，非 admin 抛 `notFound()`（与 `assertPageEnabled` 同风格）。
   同时叠加 `assertFeatureEnabled('enableAdmin')`（见 D5.5）。
3. **API 门禁**：`/api/auth/admin/*` 走 `api/auth/$.ts` 的 splat 路由，该处只认 `auth` 模块。
   与 D4 第 3 条同理，对 pathname 前缀 `/api/auth/admin` 追加 `features.enableAdmin` 判定，
   关闭 → 404。**插件自身的 `adminMiddleware` 已强制有效会话 + `hasPermission` 逐端点鉴权**
   （见 D5.6），故 role 层面由插件负责，我们只需拦 flag。

#### D5.5 `features.enableAdmin`：默认 `true`（用户已确认）

语义为「这个部署是否带管理台」，默认 `true`，与 `enableApiKeys` 处理一致。
**真正的访问控制是 role**，flag 只决定是否注册/显示。

**连带改动**：`tests/unit/brand-config.test.ts:57`（`enableAdmin: false` → `true`）；
`content/docs/configuration.md` / `.zh.md` 的 `enableAdmin` 表格行 + 完整示例块两处。

#### D5.6 端点与能力（插件提供，不自己写）

插件在 `/api/auth/admin/*` 下暴露端点。**准确清单（实测）**：**12 个**端点挂
`adminMiddleware`（要求有效会话），另有一个 **`has-permission` 不挂**该中间件（见下）。

挂 `adminMiddleware` 的 12 个：

| 端点 | HTTP | 权限 |
|---|---|---|
| `list-users` | GET | `user: ["list"]` |
| `set-role` | POST | `user: ["set-role"]` |
| `ban-user` / `unban-user` | POST | `user: ["ban"]` |
| `remove-user` | POST | `user: ["delete"]` |
| `get-user` | GET | `user: ["get"]` |
| `update-user` | POST | `user: ["update"]`（改 role→`set-role`；改 banned→`ban`；改 email→`set-email`） |
| `list-user-sessions` / `revoke-user-session` / `revoke-user-sessions` | POST | `session: ["list"]` / `["revoke"]` |
| `set-user-password` | POST | `user: ["set-password"]` |
| `impersonate-user` | POST | （**本设计不使用**） |

> **`has-permission` 是例外**（`routes.mjs:862`）：**不挂 `adminMiddleware`**，其鉴权逻辑是
> `if (!session && (ctx.request || ctx.headers)) throw UNAUTHORIZED`——即**允许匿名携带
> `role` 或 `userId` 查询权限**。这是插件的设计（供客户端本地权限计算），但意味着
> D5.4 第 3 条「全部经 adminMiddleware」的表述**不准确**。本设计的 flag 门禁（对
> `/api/auth/admin` 前缀整体拦截）仍然覆盖它，故无实际暴露；但文档不得声称该端点需要会话。

`list-users` 查询参数（`listUsersQuerySchema`）：`searchValue` / `searchField`(`email`|`name`) /
`searchOperator` / `limit` / `offset` / `sortBy` / `sortDirection`(`asc`|`desc`) /
`filterField` / `filterValue` / `filterOperator`。返回 `{ users, total, limit, offset }`。
`ban-user` body：`{ userId, banReason?, banExpiresIn? }`（秒）。

**因此不新增任何 API 路由文件**，UI 直接调 `authClient.admin.*`。

#### D5.7 CLI 提权脚本（用户已确认，对齐 tanstarter）

新增 `scripts/set-admin.ts` + `package.json` 两个 script：

```json
"db:admin:local":  "tsx scripts/set-admin.ts --local",
"db:admin:remote": "tsx scripts/set-admin.ts --remote"
```

**实现约束（实测修正）**：

- **`scripts/lib/` 没有可复用的 D1 执行器**——该目录只有 `env-file.ts`（读 `.env`）与
  `report-issues.ts`（Zod 诊断）。**真正的范式在 `scripts/setup.ts`**：用
  `node:child_process` 的 `execSync` 直接 shell out 到 `wrangler`（如
  `run('wrangler d1 migrations apply DB --local')`，行 195 附近），另有
  `scripts/check-core-changed.ts` 用 `execFileSync`。实现时**跟随 `setup.ts` 的风格**，
  不要去找 `scripts/lib/` 里的执行器（不存在）。
- **`tsx` 不能直接执行 D1 SQL**——必须 shell out 到 `wrangler`（devDep `^4.149.0`）。
  `--local` → `wrangler d1 execute DB --local --command "UPDATE users SET role='admin' WHERE email='...'"`；
  `--remote` → 同命令加 `--remote`。
- **`--remote` 需要 wrangler 登录 / `CLOUDFLARE_API_TOKEN`**，且输出为 JSON 需解析。
  脚本应做前置检查并给可操作的提示（照 `setup.ts` 的软警告风格）。
- **可测试性**：`scripts/` 下**无 `@/*` 别名解析**，既有脚本测试不 import `src/`。
  因此 `set-admin.ts` **必须避免 `@/` 导入**（把「邮箱 → SQL 语句」的纯逻辑单独导出，
  不依赖 `src/`），否则无法像 `tests/unit/setup.test.ts` 那样测。
- **必须显式选择本地/远程**（对齐 tanstarter），不做默认；缺参数时报错退出。
- **SQL 注入**：邮箱来自命令行，拼接进 SQL 前必须做**转义或参数化**（`wrangler d1 execute`
  支持 `--command` 的字符串，需自行转义单引号；更稳妥是校验邮箱格式 + 转义）。

> 这是本设计**需要用户确认新建文件**的部分（`scripts/set-admin.ts` 与其测试）。

### D6. 路由重构：`/settings/*` → `/dashboard/*`（用户已确认）

**URL 布局**：

```
/{-$locale}/_layout/dashboard.tsx              # 受保护外壳（原 settings.tsx 的守卫）
/{-$locale}/_layout/dashboard/index.tsx        # → redirect 到 dashboard/profile
/{-$locale}/_layout/dashboard/profile.tsx
/{-$locale}/_layout/dashboard/security.tsx
/{-$locale}/_layout/dashboard/sessions.tsx
/{-$locale}/_layout/dashboard/notifications.tsx
/{-$locale}/_layout/dashboard/api-keys.tsx     # 新（D4）
/{-$locale}/_layout/dashboard/admin/users.tsx  # 新（D5）
```

> **高亮判定的实现（本设计的选择，非用户确认）**：保留 `/dashboard/admin/users.tsx`
> 这个嵌套路径（未来可扩展更多 admin 子页），高亮判定**不用** `endsWith`，改为比较
> 「`/dashboard/` 之后的第一段」与 item 的 `id`：`'admin'` 项在 `/dashboard/admin/users`
> 下即可正确点亮。即把 `SettingsLayout.tsx:103` 的 `pathname.endsWith(...)` 换成与
> `:69` 同源的段比较。这样 `id` 与路由段第一段一致，嵌套子路径不影响高亮。

- 旧 `/settings/*` **直接删除，不加重定向**（用户确认）。旧路径 404。
- 外壳组件 `SettingsLayout.tsx` → 重命名为 `DashboardLayout.tsx`，侧栏**分两组**：
  「个人」（资料 / 安全 / 登录设备 / 通知偏好 / API 密钥）与
  「管理」（用户管理，`roles: ['admin']` 门禁）。导航工厂相应重构
  （可改名 `getDashboardSections`，返回 group 结构）。
- `SettingsSection` 联合扩展为 `'profile' | 'security' | 'sessions' | 'notifications' |
  'api-keys' | 'admin'`（**kebab，与路由段一致**）。
- `SettingsUserCard.tsx` 保留（改名可选），仍挂在侧栏底部。

**改动清单（必须逐项处理）**：

| 文件 | 改动 |
|---|---|
| `src/components/settings/SettingsLayout.tsx` | 改名 `DashboardLayout.tsx`；**行 69** `pathname.split('/settings/')[1]?.split('/')[0]` → `split('/dashboard/')`；**行 103** `pathname.endsWith('/settings/${item.id}')` → `'/dashboard/${item.id}'`；**行 144** 硬编码链接改 `/dashboard/profile`；**行 62** 调 `getSettingsSections` 时补 `role` |
| `src/config/settings.ts` | 4 处 `linkOptions({ to: '/{-$locale}/settings/*' })`（行 32/42/52/63）→ `/dashboard/*`；新增 `api-keys`、`admin` 两项；admin 项加 `roles: ['admin']`；改为返回 group 结构 |
| `src/config/navigation.ts` | 行 60 注释里的 `/settings/*` 示例更新 |
| `src/components/layout/UserMenu.tsx:52` | `to="/{-$locale}/settings/profile"` → `/dashboard/profile` |
| 4 个路由文件 | `createFileRoute` 路径与 `seo('/settings/x')` 参数改 `/dashboard/x`（`profile`/`security`/`sessions`/`notifications` 各 1 处 `seo`） |
| `src/routes/{-$locale}/_layout/settings.tsx` | 移动到 `dashboard.tsx`，`createFileRoute` 路径改 |
| `src/routeTree.gen.ts` | **随重构提交一起提交重新生成的产物**（该文件 git-tracked，由 `tanstackStart()` vite 插件生成，AGENT.md 禁手改）。若不提交，构建会引用已删除的路由文件 |
| `e2e/settings.spec.ts` | 8 处路径（行 35/42/43/48/59/80/102/108）+ 行 43 的正则 `/\/zh\/settings\/profile/` → `/zh/dashboard/*`；测试名与注释同步 |
| `tests/unit/settings-config.test.ts` | 行 48-52 的 `objectContaining({ to: ... })` 路径改 `/dashboard/*`；行 25/34 的扁平 `toEqual` 按 group 新形状重写 |
| `tests/components/settings-layout.test.tsx` | 导入路径、`pathname` mock（行 19/54/108/117/125）改 `/dashboard/*`；行 77 夹具补 `role` |
| `tests/components/settings-user-card.test.tsx` | 行 78 夹具补 `role` |
| `CONTEXT.md:46` | 「受保护路由」条目里的 `src/routes/{-$locale}/_layout/settings.tsx` → `dashboard.tsx` |
| `CONTEXT.md:77` | `个人中心（/{locale}/settings/*…）` → `/dashboard/*`；同段列出的板块补 API 密钥与用户管理 |
| `CONTEXT.md:80-81` | 「**尚未实现**」清单里的「管理后台、…、API 密钥」**必须删除**（本设计落地后它们已实现），并更新「账户工作台仅完成资料 / 安全 / 设备 / 通知四块」的表述 |
| `content/docs/auth.md` / `.zh.md` / `auth-account.md` / `.zh.md` | 所有 `/{locale}/settings/*` 引用、目录树、`src/components/settings/SettingsLayout.tsx` 路径说明 |
| `src/lib/seo.ts` | **不改**——`seo(path)` 接收「不含 locale 的路径」，只需调用处传新路径 |
| `src/routes/robots[.]txt.ts` | **不改**——已 `Disallow: /dashboard/`（行 12），反而覆盖了原先未禁的 `/settings/`，是净改进 |

**静默失败点（重点）**：TanStack Router 的 `to` 是类型化的（`linkOptions`、
`UserMenu.tsx:52`、`createFileRoute` 路径都能编译期发现），但**字符串形式不能**：

- `SettingsLayout.tsx:69`（`split('/settings/')`）——**漏了不会报错，面包屑末级静默消失**。
  这是最危险的一处。
- `SettingsLayout.tsx:103`（`endsWith`）——侧栏高亮静默失效。
- 4 个 `seo('/settings/x')`——canonical/og:url 静默错误（影响 SEO，不影响渲染）。
- 全部 e2e `goto`——只在 e2e 运行时报错。

**admin 高亮的坑**：行 103 若照旧改成 `endsWith('/dashboard/${item.id}')`，当 admin 项的
`item.id` 是 `'admin'` 而真实路径是 `/dashboard/admin/users` 时，
`endsWith('/dashboard/admin')` 为 **false → admin 项永不点亮**。
**解决**（见上文 URL 布局处的实现选择）：高亮判定改为「`/dashboard/` 之后第一段」与
`item.id` 比较，与 `:69` 同源。**必须在重构提交里验证高亮生效**（组件测试或 e2e）。

**提交拆分**（结构 vs 行为）：路由重构**单独一个提交**，且**早于**新功能提交。

### D7. 迁移账本修复（实测修正，最需要谨慎的一步）

**实测的故障机制**（drizzle-kit 0.31.11）：

- `prepareOutFolder` 取 meta 目录里**字典序最大的 snapshot** 作为「上一个迁移」，
  **与 journal 无关**：`readdirSync(meta).filter(it => !it.startsWith('_')).sort()` 后取末位。
- journal **仅**用于算新文件 idx：`lastEntryInJournal.idx + 1`。
- 漏登记 0001 的后果：新迁移拿到 **idx 1**，产出 `0001_<random>.sql` 与既有
  `0001_orange_sue_storm.sql` **撞号**，并**覆盖写入 `meta/0001_snapshot.json`**。
- `wrangler d1 migrations apply` **只 glob `*.sql` 并按路径字典序**应用，**不读 journal**。
  两个 `0001_*.sql` 会**都被应用**，随后 `0001_orange_sue_storm.sql` 的
  `CREATE UNIQUE INDEX ... ON api_keys(...)` 在「api_keys 已 drop」的库上**报错中断**。

**完整修法（三步，缺一不可）**：

1. **前置检查**：`git status src/db/migrations/` 确认 `meta/0001_snapshot.json` 未被改动
   （若被覆盖需先 `git checkout` 还原）。
2. **补登记 journal**：`_journal.json` 的 `entries` 追加 idx 1
   （`tag: '0001_orange_sue_storm'`，其余字段与既有条目同构）。
3. **验证**：在**无 schema 变更**状态下跑 `pnpm db:generate`，必须输出
   `No schema changes, nothing to migrate`。

**额外操作风险**：两个 drizzle config 都设了 `strict: true`。drop `api_keys` + add `apikey`
会触发表改名歧义检测，在**非 TTY 环境（CI / 脚本）直接报错退出**。必须在交互终端回答
rename prompt，或先手工写迁移 SQL 再用 `--name`。**`pnpm db:generate` 不能在非交互终端跑。**

**本设计的 schema 变更合并为一次迁移**（`0002_*`）：drop `api_keys` + 建 `apikey` +
`sessions` 加 `impersonated_by`。

**提交拆分**：

1. `fix(db)`: 补登记 journal（结构修复，无行为变化）
2. `refactor(routes)`: `/settings/*` → `/dashboard/*`（结构整理，无行为变化）
3. `feat(db)`: 迁移（行为变更）
4. 其余功能提交

### D8. `ADMIN_EMAILS` 保持不动（明确不做统一）

**结论：本设计不改 `ADMIN_EMAILS`，也不把它当作提权入口。**

探索澄清了此前的误解：`ADMIN_EMAILS`（`src/env/server.ts:42`）唯一运行时消费点是
`src/routes/api/email/$.ts:65-76`，它是 **`/api/email` 的收件人邮箱白名单**——要求
`body.to`（收件人）与 `session.user.email`（调用者）**都**命中白名单。它与
「谁是管理员」是**两个不同的概念**，只是恰好共用了 admin 这个名字。

因此：

- **不改** `ADMIN_EMAILS` 的语义与消费点，不把它接到 role 上。
- 管理员身份的唯一真相来源是 **`users.role`**（admin 插件用 `adminRoles: ['admin']`）。
- 首个管理员经 **CLI 脚本**产生（D5.7），不经 `ADMIN_EMAILS` 自动提权。
- 文档里若同时提到两者，需明确区分（`ADMIN_EMAILS` = 发信收件人白名单；
  `role` = 管理员身份）。
- **文档需写明一个反直觉点**：`role: 'admin'` **不**自动获得 `/api/email` 的发信权限——
  该端点是**双重白名单**，要求收件人 `body.to` 与调用者 `session.user.email` **都**在
  `ADMIN_EMAILS` 里。也就是说，DB 里的 admin 若邮箱不在 `ADMIN_EMAILS`，仍会被 403。

> 这样「反目标」中「不把 `ADMIN_EMAILS` 当作管理员真相来源」就有对应的正向决策支撑。

## 实现要点

### 依赖

```
@better-auth/api-key          ^1.7.10   (新增)
better-auth                   1.7.10    (1.7.7 → 1.7.10)
@better-auth/drizzle-adapter  1.7.10    (同步)
```

### schema（`src/db/schema.ts`）

- **删除** `apiKeys` 表（`api_keys`）。
- **新增** `apikey` 表，以插件 `apiKeySchema` 为唯一依据
  （**缺任一列运行时 `checkMissingFields` 会 500**）。列清单（**已解包
  `@better-auth/api-key@1.7.10` 的 tarball 核对**，但该包尚未安装，实现时**应再以
  `apiKeySchema` 复核一遍**）：

  `configId, name, start, referenceId, prefix, key, enabled, refillInterval,
  refillAmount, lastRefillAt, rateLimitEnabled, rateLimitTimeWindow, rateLimitMax,
  requestCount, remaining, lastRequest, expiresAt, createdAt, updatedAt, permissions,
  metadata, id`

  类型要点：

  - **`key` 是普通索引，不是唯一索引**——已核对：`apiKeySchema` 中 `index: true` 仅出现
    3 次（`configId` / `referenceId` / `key`），**无任何 `unique`**（文件里唯一的
    `unique` 字样在 `configId` 的报错文案里，非索引声明）。`key` 的注释是
    **「The hashed key value」**，即插件存的是哈希，校验时按哈希查找。
  - 时间列（`integer(..., { mode: 'timestamp' })`）：`lastRequest`、`expiresAt`、
    `createdAt`、`updatedAt`、**`lastRefillAt`**。
  - **`createdAt` / `updatedAt` 必须 `notNull()`**（插件显式传 `new Date()`），
    **不要**再加 `.default(sql`(unixepoch())`)`（冗余）。
  - 数值列（非 timestamp）：`rateLimitTimeWindow`、`rateLimitMax`、`requestCount`、
    `remaining`、`refillInterval`、`refillAmount`。
  - **`configId` 有 `defaultValue: 'default'`**（插件 schema 声明）——drizzle 侧应给
    `.default('default')`，否则单配置场景下 insert 缺省值会与插件行为不一致。
  - `referenceId` 指向 **user id**（插件默认 `references: 'user'`）。
- **`sessions` 表新增** `impersonatedBy`（`text('impersonated_by')`，可空）。
- **`users` 表不动**（`role`/`banned`/`banReason`/`banExpires` 已具备）。

### auth（`src/auth/auth.ts`）

```ts
import { apiKey } from '@better-auth/api-key'
import { admin } from 'better-auth/plugins/admin'
// plugins: [..., drizzleAdapter(db, { provider: 'sqlite', schema: {
//   user, session, account, verification, apikey: schema.apikey } }),
//   apiKey({ defaultPrefix: 'key_' }), admin()]
```

### 设置页板块（重构后）

- `src/config/settings.ts`：`SettingsSection` 增加 `'api-keys'` 与 `'admin'`；
  导航工厂返回分组结构；admin 项 `visibility: { roles: ['admin'] }`；
  `getSettingsSectionMeta()` 增加两个 case。
- `src/routes/{-$locale}/_layout/dashboard/api-keys.tsx`（照 `sessions.tsx` 模板：
  `head()` + `seo()` + `robots: noindex`、三态渲染、`<Card>` + `<Table>`）：
  - 创建：`Dialog`（名称输入）→ 提交 → **一次性全值展示**（+ 复制按钮 + 警示文案）。
  - 列表：名称 / 掩码 key（`prefix + ••••••`）/ 创建时间 / 过期时间（无则「永不过期」）。
  - 删除：行内按钮 → `AlertDialog` 确认。
  - 空态：`<p className="text-sm text-muted-foreground">`（仓库无 `Empty` 组件）。
- `src/routes/{-$locale}/_layout/dashboard/admin/users.tsx`：
  - `beforeLoad`：role 校验 + `assertFeatureEnabled('enableAdmin')`。
  - 用户列表：`<Table>`，列 邮箱 / 姓名 / 角色 / 状态（`Badge`）/ 创建时间。
  - 搜索：`input`（搜索框）→ `list-users` 的 `searchValue` + `searchField`。
  - 分页：`limit` / `offset`（**仓库无 `pagination` 组件**，用「上一页 / 下一页」按钮 + 页码
    文本，或引入 shadcn `pagination`）。
  - 改角色：**仓库无 `select` 组件**——用 `Dialog` + 角色按钮组，或引入 shadcn `select`。
  - 封禁：`Dialog`（原因 `input` + 可选到期时间）→ `authClient.admin.banUser`。
  - 解封：行内按钮 → `authClient.admin.unbanUser`。
  - 删除：行内按钮 → `AlertDialog`（照 `security.tsx:206-257` 的 `DeleteAccountCard` 写法）。
  - **不使用 dropdown-menu**（未安装）：行内操作按钮直接列出。

### UI 组件缺口

**缺失**：`select`、`dropdown-menu`、`checkbox`、`pagination`、`textarea`。
按仓库硬规则，**优先用 CLI 装 shadcn 组件**而非手写：
`pnpm dlx shadcn@latest add select pagination`（若确认需要）。`textarea` 若仅用于
ban reason，可先用 `input` 替代以减少依赖。**装组件属新增文件，需用户确认。**

### 邮件预览脚本

```json
"email:dev": "email dev --dir src/mail/templates --port 3001"
```

- `react-email@6.11.1` 已装，bin 为 `email`。
- **必须加 `--port 3001`**：默认 3000 与 `pnpm dev` 冲突。
- **待实现时验证**：模板 import 了 `@/config/locale` 等 `@/*` 别名，react-email CLI 用
  `tsconfig-paths` 解析，**能否解析本仓别名需实测**；不能则改相对路径或加局部 tsconfig。

### 消息键（`messages/{zh,en}.json`）

新增两组，命名 `settings_api_keys_*` 与 `admin_users_*`，约 40 条。要点：

- 侧栏：`settings_nav_api_keys`、`admin_nav_users`（或统一 `dashboard_nav_*`）。
- admin：列表表头、搜索占位、分页、角色名、状态名、封禁/解封/删除的标题与确认文案、
  错误提示。
- 两个 locale 文件必须同时存在，改完跑 `pnpm locale:sort` + `pnpm locale:check`。

### 文档

| 文件 | 动作 |
|---|---|
| `content/docs/api-keys.md` / `.zh.md` | **新增**，`group: features`，**`order: 18`**（全局递增，当前最大 `cache.zh.md`=17；取 13 会与 `forms` 撞号） |
| `content/docs/user-management.md` / `.zh.md` | **新增**，`order: 19`。内容：admin 角色、CLI 提权（`db:admin:local/remote`）、管理台位置与能力、封禁语义、`adminClient` 用法 |
| `src/components/docs/doc-icons.ts` | 给 `api-keys`、`user-management` 加 `DOC_ICON` 映射 |
| `content/docs/notifications.md` / `.zh.md` | 更新：`provider` 配置 + 修正代码示例 |
| `content/docs/email.md` / `.zh.md` | 更新：新增「本地预览」小节（端口 3001） |
| `content/docs/configuration.md` / `.zh.md` | 更新：`notification.provider` 行；`features.enableApiKeys` 与 `enableAdmin` 的**表格行 + 完整示例块各两处** |
| `content/docs/database.zh.md` | 更新：表清单 `api_keys` → `apikey`；`sessions` 加 `impersonated_by` |
| `content/docs/auth.md` / `.zh.md` / `auth-account.md` / `.zh.md` | 更新：`/settings/*` → `/dashboard/*`、目录树、`SettingsLayout.tsx` → `DashboardLayout.tsx` |
| `content/docs/integrations.md` / `.zh.md` | 补：`/api/auth/api-key/*` 与 `/api/auth/admin/*` 的 flag 门禁 |

文档规约：frontmatter 六字段固定；提示用 `> **注意事项**：` blockquote（**不用**
`:::note`）；文末固定 `## 参考资料` + `## 下一步`（相对链接 `./slug`）。

### 测试（TDD，先写失败测试）

**新增**：

- `tests/unit/api-keys-module.test.ts`：`features.enableApiKeys: false` 时
  `/api/auth/api-key/*` 返回 404。
- `tests/unit/admin-module.test.ts`：`features.enableAdmin: false` 时
  `/api/auth/admin/*` 返回 404；非 admin role 访问 admin 页面抛 notFound。
- `tests/unit/set-admin-script.test.ts`：CLI 脚本的「邮箱 → SQL」纯逻辑（**不 import
  `src/`**，因 `scripts/` 无 `@/*` 别名解析）。

**修改既有断言**（不改会红）：

- `tests/unit/brand-config.test.ts:56,57`：`enableApiKeys` / `enableAdmin` → `true`。
- `tests/unit/settings-config.test.ts:25/34/48-52`：`toEqual` 数组按 group 新形状**重写**
  （不只是加项）；`objectContaining({ to: ... })` 路径改 `/dashboard/*`。
- `tests/unit/service-status.test.ts:374-375`：notification key 名改为按 provider 的
  单变量名；行 387/400 的 `configured` 场景按 provider 重写。
- `tests/unit/contact.test.ts:201/291/339`：默认 provider `'discord'` 时**保持通过**
  （这是 D3 默认值必须是 discord 的原因）；补一条 feishu 场景。
- `tests/components/settings-layout.test.tsx`：导入路径与 `pathname` mock
  （行 19/54/108/117/125）改 `/dashboard/*`；**行 77 夹具补 `role`**。
- `tests/components/settings-user-card.test.tsx:78`：夹具补 `role`。
- `tests/unit/navigation.test.ts`：扩展已有的 role 门禁表驱动用例（行 270-287）覆盖
  admin 菜单项。
- `e2e/settings.spec.ts`：8 处路径 + 行 43 正则改 `/zh/dashboard/*`。

消息键配对由 `pnpm locale:check` 守。

## 风险

1. **路由重构面大**（D6）：涉及 10+ 文件、e2e、文档、`CONTEXT.md`。**必须先独立提交且
   全绿**，再动功能。三类**静默失败点**（`SettingsLayout.tsx:69` 的面包屑、
   `:103` 的侧栏高亮、`seo()` 的 canonical）不会在编译期暴露，需靠 e2e 与组件测试兜。
   `routeTree.gen.ts` 必须随重构提交一起重新生成并提交。
2. **admin 导航高亮**（D6）：`endsWith('/dashboard/${id}')` 与 `/dashboard/admin/users`
   路径不匹配会导致 admin 项永不点亮。实现时二选一（改判定为 `includes`，或把 admin 页
   做成单页 `/dashboard/admin.tsx`），并加测试验证。
3. **迁移账本修复**（D7）：三步修法必须完整执行；`strict: true` 的 rename prompt 需 TTY。
4. **生产库迁移**：`api_keys` → `apikey` 是 DROP + CREATE。生产库该表应为空，但
   `db:migrate:remote` 前应确认。
5. **peer 依赖**：三包必须同升 `1.7.10`，`pnpm-workspace.yaml` 会被自动追加豁免条目。
6. **`apikey` 表字段**：22 列清单已解包核对，但包未安装，实现时需以 `apiKeySchema` 复核。
7. **UI 组件缺口**：`select` / `pagination` 等缺失，需 CLI 装（新增文件）或用替代方案。
8. **`email:dev` 别名解析**：`@/*` 在 react-email CLI 下能否解析需实测。
9. **`adminClient` 导入路径**：必须 `better-auth/client/plugins`；且 `createAuthClient`
   必须保持 `better-auth/react`，不可混用。

## 待确认（供评审）

- 密钥前缀：**`key_`（本设计的选择，非用户确认）**——理由是对齐 tanstarter 示例。
- 新增文件清单（按用户全局规则需确认）：`scripts/set-admin.ts`、其测试、
  以及可能的 shadcn `select` / `pagination` 组件文件。
- 是否引入 shadcn `pagination` / `select`，还是用现有组件替代（`Dialog` + 按钮组）。
- admin 页做成单页 `/dashboard/admin.tsx`（高亮天然正确）还是
  `/dashboard/admin/users.tsx`（语义更清晰，但需额外处理高亮）。
