# 订单、付款、订阅与归因 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把支付侧补齐为 `orders → payments → subscriptions` 三层，管理台付款页按「全部 / 订阅 / 一次性 / 人工核销」分 tab，核销审核改读新表，注册写入首次归因，管理台概览提供「注册 → 创建结账 → 付款」漏斗。

**Architecture:** 新增 `orders` 表记录每次结账尝试，`manual_payment_details` 与订单 1:1 承载人工核销专有字段；`payments` 保持资金事实并增加可空 `order_id`；`subscriptions` 不变。结账链路（在线与人工）都先写订单，只有渠道回调或管理员核验才写付款。归因在自定义 server entry 写首次触达 cookie，Better Auth 的 `user.create.before` 把它落到用户行。

**Tech Stack:** TanStack Start / Router、React 19、TypeScript strict、Drizzle ORM（SQLite / D1 / PostgreSQL）、Vitest、Playwright、Paraglide。

**Spec:** `CONTEXT.md`、`docs/adr/0012-orders-payments-subscriptions.md`、`docs/adr/0013-capability-switches-and-settings-taxonomy.md`

## Global Constraints

- 目标工作区：`/Users/alvinyao/Projects/saas-template-core`，分支 `refactor/core-modules`。
- 金额一律用最小货币单位（分）存整数；币种字符串小写。
- 人工核销在支付层的 provider 标识是 `manual_payments`，事件类型是 `manual_payments.settled`。
- `orders` 只描述购买意图；`payments` 只记已确认的资金事实。用户申报、结账跳转、失败支付都不得写 `payments`。
- 续费只写 `payments` 与 `subscriptions`，不写 `orders`。
- schema 是事实源：改 `schema.sqlite.ts` 与 `schema.postgres.ts` 两份，随后运行 `pnpm db:setup`；迁移产物不提交。
- 所有管理台 server function 必须在服务端重新校验权限，不能只靠菜单隐藏。
- 新增消息键必须同时写入 `messages/zh.json` 与 `messages/en.json`，改完运行 `pnpm locale:sort`。
- `src/components/ui` 只放上游原件，不本地修改。
- 提交前 `pnpm check`、`pnpm exec vitest run --project unit`、`pnpm exec vitest run --project components` 必须全绿。
- 提交消息不得包含 `Co-Authored-By` 或任何 Claude 署名。
- 结构变更与行为变更分开提交。

## Review Focus

- 订阅结账重试：同一账号重复点「订阅」时不能产生第二条 `orders`，也不能把已有预留换成新订单。
- 一次性结账失败或用户放弃：`orders` 仍要留下一条可统计的记录，否则漏斗的「创建结账」档偏低。
- 人工核销金额池：尾数唯一索引跨 `orders` / `manual_payment_details` 拆分后仍必须全局唯一，不能因为分表而失效。
- 核验重试：崩溃后重试同一订单不得写第二条 `payments`，也不得把订阅周期再往后推。
- 首次归因：已有 UTM cookie 时后续访问不得覆盖；站内跳转的 referrer 不得被记成外部来源。
- 漏斗口径：窗口内注册的用户才算 cohort；退款仍算「付过款」；续费不计入「创建结账」。

---

### Task 1: 全量改名 `collection → manualPayments`（代码与文案层）

**Files:**
- Rename: `src/types/collection.ts` → `src/types/manual-payments.ts`
- Modify: `src/modules/manual-payments/*.ts`
- Modify: `src/config/website.ts`、`src/config/products.ts`、`src/config/routes.ts`、`src/config/admin-nav.ts`、`src/config/settings-nav.ts`、`src/config/service-status.ts`
- Modify: `src/core/config/registry.ts`、`src/core/config/settings.ts`、`src/core/config/derive.ts`
- Modify: `src/core/db/schema.sqlite.ts`、`src/core/db/schema.postgres.ts`（只改表名与常量名）
- Modify: `messages/zh.json`、`messages/en.json`
- Modify: `scripts/db-seed.ts`
- Rename: `src/routes/{-$locale}/_layout/admin/collection-orders.tsx` → `admin/manual-payments.tsx`
- Rename: `src/routes/{-$locale}/_layout/settings/orders.tsx` → `settings/manual-payments.tsx`，`settings/orders/index.tsx` → `settings/manual-payments/index.tsx`，`settings/orders/$orderId.tsx` → `settings/manual-payments/$orderId.tsx`
- Rename: `src/routes/api/collection/**` → `src/routes/api/manual-payments/**`
- Rename: `scripts/e2e-seed-collection.ts` → `scripts/e2e-seed-manual-payments.ts`；`e2e/collection.spec.ts` → `e2e/manual-payments.spec.ts`
- Test: `tests/unit/naming-manual-payments.test.ts`

**Interfaces:**
- Produces: 下列新名字，供后续任务引用：
  - 类型：`ManualPaymentOrder`、`ManualPaymentOrderStatus`、`ManualPaymentError`、`ManualPaymentReview`、`ManualPaymentReviewAction`、`ManualPaymentPrice`、`ManualPaymentAccountConfig`、`ManualPaymentChannel`
  - 常量：`MANUAL_PAYMENT_PROVIDER = 'manual_payments'`、`MANUAL_PAYMENT_SETTLEMENT_EVENT_TYPE = 'manual_payments.settled'`、`MANUAL_PAYMENT_ORDER_TTL_SECONDS`
  - 配置键：`modules.manualPayments`、`manualPayments.verificationSlaHours`、`manualPayments.accounts`、`payment.checkoutMode` 取值 `'manual_payments'`
  - 路由：`adminRoutes.manualPayments = '/{-$locale}/admin/manual-payments'`、`settingsRoutes.manualPayments = '/{-$locale}/settings/manual-payments'`
  - 消息键前缀：`manual_payments.*`、`manual_payments_admin.*`

- [ ] **Step 1: 写失败测试**

`tests/unit/naming-manual-payments.test.ts` 扫描 `src/modules/manual-payments`、`src/config`、`src/types`、`messages/zh.json`，断言不再出现旧标识符。允许的例外只有 `content-collections`、`normalize-content-collections` 与历史 ADR 文案。

```ts
const LEGACY =
  /\bCollection(Order|Error|Review|Price|Account|Channel|Status)\b|\bcollection(Accounts|Orders|Prices|ConfigErrors|AccountJson|PayerNote|SubscriptionId|SettlementEventId|QrSrc|OrderErrorMessage)\b|COLLECTION_|'collection'|"collection"|collection\./
```

断言每个被扫描文件都不匹配 `LEGACY`。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run --project unit tests/unit/naming-manual-payments.test.ts`
Expected: FAIL，报告首个旧标识符所在文件。

- [ ] **Step 3: 按映射表执行改名**

| 旧 | 新 |
|---|---|
| `CollectionOrder` | `ManualPaymentOrder` |
| `CollectionOrderStatus` | `ManualPaymentOrderStatus` |
| `CollectionError` / `CollectionErrorCode` | `ManualPaymentError` / `ManualPaymentErrorCode` |
| `CollectionReview*` | `ManualPaymentReview*` |
| `CollectionPrice` / `CollectionChannel` / `CollectionAccountConfig` | `ManualPaymentPrice` / `ManualPaymentChannel` / `ManualPaymentAccountConfig` |
| `COLLECTION_PROVIDER` / `COLLECTION_*` | `MANUAL_PAYMENT_PROVIDER` / `MANUAL_PAYMENT_*` |
| `collection.*` 配置键 | `manualPayments.*` |
| `modules.collection` | `modules.manualPayments` |
| `collection.*` / `collection_admin.*` 消息键 | `manual_payments.*` / `manual_payments_admin.*` |
| `/admin/collection-orders` | `/admin/manual-payments` |
| `/settings/orders*` | `/settings/manual-payments*` |
| `/api/collection/*` | `/api/manual-payments/*` |
| `provider = 'collection'` | `provider = 'manual_payments'` |
| `schema.collectionOrders` / 表 `collection_orders` | `schema.manualPaymentOrders` / 表 `manual_payment_orders` |
| `schema.collectionAccounts` / 表 `collection_accounts` | `schema.manualPaymentAccounts` / 表 `manual_payment_accounts` |

`collectionPrices` → `manualPaymentPrices`；`resolveCollectionPrice` → `resolveManualPaymentPrice`；`collectionConfigErrors` → `manualPaymentConfigErrors`。

本任务只改名字，不拆分表结构；`manual_payment_orders` 在 Task 4 被新表取代后删除。

- [ ] **Step 4: 运行测试与检查**

Run: `pnpm exec vitest run --project unit tests/unit/naming-manual-payments.test.ts`
Expected: PASS

Run: `pnpm locale:sort && pnpm check`
Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor: 将 collection 全量改名为 manualPayments"
```

---

### Task 2: 新增 `orders` / `manual_payment_details`，改造 `payments` 与 `users`

**Files:**
- Modify: `src/core/db/schema.sqlite.ts`
- Modify: `src/core/db/schema.postgres.ts`
- Test: `tests/unit/orders-schema.test.ts`

**Interfaces:**
- Produces:
  - `schema.orders`：`id`、`orderNo`、`userId`、`provider`、`mode`、`productId`、`offerId`、`amount`、`currency`、`status`、`providerSessionId`、`providerUrl`、`expiresAt`、`createdAt`、`updatedAt`
  - `schema.manualPaymentDetails`：`orderId`（PK/FK）、`userId`、`accountId`、`channel`、`qrImageUrl`、`qrImageKey`、`baseAmount`、`fingerprint`、`payableAmount`、`currency`、`status`、`payerNote`、`receiptKey`、`submittedAt`、`observedAmount`、`externalReference`、`reviewNote`、`reviewedBy`、`reviewedAt`、`expiresAt`、`settledAt`、`createdAt`、`updatedAt`
  - `schema.payments.orderId`：可空外键，指向 `orders.id`，`onDelete: 'set null'`
  - `schema.users` 归因列：`utmSource`、`utmMedium`、`utmCampaign`、`utmTerm`、`utmContent`、`referrer`、`country`、`ip`、`locale`，均 `text` 默认 `''`
  - `schema.checkoutReservations.orderId`：可空，指向 `orders.id`
  - `orders.status` 的取值集合与 Task 3 的 `OrderStatus` 一致；类型定义只放在 Task 3，schema 不重复声明。

- [ ] **Step 1: 写失败测试**

`tests/unit/orders-schema.test.ts` 用 `createTestDatabase()` 后查 `PRAGMA table_info` 与 `PRAGMA index_list`：

```ts
expect(columns('orders')).toContain('order_no')
expect(columns('manual_payment_details')).toContain('payable_amount')
expect(columns('payments')).toContain('order_id')
expect(columns('users')).toContain('utm_source')
expect(indexes('manual_payment_details')).toContain('manual_payment_details_active_amount_unique')
expect(indexes('manual_payment_details')).toContain('manual_payment_details_settling_user_unique')
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm db:setup && pnpm exec vitest run --project unit tests/unit/orders-schema.test.ts`
Expected: FAIL，表或列不存在。

- [ ] **Step 3: 改两份 schema**

保留 Task 1 改名后的 `manualPaymentAccounts` / `manualPaymentOrders`（它们仍是当前运行期表），新增：

- `orders`：`orderNo` 唯一；索引 `(userId, createdAt)`、`(status, createdAt)`、`(provider, providerSessionId)` 唯一且仅非空。
- `manual_payment_details`：主键 `orderId`；`userId` 冗余列用于结算临界区索引；`activeAmountUnique` 在 `(accountId, payableAmount)` 上、条件 `status IN ('pending_payment','pending_verification','settling')`；`settlingUserUnique` 在 `(userId)` 上、条件 `status = 'settling'`。
- `payments`：加 `orderId` 与索引 `(orderId)`。
- `checkout_reservations`：加 `orderId`。
- `users`：加九个归因列。

SQLite 与 PostgreSQL 两份必须同构（列名、索引名、条件一致）。

- [ ] **Step 4: 重新生成 schema 与基线迁移**

Run: `pnpm db:setup && pnpm exec vitest run --project unit tests/unit/orders-schema.test.ts`
Expected: PASS

Run: `pnpm check`
Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/core/db tests/unit/orders-schema.test.ts
git commit -m "feat(db): 新增 orders 与 manual_payment_details 表"
```

---

### Task 3: 在线结账写订单（订阅与一次性都写）

**Files:**
- Create: `src/modules/subscriptions/orders.ts`
- Modify: `src/modules/subscriptions/checkout.ts`
- Modify: `src/modules/subscriptions/service.ts`
- Test: `tests/unit/checkout-orders.test.ts`

**Interfaces:**
- Produces:
  - `export type OrderStatus = 'created' | 'open' | 'completed' | 'expired' | 'canceled' | 'failed'`
  - `export function newOrderNo(now?: Date): string`
  - `export async function createCheckoutOrder(db: DB, input: { userId: string; provider: string; productId: string; offerId: string; mode: 'subscription' | 'payment' }, now?: Date): Promise<{ id: string; orderNo: string }>`
  - `export async function markOrderOpen(db: DB, orderId: string, session: { sessionId: string; url: string; expiresAt: number }): Promise<void>`
  - `export async function markOrderStatus(db: DB, orderId: string, status: OrderStatus): Promise<void>`
  - `export async function findOrderBySessionId(db: DB, provider: string, sessionId: string): Promise<{ id: string } | undefined>`
- `beginCheckout` 行为：
  - `mode === 'payment'`：先 `createCheckoutOrder`，再调 `provider.createCheckoutSession`，成功后 `markOrderOpen`；provider 抛错时 `markOrderStatus(..., 'failed')` 后原样抛出。
  - `mode === 'subscription'`：首次创建预留时同时创建订单并把 `orderId` 写进 `checkout_reservations`；已有预留时复用其 `orderId`，不得新建。渠道 session 创建成功后 `markOrderOpen`。

- [ ] **Step 1: 写失败测试**

用假 provider 驱动 `beginCheckout`：

```ts
it('一次性结账写一条订单并在成功后标记 open', ...)
it('订阅结账写订单，重试复用同一订单', ...)
it('渠道创建失败时订单标记 failed', ...)
```

断言 `orders` 行数、`status`、`provider_session_id` 与 `checkout_reservations.order_id`。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run --project unit tests/unit/checkout-orders.test.ts`
Expected: FAIL，`orders` 表无行。

- [ ] **Step 3: 实现**

`newOrderNo` 生成 `ord_<UTC yyyyMMddHHmmss>_<8 位随机>`，插入冲突时重试一次。订单 `status` 初值 `created`，`mode` 用 `input.mode`，`amount` / `currency` 留空（渠道价格目录才是金额事实源）。

- [ ] **Step 4: 运行测试与检查**

Run: `pnpm exec vitest run --project unit tests/unit/checkout-orders.test.ts`
Expected: PASS

Run: `pnpm check`
Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/modules/subscriptions tests/unit/checkout-orders.test.ts
git commit -m "feat(payment): 在线结账写入订单"
```

---

### Task 4: 人工核销订单改写入 `orders` + `manual_payment_details`

**Files:**
- Modify: `src/modules/manual-payments/orders.ts`
- Modify: `src/modules/manual-payments/types.ts`
- Modify: `src/modules/manual-payments/settlement.ts`
- Test: `tests/unit/manual-payments-orders.test.ts`（由原 collection 测试改名）

**Interfaces:**
- Consumes: `schema.orders`、`schema.manualPaymentDetails`（Task 2）
- Produces:
  - `ManualPaymentOrder` 领域视图增加 `orderNo: string` 与 `userId: string`
  - `createOrder(db, input, now?)` 先插入 `orders`（`status='open'`、`provider='manual_payments'`、`mode` 由价格 kind 决定），再插入 `manual_payment_details`（`status='pending_payment'`）
  - `toManualPaymentOrder(order, detail)` 组合两行
  - `listAllOrders` 返回 `{ rows: AdminManualPaymentOrder[]; total: number }`，`AdminManualPaymentOrder` 含 `email`
  - 状态同步：`expired` → 订单 `expired`；`canceled` → `canceled`；`rejected` → `failed`；`settled` → `completed`；`requires_refund` → `failed`

- [ ] **Step 1: 写失败测试**

```ts
it('创建订单同时写 orders 与 manual_payment_details', ...)
it('同一账户下两个活跃订单的应付金额不同', ...)
it('订单过期同步把 orders 标记为 expired', ...)
it('管理员列表按订单状态筛选并带买家邮箱', ...)
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm db:setup && pnpm exec vitest run --project unit tests/unit/manual-payments-orders.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现两表写入与状态同步**

金额池仍按「随机起点 + 环形扫描 + 直接 INSERT 让唯一索引判定」实现；唯一索引现在在 `manual_payment_details`。`manual_payment_details.userId` 与 `orders.userId` 必须同时写入，结算临界区索引才能生效。

代码全部切到新表后，删除两份 schema 里的 `manualPaymentOrders` 定义，并运行 `pnpm db:setup` 重新生成基线；`manualPaymentAccounts` 保留（它仍是收款账户表）。

- [ ] **Step 4: 运行测试**

Run: `pnpm exec vitest run --project unit tests/unit/manual-payments-orders.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/modules/manual-payments tests/unit/manual-payments-orders.test.ts
git commit -m "feat(manual-payments): 订单改写入 orders 与核销详情表"
```

---

### Task 5: 结算写 `payments.order_id` 与 `provider='manual_payments'`

**Files:**
- Modify: `src/core/payment/types.ts`
- Modify: `src/modules/subscriptions/events.ts`
- Modify: `src/modules/manual-payments/settlement.ts`
- Test: `tests/unit/manual-payments-settlement.test.ts`

**Interfaces:**
- `PaymentEvent` 增加 `orderId?: string | null`
- `applyPaymentEvent` 写 `payments.orderId = event.orderId ?? null`
- `buildSettlementEvent(order, review, amount, period)` 设置 `provider: MANUAL_PAYMENT_PROVIDER`、`type: MANUAL_PAYMENT_SETTLEMENT_EVENT_TYPE`、`orderId: order.id`
- 在线支付事件：若 `event.checkoutId` 存在，用 `findOrderBySessionId` 解析 `orderId`；解析成功时把对应订单标记 `completed`

- [ ] **Step 1: 写失败测试**

```ts
it('人工核销结算写 payments 且 order_id 指向订单', ...)
it('结算事件重复应用只写一条 payments', ...)
it('在线支付事件带 checkoutId 时关联订单并标记 completed', ...)
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run --project unit tests/unit/manual-payments-settlement.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现事件字段与落库**

`payments.id` 仍用 `${provider}:${payment.id}`；人工核销的 `payment.id` 是订单 id，`externalId` 同为订单 id。不要给 `payments.order_id` 加唯一约束（同一订单理论上可有多条补款记录）。

- [ ] **Step 4: 运行测试**

Run: `pnpm exec vitest run --project unit tests/unit/manual-payments-settlement.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/payment/types.ts src/modules/subscriptions/events.ts src/modules/manual-payments/settlement.ts tests/unit/manual-payments-settlement.test.ts
git commit -m "feat(payment): 付款关联订单并统一人工核销 provider"
```

---

### Task 6: 管理台「付款」页按四个 tab 展示

**Files:**
- Rename: `src/routes/{-$locale}/_layout/admin/orders.tsx` → `admin/payments.tsx`
- Modify: `src/modules/subscriptions/admin-orders.ts`（改名导出）
- Modify: `src/modules/subscriptions/service.ts`
- Modify: `src/config/routes.ts`（`adminRoutes.orders` → `adminRoutes.payments`）
- Modify: `src/config/admin-nav.ts`
- Test: `tests/unit/admin-payments.test.ts`

**Interfaces:**
- `export type AdminPaymentTab = 'all' | 'subscription' | 'one_time' | 'manual_payments'`
- `export interface AdminPaymentsQuery { tab?: AdminPaymentTab; status?: AdminOrderStatusFilter; limit?: number; offset?: number }`
- `export async function queryAdminPayments(db, query): Promise<AdminOrdersResult>`
- `export const fetchAdminPayments = createServerFn(...)`
- 过滤规则：
  - `subscription`：`payments.type = 'subscription'`
  - `one_time`：`payments.type = 'one_time'` 且 `payments.provider != 'manual_payments'`
  - `manual_payments`：`payments.provider = 'manual_payments'`
  - `all`：不过滤类型
- `AdminOrder` 增加 `orderId: string | null`
- 页面：URL 参数 `tab`、`status`、`page`；tab 用 `src/components/ui/tabs`；退款按钮只在 `provider` 为 `stripe` / `creem` 时渲染。

- [ ] **Step 1: 写失败测试**

```ts
it('subscription tab 只返回订阅付款', ...)
it('one_time tab 排除人工核销付款', ...)
it('manual_payments tab 只返回人工核销付款', ...)
it('状态筛选与类型筛选叠加', ...)
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run --project unit tests/unit/admin-payments.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现查询与页面**

`queryAdminPayments` 用 `and(...)` 组合条件；计数查询复用同一 `where`。页面 tab 值写进 URL，默认 `all` 不写。人工核销行不显示退款按钮。

同时核对订阅入口：`admin/subscriptions` 页面与 `fetchAdminSubscriptions` 保持独立，菜单分组顺序为「付款 / 订阅 / 核销审核」。`adminRoutes.orders` 的全部引用改为 `adminRoutes.payments`（用 `grep -rn "adminRoutes.orders" src tests` 收尾）。

- [ ] **Step 4: 运行测试与检查**

Run: `pnpm exec vitest run --project unit tests/unit/admin-payments.test.ts`
Expected: PASS

Run: `pnpm check`
Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/routes src/modules/subscriptions src/config tests/unit/admin-payments.test.ts
git commit -m "feat(admin): 付款页按类型分 tab 展示"
```

---

### Task 7: 管理台「核销审核」页改读订单与核销详情

**Files:**
- Rename: `src/routes/{-$locale}/_layout/admin/manual-payments.tsx`（Task 1 已改名）
- Modify: `src/modules/manual-payments/server.ts`
- Modify: `src/modules/manual-payments/server-logic.ts`
- Modify: `src/config/admin-nav.ts`
- Test: `tests/unit/manual-payments-server.test.ts`

**Interfaces:**
- 路由 `/admin/manual-payments`，菜单标题「核销审核」
- `adminListOrders` / `adminReviewOrder` / `adminSaveAccount` 的权限检查从「`role === 'admin'`」改为 `requirePermissionDb('admin.orders.read')` / `('admin.orders.write')`
- 页面 loader 同时取订单列表与收款账户；订单列表行含 `orderNo`、`email`、`payableAmount`、`status`、`submittedAt`
- 默认筛选 `pending_verification` 不写 URL；「全部」保留在 URL

- [ ] **Step 1: 写失败测试**

```ts
it('没有 admin.orders.read 权限的管理员拿到 403', ...)
it('editor 只有内容权限时不能读取核销队列', ...)
it('管理员列表返回 orderNo 与买家邮箱', ...)
it('核验通过后订单状态为 settled 且 payments.order_id 指向订单', ...)
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run --project unit tests/unit/manual-payments-server.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现权限与查询**

`guardManualPaymentRequest` 增加 `requiredPermission?: string`，用 `getUserPermissions` + `matchPermission` 判定；没有权限返回 403 `Response`，不回空数据。

- [ ] **Step 4: 运行测试**

Run: `pnpm exec vitest run --project unit tests/unit/manual-payments-server.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/routes src/modules/manual-payments src/config tests/unit/manual-payments-server.test.ts
git commit -m "feat(admin): 核销审核改读订单并走权限点"
```

---

### Task 8: 首次归因写入用户行

**Files:**
- Create: `src/lib/attribution.ts`
- Modify: `src/server.ts`
- Modify: `src/core/auth/auth.ts`
- Test: `tests/unit/attribution.test.ts`、`tests/unit/auth-attribution.test.ts`

**Interfaces:**
- `export const UTM_COOKIE_KEYS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'] as const`
- `export const REFERRER_COOKIE = 'first_referrer'`
- `export function sanitizeUtm(value: string): string`
- `export function sanitizeReferrer(value: string, selfHosts?: string[]): string`
- `export function getCountryFromHeaders(headers: Headers): string`
- `export function getClientIpFromHeaders(headers: Headers): string`
- `export function guessLocaleFromAcceptLanguage(value: string | null): string`
- `export function attributionCookieHeaders(request: Request): string[]`
- `export function readAttribution(headers: Headers): { utmSource: string; utmMedium: string; utmCampaign: string; utmTerm: string; utmContent: string; referrer: string; country: string; ip: string; locale: string }`

行为：
- UTM cookie：请求 URL 有参数且请求里没有同名 cookie 时写 `Set-Cookie`，`Max-Age=2592000; Path=/; SameSite=Lax`。
- referrer cookie：仅 `GET`、`Accept` 含 `text/html`、且没有 `first_referrer` cookie 时写；`sanitizeReferrer` 去掉 query/hash，过滤同站 host。
- `readAttribution` 从请求 cookie 解码并再次清洗，country 取 `cf-ipcountry`，ip 优先 `cf-connecting-ip`。

- [ ] **Step 1: 写失败测试**

```ts
it('sanitizeUtm 保留字母数字与 ._-，截断到 100', ...)
it('sanitizeReferrer 去掉 query 与同站来源', ...)
it('已有 utm cookie 时不重复写 Set-Cookie', ...)
it('站内跳转的 referrer 不写 cookie', ...)
it('readAttribution 解码 cookie 并归一 country', ...)
it('user.create.before 把归因写进 data', ...)
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run --project unit tests/unit/attribution.test.ts tests/unit/auth-attribution.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

`src/server.ts` 在 `paraglideMiddleware` 返回后追加 `attributionCookieHeaders(request)` 的 `Set-Cookie`；响应头不可变时先复制一份再追加。

`src/core/auth/auth.ts`：
- `user.additionalFields` 声明九个字段，全部 `input: false`、`required: false`、默认 `''`。
- `databaseHooks.user.create.before` 用 `readAttribution(ctx.headers)` 合并进 `data`；`ctx` 无 headers 时回退空值，不得抛错。

- [ ] **Step 4: 运行测试**

Run: `pnpm exec vitest run --project unit tests/unit/attribution.test.ts tests/unit/auth-attribution.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/attribution.ts src/server.ts src/core/auth tests/unit/attribution.test.ts tests/unit/auth-attribution.test.ts
git commit -m "feat(auth): 注册写入首次触达归因"
```

---

### Task 9: 转化漏斗与管理台概览

**Files:**
- Create: `src/modules/subscriptions/admin-funnel.ts`
- Create: `src/modules/subscriptions/admin-overview.ts`
- Modify: `src/modules/subscriptions/service.ts`
- Modify: `src/routes/{-$locale}/_layout/admin/index.tsx`
- Create: `src/routes/{-$locale}/_layout/admin/-conversion-funnel.tsx`
- Test: `tests/unit/funnel.test.ts`、`tests/unit/admin-overview.test.ts`

**Interfaces:**
- `export const FUNNEL_RANGES = { '24h': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000 } as const`
- `export type FunnelRange = keyof typeof FUNNEL_RANGES`
- `export const FUNNEL_DIMENSIONS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','referrer','country'] as const`
- `export interface FunnelCounts { signups: number; checkouts: number; paid: number }`
- `export interface FunnelReport { totals: FunnelCounts; rows: Array<FunnelCounts & { value: string }>; options: Record<FunnelDimension, string[]> }`
- `export async function getFunnelReport(db, input: { range: FunnelRange; groupBy: FunnelDimension; filters?: Partial<Record<FunnelDimension, string>> }): Promise<FunnelReport>`
- `export interface AdminOverview { users: { total: number; new24h: number }; revenue30d: { amount: number; currency: string }; activeSubscriptions: number; pendingManualReviews: number; funnel: FunnelReport; recentPayments: AdminOrder[]; todos: { pendingManualReviews: number; openTickets: number; failedPayments24h: number } }`
- `export const fetchAdminOverview = createServerFn(...)`

口径：
- cohort = 窗口内注册的用户（`users.created_at >= since`）。
- `checkouts` = cohort 中在 `orders` 有任意行的用户数；续费不写 `orders`，自然排除。
- `paid` = cohort 中在 `payments` 有 `status IN ('paid','refunded','partially_refunded')` 的用户数。
- 分组维度空值显示为 `direct`（查询层把 `''` 归一为 `direct`，筛选 `direct` 时匹配 `''`）。

- [ ] **Step 1: 写失败测试**

```ts
it('窗口内注册的用户计入 signups', ...)
it('创建过结账但未付款只计入 checkouts', ...)
it('退款用户仍计入 paid', ...)
it('按 utm_source 分组，空值归一为 direct', ...)
it('概览返回 KPI、漏斗、最近付款与待办', ...)
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run --project unit tests/unit/funnel.test.ts tests/unit/admin-overview.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现查询与概览**

`getFunnelReport` 一次 `users LEFT JOIN orders LEFT JOIN payments`，用 `count(distinct users.id)` 分档；`rows` 按分组列分组，`options` 对每个维度取前 50 个非空值。

`fetchAdminOverview` 权限用 `requirePermissionDb('admin.orders.read')`；KPI 与待办可并行查询。

- [ ] **Step 4: 实现概览 UI**

`admin/index.tsx` 改为：4 张 KPI 卡（总用户 / 24h 新增、30 天营收、活跃订阅、待核销）、`ConversionFunnel`（范围切换 24h/7d/30d + 维度下拉 + 三档条形）、最近付款表（复用 `AdminOrder` 列定义）、待办卡。所有 `m.*()` 在渲染期求值。

- [ ] **Step 5: 运行测试与检查**

Run: `pnpm exec vitest run --project unit tests/unit/funnel.test.ts tests/unit/admin-overview.test.ts`
Expected: PASS

Run: `pnpm check`
Expected: 无错误。

- [ ] **Step 6: 提交**

```bash
git add src/modules/subscriptions src/routes tests/unit
git commit -m "feat(admin): 新增转化漏斗与概览 KPI"
```

---

### Task 10: 文档、E2E 与全量验证

**Files:**
- Modify: `CONTEXT.md`、`AGENTS.md`、`content/docs/payment*.md`、`content/docs/configuration*.md`、`content/docs/project-structure*.md`
- Modify: `e2e/manual-payments.spec.ts`、`e2e/payment.spec.ts`、`e2e/settings.spec.ts`
- Modify: `scripts/e2e-seed-manual-payments.ts`、`scripts/db-seed.ts`

- [ ] **Step 1: 更新文档**

文档里只保留新名字：`manualPayments`、`orders`、`manual_payment_details`、`manual_payments` provider。删除对 `collection_orders` 的引用；历史 ADR 保留原文，但在 `CONTEXT.md` 标注改名。

- [ ] **Step 2: 更新 E2E**

- `manual-payments.spec.ts`：路由与文案用新名字；断言用户下单后 `orders` 与 `manual_payment_details` 都有行。
- `payment.spec.ts`：断言付款页四个 tab 可见，人工核销 tab 只出现 `manual_payments` 行，且没有退款按钮。
- `settings.spec.ts`：系统设置页 tab 名称按新分类断言（本任务的设置部分由下一份 plan 完成，先只改与支付相关的 tab 名称）。

- [ ] **Step 3: 全量验证**

Run: `pnpm check`
Expected: 无错误。

Run: `pnpm exec vitest run --project unit && pnpm exec vitest run --project components`
Expected: 全部通过。

Run: `pnpm test:e2e`
Expected: 全部通过；本地 D1 写竞争导致的偶发失败按 `e2e-local-d1-write-contention` 重试。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "docs: 同步订单、付款与归因模型"
```
