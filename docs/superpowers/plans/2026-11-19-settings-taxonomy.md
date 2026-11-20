# 系统设置分类重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把系统设置重构为 9 个 tab、每个 tab 一个保存按钮、分组可折叠；删除全部 `features.*` 与 `modules.auth` 总开关；认证改为邮箱 / Google / GitHub 三个方法开关；新增「用户」与「自定义配置」两个 tab；管理台门禁改为任意 `admin.*` 权限。

**Architecture:** 配置注册表仍是唯一事实来源，但 tab 由「全局模块 / 功能」改为「按业务域」：服务模块开关跟随所属 tab。保存粒度从分组提升为 tab：一次提交校验该 tab 下所有分组，任一组非法则整 tab 拒绝。用户中心入口由 `userFeatures.*` 控制，模块是否存在仍由 `modules.*` 决定。自定义配置以 `custom.<key>` 命名空间存入 `settings` 表，仅服务端可读。

**Tech Stack:** TanStack Start / Router、React 19、TypeScript strict、Drizzle ORM、Better Auth、Paraglide、Vitest、Playwright。

**Spec:** `CONTEXT.md`、`docs/adr/0013-capability-switches-and-settings-taxonomy.md`、`docs/adr/0012-orders-payments-subscriptions.md`

**执行顺序：** 先执行 `2026-11-19-orders-payments-attribution.md`。本计划依赖其中的 `manualPayments` 改名与 `orders` / `manual_payment_details` 表。

## Global Constraints

- 目标工作区：`/Users/alvinyao/Projects/saas-template-core`，分支 `refactor/core-modules`。
- 配置字段只在 `src/core/config/registry.ts` 声明；页面、脚本、env schema 不得另写一份。
- 删除的配置键会留下孤儿行：本计划包含一次清理迁移脚本，删除 `features.*` 与 `modules.auth` 的 `settings` 行。
- 认证至少保留一个登录方法；保存时校验，直接改库仍可能锁死，文档需标注。
- 管理台门禁 = `matchPermission('admin.*', permissions)`；`editor` 可进管理台，菜单与接口按权限点逐项校验。
- 新增消息键必须同时写入 `messages/zh.json` 与 `messages/en.json`，改完运行 `pnpm locale:sort`。
- `src/components/ui` 只放上游原件，不本地修改；折叠用现有 `src/components/ui/collapsible`，tab 用 `tabs`。
- 提交前 `pnpm check`、`pnpm exec vitest run --project unit`、`pnpm exec vitest run --project components` 必须全绿。
- 提交消息不得包含 `Co-Authored-By` 或任何 Claude 署名。
- 结构变更与行为变更分开提交。

## Review Focus

- 删除 `modules.auth` 后，认证路由与 API 仍必须始终可用；不能残留 `assertPageEnabled('auth')` 导致 404。
- 三个登录方法全部关闭时保存必须被拒绝，否则管理员会把自己锁在门外。
- 按 tab 保存时，一个分组里的非法值必须让整 tab 失败，不能半组落库。
- 管理台门禁改为权限点后，`super_admin` 与持 `admin.*` 的 `editor` 都必须能进入；没有 `admin.*` 的普通用户仍是 404。
- 删除 `features.enableApiKeys` 后，API 密钥入口由 `userFeatures.apiKeys` 控制，但 `/api/auth/api-key` 端点也必须同步门禁，不能只隐藏菜单。
- 自定义配置不得覆盖注册表字段，也不得把 secret 写进公开配置。

---

### Task 1: 重构 `WebsiteConfig` 与配置注册表为 9 个 tab

**Files:**
- Modify: `src/config/website.ts`
- Modify: `src/core/config/registry.ts`
- Modify: `src/core/config/settings.ts`（类型引用）
- Modify: `messages/zh.json`、`messages/en.json`
- Test: `tests/unit/config-registry.test.ts`（新建或扩展现有）

**Interfaces:**
- 本任务**只新增**新字段与重排 tab；`ServiceModule` 里的 `'auth'`、`WebsiteConfig.auth.enabled` 与 `WebsiteConfig.features` 保留到 Task 5 / Task 6 再删除，避免中间态类型错误。
- `WebsiteConfig` 新增：
  - `payment.checkoutMode: 'provider' | 'manual_payments'`
  - `manualPayments: { enabled: boolean; verificationSlaHours: number; accounts: ManualPaymentAccountConfig[] }`
  - `auth.emailEnabled`、`auth.googleEnabled`、`auth.githubEnabled`（与现有 `auth.requireEmailVerification` 并存）
  - `userFeatures: { billing: boolean; manualPayments: boolean; apiKeys: boolean; notifications: boolean }`
  - `users: { defaultRole: 'viewer' | 'editor'; signupCredits: { enabled: boolean; amount: number; validDays: number; description: string } }`
- `SettingTabId = 'general' | 'users' | 'content' | 'auth' | 'payment' | 'mail' | 'analytics' | 'notification' | 'custom'`
- `export function settingTab(id: string): SettingTab | undefined`（与现有 `settingGroup` 同一手法，供按 tab 保存使用）
- 新字段键：
  - `modules.manualPayments`
  - `userFeatures.billing`、`userFeatures.manualPayments`、`userFeatures.apiKeys`、`userFeatures.notifications`
  - `users.defaultRole`（select `viewer` / `editor`）
  - `signupCredits.enabled`、`signupCredits.amount`、`signupCredits.validDays`、`signupCredits.description`
  - `auth.emailEnabled`、`auth.googleEnabled`、`auth.githubEnabled`
  - `github.clientId`、`github.clientSecret`（secret，`envKey` 分别为 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`）

- [ ] **Step 1: 写失败测试**

`tests/unit/config-registry.test.ts` 断言：

```ts
expect(SETTING_TABS.map((tab) => tab.id)).toEqual([
  'general', 'users', 'content', 'auth', 'payment', 'mail', 'analytics', 'notification', 'custom',
])
expect(SETTING_FIELDS.some((field) => field.key.startsWith('features.'))).toBe(false)
expect(SETTING_FIELDS.some((field) => field.key === 'modules.auth')).toBe(false)
expect(SETTING_FIELDS.map((field) => field.key)).toEqual(
  expect.arrayContaining(['userFeatures.apiKeys', 'users.defaultRole', 'signupCredits.amount']),
)
expect(SETTING_FIELDS.map((field) => field.key)).toEqual(
  expect.arrayContaining(['auth.emailEnabled', 'auth.googleEnabled', 'auth.githubEnabled']),
)
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run --project unit tests/unit/config-registry.test.ts`
Expected: FAIL，tab 列表与字段不符。

- [ ] **Step 3: 重构注册表**

tab 与分组：

| tab | 分组 |
|---|---|
| `general` 基础与外观 | `brand`、`seo`、`social` |
| `users` 用户 | `userFeatures`、`registration`（默认角色 + 注册赠积分） |
| `content` 内容模块 | `contentModules`（`modules.docs/blog/changelog/contact`）、`docs`（siteUrl/homeUrl/asHome） |
| `auth` 认证与安全 | `authMethods`（三个方法开关 + `auth.requireEmailVerification`）、`google`、`github`、`turnstile` |
| `payment` 支付 | `paymentModules`（`modules.payment`、`modules.manualPayments`）、`payment`（provider/checkoutMode）、`stripe`、`creem`、`manualPayments`（SLA/accounts） |
| `mail` 邮件 | `mailModules`（`modules.mail`、`modules.newsletter`）、`mail`、`resend`、`cloudflareEmail`、`newsletter`、`beehiiv` |
| `analytics` 分析 | `analyticsModules`（`modules.analytics`）、`analytics` |
| `notification` 通知 | `notificationModules`（`modules.notification`）、`notification` |
| `custom` 自定义配置 | 无注册表分组，页面单独渲染 |

删除 `moduleFields` 中的 `modules.auth` 与整个 `featureFields`。`manualPayments` 分组沿用改名后的 `manualPayments.verificationSlaHours` / `manualPayments.accounts`。

- [ ] **Step 4: 运行测试**

Run: `pnpm exec vitest run --project unit tests/unit/config-registry.test.ts`
Expected: PASS

Run: `pnpm locale:sort && pnpm check`
Expected: 无错误。旧的 `auth.enabled` / `features` 字段仍保留，`applySettingsToConfig` 继续按默认值填充它们。

- [ ] **Step 5: 提交**

```bash
git add src/config src/core/config messages tests/unit/config-registry.test.ts
git commit -m "refactor(config): 系统设置重构为 9 个 tab"
```

---

### Task 2: 配置落地与孤儿键清理

**Files:**
- Modify: `src/core/config/settings.ts`（`applySettingsToConfig`）
- Modify: `src/core/config/derive.ts`（GitHub env 映射）
- Create: `scripts/cleanup-removed-settings.ts`
- Modify: `scripts/db-seed.ts`
- Test: `tests/unit/config-settings.test.ts`

**Interfaces:**
- `applySettingsToConfig` 产出：
  - `auth` 增加 `emailEnabled` / `googleEnabled` / `githubEnabled`；`enabled` 暂留 `true`，Task 5 删除
  - `userFeatures`、`users` 按字段映射
  - `manualPayments` 替代 `collection`
  - 不再读取 `features.*` / `modules.auth`，但 `features` 形状与 `auth.enabled` 继续输出默认值，Task 6 删除
- `settingsToServerEnv` 的 `ENV_MAP` 增加 `github.clientId → GITHUB_CLIENT_ID`、`github.clientSecret → GITHUB_CLIENT_SECRET`
- `scripts/cleanup-removed-settings.ts`：删除 `settings` 表中 `key LIKE 'features.%'` 与 `key = 'modules.auth'` 的行，可重复执行

- [ ] **Step 1: 写失败测试**

```ts
it('features.* 不再影响站点配置', ...)
it('三个认证方法开关映射到 auth', ...)
it('用户中心功能开关映射到 userFeatures', ...)
it('注册赠积分映射到 users.signupCredits', ...)
it('manualPayments 配置映射到 manualPayments', ...)
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run --project unit tests/unit/config-settings.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现映射与清理脚本**

`cleanup-removed-settings.ts` 用 `pnpm tsx` 或现有脚本运行方式；在 `package.json` 增加 `db:cleanup:settings`，文档写明升级时执行一次。

- [ ] **Step 4: 运行测试**

Run: `pnpm exec vitest run --project unit tests/unit/config-settings.test.ts`
Expected: PASS

Run: `pnpm check`
Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/core/config scripts package.json tests/unit/config-settings.test.ts
git commit -m "refactor(config): 移除能力开关并清理孤儿配置"
```

---

### Task 3: 保存粒度改为按 tab

**Files:**
- Modify: `src/core/config/settings.ts`（新增 `validateTabValues`）
- Modify: `src/core/config/service.ts`（新增 `saveSettingsTab`）
- Modify: `src/core/config/admin.ts`（`saveAdminSettings` 改为 `{ tabId, values }`）
- Test: `tests/unit/config-service.test.ts`、`tests/unit/config-admin.test.ts`

**Interfaces:**
- `export function validateTabValues(tabId: SettingTabId, input: Record<string, unknown>): SettingsValues`
- `export function tabHasSecrets(tabId: SettingTabId): boolean`
- `export function tabSecretKeys(tabId: SettingTabId): string[]`
- `export async function saveSettingsTab(db: DB, tabId: SettingTabId, input: Record<string, unknown>, options?: SettingsLoadOptions): Promise<SettingsValues>`
- `saveAdminSettings` 输入 `{ tabId: string; values: Record<string, unknown> }`，校验 `settingTab(tabId)` 存在

- [ ] **Step 1: 写失败测试**

```ts
it('按 tab 保存会校验该 tab 下所有分组', ...)
it('一个分组非法则整 tab 不落库', ...)
it('tab 内含密钥且未提供加密口令时拒绝保存', ...)
it('保存后立即刷新进程内快照', ...)
it('未知 tab 返回 400', ...)
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run --project unit tests/unit/config-service.test.ts tests/unit/config-admin.test.ts`
Expected: FAIL，`saveSettingsTab` 不存在。

- [ ] **Step 3: 实现**

`validateTabValues` 遍历 `settingTab(tabId).groups` 的字段，组外键忽略，组内非法即抛 `SettingsValidationError`。`saveSettingsTab` 复用 `saveSettingsGroup` 的落库与缓存刷新逻辑，但只刷新一次。

- [ ] **Step 4: 运行测试**

Run: `pnpm exec vitest run --project unit tests/unit/config-service.test.ts tests/unit/config-admin.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/config tests/unit/config-service.test.ts tests/unit/config-admin.test.ts
git commit -m "feat(config): 系统设置改为按 tab 保存"
```

---

### Task 4: 设置页 UI（单保存 + 可折叠分组）

**Files:**
- Modify: `src/routes/{-$locale}/_layout/admin/settings.tsx`
- Test: `tests/components/admin-settings.test.tsx`

**Interfaces:**
- 每个 tab 顶部一个保存按钮，提交该 tab 全部字段。
- 每个分组渲染为可折叠卡片，默认展开；标题、说明、字段与「测试连接」保持在卡片内。
- `custom` tab 渲染 `<CustomConfigPanel />`（Task 8 实现），不渲染注册表分组。
- 草稿状态从「每卡片一份」改为「每 tab 一份」；切换 tab 不丢未保存草稿，刷新后回到服务端值。

- [ ] **Step 1: 写失败测试**

组件测试 mock `fetchAdminSettings` / `saveAdminSettings`：

```ts
it('切换 tab 只显示该 tab 的分组', ...)
it('一个 tab 只有一个保存按钮', ...)
it('保存提交 tabId 与该 tab 全部字段', ...)
it('分组可以折叠与展开', ...)
it('custom tab 不渲染注册表字段', ...)
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run --project components tests/components/admin-settings.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现页面**

用 `src/components/ui/tabs` 做左侧导航（宽屏竖排，窄屏横滚），`src/components/ui/collapsible` 做分组折叠。保存时把 `list` / `json` 字段按现有规则转换；密钥字段与初始掩码相同则跳过。

- [ ] **Step 4: 运行测试与检查**

Run: `pnpm exec vitest run --project components tests/components/admin-settings.test.tsx`
Expected: PASS

Run: `pnpm check`
Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/routes src/components tests/components/admin-settings.test.tsx
git commit -m "feat(admin): 设置页按 tab 单保存并支持折叠"
```

---

### Task 5: 认证方法开关与 GitHub OAuth

**Files:**
- Modify: `src/core/auth/auth.ts`
- Modify: `src/core/auth/providers.ts`
- Modify: `src/core/auth/flow.ts`
- Modify: `src/components/auth/SocialAuthButtons.tsx`
- Modify: `src/routes/{-$locale}/auth/login.tsx`、`register.tsx`
- Modify: `src/routes/{-$locale}/_layout/admin.tsx`、`settings.tsx`
- Modify: `src/routes/{-$locale}/auth/error.tsx`、`forgot-password.tsx`、`reset-password.tsx`、`verify-email.tsx`
- Modify: `src/routes/api/auth/$.ts`
- Modify: `src/blocks/template-pricing.tsx`
- Test: `tests/unit/auth-providers.test.ts`、`tests/unit/auth-flow.test.ts`

**Interfaces:**
- `fetchAuthProviderAvailability()` 返回 `{ email: boolean; google: boolean; github: boolean }`
- `auth.ts`：
  - `emailAndPassword.enabled = websiteConfig.auth.emailEnabled`
  - `socialProviders.google` 仅在 `googleEnabled && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET` 时注册
  - `socialProviders.github` 仅在 `githubEnabled && GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET` 时注册
- `SocialAuthButtons` 接受 `googleEnabled`、`githubEnabled`、`onGithubClick`；两个都关闭时不渲染。
- 保存 `auth` tab 时校验 `emailEnabled || googleEnabled || githubEnabled`，否则抛 `SettingsValidationError('auth', '至少保留一种登录方式')`。
- 删除 `assertPageEnabled('auth')` 与 `getModuleUnavailableResponse('auth')`；`api/auth/$.ts` 只保留 API Key 端点门禁（读 `websiteConfig.userFeatures.apiKeys`）。
- 本任务同时删除 `ServiceModule` 的 `'auth'` 与 `WebsiteConfig.auth.enabled`，并移除所有依赖它们的门禁。
- `assertAdminRole` / `assertFeatureEnabled` 暂不删除，由 Task 6 统一移除。

- [ ] **Step 1: 写失败测试**

```ts
it('邮箱关闭时不启用 emailAndPassword', ...)
it('Google 未配置凭据时不注册 socialProvider', ...)
it('GitHub 配置齐备时注册 socialProvider', ...)
it('三种登录全关时保存被拒绝', ...)
it('认证页面不再因 modules.auth 关闭而 404', ...)
it('userFeatures.apiKeys 关闭时 /api/auth/api-key 返回 404', ...)
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run --project unit tests/unit/auth-providers.test.ts tests/unit/auth-flow.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

登录 / 注册页按 `email` 开关隐藏邮箱表单；三个方法都关闭时页面显示运维提示而不是空白。`template-pricing.tsx` 的 `auth.enabled` 判断改为 `payment.enabled`。

- [ ] **Step 4: 运行测试与检查**

Run: `pnpm exec vitest run --project unit tests/unit/auth-providers.test.ts tests/unit/auth-flow.test.ts`
Expected: PASS

Run: `pnpm check`
Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/core/auth src/components/auth src/routes src/lib src/blocks tests/unit
git commit -m "feat(auth): 认证改为方法开关并新增 GitHub 登录"
```

---

### Task 6: 管理台门禁改为任意 `admin.*` 权限

**Files:**
- Modify: `src/core/auth/rbac.ts`（新增 `loadUserPermissions`）
- Modify: `src/modules/rbac/service.ts`（`getUserPermissions` 委托 core 实现）
- Modify: `src/core/auth/session.ts`（`SessionInfo` 增加 `permissions`）
- Modify: `src/routes/{-$locale}/_layout/admin.tsx`
- Modify: `src/routes/{-$locale}/_layout/settings.tsx`
- Modify: `src/components/settings/PersonalCenterLayout.tsx`
- Modify: `src/components/admin/AdminConsoleLayout.tsx`
- Modify: `src/components/layout/account-menu.tsx`
- Modify: `src/lib/module-access.ts`（删除 `assertAdminRole`、`assertFeatureEnabled`）
- Modify: `src/core/config/admin.ts`、`src/core/auth/admin-users.ts`、`src/modules/subscriptions/admin-billing.ts`、`src/modules/subscriptions/admin-orders.ts`
- Modify: `src/routes/{-$locale}/_layout/admin/manual-payments.tsx` 的二维码 / 凭证 API
- Test: `tests/unit/admin-module.test.ts`、`tests/unit/rbac.test.ts`

**Interfaces:**
- `export async function loadUserPermissions(db: DB, userId: string, now?: Date): Promise<string[]>` 位于 `src/core/auth/rbac.ts`，实现从 `user_roles` / `role_permissions` / `permissions` 读权限；`users.role` 为 `admin` / `super_admin` 时回退 `['*']`。
- `SessionInfo` 增加 `permissions: string[]`
- `fetchSession()` 读取会话后并行 `loadUserPermissions`
- 管理台 `beforeLoad`：未登录重定向；`matchPermission('admin.*', session.permissions)` 为假时 `notFound()`
- `PersonalCenterLayout` 与 `account-menu` 的 `canEnterAdmin` 改用 `matchPermission('admin.*', permissions)`
- 本任务删除 `WebsiteConfig.features` 类型与 `applySettingsToConfig` 中的 `features` 输出；所有 `features.*` 消费方在本任务内改完。
- 管理台 server function 改用 `requirePermissionDb('<resource>.<action>')`：
  - 设置：`admin.settings.read` / `admin.settings.write`
  - 付款：`admin.orders.read`，退款：`payments.refund`
  - 订阅：`admin.subscriptions.read`
  - 用户：`admin.users.read` / `admin.users.write`

- [ ] **Step 1: 写失败测试**

```ts
it('持 admin.* 的 editor 能通过管理台门禁', ...)
it('只有 user 角色的用户被 notFound', ...)
it('super_admin 的 * 覆盖 admin.*', ...)
it('fetchSession 返回权限点列表', ...)
it('没有 admin.settings.read 时设置接口 403', ...)
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run --project unit tests/unit/admin-module.test.ts tests/unit/rbac.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`getUserPermissions` 保留为 `loadUserPermissions` 的薄封装，避免重复 SQL。`AdminConsoleLayout` 的兜底判断改为 `matchPermission('admin.*', permissions)`，权限从 `session.permissions` 取。

- [ ] **Step 4: 运行测试与检查**

Run: `pnpm exec vitest run --project unit tests/unit/admin-module.test.ts tests/unit/rbac.test.ts`
Expected: PASS

Run: `pnpm check`
Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add src tests/unit
git commit -m "feat(rbac): 管理台门禁改为 admin.* 权限点"
```

---

### Task 7: 用户 tab 的行为（默认角色、注册赠积分、用户中心功能开关）

**Files:**
- Create: `src/core/auth/user-hooks.ts`
- Create: `src/modules/rbac/signup.ts`
- Modify: `src/core/auth/auth.ts`
- Modify: `src/modules/rbac/service.ts`
- Modify: `src/modules/credits/service.ts`
- Modify: `src/server.ts`
- Modify: `src/config/settings-nav.ts`
- Test: `tests/unit/signup-rewards.test.ts`

**Interfaces:**
- `export type UserCreatedHook = (ctx: { db: DB; user: { id: string; email: string } }) => Promise<void>`
- `export function registerUserCreatedHook(hook: UserCreatedHook): void`
- `export async function runUserCreatedHooks(ctx): Promise<void>`（单个 hook 失败只记日志，不让注册失败）
- `export function registerSignupSideEffects(): void` 从 `@/modules/rbac/service` 导出；注册两个动作：
  1. 分配默认角色：`assignRolesToUser(db, { actorPermissions: ['*'], targetUserId: user.id, assignments: [{ roleName: websiteConfig.users.defaultRole }] })`。`actorPermissions: ['*']` 只用于系统发起的注册动作，不经过 HTTP。
  2. `websiteConfig.users.signupCredits.enabled` 时调用 `grantCredits(db, { userId, amount, source: 'bonus', idempotencyKey: \`signup:${user.id}\`, expiresAt: validDays > 0 ? new Date(Date.now() + validDays * 86_400_000) : undefined })`。
- `src/server.ts` 模块加载期调用一次 `registerSignupSideEffects()`
- `settings-nav.ts` 可见性：
  - 账单 → `userFeatures.billing`
  - 人工核销 → `userFeatures.manualPayments`
  - API 密钥 → `userFeatures.apiKeys`
  - 通知偏好 → `userFeatures.notifications`

- [ ] **Step 1: 写失败测试**

```ts
it('注册后分配默认 viewer 角色', ...)
it('默认角色为 editor 时分配 editor', ...)
it('注册赠积分开启时发放一次', ...)
it('同一用户重试注册钩子不会重复发放', ...)
it('赠积分关闭时不写流水', ...)
it('userFeatures 关闭时个人中心入口不可见', ...)
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run --project unit tests/unit/signup-rewards.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`auth.ts` 的 `databaseHooks.user.create.after` 调 `runUserCreatedHooks({ db: await createDbFromEnv(env), user })`。`registerSignupSideEffects` 由 `src/server.ts` 在模块顶层调用；`registerUserCreatedHook` 只允许注册一次（重复调用幂等）。

- [ ] **Step 4: 运行测试**

Run: `pnpm exec vitest run --project unit tests/unit/signup-rewards.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src tests/unit/signup-rewards.test.ts
git commit -m "feat(users): 注册默认角色与赠积分"
```

---

### Task 8: 自定义配置 tab

**Files:**
- Create: `src/core/config/custom.ts`
- Modify: `src/core/config/admin.ts`
- Modify: `src/routes/{-$locale}/_layout/admin/settings.tsx`（挂载 `CustomConfigPanel`）
- Create: `src/components/admin/CustomConfigPanel.tsx`
- Test: `tests/unit/custom-config.test.ts`

**Interfaces:**
- `export interface CustomSetting { key: string; value: string; secret: boolean }`
- `export function isReservedCustomKey(key: string): boolean`
- `export async function listCustomSettings(db: DB, encryptionKey?: string): Promise<CustomSetting[]>`（secret 只回显掩码）
- `export async function replaceCustomSettings(db: DB, entries: CustomSetting[], options?: SettingsLoadOptions): Promise<void>`
- `export const getCustomSetting = createServerOnlyFn(async (key: string): Promise<unknown | undefined>)`
- 存储：`settings.key = 'custom.' + key`，`value = JSON.stringify({ v: value | enc:v1:..., s: boolean })`
- 键规则：`/^[a-z][a-z0-9_.-]{1,63}$/`；不得等于任何注册表字段键；不得以 `custom.` 开头；不得命中保留前缀（注册表所有顶层前缀 + `features.` + `modules.auth`）

- [ ] **Step 1: 写失败测试**

```ts
it('自定义键写入 custom. 命名空间', ...)
it('注册表已有的键被拒绝', ...)
it('非法键格式被拒绝', ...)
it('secret 值加密且列表只回显掩码', ...)
it('getCustomSetting 解密后返回原值', ...)
it('删除条目会移除对应 settings 行', ...)
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run --project unit tests/unit/custom-config.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现服务与面板**

面板：表格列出 key / value / secret，支持新增、删除、修改；保存时整表替换；secret 输入框留空表示不修改。`saveAdminSettings` 不处理 custom tab，custom tab 走独立的 `saveCustomSettings` server function。

- [ ] **Step 4: 运行测试与检查**

Run: `pnpm exec vitest run --project unit tests/unit/custom-config.test.ts`
Expected: PASS

Run: `pnpm check`
Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/core/config src/components/admin src/routes tests/unit/custom-config.test.ts
git commit -m "feat(config): 新增自定义配置 tab"
```

---

### Task 9: 文档、E2E 与全量验证

**Files:**
- Modify: `CONTEXT.md`、`AGENTS.md`
- Modify: `content/docs/configuration*.md`、`content/docs/payment*.md`
- Modify: `e2e/settings.spec.ts`、`e2e/auth.spec.ts`、`e2e/rbac.spec.ts`
- Modify: `scripts/db-seed.ts`

- [ ] **Step 1: 更新文档**

- 系统设置 9 个 tab、单保存、可折叠。
- 删除 `features.*` 与 `modules.auth`；认证三方法开关与「至少保留一个」。
- 管理台门禁为 `matchPermission('admin.*')`。
- 用户中心功能开关与模块开关的区别。
- 自定义配置仅服务端可读。
- 升级提示：执行 `pnpm db:cleanup:settings` 清理孤儿键。

- [ ] **Step 2: 更新 E2E**

- `settings.spec.ts`：断言 9 个 tab、每 tab 一个保存按钮、分组可折叠、custom tab 可增删键值。
- `auth.spec.ts`：断言关闭邮箱登录后邮箱表单消失、GitHub 按钮按配置出现。
- `rbac.spec.ts`：断言 `editor` 能进入管理台但看不到无权限菜单；普通用户 404。

- [ ] **Step 3: 全量验证**

Run: `pnpm check`
Expected: 无错误。

Run: `pnpm exec vitest run --project unit && pnpm exec vitest run --project components`
Expected: 全部通过。

Run: `pnpm test:e2e`
Expected: 全部通过。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "docs: 同步系统设置分类与权限门禁"
```
