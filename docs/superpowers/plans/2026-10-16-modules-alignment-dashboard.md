# 邮件 / 通知 / 密钥管理 / Admin 对齐 tanstarter 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把邮件 / 通知 / 密钥管理 / Admin 四个可配置模块对齐 tanstarter 的结构与文档深度，含一次 `/settings/*` → `/dashboard/*` 的路由重构。

**Architecture:** 沿用本仓既有的「ALS provider 注册表 + 模块门禁 + 配置集中入口」模式。密钥管理与 Admin 走 Better Auth 插件（`@better-auth/api-key` + in-tree `admin`），UI 经 `authClient` 直连插件端点，不新增 API 路由文件。路由重构把个人中心提升到 `/dashboard/*`，Admin 落在 `/dashboard/admin/*`，共用一个受保护外壳。

**Tech Stack:** TanStack Start / Router、React 19、TypeScript strict、Drizzle ORM + D1、Better Auth 1.7.10（api-key + admin 插件）、Paraglide i18n、Vitest + Playwright、shadcn/ui（Base UI 基座）。

**Spec:** `docs/superpowers/specs/2026-10-16-modules-alignment-dashboard-design.md`

## Global Constraints

- **语言**：所有文档、注释用中文；技术名词 / 命令 / 标识符保留英文原文。中文与半角英数字之间加一个半角空格，标点用全角。
- **env 两层模型**：业务代码不得直接读 `process.env` / `import.meta.env`，一律经 `src/env/public.ts`、`src/env/server.ts`。
- **消息键配对**：新增消息键必须在 `messages/zh.json` 与 `messages/en.json` **同时**存在；改完跑 `pnpm locale:sort` 再跑 `pnpm locale:check`。
- **不手改生成物**：`src/routeTree.gen.ts`、`src/locale/paraglide/**`、`.content-collections/generated/**` 不得手工编辑。`routeTree.gen.ts` 由 vite 插件生成，但**需随改动提交**。
- **`src/components/ui/` 只放上游原件**，一律不本地修改；需要调整外观时在调用处传 `className`。
- **UI 组件硬规则**：先用 shadcn / Base UI 现成组件；破坏性操作确认用 `AlertDialog`（不用 `window.confirm`）；状态标记用 `Badge`。
- **表单**：统一用 TanStack Form + Zod `validators` + `Field` 组合件。
- **提交纪律**：仅当全部测试通过、Linter 零警告、代表单一逻辑工作单元时提交。提交消息末尾附 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。结构整理与行为修改**分开提交**。
- **提交前必跑**：`pnpm check`（locale 编译 + Biome + tsc + env + locale 校验）。
- **迁移命令**：`pnpm db:generate` 设了 `strict: true`，表改名歧义检测**在非 TTY 环境会报错退出**——必须在交互终端跑。
- **文档 frontmatter 六字段固定**：`title` / `description` / `locale` / `order` / `group` / `updated`。提示用 `> **注意事项**：` blockquote（**不用** `:::note`）。文末固定 `## 参考资料`（外链）+ `## 下一步`（相对链接 `./slug`，无扩展名）。
- **关键取值**：API key 前缀 `key_`；文档 `order`：api-keys = 18、user-management = 19；`group` = `features`；`features.enableApiKeys` 与 `features.enableAdmin` 默认 `true`；`notification.provider` 默认 `'discord'`；admin 页路径 `/dashboard/admin/users.tsx`。

## Review Focus

以下五类输入 / 失败模式，spec 隐含要求但不会由任何任务的主路径测试覆盖，最可能伤到真实使用者。每一条都在其归属任务的步骤里配了测试。

1. **迁移落在 `api_keys` 非空的库上**——spec 假定生产库该表为空。若不为空，`DROP TABLE` 会**静默丢数据**。期望：迁移前脚本或文档给出检查步骤，且 `DROP` 前后行为可预测。
2. **flag 关闭时已存在的 API key / admin 会话**——关掉 `enableApiKeys` 后，已签发的 key 仍应能（或明确不能）通过 `verifyApiKey`。期望：行为明确且在文档中写清，而非「UI 没了但 key 还能用」这种模糊态。
3. **无 locale 前缀访问 `/dashboard/profile`**——`{-$locale}` 是可选的。期望：不出现 404 或语言错乱，走默认语言（`zh`）。
4. **`db:generate` 在 CI / 非交互终端**——`strict: true` 下 rename prompt 会直接退出。期望：文档明确「只能在 TTY 跑」，避免有人写进 CI。
5. **`key_` 前缀与用户输入的名称 / 邮箱注入**——创建 key 时名称含特殊字符、CLI 提权脚本的邮箱拼接进 SQL。期望：转义或校验，不产生注入。

---

## Phase 0 — 结构性前置（必须先于所有行为变更）

### Task 1: 修复迁移账本（结构修复）

**Files:**
- Modify: `src/db/migrations/meta/_journal.json`

**Interfaces:**
- Consumes: 无
- Produces: 一个「journal 已登记 0001」的状态，使后续 `pnpm db:generate` 产出 `0002_*` 而非撞号 `0001_*`。

- [ ] **Step 1: 确认快照未被污染**

Run: `git status src/db/migrations/`
Expected: `meta/0001_snapshot.json` **未**出现在修改列表。若已修改，先 `git checkout -- src/db/migrations/meta/0001_snapshot.json` 还原。

- [ ] **Step 2: 在 journal 追加 idx 1**

编辑 `src/db/migrations/meta/_journal.json`，在 `entries` 数组追加一项，与既有 idx 0 条目同构：

```json
{
  "idx": 1,
  "version": "6",
  "when": 1791810350158,
  "tag": "0001_orange_sue_storm",
  "breakpoints": true
}
```

`version` 抄 idx 0 的 `"6"`；`when` 取一个**大于** idx 0 的毫秒时间戳（严格递增，否则 drizzle-kit 会警告）。

- [ ] **Step 3: 验证产出 idx 正确**

Run: `pnpm db:generate`
Expected: 输出 `No schema changes, nothing to migrate 😴`（当前 schema 与 0001 快照一致，无 diff）。
若输出生成文件，说明快照链仍有问题，**停下来排查**，不要继续。

- [ ] **Step 4: 提交**

```bash
git add src/db/migrations/meta/_journal.json
git commit -m "fix(db): 补登记 0001 迁移到 journal"
```

---

### Task 2: 路由重构 `/settings/*` → `/dashboard/*`（结构整理）

**Files:**
- Move: `src/routes/{-$locale}/_layout/settings.tsx` → `src/routes/{-$locale}/_layout/dashboard.tsx`
- Move: `src/routes/{-$locale}/_layout/settings/` 下 5 个文件 → `dashboard/`
- Rename: `src/components/settings/SettingsLayout.tsx` → `src/components/dashboard/DashboardLayout.tsx`
- Rename: `src/components/settings/SettingsUserCard.tsx` → `src/components/dashboard/DashboardUserCard.tsx`
- Modify: `src/config/settings.ts`、`src/config/navigation.ts:60`、`src/components/layout/UserMenu.tsx:52`、`src/routeTree.gen.ts`（重新生成）
- Modify: `tests/unit/settings-config.test.ts`、`tests/components/settings-layout.test.tsx`、`tests/components/settings-user-card.test.tsx`、`e2e/settings.spec.ts`
- Modify: `CONTEXT.md:46,77`、`content/docs/auth.md`、`auth.zh.md`、`auth-account.md`、`auth-account.zh.md`

**Interfaces:**
- Consumes: Task 1 完成（不直接依赖，但顺序在前）
- Produces: 受保护路由前缀 `/dashboard/*`；`getSettingsSections(locale, ctx)` 仍返回**扁平数组**（本任务不改形状，分组留到 Task 12）；高亮判定改为「`/dashboard/` 之后第一段」与 `item.id` 比较。

- [ ] **Step 1: 移动路由文件与外壳组件**

```bash
git mv "src/routes/{-\$locale}/_layout/settings.tsx" "src/routes/{-\$locale}/_layout/dashboard.tsx"
git mv "src/routes/{-\$locale}/_layout/settings" "src/routes/{-\$locale}/_layout/dashboard"
mkdir -p src/components/dashboard
git mv src/components/settings/SettingsLayout.tsx src/components/dashboard/DashboardLayout.tsx
git mv src/components/settings/SettingsUserCard.tsx src/components/dashboard/DashboardUserCard.tsx
rmdir src/components/settings 2>/dev/null || true
```

- [ ] **Step 2: 改所有路由路径与字符串**

逐个替换（**逐条核对，不要全局 sed**）：

- `dashboard.tsx`：`createFileRoute('/{-$locale}/_layout/settings')` → `'/{-$locale}/_layout/dashboard'`
- `dashboard/index.tsx`：`createFileRoute('/{-$locale}/_layout/settings/')` → `'.../dashboard/'`；`redirect({ to: '/{-$locale}/settings/profile' })` → `'/dashboard/profile'`
- `dashboard/profile.tsx` / `security.tsx` / `sessions.tsx` / `notifications.tsx`：`createFileRoute` 路径 + `seo('/settings/x')` → `seo('/dashboard/x')`
- `DashboardLayout.tsx:69`：`pathname.split('/settings/')` → `pathname.split('/dashboard/')`
- `DashboardLayout.tsx:103`：`pathname.endsWith('/settings/${item.id}')` → 改为「取 `/dashboard/` 后第一段与 `item.id` 比较」（见 Step 3）
- `DashboardLayout.tsx:144`：`to="/{-$locale}/settings/profile"` → `"/{-$locale}/dashboard/profile"`
- `src/config/settings.ts:32/42/52/63`：4 处 `linkOptions({ to: '/{-$locale}/settings/*' })` → `/dashboard/*`
- `src/config/navigation.ts:60`：注释里的 `/settings/*` 示例 → `/dashboard/*`
- `src/components/layout/UserMenu.tsx:52`：`to="/{-$locale}/settings/profile"` → `"/{-$locale}/dashboard/profile"`

- [ ] **Step 3: 高亮判定改为段比较**

在 `DashboardLayout.tsx` 中把当前板块的提取结果复用于高亮。`currentSection`（行 69）已是「`/dashboard/` 之后第一段」，行 103 的高亮判定改为：

```tsx
currentSection === item.id
```

即删除 `pathname.endsWith(...)` 写法。这样 `/dashboard/admin/users` 下的 `id: 'admin'` 项能正确点亮。

- [ ] **Step 4: 更新测试与文档引用**

- `tests/unit/settings-config.test.ts:48-52`：`objectContaining({ to: '/{-$locale}/settings/*' })` → `/dashboard/*`
- `tests/components/settings-layout.test.tsx`：导入路径改 `@/components/dashboard/DashboardLayout`；`pathname` mock（行 19/54/108/117/125）改 `/dashboard/*`；组件名 `SettingsLayout` → `DashboardLayout`
- `tests/components/settings-user-card.test.tsx`：导入路径与组件名同步
- `e2e/settings.spec.ts`：8 处 `/zh/settings/*` → `/zh/dashboard/*`（行 35/42/43/48/59/80/102/108），行 43 的正则 `/\/zh\/settings\/profile/` → `/\/zh\/dashboard\/profile/`
- `CONTEXT.md:46`：`_layout/settings.tsx` → `_layout/dashboard.tsx`
- `CONTEXT.md:77`：`个人中心（/{locale}/settings/*…）` → `/dashboard/*`
- `content/docs/auth.md:12`、`auth.zh.md:11`、`auth-account.md:10,16,19-24,27,85`、`auth-account.zh.md:10,15,18-23,26,78`：所有 `/{locale}/settings/*`、目录树、`SettingsLayout.tsx` 路径

- [ ] **Step 5: 重新生成路由树并验证**

```bash
pnpm dev   # 触发 vite 插件重新生成 routeTree.gen.ts，启动后 Ctrl-C
git diff --stat src/routeTree.gen.ts
```

Expected: `routeTree.gen.ts` 有 diff，且不含任何 `settings` 路由残留。

- [ ] **Step 6: 跑检查与测试**

Run: `pnpm check && pnpm test`
Expected: 全绿。**若出现编译错误指向 `/settings`**，说明有遗漏引用，回到 Step 2 补。

- [ ] **Step 7: 验证无 locale 前缀可访问（Review Focus 第 3 条）**

`pnpm dev` 后访问 `http://localhost:3000/dashboard/profile`（**不带** `/zh` 或 `/en`）。
Expected: 正常渲染并落到默认语言（`zh`），**不是** 404 或语言错乱。
若失败，检查 `{-$locale}` 可选段是否被 `_layout/dashboard.tsx` 的守卫破坏。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "refactor(routes): 个人中心 /settings/* 迁移到 /dashboard/*"
```

---

## Phase 1 — 两个小修复

### Task 3: 通知补显式 `provider` 配置

**Files:**
- Modify: `src/config/website.ts`（类型行 40、默认值行 99）
- Modify: `src/contact/notifications.ts:34,36,41`
- Modify: `src/config/service-status.ts`（notification 检查项）
- Test: `tests/unit/contact.test.ts`、`tests/unit/service-status.test.ts`、`tests/unit/brand-config.test.ts`（如需）
- Modify: `content/docs/notifications.md`、`notifications.zh.md`

**Interfaces:**
- Consumes: 无
- Produces: `WebsiteConfig['notification'] = { enabled: boolean; provider: 'discord' | 'feishu' }`，默认 `{ enabled: false, provider: 'discord' }`。

- [ ] **Step 1: 写失败测试**

在 `tests/unit/contact.test.ts` 补一条：`notification.provider = 'feishu'` 时，`deliverContactNotification` 调 `notify('feishu', ...)` 而非 `'discord'`。

在 `tests/unit/service-status.test.ts` 补一条：`notification.enabled = true` 且 `provider = 'feishu'`、只配了 `DISCORD_WEBHOOK_URL` 时，`state === 'incomplete'`。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test tests/unit/contact.test.ts tests/unit/service-status.test.ts`
Expected: FAIL（`provider` 字段不存在 / 仍硬编码 discord）

- [ ] **Step 3: 实现**

- `src/config/website.ts:40`：类型改 `notification: { enabled: boolean; provider: 'discord' | 'feishu' }`
- `src/config/website.ts:99`：默认值改 `notification: { enabled: false, provider: 'discord' }`
- `src/contact/notifications.ts:41`：`notify('discord', {...})` → `notify(websiteConfig.notification.provider, {...})`
- `src/contact/notifications.ts:36`：`websiteConfig.notification?.enabled` → `websiteConfig.notification.enabled`（去掉冗余 `?.`）
- `src/contact/notifications.ts:34`：注释「2. Discord 通知」→「2. Webhook 通知（按 notification.provider）」
- `src/config/service-status.ts`：notification 检查项改为按 provider 取对应 webhook，key 名为单个变量名：

```ts
const notificationWebhookKey =
  config.notification.provider === 'discord' ? 'DISCORD_WEBHOOK_URL' : 'FEISHU_WEBHOOK_URL'
check('notification', [
  [notificationWebhookKey, !!env[notificationWebhookKey], 'env'],
])
```

- [ ] **Step 4: 更新既有断言**

- `tests/unit/service-status.test.ts:374-375`：key 名从 `'DISCORD_WEBHOOK_URL / FEISHU_WEBHOOK_URL'` 改为单个变量名；行 387/400 的 `configured` 场景确保 provider 与所配 webhook 一致。
- `tests/unit/contact.test.ts:201/291/339`：默认 provider 为 `'discord'` 时**应保持通过**；确认未破坏。
- `tests/unit/brand-config.test.ts`：若断言了 `notification` 的完整形状，补 `provider`。

- [ ] **Step 5: 运行测试**

Run: `pnpm test tests/unit/contact.test.ts tests/unit/service-status.test.ts`
Expected: PASS

- [ ] **Step 6: 更新文档**

`content/docs/notifications.md` / `.zh.md`：配置示例改 `notification: { enabled: true, provider: 'discord' }`；补一句「provider 必须是已配置对应 webhook 的渠道，否则状态为 incomplete」。

- [ ] **Step 7: 提交**

```bash
git add src/config/website.ts src/contact/notifications.ts src/config/service-status.ts \
  tests/unit/contact.test.ts tests/unit/service-status.test.ts \
  content/docs/notifications.md content/docs/notifications.zh.md
git commit -m "fix(notification): 补显式 provider 配置，修复 feishu 渠道无法选中"
```

---

### Task 4: 邮件本地预览脚本

**Files:**
- Modify: `package.json`（scripts）
- Modify: `content/docs/email.md`、`email.zh.md`

**Interfaces:**
- Consumes: 无
- Produces: `pnpm email:dev` 启动 React Email 预览，端口 3001。

- [ ] **Step 1: 加脚本**

`package.json` 的 `scripts` 加：

```json
"email:dev": "email dev --dir src/mail/templates --port 3001"
```

- [ ] **Step 2: 验证别名解析**

Run: `pnpm email:dev`
Expected: 服务在 3001 启动，4 个模板（verify-email / forgot-password / welcome / contact-message）出现在列表。
**若报错找不到 `@/config/locale` 等别名**：说明 react-email CLI 无法解析本仓 `@/*`。此时在 `src/mail/` 下加一个仅含 `paths` 的局部 tsconfig，或把模板内的 `@/` 导入改为相对路径。**记录实际采用的方案。**

- [ ] **Step 3: 文档补「本地预览」小节**

`content/docs/email.md` / `.zh.md` 加一节：`pnpm email:dev`（端口 3001，与 `pnpm dev` 的 3000 区分）。

- [ ] **Step 4: 提交**

```bash
git add package.json content/docs/email.md content/docs/email.zh.md
git commit -m "chore(mail): 新增 email:dev 本地预览脚本"
```

---

## Phase 2 — 密钥管理

### Task 5: 依赖 bump 到 better-auth 1.7.10 + 装 api-key 插件

**Files:**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`（pnpm 自动追加）
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: 无
- Produces: `better-auth@1.7.10`、`@better-auth/drizzle-adapter@1.7.10`、`@better-auth/api-key@^1.7.10` 可用。

- [ ] **Step 1: 改 package.json 版本**

```json
"better-auth": "1.7.10",
"@better-auth/drizzle-adapter": "1.7.10",
"@better-auth/api-key": "^1.7.10"
```

`better-auth` 与 adapter 用**精确** `1.7.10`（caret 会让 pnpm 解析到 1.7.9，peer 冲突）。

- [ ] **Step 2: 安装**

Run: `pnpm install`

- [ ] **Step 3: 验证 peer 无冲突**

Run: `pnpm peers check`
Expected: **输出中不出现任何 `better-auth` / `@better-auth/*` 的 unmet peer**。
注意：本仓**已存在**一条与本次无关的 `unmet peer vitest` 警告（且该命令退出码为 0），
**不要**试图消除它，只需确认没有新增 better-auth 相关的 peer 问题。

- [ ] **Step 4: 检查 pnpm-workspace.yaml 的自动追加**

Run: `git diff pnpm-workspace.yaml`
Expected: pnpm 追加了若干 `@better-auth/*@1.7.10` 与 `better-auth@1.7.10` 到 `minimumReleaseAgeExclude`。**保留并提交**，核对格式与既有条目一致。

- [ ] **Step 5: 回归既有测试**

Run: `pnpm test`
Expected: 全绿（1.7.7 → 1.7.10 是 patch 级）。

- [ ] **Step 6: 提交**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "chore(deps): better-auth 升级至 1.7.10 并引入 @better-auth/api-key"
```

---

### Task 6: schema 迁移（drop api_keys + 建 apikey + sessions 加 impersonated_by）

**Files:**
- Modify: `src/db/schema.ts`（删 `apiKeys`，加 `apikey`，`sessions` 加列）
- Create: `src/db/migrations/0002_*.sql`（由 drizzle-kit 生成）
- Modify: `src/db/migrations/meta/_journal.json`、`meta/0002_snapshot.json`（生成）
- Modify: `content/docs/database.zh.md`

**Interfaces:**
- Consumes: Task 1（journal 已修）
- Produces: 表 `apikey`（22 列，索引在 `config_id` / `reference_id` / `key`）；`sessions.impersonated_by`。

- [ ] **Step 1: 改 schema**

删除 `apiKeys` 定义。新增 `apikey` 表（列以 `@better-auth/api-key` 的 `apiKeySchema` 为唯一依据；以下为已核对的清单，**实现时再打开
`node_modules/@better-auth/api-key/dist/index.mjs` 的 `apiKeySchema` 复核**）：

列（snake_case）：`id, config_id, name, start, reference_id, prefix, key, enabled,
refill_interval, refill_amount, last_refill_at, rate_limit_enabled,
rate_limit_time_window, rate_limit_max, request_count, remaining, last_request,
expires_at, created_at, updated_at, permissions, metadata`

类型要点：
- 时间列用 `integer(..., { mode: 'timestamp' })`：`last_refill_at`、`last_request`、`expires_at`、`created_at`、`updated_at`
- `created_at` / `updated_at` **`notNull()`**，**不加** `.default(sql`(unixepoch())`)`
- 数值列：`refill_interval`、`refill_amount`、`rate_limit_time_window`、`rate_limit_max`、`request_count`、`remaining`
- `config_id` 加 `.default('default')`
- 索引（普通，**非 unique**）：`config_id`、`reference_id`、`key`

`sessions` 表加 `impersonatedBy: text('impersonated_by')`（可空）。

- [ ] **Step 2: 生成迁移（交互终端）**

Run: `pnpm db:generate`
Expected: 产出 `0002_<random>.sql`，内容含 `DROP TABLE api_keys`、`CREATE TABLE apikey`、`ALTER TABLE sessions ADD COLUMN impersonated_by`。
**注意**：`strict: true` 会就 `api_keys` → `apikey` 的改名歧义弹 prompt（`is ... table created or renamed`）。选 **created**（不是 rename）。**此步必须在 TTY 跑，不能在 CI。**

- [ ] **Step 3: 人工核对生成的 SQL**

打开 `0002_*.sql`，确认：
- `DROP TABLE api_keys` 存在
- `CREATE TABLE apikey` 的列数 = 22
- 三个 `CREATE INDEX`（非 unique）
- `ALTER TABLE sessions ADD COLUMN impersonated_by text`

- [ ] **Step 4: 本地应用并验证**

```bash
pnpm db:migrate:local
pnpm exec wrangler d1 execute DB --local --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('apikey','api_keys');"
```
Expected: 只返回 `apikey`，无 `api_keys`。

- [ ] **Step 5: 生产库前置检查（写进文档，不在此步执行）**

在 `content/docs/database.zh.md` 记录：`db:migrate:remote` 前先跑

```bash
pnpm exec wrangler d1 execute DB --remote --command "SELECT COUNT(*) FROM api_keys;"
```

**若非 0，停止并备份**——`DROP TABLE` 会丢数据（Review Focus 第 1 条）。

- [ ] **Step 6: 更新数据库文档**

`content/docs/database.zh.md`：表清单 `api_keys` → `apikey`；`sessions` 补 `impersonated_by`；补上面 Step 5 的检查步骤。

- [ ] **Step 7: 提交**

```bash
git add src/db/schema.ts src/db/migrations content/docs/database.zh.md
git commit -m "feat(db): 用 apikey 表替换 api_keys，sessions 加 impersonated_by"
```

---

### Task 7: 注册 apiKey 插件与服务端 / 客户端接线

**Files:**
- Modify: `src/auth/auth.ts`（plugins + adapter schema map）
- Modify: `src/auth/client.ts`

**Interfaces:**
- Consumes: Task 6（`schema.apikey` 存在）
- Produces: `auth.api.*` 暴露 api-key 端点；`authClient.apiKey.*` 在客户端可用。

- [ ] **Step 1: 服务端挂插件**

`src/auth/auth.ts`：

```ts
import { apiKey } from '@better-auth/api-key'
// plugins 数组内：
//   drizzleAdapter(db, { provider: 'sqlite', schema: {
//     user, session, account, verification, apikey: schema.apikey } }),
//   apiKey({ defaultPrefix: 'key_' }),
```

`apikey: schema.apikey` **必须**显式登记（adapter 经 `config.schema[model]` 解析）。

- [ ] **Step 2: 客户端挂插件**

`src/auth/client.ts`（**保持 `better-auth/react` 导入源不变**）：

```ts
import { apiKeyClient } from '@better-auth/api-key/client'
// createAuthClient({ ..., plugins: [apiKeyClient()] })
```

- [ ] **Step 3: 验证端点已挂载**

Run: `pnpm dev`，登录后浏览器控制台：

```js
await fetch('/api/auth/api-key/list', { method: 'GET', credentials: 'include' })
```

Expected: 200（返回 `{ apiKeys: [...] }` 或空列表），**不是** 404。

- [ ] **Step 4: 回归测试**

Run: `pnpm test`
Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add src/auth/auth.ts src/auth/client.ts
git commit -m "feat(auth): 注册 apiKey 插件（服务端 + 客户端）"
```

---

### Task 8: `features.enableApiKeys` 门禁接线

**Files:**
- Modify: `src/config/navigation.ts`（`MenuVisibility` 加 `feature`）
- Modify: `src/lib/module-access.ts`（加 `assertFeatureEnabled`）
- Modify: `src/routes/api/auth/$.ts`（api-key 前缀判定）
- Test: `tests/unit/api-keys-module.test.ts`（新建）、`tests/unit/navigation.test.ts`（扩展）
- Modify: `content/docs/configuration.md`、`.zh.md`

**Interfaces:**
- Consumes: Task 2（`/dashboard` 外壳）
- Produces:
  - `MenuVisibility.feature?: keyof WebsiteConfig['features']`
  - `assertFeatureEnabled(feature: keyof WebsiteConfig['features'], config?: WebsiteConfig): void`

- [ ] **Step 1: 写失败测试**

`tests/unit/api-keys-module.test.ts`（新建）：`features.enableApiKeys: false` 时，对 `/api/auth/api-key/list` 的请求返回 `404 { error: 'MODULE_DISABLED' }`。

`tests/unit/navigation.test.ts`（扩展）：`visibility: { feature: 'enableApiKeys' }` 的菜单项在 flag 为 `false` 时被过滤、为 `true` 时保留。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test tests/unit/api-keys-module.test.ts tests/unit/navigation.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`src/config/navigation.ts`：`MenuVisibility` 加 `feature?: keyof WebsiteConfig['features']`；`filterMenuItems` 加分支：

```ts
if (rule?.feature && !ctx.config.features[rule.feature]) continue
```

（**不能**复用 `rule.module` 的 `ctx.config[rule.module].enabled` 写法。）

`src/lib/module-access.ts`：

```ts
export function assertFeatureEnabled(
  feature: keyof WebsiteConfig['features'],
  config: WebsiteConfig = websiteConfig,
) {
  if (!config.features[feature]) throw notFound()
}
```

`src/routes/api/auth/$.ts`：在 GET/POST 两个 handler 里、`getAuth(env).handler(request)` **之前**：

```ts
const path = new URL(request.url).pathname
if (path.startsWith('/api/auth/api-key') && !websiteConfig.features.enableApiKeys) {
  return Response.json({ error: 'MODULE_DISABLED' }, { status: 404 })
}
```

- [ ] **Step 4: 运行测试**

Run: `pnpm test tests/unit/api-keys-module.test.ts tests/unit/navigation.test.ts`
Expected: PASS

- [ ] **Step 5: 改默认值与文档**

- `src/config/website.ts:109`：`enableApiKeys: false` → `true`
- `tests/unit/brand-config.test.ts:56`：`enableApiKeys: false` → `true`
- `content/docs/configuration.md:106` 与 `.zh.md:106`（表格行）→ `true`
- `content/docs/configuration.md:143` 与 `.zh.md:143`（完整示例代码块）→ `true`

- [ ] **Step 6: 跑全量检查**

Run: `pnpm check && pnpm test`
Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add src/config/navigation.ts src/lib/module-access.ts "src/routes/api/auth/\$.ts" \
  src/config/website.ts tests/unit/api-keys-module.test.ts tests/unit/navigation.test.ts \
  tests/unit/brand-config.test.ts content/docs/configuration.md content/docs/configuration.zh.md
git commit -m "feat(apikeys): enableApiKeys 门禁接线（菜单 / 页面 / API）"
```

---

### Task 9: API 密钥设置页

**Files:**
- Create: `src/routes/{-$locale}/_layout/dashboard/api-keys.tsx`
- Modify: `src/config/settings.ts`（`SettingsSection` + 导航项 + meta）
- Modify: `messages/zh.json`、`messages/en.json`
- Test: `tests/unit/settings-config.test.ts`（补 api-keys 项）

**Interfaces:**
- Consumes: Task 7（`authClient.apiKey.*`）、Task 8（`assertFeatureEnabled`）
- Produces: `SettingsSection` 含 `'api-keys'`。

- [ ] **Step 1: 加消息键**

`messages/zh.json` 与 `messages/en.json` 同时加（约 20 条，前缀 `settings_api_keys_`）：
`settings_nav_api_keys`、`settings_api_keys_title`、`_description`、`_create`、
`_create_submit`、`_name_label`、`_name_placeholder`、`_created_title`、
`_created_warning`、`_copy`、`_copied`、`_table_name`、`_table_key`、`_table_created_at`、
`_table_expires_at`、`_table_actions`、`_never_expires`、`_empty`、`_delete`、
`_delete_confirm_title`、`_delete_confirm_description`、`_delete_confirm_action`

Run: `pnpm locale:sort && pnpm locale:check`
Expected: PASS（键配对）

- [ ] **Step 2: 写失败测试**

`tests/unit/settings-config.test.ts` 补：`getSettingsSections('en', ctx(config))` 的结果**包含** `id === 'api-keys'` 的项（当 `enableApiKeys: true`），且其 `visibility.feature === 'enableApiKeys'`。

- [ ] **Step 3: 运行确认失败**

Run: `pnpm test tests/unit/settings-config.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现页面与配置**

- `src/config/settings.ts`：`SettingsSection` 加 `'api-keys'`；`getSettingsSections` 加一项
  （`id: 'api-keys'`、`icon: IconKey`、`visibility: { feature: 'enableApiKeys' }`、
  `to: '/{-$locale}/dashboard/api-keys'`）；`getSettingsSectionMeta` 加 `case 'api-keys'`
- `src/routes/{-$locale}/_layout/dashboard/api-keys.tsx`：照 `sessions.tsx` 模板——
  `head()` 用 `seo('/dashboard/api-keys', {...})` + 追加 `{ name: 'robots', content: 'noindex' }`；
  `beforeLoad: () => assertFeatureEnabled('enableApiKeys')`；三态渲染（error `<p role="alert">` /
  `null` → `<Spinner />` / 空 → 提示文本 / 有数据 → `<Table>`）
  - 列表列：名称 / 掩码 key（`prefix + '••••••'`）/ 创建时间 / 过期时间（无则「永不过期」）
  - 创建：`Dialog`（`input` 名称）→ `authClient.apiKey.create({ name })` → 成功后在
    **第二个 `Dialog`** 里一次性展示全值 + 复制按钮 + `_created_warning` 文案
  - 删除：行内 `Button variant="outline" size="sm"` → `AlertDialog` 确认 →
    `authClient.apiKey.delete({ keyId })`
  - 数据源：`authClient.apiKey.list()`

**客户端接口契约（已核对 `@better-auth/api-key@1.7.10`）**：

- `authClient.apiKey.create({ name })` → 返回含**明文 `key`** 的对象（**仅此一次**），
  另有 `id`、`name`、`start`、`prefix`、`createdAt` 等
- `authClient.apiKey.list()` → `{ apiKeys: [...], total, limit, offset }`；列表项
  **不含明文 `key`**，含 `id`、`name`、`start`、`prefix`、`enabled`、`createdAt`、
  `expiresAt`、`lastRequest`
- `authClient.apiKey.delete({ keyId })` → `{ success: boolean }`
- 掩码显示用列表项的 `start`（插件返回的「前几位」字段），非 `prefix`；`prefix` 是
  配置级前缀（本设计为 `key_`）

- [ ] **Step 5: 运行测试**

Run: `pnpm test tests/unit/settings-config.test.ts`
Expected: PASS

- [ ] **Step 6: 手动验证（Review Focus 第 5 条）**

`pnpm dev` 登录后进 `/dashboard/api-keys`：
- 创建一个名称含特殊字符（如 `<script>`)的 key → 应正常创建且列表正确转义显示
- 创建 → 关闭一次性弹窗 → 刷新 → 列表仍显示掩码，**无法再看到全值**

- [ ] **Step 7: 提交**

```bash
git add "src/routes/{-\$locale}/_layout/dashboard/api-keys.tsx" src/config/settings.ts \
  messages/zh.json messages/en.json tests/unit/settings-config.test.ts
git commit -m "feat(apikeys): 个人中心新增 API 密钥管理页"
```

---

### Task 10: API 密钥文档

**Files:**
- Create: `content/docs/api-keys.md`、`content/docs/api-keys.zh.md`
- Modify: `src/components/docs/doc-icons.ts`

**Interfaces:**
- Consumes: Task 9（页面与端点已存在）
- Produces: `/docs/api-keys` 页面。

- [ ] **Step 1: 写文档**

两个文件 frontmatter：

```yaml
---
title: API 密钥
description: 用户自助创建与撤销 API 密钥
locale: zh
order: 18
group: features
updated: 2026-10-16
---
```

（en 版 `title: API Keys`、`locale: en`，其余同。）

正文：数据模型（`apikey` 表、`key` 存哈希、普通索引）、设置页位置
（`/dashboard/api-keys`）、`authClient.apiKey.*` 用法示例、服务端校验示例：

```ts
const result = await getAuth(env).api.verifyApiKey({ body: { key } })
if (!result.valid) return new Response('Unauthorized', { status: 401 })
```

注意事项 blockquote：`key_` 前缀；**关闭 `features.enableApiKeys` 后 `/api/auth/api-key/*`
端点返回 404**（即已签发的 key 也无法再通过插件端点管理）；明文只在创建时展示一次。
文末 `## 参考资料` + `## 下一步`。

> **必须写清 flag 关闭后已有 key 的行为**（Review Focus 第 2 条）：本设计选定的行为是
> **端点整体 404**——flag 关闭即管理能力关闭，已签发 key 的既有用途（若将来接业务路由）
> 由调用方自行决定。文档要明说，避免读者以为「UI 没了但 key 照常可用」。

- [ ] **Step 2: 加文档图标**

`src/components/docs/doc-icons.ts` 的 `DOC_ICON` 加 `'api-keys'` 条目。

- [ ] **Step 3: 验证文档渲染**

Run: `pnpm dev`，访问 `/zh/docs/api-keys`
Expected: 页面渲染，侧边栏 `features` 组内出现该项。

- [ ] **Step 4: 提交**

```bash
git add content/docs/api-keys.md content/docs/api-keys.zh.md src/components/docs/doc-icons.ts
git commit -m "docs(apikeys): 新增 API 密钥管理文档"
```

---

## Phase 3 — Admin

### Task 11: 注册 admin 插件 + `fetchSession` 补 role

**Files:**
- Modify: `src/auth/auth.ts`
- Modify: `src/auth/client.ts`
- Modify: `src/auth/session.ts`
- Modify: `tests/components/settings-layout.test.tsx:77`、`tests/components/settings-user-card.test.tsx:78`

**Interfaces:**
- Consumes: Task 6（`sessions.impersonated_by` 已加）
- Produces:
  - `authClient.admin.*` 可用
  - `SessionInfo.user.role: string`

- [ ] **Step 1: 服务端挂 admin 插件**

`src/auth/auth.ts`：

```ts
import { admin } from 'better-auth/plugins/admin'
// plugins 数组末尾加 admin()（默认 defaultRole: 'user'、adminRoles: ['admin']，与本仓一致，无需 options）
```

- [ ] **Step 2: 客户端挂 adminClient**

`src/auth/client.ts`（**导入源必须是 `better-auth/client/plugins`**）：

```ts
import { adminClient } from 'better-auth/client/plugins'
// plugins: [apiKeyClient(), adminClient()]
```

- [ ] **Step 3: `SessionInfo` 补 role**

`src/auth/session.ts`：`SessionInfo['user']` 加 `role: string`；`fetchSession` 返回值加
`role: session.user.role`。

- [ ] **Step 4: 修两个测试夹具**

- `tests/components/settings-layout.test.tsx:77` 的 `sessionWith()`：`user` 加 `role: 'user'`
- `tests/components/settings-user-card.test.tsx:78` 的 `sessionWith()`：`user` 加 `role: 'user'`（可并入 `overrides` 默认值）

- [ ] **Step 5: 运行测试**

Run: `pnpm test tests/components/settings-layout.test.tsx tests/components/settings-user-card.test.tsx`
Expected: PASS

- [ ] **Step 6: 验证插件端点**

`pnpm dev` 登录后：

```js
await fetch('/api/auth/admin/list-users', { method: 'GET', credentials: 'include' })
```

Expected: 普通用户返回 403（权限不足），admin 返回用户列表。**均非 404。**

- [ ] **Step 7: 提交**

```bash
git add src/auth/auth.ts src/auth/client.ts src/auth/session.ts \
  tests/components/settings-layout.test.tsx tests/components/settings-user-card.test.tsx
git commit -m "feat(auth): 注册 admin 插件，会话信息补 role"
```

---

### Task 12: `features.enableAdmin` + role 门禁 + 侧栏分组

**Files:**
- Modify: `src/config/settings.ts`（改返回 group 结构、加 admin 项）
- Modify: `src/components/dashboard/DashboardLayout.tsx`（传 role、适配 group）
- Modify: `src/routes/{-$locale}/_layout/dashboard.tsx`（传 role 给外壳）
- Modify: `src/routes/api/auth/$.ts`（admin 前缀判定）
- Test: `tests/unit/admin-module.test.ts`（新建）、`tests/unit/settings-config.test.ts`（重写形状）、`tests/unit/navigation.test.ts`
- Modify: `content/docs/configuration.md`、`.zh.md`

**Interfaces:**
- Consumes: Task 11（`session.user.role`）、Task 8（`assertFeatureEnabled`）
- Produces:
  - `getSettingsSections(locale, ctx)` 返回 `MenuItem[]`（含 `kind: 'group'`）
  - `assertAdminRole(role: string | undefined): void`（非 admin 抛 `notFound()`）

- [ ] **Step 1: 写失败测试**

`tests/unit/admin-module.test.ts`（新建）：`features.enableAdmin: false` 时
`/api/auth/admin/list-users` 返回 404；`assertAdminRole('user')` 抛 `notFound()`，
`assertAdminRole('admin')` 不抛。

`tests/unit/settings-config.test.ts`：**重写**为断言 group 结构（两个 group：个人 / 管理），
admin 项仅在 `role === 'admin'` 且 `enableAdmin` 为真时出现。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test tests/unit/admin-module.test.ts tests/unit/settings-config.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现门禁与分组**

- `src/lib/module-access.ts` 加：

```ts
export function assertAdminRole(role: string | undefined): void {
  if (role !== 'admin') throw notFound()
}
```

- `src/config/settings.ts`：`SettingsSection` 加 `'admin'`；`getSettingsSections` 返回两个
  group（`kind: 'group'`，id `'personal'` / `'admin'`），admin 组含
  `{ id: 'admin', icon: IconUsers, visibility: { roles: ['admin'], feature: 'enableAdmin' },
  destination: { to: '/{-$locale}/dashboard/admin/users' } }`；`getSettingsSectionMeta` 加
  `case 'admin'`
- `src/routes/api/auth/$.ts`：照 Task 8 的写法，对 `/api/auth/admin` 前缀加
  `!websiteConfig.features.enableAdmin` → 404

- [ ] **Step 4: 传 role 并适配 group**

- `src/routes/{-$locale}/_layout/dashboard.tsx`：`beforeLoad` 返回值已含 `session`，
  组件把 `session.user.role` 传给 `DashboardLayout`
- `src/components/dashboard/DashboardLayout.tsx:62`：`getSettingsSections(locale, {
  config, authenticated: true, role: session.user.role })`；渲染逻辑适配 group（顶层
  group 渲染为分组标题 + 子项）

- [ ] **Step 5: 运行测试**

Run: `pnpm test tests/unit/admin-module.test.ts tests/unit/settings-config.test.ts tests/unit/navigation.test.ts`
Expected: PASS

- [ ] **Step 6: 改默认值与文档**

- `src/config/website.ts:110`：`enableAdmin: false` → `true`
- `tests/unit/brand-config.test.ts:57`：`enableAdmin: false` → `true`
- `content/docs/configuration.md` / `.zh.md`：`enableAdmin` 的**表格行 + 完整示例块各两处** → `true`

- [ ] **Step 7: 验证高亮（Review Focus 相关）**

`pnpm dev` 以 admin 身份访问 `/dashboard/admin/users`：
Expected: 侧栏「管理」组下的「用户管理」**高亮**（验证 Task 2 Step 3 的段比较在嵌套路径下生效）。

- [ ] **Step 8: 提交**

```bash
git add src/config/settings.ts src/components/dashboard/DashboardLayout.tsx \
  "src/routes/{-\$locale}/_layout/dashboard.tsx" "src/routes/api/auth/\$.ts" \
  src/lib/module-access.ts src/config/website.ts tests/unit/admin-module.test.ts \
  tests/unit/settings-config.test.ts tests/unit/navigation.test.ts \
  tests/unit/brand-config.test.ts content/docs/configuration.md content/docs/configuration.zh.md
git commit -m "feat(admin): enableAdmin 门禁与侧栏分组，role 驱动可见性"
```

---

### Task 13: 用户管理页

**Files:**
- Create: `src/routes/{-$locale}/_layout/dashboard/admin/users.tsx`
- Modify: `messages/zh.json`、`messages/en.json`

**Interfaces:**
- Consumes: Task 11（`authClient.admin.*`）、Task 12（`assertAdminRole`、`assertFeatureEnabled`）
- Produces: `/dashboard/admin/users` 页面。

- [ ] **Step 1: 加消息键**

两个 locale 同时加（约 20 条，前缀 `admin_users_`）：列表表头（邮箱 / 姓名 / 角色 / 状态 /
创建时间）、搜索占位、分页（上一页 / 下一页 / 页码）、角色名、状态名（正常 / 已封禁）、
封禁弹窗（标题 / 原因标签 / 到期标签 / 提交 / 取消）、解封、删除确认（标题 / 描述 / 确认）、
错误提示。

Run: `pnpm locale:sort && pnpm locale:check`
Expected: PASS

- [ ] **Step 2: 实现页面**

`src/routes/{-$locale}/_layout/dashboard/admin/users.tsx`：
- `head()`：`seo('/dashboard/admin/users', {...})` + `robots: noindex`
- `beforeLoad`：`assertFeatureEnabled('enableAdmin')` + `assertAdminRole(session.user.role)`
  （role 从父路由 context 取）
- 状态：`page`（offset）、`search`、数据三态
- 列表：`authClient.admin.listUsers({ query: { limit, offset, searchValue, searchField: 'email' } })`
  → `<Table>`；角色用 `Badge`，状态用 `Badge`（已封禁 → destructive 变体）
- 搜索：`input`，改动后重置 offset 到 0
- 分页：**不引入 shadcn `pagination`**——用「上一页 / 下一页」`Button` + 「第 N / 共 M 页」文本
- 改角色：`Dialog` + 角色按钮组（`user` / `admin`）→ `authClient.admin.setRole({ userId, role })`
- 封禁：`Dialog`（原因 `input` + 可选到期 `input`）→ `authClient.admin.banUser({ userId, banReason, banExpiresIn })`
- 解封：行内 `Button variant="outline" size="sm"` → `authClient.admin.unbanUser({ userId })`
- 删除：行内按钮 → `AlertDialog`（照 `security.tsx` 的 `DeleteAccountCard` 写法）→
  `authClient.admin.removeUser({ userId })`
- 每步成功后 `reload()`

- [ ] **Step 3: 手动验证**

`pnpm dev` 以 admin 身份：
- 搜索邮箱片段 → 列表过滤
- 改某用户角色 → 刷新后生效
- 封禁 → 该用户被登出 / 无法登录；解封 → 恢复
- 删除 → 用户消失
- 以**普通用户**身份访问 `/dashboard/admin/users` → 404（Review Focus：非 admin 访问）

- [ ] **Step 4: 提交**

```bash
git add "src/routes/{-\$locale}/_layout/dashboard/admin/users.tsx" \
  messages/zh.json messages/en.json
git commit -m "feat(admin): 用户管理页（列表 / 搜索 / 分页 / 角色 / 封禁 / 删除）"
```

---

### Task 14: `set-admin` CLI 提权脚本

**Files:**
- Create: `scripts/set-admin.ts`
- Create: `tests/unit/set-admin-script.test.ts`
- Modify: `package.json`（scripts）

**Interfaces:**
- Consumes: Task 6（`users.role` 列已存在）
- Produces: `buildSetAdminSql(email: string): string`（纯函数，可测）

- [ ] **Step 1: 写失败测试**

`tests/unit/set-admin-script.test.ts`（**不 import `src/`**，因 `scripts/` 无 `@/*` 别名）：

```ts
import { buildSetAdminSql } from '../../scripts/set-admin'
// 正常邮箱 → 含 UPDATE users SET role='admin' WHERE email='...'
// 含单引号的邮箱 → 单引号被转义（'' 或拒绝）
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test tests/unit/set-admin-script.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现脚本**

`scripts/set-admin.ts`：
- 导出 `buildSetAdminSql(email: string): string`——校验邮箱格式（正则），转义单引号
  （`'` → `''`），返回 SQL
- `main()`：读 `process.argv`，要求**显式** `--local` 或 `--remote`（缺则报错退出并打印用法）；
  取邮箱参数；用 `node:child_process` 的 `execSync` shell out：

```ts
execSync(`wrangler d1 execute DB ${flag} --command "${buildSetAdminSql(email)}"`, { stdio: 'inherit' })
```

（`flag` 为 `--local` 或 `--remote`。）**跟随 `scripts/setup.ts` 的 `execSync` 风格**，
不依赖 `scripts/lib/`（那里没有 D1 执行器）。
- `--remote` 前做 wrangler 登录软检查（照 `setup.ts` 的 `wrangler whoami` 风格）

`package.json`：

```json
"db:admin:local": "tsx scripts/set-admin.ts --local",
"db:admin:remote": "tsx scripts/set-admin.ts --remote"
```

- [ ] **Step 4: 运行测试**

Run: `pnpm test tests/unit/set-admin-script.test.ts`
Expected: PASS

- [ ] **Step 5: 本地验证**

```bash
pnpm db:admin:local <你的测试账号邮箱>
pnpm exec wrangler d1 execute DB --local --command "SELECT email, role FROM users;"
```
Expected: 该用户 `role = 'admin'`。

- [ ] **Step 6: 提交**

```bash
git add scripts/set-admin.ts tests/unit/set-admin-script.test.ts package.json
git commit -m "feat(admin): 新增 set-admin CLI 提权脚本"
```

---

### Task 15: 用户管理文档 + CONTEXT.md 状态更新

**Files:**
- Create: `content/docs/user-management.md`、`content/docs/user-management.zh.md`
- Modify: `src/components/docs/doc-icons.ts`
- Modify: `CONTEXT.md:77,80-81`
- Modify: `content/docs/integrations.md`、`.zh.md`

**Interfaces:**
- Consumes: Task 13、Task 14（功能与脚本已存在）
- Produces: `/docs/user-management` 页面。

- [ ] **Step 1: 写文档**

frontmatter：`order: 19`、`group: features`、`locale: zh`/`en`。
正文：admin 角色（`admin` / `user`）、CLI 提权（`pnpm db:admin:local <email>` /
`db:admin:remote <email>`，或 Drizzle Studio 改 `role`）、管理台位置
（`/dashboard/admin/users`）与能力（搜索 / 分页 / 改角色 / 封禁解封 / 删除）、
封禁语义（立即生效、无法登录）、`adminClient` 用法。
注意事项：`ADMIN_EMAILS` 与 `role` **是两回事**——`role: 'admin'` 不自动获得
`/api/email` 发信权限（那里是双重邮箱白名单）。文末 `## 参考资料` + `## 下一步`。

- [ ] **Step 2: 加图标 + 更新 CONTEXT.md**

- `src/components/docs/doc-icons.ts`：加 `'user-management'`
- `CONTEXT.md:77`：板块列表补「API 密钥 / 用户管理」
- `CONTEXT.md:80-81`：「尚未实现」清单**删除**「管理后台」「API 密钥」两项，
  并更新「账户工作台仅完成资料 / 安全 / 设备 / 通知四块」的表述

- [ ] **Step 3: 更新 integrations 文档**

`content/docs/integrations.md` / `.zh.md`：补 `/api/auth/api-key/*` 与
`/api/auth/admin/*` 的 flag 门禁说明。

- [ ] **Step 4: 验证**

Run: `pnpm dev`，访问 `/zh/docs/user-management`
Expected: 渲染正常，侧边栏出现该项。

- [ ] **Step 5: 提交**

```bash
git add content/docs/user-management.md content/docs/user-management.zh.md \
  src/components/docs/doc-icons.ts CONTEXT.md \
  content/docs/integrations.md content/docs/integrations.zh.md
git commit -m "docs(admin): 新增用户管理文档并更新 CONTEXT 状态"
```

---

## 收尾验证

- [ ] **全量检查**：`pnpm check && pnpm test`
- [ ] **E2E**：`pnpm test:e2e`（`e2e/settings.spec.ts` 已改路径，确认全绿）
- [ ] **构建**：`pnpm build`
- [ ] **客户端 bundle 检查**：`pnpm check:client-bundle`（确认服务端 secret 未泄漏）
- [ ] **Review Focus 复核**：逐条确认第 1–5 项的测试已落地并通过
