# QR Code Collection Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加一个可选的 `collection` 模块，让登录用户按带唯一尾数的订单金额向支付宝个人收款码付款，由管理员人工核验后复用现有支付事件持久化完成一次性购买或手动续费。

**Architecture:** `collection_orders` 保存购买意图与核验状态，`payments` / `subscriptions` 继续只保存已核验的资金事实。核验型链路不实现 `PaymentProvider`；管理员通过后合成 `provider='collection'` 的 `PaymentEvent` 交给 `applyPaymentEvent`。收款账户以源码配置兜底、D1 运营覆盖，二维码与付款凭证可选存 R2。

**Tech Stack:** TypeScript strict、TanStack Start / Router、React 19、Drizzle ORM + Cloudflare D1、R2 native binding、Zod、Paraglide、Vitest、Playwright、shadcn/ui（Base UI）。

**Spec:** `docs/superpowers/specs/2026-11-05-qrcode-collection-design.md`

## Global Constraints

- 默认 `checkout.mode='provider'`、`collection.enabled=false`，升级后不能改变现有实例的购买行为。
- 首期渠道固定 `alipay`、币种固定 `cny`；金额全部以分为单位的整数保存。
- 订单有效期精确为 `15 * 60` 秒；尾数只允许 `1..99`。
- 同一收款账户处于 `pending_payment`、`pending_verification`、`settling` 的应付金额必须全局唯一，由数据库 partial unique index 兜底。
- 用户申报与付款截图不能写 `payments`、订阅或权益；只有管理员核验能触发结算。
- 核销型支付不实现 `PaymentProvider`，不新增 npm 依赖、cron、queue、secret 或外部 API。
- 订阅不自动扣款；同 offer 通过再次下单手动延长，其他占位订阅冲突转 `requires_refund`。
- 复用 `src/payment/events.ts` 落库，结算事件固定 `provider='collection'`、`id='order:{orderId}:settled'`。
- 二维码 / 凭证只允许 JPG、PNG、WebP；二维码 ≤2 MiB，凭证 ≤5 MiB；必须同时校验 MIME 与 magic bytes。
- 新增 i18n key 必须同时写入 `messages/zh.json`、`messages/en.json` 并运行 `pnpm locale:sort`。
- 不手改 `src/routeTree.gen.ts`、`src/locale/paraglide/**`、`.content-collections/generated/**`。
- `src/components/ui` 只使用上游组件，不本地修改。
- schema 变更由 `pnpm db:generate` 生成，核对 `meta/_journal.json` 从当前 `0008` 正确追加；schema / migration 作为独立结构提交，不与行为变更混提。
- 每个任务完成后运行该任务测试；最终运行 `pnpm check`、unit、components、workers 与 E2E。

## Review Focus

- **并发金额分配**：两个请求同时从同一账户 / 同一价格创建订单时，应由 partial unique index 保证不重号；Task 3 的并发测试固定。
- **15 分钟边界**：`expiresAt === now` 必须已过期，不能申报；过期订单释放尾数；Task 4 的时钟边界测试固定。
- **越权访问**：其他用户读取订单 / 凭证统一表现为 `ORDER_NOT_FOUND`，非 admin 不能核验或改收款账户；Task 6、7 的权限测试固定。
- **结算中途失败**：付款事件已落库但订单未标记 `settled` 时，同订单重试只能补状态，不能重复付款 / 续期；Task 5 的故障恢复测试固定。
- **订阅冲突与月末**：同 offer 手动续期从较晚日期延长，1 月 31 日按 UTC 夹到 2 月末；其他 provider / offer 的占位订阅转 `requires_refund`；Task 5 的订阅矩阵测试固定。

---

## File Map

### 新建

- `src/collection/types.ts`：collection 配置、订单状态、领域输入 / 输出类型。
- `src/collection/pricing.ts`：本地价格解析、校验与通用币种格式化。
- `src/collection/accounts.ts`：配置兜底 + D1 覆盖的收款账户解析。
- `src/collection/orders.ts`：金额分配、订单状态机与查询。
- `src/collection/settlement.ts`：核验、订阅周期计算、`PaymentEvent` 合成与结算恢复。
- `src/collection/server.ts`：用户 / 管理员 server functions、鉴权、门禁、限流。
- `src/collection/files.ts`：图片 magic bytes / 大小校验。
- `src/collection/client.ts`：浏览器端创建订单并归一化错误。
- `src/routes/{-$locale}/_layout/dashboard/orders.tsx`：用户订单列表。
- `src/routes/{-$locale}/_layout/dashboard/orders/$orderId.tsx`：订单详情、申报与轮询。
- `src/routes/{-$locale}/_layout/dashboard/admin/orders.tsx`：待核验队列与收款账户管理。
- `src/routes/api/collection/orders/$orderId/receipt.ts`：凭证上传 / 授权读取。
- `src/routes/api/collection/accounts/$accountId/qrcode.ts`：二维码上传 / 授权读取。
- `tests/unit/collection-config.test.ts`、`collection-orders.test.ts`、`collection-settlement.test.ts`、`collection-server.test.ts`、`collection-files.test.ts`。
- `tests/components/collection-order.test.tsx`、`collection-admin.test.tsx`。
- `e2e/collection.spec.ts`、`scripts/e2e-seed-collection.ts`。
- `content/docs/payment-collection.zh.md`、`content/docs/payment-collection.md`。

### 修改

- `src/types/pricing.ts`、`src/config/products.ts`：`collectionPrices`。
- `src/config/website.ts`、`src/env/public.ts`、`src/config/service-status.ts`：模块、结账模式、账户配置与诊断。
- `scripts/init/plan.ts`、`scripts/init/questions.ts`：init 模块选择与结账模式。
- `src/db/schema.ts`、`src/db/migrations/**`：两张 collection 表与索引。
- `src/payment/types.ts`、`src/payment/events.ts`：订阅直接归属字段。
- `src/storage/provider/r2.ts`：collection 文件夹白名单。
- `src/config/settings.ts`：用户订单与管理员订单导航。
- `src/routes/{-$locale}/index.tsx`、`src/components/marketing/LandingPage.tsx`：按 checkout mode 取价与分流。
- `messages/zh.json`、`messages/en.json`：页面 / 状态 / 风险告知文案。
- `content/docs/payment.zh.md`、`content/docs/payment.md`、`content/docs/configuration.zh.md`、`content/docs/configuration.md`、`content/docs/environment.zh.md`、`content/docs/environment.md`：接入说明。

---

### Task 1: Collection 配置、商品价格与模块门禁

**Files:**
- Create: `src/collection/types.ts`
- Create: `src/collection/pricing.ts`
- Modify: `src/types/pricing.ts`
- Modify: `src/config/products.ts`
- Modify: `src/config/website.ts`
- Modify: `src/env/public.ts`
- Modify: `src/config/service-status.ts`
- Modify: `scripts/init/plan.ts`
- Modify: `scripts/init/questions.ts`
- Test: `tests/unit/collection-config.test.ts`
- Test: `tests/unit/env.test.ts`
- Test: `tests/unit/service-status.test.ts`
- Test: `tests/unit/init-modules.test.ts`
- Test: `tests/unit/module-access.test.ts`

**Interfaces:**
- Produces: `CollectionPrice`, `CollectionAccountConfig`, `CheckoutMode`, `resolveCollectionPrice(productId, offerId)`, `collectionConfigErrors(products?)`, `formatMoneyAmount(amount, currency, locale?)`。
- Produces: `websiteConfig.checkout.mode`、`websiteConfig.collection`、`ServiceModule` 新成员 `'collection'`、公开 env `VITE_CHECKOUT_MODE`。
- Consumes: 现有 `ProductDefinition`、`getProducts()`、`applyEnvOverrides()`、`getServiceStatuses()`。

- [x] **Step 1: 写配置与价格失败测试**

```ts
it('解析 CNY collection price 且金额只接受正整数', () => {
  expect(resolveCollectionPrice('template', 'once')).toMatchObject({
    currency: 'cny', kind: 'one_time', amount: 18_000,
  })
  expect(collectionConfigErrors([invalidFractionalProduct])).toContain(
    'invalidCollectionAmount.template.once',
  )
})

it('VITE_CHECKOUT_MODE 覆盖源码默认值且默认仍为 provider', () => {
  expect(createWebsiteConfig(baseEnv).checkout.mode).toBe('provider')
  expect(createWebsiteConfig({ ...baseEnv, VITE_CHECKOUT_MODE: 'collection' }).checkout.mode)
    .toBe('collection')
})

it('collection checkout 缺模块、价格或账户时为 incomplete', () => {
  expect(statusFor({ mode: 'collection', enabled: false }).collection.state).toBe('disabled')
  expect(statusFor({ mode: 'collection', accounts: [] }).collection.state).toBe('incomplete')
})
```

同时在 `init-modules.test.ts` 断言 `collection` 出现在 `MODULE_NAMES`，init 选择 collection 时把 `checkout.mode` 写成 `'collection'`；`module-access.test.ts` 断言关闭时页面门禁 404。

- [x] **Step 2: 运行测试确认 Red**

Run: `pnpm exec vitest run --project unit tests/unit/collection-config.test.ts tests/unit/env.test.ts tests/unit/service-status.test.ts tests/unit/init-modules.test.ts tests/unit/module-access.test.ts`

Expected: FAIL，缺少 collection 类型 / 配置 / env 枚举。

- [x] **Step 3: 实现配置接口与本地价格解析**

在 `src/collection/types.ts` 定义：

```ts
export type CheckoutMode = 'provider' | 'collection'
export type CollectionChannel = 'alipay'
export interface CollectionPrice {
  amount: number
  currency: 'cny'
  kind: 'subscription' | 'one_time'
  interval?: 'month' | 'year'
  intervalCount?: number
}
export interface CollectionAccountConfig {
  id: string
  channel: CollectionChannel
  displayName: string
  currency: 'cny'
  qrImageUrl: string
}
```

扩展 `ProductDefinition.collectionPrices?`；在 `products.ts` 给实例目标 offer 配置明确的 CNY 价格，并导出 `resolveCollectionPrice()`。验证正整数、订阅周期、账户 ID 唯一、二维码 URL 为根路径或无凭据 HTTPS。

`websiteConfig` 默认 provider 模式与 collection disabled；`applyEnvOverrides()` 处理 `VITE_CHECKOUT_MODE` 与 `VITE_MODULES` 中的 collection。ServiceStatus 在 collection 启用时检查目标价格、账户与 `checkout.mode` 的一致性；R2 不参与完整性判定。

- [x] **Step 4: 运行测试确认 Green**

Run: 与 Step 2 相同。

Expected: PASS。

- [x] **Step 5: 跑格式化并提交单一行为变更**

```bash
pnpm locale:sort
pnpm exec biome check --write src/collection/types.ts src/collection/pricing.ts src/types/pricing.ts src/config/products.ts src/config/website.ts src/env/public.ts src/config/service-status.ts scripts/init/plan.ts scripts/init/questions.ts tests/unit/collection-config.test.ts tests/unit/env.test.ts tests/unit/service-status.test.ts tests/unit/init-modules.test.ts tests/unit/module-access.test.ts
git add src/collection src/types/pricing.ts src/config/products.ts src/config/website.ts src/env/public.ts src/config/service-status.ts scripts/init tests/unit
git commit -m "feat(collection): 定义核销型支付配置与本地价格"
```

---

### Task 2: Collection 数据表与迁移（结构提交）

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/0009_*.sql`（由 Drizzle 生成，实际 slug 以命令输出为准）
- Create: `src/db/migrations/meta/0009_snapshot.json`
- Modify: `src/db/migrations/meta/_journal.json`
- Test: `tests/unit/collection-orders.test.ts`

**Interfaces:**
- Produces: `schema.collectionAccounts`、`schema.collectionOrders`。
- Consumes: Task 1 的 `CollectionChannel` / 状态文字约束仅在 TS 层使用；SQL 列保持 text。

- [x] **Step 1: 写 migration 结构失败测试**

在 `collection-orders.test.ts` 复用 `payment-persistence.test.ts` 的内存 SQLite + 全迁移回放：

```ts
it('迁移创建 collection 表与两个 partial unique index', () => {
  expect(tableNames(sqlite)).toContain('collection_orders')
  expect(tableNames(sqlite)).toContain('collection_accounts')
  expect(indexSql(sqlite, 'collection_orders_active_amount_unique'))
    .toContain("status IN ('pending_payment','pending_verification','settling')")
  expect(indexSql(sqlite, 'collection_orders_settling_user_unique'))
    .toContain("status = 'settling'")
})
```

- [x] **Step 2: 运行测试确认 Red**

Run: `pnpm exec vitest run --project unit tests/unit/collection-orders.test.ts`

Expected: FAIL，表不存在。

- [x] **Step 3: 只做 schema 与 migration 结构变更**

按 spec §5 定义两张表和索引；执行：

```bash
pnpm db:generate
```

检查：

- 新 migration 只新增 collection 表 / 索引，不改旧支付表；
- `_journal.json` 从 idx 8 正确追加 idx 9；
- `0009_snapshot.json` 存在；
- partial unique index 的 WHERE 条件与 spec 完全一致。

- [x] **Step 4: 回放所有 migration 并确认 Green**

Run: `pnpm exec vitest run --project unit tests/unit/collection-orders.test.ts`

Expected: PASS，内存 SQLite 可依次应用 `0000..0009`。

- [x] **Step 5: 提交纯结构变更**

```bash
git add src/db/schema.ts src/db/migrations tests/unit/collection-orders.test.ts
git commit -m "chore(db): 增加核销订单与收款账户表"
```

---

### Task 3: 收款账户解析与并发安全的金额分配

**Files:**
- Create: `src/collection/accounts.ts`
- Create: `src/collection/orders.ts`
- Modify: `tests/unit/collection-orders.test.ts`

**Interfaces:**
- Consumes: `schema.collectionAccounts` / `schema.collectionOrders`、Task 1 的 config 类型与 `resolveCollectionPrice()`。
- Produces:

```ts
resolveCollectionAccount(db, config): Promise<ResolvedCollectionAccount | null>
createOrder(db, input: { userId: string; productId: string; offerId: string }, now?: Date): Promise<CollectionOrder>
expirePendingOrders(db, accountId: string, now: Date): Promise<number>
```

- [x] **Step 1: 写账户覆盖与分配失败测试**

测试必须覆盖：配置兜底、D1 覆盖优先、`base+1..99`、账户级唯一、随机起点环形扫描、99 个槽位耗尽、并发两个 create 不重号。

```ts
it('同一账户并发创建订单不会拿到相同 payableAmount', async () => {
  const [a, b] = await Promise.all([create(), create()])
  expect(a.payableAmount).not.toBe(b.payableAmount)
})

it('99 个活跃金额占满后抛 AMOUNT_POOL_EXHAUSTED', async () => {
  await occupyAllFingerprints()
  await expect(create()).rejects.toMatchObject({ code: 'AMOUNT_POOL_EXHAUSTED' })
})
```

- [x] **Step 2: 运行测试确认 Red**

Run: `pnpm exec vitest run --project unit tests/unit/collection-orders.test.ts`

Expected: FAIL，领域函数不存在。

- [x] **Step 3: 实现账户解析、惰性过期与插入重试**

`createOrder()` 使用 Web Crypto 生成随机起点，依次尝试 99 个候选；每次直接 INSERT，让 partial unique index决定冲突，不采用「先查后插」。订单创建时快照账户与价格字段，`expiresAt = now + 900s`。

D1 覆盖只覆盖相同 account ID；禁用覆盖跳过该账户，随后寻找下一个配置账户。没有可用账户抛 `NO_COLLECTION_ACCOUNT`。

- [x] **Step 4: 运行测试确认 Green**

Run: 与 Step 2 相同。

Expected: PASS，包括并发与容量测试。

- [x] **Step 5: 提交**

```bash
git add src/collection/accounts.ts src/collection/orders.ts tests/unit/collection-orders.test.ts
git commit -m "feat(collection): 分配唯一订单金额"
```

---

### Task 4: 用户订单状态机与查询隔离

**Files:**
- Modify: `src/collection/types.ts`
- Modify: `src/collection/orders.ts`
- Modify: `tests/unit/collection-orders.test.ts`

**Interfaces:**
- Consumes: Task 3 的订单写入。
- Produces:

```ts
submitOrder(db, { userId, orderId, payerNote? }, now?): Promise<CollectionOrder>
cancelOrder(db, { userId, orderId }, now?): Promise<CollectionOrder>
getUserOrder(db, userId, orderId, now?): Promise<CollectionOrder | null>
listUserOrders(db, { userId, limit, offset }, now?): Promise<{ rows; total }>
```

- [x] **Step 1: 写 15 分钟边界与状态转换失败测试**

```ts
it('expiresAt 等于 now 时已过期且不能申报', async () => {
  const order = await createAt(t0)
  await expect(submitOrder(db, input(order), plusSeconds(t0, 900)))
    .rejects.toMatchObject({ code: 'ORDER_EXPIRED' })
  expect(readStatus(order.id)).toBe('expired')
})

it('他人读取与提交统一返回 ORDER_NOT_FOUND', async () => {
  expect(await getUserOrder(db, 'u2', order.id)).toBeNull()
  await expect(submitOrder(db, { userId: 'u2', orderId: order.id }))
    .rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
})
```

另测：申报进入 `pending_verification` 且保留尾数；只有 `pending_payment` 可取消；重复申报返回 `INVALID_ORDER_STATE`；payerNote 截断 / 拒绝超过 500 字符。

- [x] **Step 2: 运行测试确认 Red**

Run: `pnpm exec vitest run --project unit tests/unit/collection-orders.test.ts`

Expected: FAIL，状态机函数不存在。

- [x] **Step 3: 实现 CAS 状态更新与所有者查询**

每次更新都在 WHERE 中带当前状态与所有者；更新返回空行时重新读取并映射稳定错误码。查询先惰性过期自己的 `pending_payment`，不能修改 `pending_verification`。

- [x] **Step 4: 运行测试确认 Green**

Run: 与 Step 2 相同。

Expected: PASS。

- [x] **Step 5: 提交**

```bash
git add src/collection/types.ts src/collection/orders.ts tests/unit/collection-orders.test.ts
git commit -m "feat(collection): 实现用户订单状态机"
```

---

### Task 5: 人工核验、付款事件与手动续费

**Files:**
- Create: `src/collection/settlement.ts`
- Modify: `src/payment/types.ts`
- Modify: `src/payment/events.ts`
- Create: `tests/unit/collection-settlement.test.ts`
- Modify: `tests/unit/payment-persistence.test.ts`

**Interfaces:**
- Consumes: Task 4 的订单状态、`applyPaymentEvent()`。
- Produces:

```ts
addBillingInterval(start: Date, interval: 'month'|'year', count: number): Date
reviewOrder(db, input: ReviewOrderInput, now?: Date): Promise<CollectionOrder>
settleCollectionOrder(db, order, review, now?): Promise<CollectionOrder>
```

`ProviderSubscription` 新增可选 `productId?: string|null`、`offerId?: string|null`；`applyPaymentEvent` 优先使用它们，再回退 `reference` 反查。

- [x] **Step 1: 写核验与付款桥接失败测试**

固定以下矩阵：

```ts
it('普通核验金额不符时拒绝且不写 payments', ...)
it('异常核验必须有理由并按 observedAmount 写付款', ...)
it('一次性订单重复核验只生成一条 payment', ...)
it('同 offer 手动续费从 max(now,currentPeriodEnd) 延长', ...)
it('1 月 31 日加一个月夹到 UTC 2 月末', ...)
it('其他 provider 或 offer 占位时转 requires_refund', ...)
it('付款已落库但订单更新失败，重试只补 settled', ...)
```

崩溃恢复测试在第一次调用时 mock / 包装订单最终 UPDATE 抛错；第二次调用后断言 payments count = 1、续期只加一次、订单 settled。

- [x] **Step 2: 运行测试确认 Red**

Run: `pnpm exec vitest run --project unit tests/unit/collection-settlement.test.ts tests/unit/payment-persistence.test.ts`

Expected: FAIL，settlement 与直接归属字段不存在。

- [x] **Step 3: 实现结算临界区与 PaymentEvent 合成**

普通 approve 只接受 `pending_verification` 且金额相等；exception approve 接受过期 / 金额异常但强制 note。先 CAS 更新到 `settling`，partial unique index 序列化同一用户。

付款事件：

- `provider: 'collection'`
- `id: order:${orderId}:settled`
- `payment.id: orderId`
- one-time 直接带 product / offer；
- subscription ID 固定 `user:${userId}`，直接带 product / offer；
- `payment.amount = observedAmount`。

处理订阅冲突后再调用 `applyPaymentEvent`；成功后更新当前订单并清理同用户重复订阅订单。事件幂等是故障恢复依据。

- [x] **Step 4: 运行测试确认 Green**

Run: 与 Step 2 相同。

Expected: PASS，原 Stripe / Creem 持久化测试也保持绿色。

- [x] **Step 5: 提交**

```bash
git add src/collection/settlement.ts src/payment/types.ts src/payment/events.ts tests/unit/collection-settlement.test.ts tests/unit/payment-persistence.test.ts
git commit -m "feat(collection): 核验订单并复用支付事件结算"
```

---

### Task 6: 用户与管理员 server functions

**Files:**
- Create: `src/collection/server.ts`
- Create: `tests/unit/collection-server.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5 的全部领域函数、现有 `getAuth()`、`getModuleUnavailableResponse()`、`checkRateLimit()`。
- Produces: `createCollectionOrderFn`、`submitCollectionOrderFn`、`cancelCollectionOrderFn`、`fetchCollectionOrderFn`、`fetchMyCollectionOrdersFn`、`fetchAdminCollectionOrdersFn`、`reviewCollectionOrderFn`、`saveCollectionAccountFn`。

- [x] **Step 1: 写服务端门禁与限流失败测试**

测试：模块关闭 404、配置不全 503、未登录 401、其他用户 `ORDER_NOT_FOUND`、普通用户 admin 函数 403、admin 可核验、创建 5/15m 与轮询 60/min 的 action key独立。

```ts
it('客户端伪造 role 不能绕过服务端 session', async () => {
  authSession.user.role = 'user'
  await expect(callReview({ role: 'admin' })).rejects.toMatchObject({ status: 403 })
})
```

- [x] **Step 2: 运行测试确认 Red**

Run: `pnpm exec vitest run --project unit tests/unit/collection-server.test.ts`

Expected: FAIL，server functions 不存在。

- [x] **Step 3: 实现薄 server-function 边界**

每个 handler 顺序固定：模块门禁 → 服务端 session → 角色（如需要）→ rate limit → Zod input → 领域函数。不得信任客户端传入 userId / role / amount / price；userId 来自 session，金额来自订单与商品配置。

管理员列表默认 `pending_verification`，limit 1–100、默认 20；所有公开错误只返回稳定 code。

- [x] **Step 4: 运行测试确认 Green**

Run: 与 Step 2 相同。

Expected: PASS。

- [x] **Step 5: 提交**

```bash
git add src/collection/server.ts tests/unit/collection-server.test.ts
git commit -m "feat(collection): 增加订单与核验服务端接口"
```

---

### Task 7: R2 二维码与凭证文件端点

**Files:**
- Create: `src/collection/files.ts`
- Modify: `src/storage/provider/r2.ts`
- Create: `src/routes/api/collection/orders/$orderId/receipt.ts`
- Create: `src/routes/api/collection/accounts/$accountId/qrcode.ts`
- Create: `tests/unit/collection-files.test.ts`
- Modify: `tests/unit/storage-security.test.ts`

**Interfaces:**
- Consumes: `getStorageProvider()`、collection order / account 查询、服务端 session。
- Produces: `validateCollectionImage(bytes, mime, kind)`；两个 POST / GET 文件端点。

- [x] **Step 1: 写文件伪装与越权失败测试**

```ts
it('拒绝 MIME 为 image/png 但 magic bytes 不是 PNG 的文件', ...)
it('凭证超过 5 MiB、二维码超过 2 MiB 时拒绝', ...)
it('其他用户读取凭证返回 404，admin 可读', ...)
it('非 admin 不能上传二维码', ...)
it('无 BUCKET 时返回 STORAGE_UNAVAILABLE 且不改 DB', ...)
```

- [x] **Step 2: 运行测试确认 Red**

Run: `pnpm exec vitest run --project unit tests/unit/collection-files.test.ts tests/unit/storage-security.test.ts`

Expected: FAIL，验证器 / 路由不存在，folder 不在白名单。

- [x] **Step 3: 实现文件验证、存储与授权下载**

在 R2 folder 白名单加入 `collection-qrcodes` / `collection-receipts`。端点不接受裸 key：由 orderId / accountId 查询授权后取得 key。上传新二维码成功后再 upsert account；旧 key 删除失败只告警。

凭证上传只允许订单所有者、状态 `pending_payment|pending_verification`；存为 private。GET 按所有者 / admin 授权并返回正确 Content-Type 与 `Cache-Control: private, no-store`。

- [x] **Step 4: 运行测试确认 Green**

Run: 与 Step 2 相同。

Expected: PASS。

- [x] **Step 5: 提交**

```bash
git add src/collection/files.ts src/storage/provider/r2.ts src/routes/api/collection tests/unit/collection-files.test.ts tests/unit/storage-security.test.ts
git commit -m "feat(collection): 安全存取收款码与付款凭证"
```

---

### Task 8: 首页购买分流与用户订单页面

**Files:**
- Create: `src/collection/client.ts`
- Create: `src/routes/{-$locale}/_layout/dashboard/orders.tsx`
- Create: `src/routes/{-$locale}/_layout/dashboard/orders/$orderId.tsx`
- Modify: `src/routes/{-$locale}/index.tsx`
- Modify: `src/components/marketing/LandingPage.tsx`
- Modify: `src/config/settings.ts`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Create: `tests/components/collection-order.test.tsx`
- Modify: `tests/components/landing.test.tsx`
- Modify: `tests/components/settings-layout.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 checkout mode / money formatter、Task 6 server functions、Task 7 receipt endpoint。
- Produces: 首页 collection CTA、用户订单列表与详情；申报后每 5 秒轮询。

- [x] **Step 1: 写组件失败测试**

固定断言：

```ts
it('collection 模式 CTA 创建订单并站内导航，不调用 Stripe checkout', ...)
it('订单页显示精确金额、15 分钟、二维码与风险正文', ...)
it('点击我已支付只进入待核验，不显示已到账', ...)
it('申报后每 5 秒轮询，settled 后停止', ...)
it('无 BUCKET 时不显示上传入口但仍可填写说明', ...)
it('非登录用户仍先去登录', ...)
```

Settings 测试断言 collection enabled 时显示「订单」，disabled 时隐藏；面包屑识别 `orders` 与订单详情。

- [x] **Step 2: 运行测试确认 Red**

Run: `pnpm exec vitest run --project components tests/components/collection-order.test.tsx tests/components/landing.test.tsx tests/components/settings-layout.test.tsx`

Expected: FAIL，新路由 / 文案 / 分流不存在。

- [x] **Step 3: 实现价格数据与 CTA 分流**

首页 loader 返回 `{ amount, currency } | null`，provider 模式从 catalog 取，collection 模式从本地 price 取；`LandingPage` 用 `formatMoneyAmount()`。`client.ts` 将 server-function 结果映射为 `redirect|unauthenticated|not-configured|error`，成功导航内部订单页。

- [x] **Step 4: 实现用户列表、详情、倒计时、申报与轮询**

页面门禁 `assertPageEnabled('collection')`；倒计时以服务端 `expiresAt` 为准，客户端只显示；到 0 后刷新服务端状态。风险文案放正文，明确截图不是到账依据、订单过期勿付、订阅不自动续费。

轮询只在 `pending_verification|settling` 启动，5 秒一次；卸载 / settled / rejected / requires_refund 时清理 timer。

- [x] **Step 5: 补齐双语 key、排序并确认 Green**

Run:

```bash
pnpm locale:sort
pnpm locale:compile
pnpm exec vitest run --project components tests/components/collection-order.test.tsx tests/components/landing.test.tsx tests/components/settings-layout.test.tsx
pnpm locale:check
```

Expected: PASS，locale 键完全配对。

- [x] **Step 6: 提交**

```bash
git add src/collection/client.ts src/routes/'{-$locale}' src/components/marketing/LandingPage.tsx src/config/settings.ts messages tests/components
git commit -m "feat(collection): 增加收款码订单用户流程"
```

---

### Task 9: 管理员核验队列与收款账户运营

**Files:**
- Create: `src/routes/{-$locale}/_layout/dashboard/admin/orders.tsx`
- Modify: `src/config/settings.ts`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Create: `tests/components/collection-admin.test.tsx`
- Modify: `tests/unit/admin-module.test.ts`
- Modify: `tests/components/settings-layout.test.tsx`

**Interfaces:**
- Consumes: Task 6 admin server functions、Task 7 QR / receipt endpoints、Task 5 review actions。
- Produces: 管理员订单队列、核验 Dialog、异常确认 AlertDialog、账户启停 / QR 上传。

- [x] **Step 1: 写 admin UI 与门禁失败测试**

```ts
it('只有 admin + enableAdmin + collection 三条件都满足才显示入口', ...)
it('默认筛选待核验并显示应付金额、申报时间与凭证', ...)
it('observedAmount 不符时普通通过按钮不可提交', ...)
it('异常通过必须填写理由并二次确认', ...)
it('上传二维码后显示数据库覆盖，禁用后回退下一个配置账户', ...)
```

`admin-module.test.ts` 同时验证直接调用 route / server function 时非 admin 403/404，不只测菜单隐藏。

- [x] **Step 2: 运行测试确认 Red**

Run: `pnpm exec vitest run --project unit tests/unit/admin-module.test.ts && pnpm exec vitest run --project components tests/components/collection-admin.test.tsx tests/components/settings-layout.test.tsx`

Expected: FAIL，admin route / 导航不存在。

- [x] **Step 3: 实现分页筛选、核验与账户区块**

复用现有 `Table`、`Badge`、`Dialog`、`AlertDialog`、`Input`、`Select`、`Pagination`；不改 `src/components/ui`。金额输入在客户端只做 UX 校验，服务端仍以整数分重新验证。

异常通过 dialog 明示实际金额、订单金额、退款 / 风控影响，并强制非空理由。核验成功后刷新列表与 router data。

- [x] **Step 4: 双语排序、运行测试确认 Green**

Run:

```bash
pnpm locale:sort
pnpm locale:compile
pnpm exec vitest run --project unit tests/unit/admin-module.test.ts
pnpm exec vitest run --project components tests/components/collection-admin.test.tsx tests/components/settings-layout.test.tsx
pnpm locale:check
```

Expected: PASS。

- [x] **Step 5: 提交**

```bash
git add src/routes/'{-$locale}'/_layout/dashboard/admin/orders.tsx src/config/settings.ts messages tests/unit/admin-module.test.ts tests/components/collection-admin.test.tsx tests/components/settings-layout.test.tsx
git commit -m "feat(collection): 增加管理员人工核验队列"
```

---

### Task 10: E2E、用户文档与全量验收

**Files:**
- Create: `scripts/e2e-seed-collection.ts`
- Create: `e2e/collection.spec.ts`
- Create: `content/docs/payment-collection.zh.md`
- Create: `content/docs/payment-collection.md`
- Modify: `content/docs/payment.zh.md`
- Modify: `content/docs/payment.md`
- Modify: `content/docs/configuration.zh.md`
- Modify: `content/docs/configuration.md`
- Modify: `content/docs/environment.zh.md`
- Modify: `content/docs/environment.md`
- Modify: `.env.example`
- Modify: `CHANGELOG.md`（仅在实现实际准备发布时）

**Interfaces:**
- Consumes: 完整 collection 模块。
- Produces: 可复现的本地端到端验收、互斥接入文档页。

- [x] **Step 1: 写失败的 Playwright 流程**

`collection.spec.ts` 使用本地 D1 和 mock R2：

```ts
test('用户申报后由管理员核验，用户轮询看到结算', async ({ browser }) => {
  // user: login → create → exact amount + 15min → submit
  // admin: login → pending queue → approve
  // user: status settled; payment history/order history contains one row
})

test('跨用户读订单和凭证被拒绝', ...)
test('过期订单不可申报且尾数可复用', ...)
```

Seed 脚本只写本地 D1：创建 verified user / admin、必要 collection account override；不访问 Stripe / 支付宝。

- [x] **Step 2: 跑 E2E 确认 Red**

Run: `pnpm test:e2e -- e2e/collection.spec.ts`

Expected: FAIL，文档前的实现缺口或 E2E seed 尚未完成。

- [x] **Step 3: 完成 seed 与 E2E 所需测试接线**

给 Playwright 测试环境设置 `VITE_CHECKOUT_MODE=collection` 与包含 `collection,auth` 的 `VITE_MODULES`；使用测试专用同源二维码资源，不写真实收款码。若 E2E server 已在运行，不在测试运行中修改源码。

- [x] **Step 4: 写互斥、按步骤的双语文档**

新页面只讲 collection：

1. 适用范围与风险；
2. 在 `products.ts` 配 CNY 标价；
3. 配收款账户 / 可选 R2；
4. 打开 module 与 checkout mode；
5. 执行 migration；
6. 设置 admin；
7. 用户与核验流程；
8. 15 分钟、99 尾数、迟到 / 错额 / 退款处置；
9. 明确无自动续费、无 webhook、无自动交付。

总览页只链接 Stripe / Creem / collection 三条互斥接入页，不重复正文。环境文档登记 `VITE_CHECKOUT_MODE`；不虚构 secret。

- [x] **Step 5: 运行 E2E 与文档检查确认 Green**

Run:

```bash
pnpm content:build
pnpm test:e2e -- e2e/collection.spec.ts
pnpm exec vitest run --project unit tests/unit/docs.test.ts tests/unit/init-modules.test.ts
```

Expected: PASS。

- [x] **Step 6: 全量验证**

按仓库非交互约定分开运行：

```bash
pnpm check
pnpm exec vitest run --project unit
pnpm exec vitest run --project components
pnpm test:workers
pnpm test:e2e
```

Expected: 全部退出码 0；Biome / tsc / env / locale 零 warning；E2E 全绿。若 `pnpm check` 因 locale compile 交互提示阻塞，先运行 `pnpm locale:compile` 后逐项执行 check 内各命令，不声称跳过。

- [x] **Step 7: 最终提交**

```bash
git add scripts/e2e-seed-collection.ts e2e/collection.spec.ts content/docs .env.example CHANGELOG.md
git commit -m "docs(collection): 补齐核销型支付接入与验收"
```

---

## Self-Review Result

- **Spec coverage**：配置、价格、账户覆盖、订单 / 付款分离、15 分钟与 99 尾数、并发唯一、用户申报、人工 / 异常核验、付款事件、手动续费、R2、用户 UI、admin UI、init、文档、E2E 均有归属任务。
- **Type consistency**：全计划使用 `collection`、`collection_orders`、`collection_accounts`、`provider='collection'`；订阅归属字段统一为 `productId` / `offerId`。
- **Review Focus**：五项高风险输入均在 Tasks 3–7 具名测试覆盖。
- **Scope**：没有引入插件框架、外部支付 API、cron、自动退款或自动交付。
- **Commit discipline**：Task 2 是独立结构提交；其余为单一行为单元，未把 schema 与行为混在同一提交。
