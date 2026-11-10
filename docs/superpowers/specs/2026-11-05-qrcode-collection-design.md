# 个人收款码核销型支付设计

**日期**：2026-11-05
**状态**：Accepted
**关联 ADR**：[`ADR-0006`](../../adr/0006-collection-code-settlement.md)、
[`ADR-0007`](../../adr/0007-optional-module-not-plugin-system.md)

## 1. 目标

给 `saas-template` 增加一个与 `payment` 平级、可独立开关的 `collection` 业务模块。
首期让已登录用户向支付宝个人收款码付款：系统创建一笔 15 分钟有效的订单，在标价上加
`¥0.01`–`¥0.99` 的唯一尾数；用户付款后申报，管理员核对真实收款流水并核验；只有核验
通过才生成 `payments` 资金事实与订阅快照。

这条链路不调用支付宝 API，不依赖商户号，不实现 `PaymentProvider`。

## 2. 非目标

首期不做：

- 支付宝开放平台、微信支付商户 API、到账 webhook 或账单抓取；
- 自动续费、签约代扣、催款与自动重试；
- 自动退款或退款 API；
- USDT / 链上自动核验；
- license key、源码下载链接或交付邮件；
- 通用应用插件系统；
- 定时任务、队列或定时对账；
- 根据付款截图自动授予权益。

## 3. 领域边界

### 3.1 两条并列链路

```text
provider 托管支付
  ProductDefinition.prices
    → PaymentProvider Checkout
    → provider webhook
    → PaymentEvent
    → applyPaymentEvent

核销型支付
  ProductDefinition.collectionPrices
    → CollectionOrder（待支付 / 待核验）
    → 管理员核验真实流水
    → PaymentEvent
    → applyPaymentEvent
```

`payment` 表达「外部服务商已经确认的一笔资金事实」。`collection` 表达「先有购买意图，
后由人确认资金事实」。二者只在 `PaymentEvent → applyPaymentEvent` 汇合。

### 3.2 不实现 `PaymentProvider`

核销型支付没有远程 Checkout Session、远程 Subscription、Customer Portal 与 webhook；
让它实现 `PaymentProvider` 只能靠空方法和伪造语义。`collection` 因此有自己的订单状态机，
但结算后复用支付持久化。

### 3.3 模块而非插件

本仓没有应用级插件发现、生命周期或路由 / schema / env 贡献机制。`collection` 采用现有
业务模块惯例：

- `src/collection/`：领域逻辑、查询与 server functions；
- `websiteConfig.collection.enabled`：模块开关；
- `ServiceModule` + 页面 / API 门禁：关闭时 404、配置不全时 503；
- `src/routes/`：静态注册页面与文件端点；
- `src/db/schema.ts` + Drizzle migration：静态 schema；
- `src/config/settings.ts`：静态用户与管理员导航。

## 4. 配置模型

### 4.1 结账模式

新增部署级配置：

```ts
export type CheckoutMode = 'provider' | 'collection'

interface WebsiteConfig {
  checkout: { mode: CheckoutMode }
  // existing fields...
}
```

公开环境变量 `VITE_CHECKOUT_MODE=provider|collection` 可覆盖源码默认值。默认
`provider`，保持已有实例行为不变。

- `provider`：首页取外部价格目录，CTA 调 `startCheckout()`；
- `collection`：首页取本地 `collectionPrices`，CTA 创建核销订单。

`payment` 与 `collection` 可以同时启用（前者继续提供历史付款与存量订阅数据），但
`checkout.mode` 只选一条**新订单**链路。`checkout.mode=collection` 时，`collection`
必须启用且目标 offer 必须有本地价格；反之服务状态为 `incomplete`。

### 4.2 商品与价格

扩展 `ProductDefinition`：

```ts
export interface CollectionPrice {
  amount: number // 最小货币单位；CNY 为分
  currency: 'cny'
  kind: 'subscription' | 'one_time'
  interval?: 'month' | 'year'
  intervalCount?: number
}

export interface ProductDefinition {
  // existing fields...
  prices: Record<string, string>
  collectionPrices?: Record<string, CollectionPrice>
}
```

约束：

- `amount` 是正整数；
- `currency` 首期只能为 `cny`；
- `one_time` 不得声明 `interval` / `intervalCount`；
- `subscription` 必须声明 `month|year` 与正整数 `intervalCount`；
- `collectionPrices` 是核销型链路的唯一金额事实源，不在 `websiteConfig`、数据库或文案中
  再存第二份标价；
- provider 的 `prices` 仍只保存销售引用，不受影响。

模板示例商品只给真正要通过收款码出售的 offer 配 `collectionPrices`；不应为了演示给所有
套餐填虚假金额。

### 4.3 收款账户

公开配置提供兜底：

```ts
export interface CollectionAccountConfig {
  id: string
  channel: 'alipay'
  displayName: string
  currency: 'cny'
  qrImageUrl: string // 同源根路径或无凭据 HTTPS URL
}

interface WebsiteConfig {
  collection: {
    enabled: boolean
    verificationSlaHours: number
    accounts: CollectionAccountConfig[]
  }
}
```

首期选择第一个 `enabled` 的数据库覆盖；没有覆盖时使用第一个配置账户。订单创建时快照
账户 ID、渠道、币种及二维码 URL / R2 key，后续换码不改变既有订单。

管理员可上传二维码到 R2 并写入 `collection_accounts` 作为同 ID 配置项的覆盖。若未绑定
R2，配置兜底仍可工作，上传按钮隐藏；R2 缺失不让模块变成 `incomplete`。二维码不是
secret，但只在登录后的订单页展示。

## 5. 数据模型

### 5.1 `collection_accounts`

数据库只存运营覆盖，不复制源码默认值：

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | text PK | 对应配置账户 ID |
| `channel` | text not null | 首期 `alipay` |
| `display_name` | text not null | 用户可见名称 |
| `currency` | text not null | 首期 `cny` |
| `qr_image_key` | text nullable | R2 key；有值时覆盖配置 URL |
| `enabled` | boolean not null | 是否可分配新订单 |
| `updated_by` | text nullable FK users set null | 最后更新管理员 |
| `created_at` / `updated_at` | timestamp | 审计时间 |

### 5.2 `collection_orders`

使用带上下文前缀的表名，避免占用将来电商领域的通用 `orders`：

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | text PK | `crypto.randomUUID()` |
| `user_id` | text not null FK users cascade | 下单账号 |
| `account_id` | text not null | 收款账户快照 ID，不设 FK（可来自配置） |
| `channel` | text not null | 首期 `alipay` |
| `qr_image_url` | text nullable | 创建时的配置 URL 快照 |
| `qr_image_key` | text nullable | 创建时的 R2 key 快照 |
| `product_id` / `offer_id` | text not null | 商品归属 |
| `kind` | text not null | `subscription|one_time` |
| `interval` / `interval_count` | nullable | 订阅周期快照 |
| `base_amount` | integer not null | 商品标价（分） |
| `fingerprint` | integer not null | 1–99 |
| `payable_amount` | integer not null | `base_amount + fingerprint` |
| `currency` | text not null | 首期 `cny` |
| `status` | text not null | 下述状态机 |
| `payer_note` | text nullable | 用户提供的辅助信息，最多 500 字符 |
| `receipt_key` | text nullable | 用户上传凭证的私有 R2 key |
| `submitted_at` | timestamp nullable | 用户申报已付款时间 |
| `observed_amount` | integer nullable | 管理员在真实流水中看到的金额 |
| `external_reference` | text nullable | 管理员录入的流水号 |
| `review_note` | text nullable | 驳回 / 异常核验理由 |
| `reviewed_by` | text nullable FK users set null | 核验管理员 |
| `reviewed_at` | timestamp nullable | 最后核验时间 |
| `expires_at` | timestamp not null | 创建时间 + 15 分钟 |
| `settled_at` | timestamp nullable | 结算完成时间 |
| `created_at` / `updated_at` | timestamp | 审计时间 |

关键索引：

1. `(user_id, status)`：用户订单列表；
2. `(status, expires_at)`：惰性过期；
3. **partial unique** `(account_id, payable_amount) WHERE status IN
   ('pending_payment','pending_verification','settling')`：同一收款账户的活跃应付金额全局唯一；
4. **partial unique** `(user_id) WHERE status = 'settling'`：同一账号只允许一个结算临界区。

金额唯一性按**收款账户**而非「商品 + offer」约束。后者不足：两个商品价格区间重叠时，
仍可能出现同一收款码、同一时段、同一实付金额，人工无法区分。

## 6. 订单状态机

```text
pending_payment ──用户在 15 分钟内申报──▶ pending_verification
       │                                      │
       ├──到期惰性清理──▶ expired             ├──管理员驳回──▶ rejected
       │                                      └──取得结算锁──▶ settling
       └──用户主动取消──▶ canceled                                  │
                                        ┌───────────────────────────┴────────────┐
                                        ▼                                        ▼
                                     settled                            requires_refund
```

规则：

- 创建订单前，先把 `expires_at <= now` 的 `pending_payment` 更新为 `expired`，释放金额；
- `pending_verification` 不自动过期，持续占用尾数，直到管理员处理；
- 用户申报必须满足 `status=pending_payment AND expires_at>now`，否则返回 `ORDER_EXPIRED`；
- 「我已支付」只是申报，不能写 `payments`、订阅或权益；
- 普通核验要求 `observedAmount === payableAmount`；金额不符不能普通通过；
- `approve_exception` 允许管理员处理过期到账或金额不符，但必须填写 `reviewNote`；
- 管理员确认钱已到但不能授予订阅（账号已有不兼容订阅、重复订单）时，状态变为
  `requires_refund`，不写新的有效订阅；退款由人工完成；
- 同一 API 重试必须幂等；`settling` 可由同一订单继续完成，不能由另一订单抢占。

## 7. 金额指纹分配

常量：

```ts
COLLECTION_ORDER_TTL_SECONDS = 15 * 60
FINGERPRINT_MIN = 1
FINGERPRINT_MAX = 99
```

算法：

1. 解析商品与 offer 的 `CollectionPrice`；
2. 解析当前启用的收款账户；
3. 惰性过期当前账户的 `pending_payment`；
4. 用 Web Crypto 从 1–99 选随机起点，循环尝试 99 个尾数；
5. 对每个候选值插入订单；由 partial unique index 决定是否成功；
6. 成功即返回；99 个都冲突则返回 `AMOUNT_POOL_EXHAUSTED`（HTTP 409）。

不能「先查空位、再无约束插入」：并发请求会同时选中同一个尾数。数据库唯一约束是最终
正确性来源，随机起点只负责分散热点。

## 8. 用户流程

1. 首页 loader 按 `checkout.mode` 取价：provider 目录或本地 `collectionPrices`；价格展示使用
   通用按币种格式化函数，不再硬编码 USD。
2. 已登录用户点购买：
   - `provider` → 现有 `startCheckout()`；
   - `collection` → `createCollectionOrder()`，然后站内导航到
     `/{locale}/dashboard/orders/{orderId}`。
3. 订单详情页显示：商品、**精确应付金额**、15 分钟倒计时、支付宝二维码、订单号、风险与
   核验 SLA 正文。
4. 用户付款后可填写辅助说明，并在 R2 可用时上传 JPG / PNG / WebP 凭证（≤5 MiB）；
   页面明确写「凭证不作为到账依据」。
5. 用户点「我已支付」后进入 `pending_verification`；页面每 5 秒轮询订单状态。
6. 管理员核验后页面显示 `settled` 或处理结果。订单列表保留历史状态。

用户不能读取其他账号的订单或凭证。二维码可以显示给该订单所有者；凭证仅订单所有者与
管理员可读。

## 9. 管理员流程

新增 `/{locale}/dashboard/admin/orders`，门禁沿用管理台现有三层：

1. dashboard 要求登录；
2. 路由 `beforeLoad` 检查 `enableAdmin`、`collection` 模块与 `role=admin`；
3. 每个 server function / 文件端点重新取服务端 session 并检查 `role=admin`。

页面提供：

- 按状态筛选、分页、默认先显示 `pending_verification`；
- 订单、用户邮箱、应付金额、申报时间、辅助说明、凭证；
- 管理员录入 `observedAmount`、流水号、核验备注；
- 普通通过、异常通过、驳回；
- 收款账户配置与二维码上传 / 启停。

所有破坏性操作使用 `AlertDialog` 确认。异常通过必须二次确认并填写理由。

## 10. 结算与订阅

结算事件使用固定 `provider='collection'`、事件 ID `order:{orderId}:settled`、付款外部 ID
`orderId`。`applyPaymentEvent` 的 webhook 幂等表确保重试不重复写款。

### 10.1 一次性购买

合成一条 `type='one_time'`、`status='paid'` 的 payment；金额记录管理员观察到的真实金额
（普通核验等于应付金额），商品 / offer 直接来自订单。

### 10.2 手动续费订阅

`ProviderSubscription` 增加可选 `productId` / `offerId`，`applyPaymentEvent` 优先使用直接
归属，外部 provider 仍可通过 `reference` 反查。

核销型订阅使用稳定外部 ID `user:{userId}`（provider 作用域已隔离）：

- 没有当前订阅：`currentPeriodStart=now`；
- 有同一商品 + offer 的 `collection` 订阅：从 `max(now, currentPeriodEnd)` 延长；
- 有其他 provider 或不同商品 / offer 的占位订阅：不授予，订单进入 `requires_refund`；
- 月 / 年按 UTC 日历增加，保留「月末夹紧」语义（如 1 月 31 日 + 1 月 = 2 月末）；
- 不保存扣款授权，不创建 Portal，不自动续费。

结算成功后：

- 当前订单 → `settled`；
- 同账号仍在 `pending_payment` 的订阅订单 → `canceled`；
- 同账号已在 `pending_verification` 的旧重复订阅订单 → `requires_refund`；
- 交付仍由人工邮件完成。

若 `applyPaymentEvent` 已成功而订单更新失败，重试会因事件幂等跳过付款写入，再补订单状态，
不会重复收款记录。

## 11. 文件处理

沿用已有 R2 provider，不引入 SDK：

- 新增白名单目录 `collection-qrcodes`、`collection-receipts`；
- 二维码：JPG / PNG / WebP，≤2 MiB，管理员上传；
- 凭证：JPG / PNG / WebP，≤5 MiB，订单所有者上传；
- 只信 MIME 与大小还不够，至少校验文件 magic bytes；
- 下载端点根据 session + 数据库归属授权，不接受客户端直接指定任意 R2 key；
- 上传新二维码成功后再更新 DB；旧对象删除失败不回滚新配置，只记录告警；
- 模块没有 R2 binding 时不显示上传入口，仍允许填写辅助说明与使用配置二维码。

## 12. API 与领域接口

领域层放在 `src/collection/`，不依赖路由组件：

```ts
createOrder(db, input, now?): Promise<CollectionOrder>
submitOrder(db, input, now?): Promise<CollectionOrder>
cancelOrder(db, input, now?): Promise<CollectionOrder>
reviewOrder(db, input, now?): Promise<CollectionOrder>
listUserOrders(db, input): Promise<...>
getUserOrder(db, userId, orderId): Promise<CollectionOrder | null>
listAdminOrders(db, input): Promise<...>
resolveCollectionAccount(db, config): Promise<ResolvedCollectionAccount | null>
settleCollectionOrder(db, order, review, now?): Promise<CollectionOrder>
```

Server functions 封装模块门禁、session、角色、限流与 Zod 校验。文件上传 / 下载因使用
`multipart/form-data` 与流，使用专用 API routes。

稳定错误码：

- `MODULE_DISABLED` / `SERVICE_UNAVAILABLE`
- `INVALID_OFFER`
- `NO_COLLECTION_ACCOUNT`
- `AMOUNT_POOL_EXHAUSTED`
- `ORDER_NOT_FOUND`
- `ORDER_EXPIRED`
- `INVALID_ORDER_STATE`
- `AMOUNT_MISMATCH`
- `SUBSCRIPTION_SLOT_TAKEN`
- `SETTLEMENT_IN_PROGRESS`
- `STORAGE_UNAVAILABLE`
- `INVALID_RECEIPT`

错误响应不暴露其他用户订单是否存在：非所有者统一 `ORDER_NOT_FOUND`。

## 13. 限流

在已有 KV rate-limit 上增加：

| 动作 | 限制 |
|---|---|
| 创建订单 | 每账号 / IP 15 分钟 5 次 |
| 申报付款 | 每账号 / IP 1 分钟 10 次 |
| 状态轮询 | 每账号 / IP 1 分钟 60 次 |
| 上传凭证 | 每账号 / IP 15 分钟 5 次 |
| 管理员核验 | 每管理员 1 分钟 30 次 |

管理员页面读取沿用分页，不一次加载全表。

## 14. 文案与合规边界

商品页与订单页正文（不是弹窗）必须明确：

- 这是人工核验，不是即时自动到账；
- 付款后预计在 `verificationSlaHours` 小时内开通；
- 必须支付页面显示的**精确金额**；
- 订单 15 分钟有效，过期后不要付款；
- 「我已支付」与截图不代表系统确认到账；
- 订阅不自动扣款，到期前需要重新下单；
- 退款、发票与异常款项由运营方人工处理。

模板提供这些中英文默认文案；实例项目须按自己的运营与法律条件复核。模板不声称个人码
经营收款在所有司法辖区或平台规则下都合规。

## 15. 测试策略

### 单元 / 持久化

- 商品配置校验与本地价格目录；
- 金额尾数范围、随机起点后的环形扫描、99 个槽位耗尽；
- 并发创建依靠 partial unique index不重号；
- 15 分钟边界（`expiresAt === now` 已过期）；
- 申报、驳回、普通核验、异常核验的合法 / 非法状态转换；
- 用户隔离、admin 服务端角色门禁；
- 结算幂等、崩溃后补写订单状态；
- 一次性付款、首次订阅、同 offer 手动续费、月末夹紧、订阅冲突转退款；
- R2 MIME / magic bytes / 大小 / 所有权。

### 组件

- provider / collection 两种 CTA 分流；
- 订单倒计时、精确金额、风险正文、凭证仅作辅助文案；
- 申报后轮询并显示结算结果；
- admin 导航只对 admin + enableAdmin + collection 显示；
- 普通金额不符不能通过，异常通过要求理由。

### E2E

使用本地 D1 + mock R2，不接真实支付宝：

1. 用户登录 → 创建订单 → 看见 15 分钟与唯一金额 → 申报；
2. admin 登录 → 查看待核验 → 核验通过；
3. 用户轮询后看到已结算，billing / order history 有付款记录；
4. 跨用户读取订单 / 凭证被拒绝；
5. 过期订单不可申报，尾数可重新分配。

## 16. 发布与运维

- 默认 `checkout.mode='provider'`、`collection.enabled=false`，升级不改变现有实例行为；
- `pnpm run init` 要把 `collection` 纳入模块选择，并在选择它时要求使用者手工填写
  `collectionPrices` 与收款账户二维码；init 不生成真实金额或收款码；
- schema migration 只新增表 / 索引，不转换既有支付数据；
- 新迁移由 Drizzle 生成并核对 `meta/_journal.json`，当前基线到 `0008`；
- 配置切到 collection 前必须先迁移 D1；
- 不需要新增 npm 依赖、cron、queue、secret 或外部 API。
