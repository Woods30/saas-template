import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/**
 * 本文件所属的方言。
 *
 * 生成物 `schema.ts` 重导出本文件，运行期据此校验「生成时的方言」与
 * 「运行时声明的 provider」是否一致——两者不一致时 SQL 会静默跑错方言，
 * 必须当场报错而不是等到写数据才暴露。
 */
export const SCHEMA_DIALECT = 'postgresql' as const

// PostgreSQL 版 schema：与 `schema.sqlite.ts` 逐表逐列对齐，由
// `tests/unit/schema-parity.test.ts` 盯着漂移。
//
// 与 SQLite 版的差异只有两处，且都被收敛在列定义里：
// - 时间戳：SQLite 用 `integer(mode: 'timestamp')`，PG 用 `timestamp(mode: 'date')`；
//   两者都映射成 JS `Date`，业务代码无感。
// - 布尔：SQLite 用 `integer(mode: 'boolean')`，PG 用原生 `boolean`。

// Better Auth 表：需与 better-auth CLI 输出保持一致。
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name'),
  image: text('image'),
  // 首次触达归因：注册时由自定义 server entry 写入，之后不覆盖。
  // 缺值统一为空串而不是 null，漏斗分组不必再处理 NULL 分支。
  utmSource: text('utm_source').notNull().default(''),
  utmMedium: text('utm_medium').notNull().default(''),
  utmCampaign: text('utm_campaign').notNull().default(''),
  utmTerm: text('utm_term').notNull().default(''),
  utmContent: text('utm_content').notNull().default(''),
  referrer: text('referrer').notNull().default(''),
  country: text('country').notNull().default(''),
  ip: text('ip').notNull().default(''),
  locale: text('locale').notNull().default(''),
  role: text('role').notNull().default('user'),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  impersonatedBy: text('impersonated_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    accountId: text('account_id').notNull(),
    password: text('password'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    scope: text('scope'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    providerAccountUnique: uniqueIndex('accounts_provider_account_unique').on(
      table.providerId,
      table.accountId,
    ),
  }),
)

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// 订单组：orders / manual_payment_details
//
// 与 SQLite 版逐表逐列对齐，由 `tests/unit/schema-parity.test.ts` 盯着漂移。
// `orders` 只描述购买意图（每次创建结账一行，续费不写），`payments` 只记已确认的
// 资金事实。核销渠道专有的字段放在与订单 1:1 的 `manual_payment_details`。
// ---------------------------------------------------------------------------

export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    orderNo: text('order_no').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    /** `subscription` | `payment`：这次结账买的是订阅还是一次性商品。 */
    mode: text('mode').notNull(),
    productId: text('product_id').notNull(),
    offerId: text('offer_id').notNull(),
    // 金额与币种由渠道价格目录决定；创建订单时还不知道，渠道回调后才有。
    amount: integer('amount'),
    currency: text('currency'),
    /** `created` | `open` | `completed` | `expired` | `canceled` | `failed`。 */
    status: text('status').notNull().default('created'),
    providerSessionId: text('provider_session_id'),
    providerUrl: text('provider_url'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index('orders_user_created_idx').on(table.userId, table.createdAt),
    statusCreatedIdx: index('orders_status_created_idx').on(table.status, table.createdAt),
    // 渠道会话幂等：同一 provider 的同一 session 只对应一个订单；未开单前为空。
    providerSessionUnique: uniqueIndex('orders_provider_session_unique')
      .on(table.provider, table.providerSessionId)
      .where(sql`provider_session_id IS NOT NULL`),
  }),
)

/** 核销型支付的订单详情：与 `orders` 1:1，主键即订单 id。 */
export const manualPaymentDetails = pgTable(
  'manual_payment_details',
  {
    orderId: text('order_id')
      .primaryKey()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // `orders.userId` 的冗余副本：结算临界区索引要在本表上判定。
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // 收款账户快照 ID，不设外键：账户可能只存在于源码配置里。
    accountId: text('account_id').notNull(),
    channel: text('channel').notNull(),
    qrImageUrl: text('qr_image_url'),
    qrImageKey: text('qr_image_key'),
    baseAmount: integer('base_amount').notNull(),
    fingerprint: integer('fingerprint').notNull(),
    payableAmount: integer('payable_amount').notNull(),
    currency: text('currency').notNull(),
    status: text('status').notNull(),
    payerNote: text('payer_note'),
    receiptKey: text('receipt_key'),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    observedAmount: integer('observed_amount'),
    externalReference: text('external_reference'),
    reviewNote: text('review_note'),
    reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    // 审核队列与过期扫描：按状态找订单。
    statusExpiresIdx: index('manual_payment_details_status_expires_idx').on(
      table.status,
      table.expiresAt,
    ),
    // 「我的活跃订单」：按用户找订单。
    userStatusIdx: index('manual_payment_details_user_status_idx').on(table.userId, table.status),
    // 金额唯一性按收款账户而非「商品 + offer」约束：两个商品价格区间重叠时，
    // 仍可能出现同一收款码、同一时段、同一实付金额，人工无法区分。
    activeAmountUnique: uniqueIndex('manual_payment_details_active_amount_unique')
      .on(table.accountId, table.payableAmount)
      .where(sql`status IN ('pending_payment','pending_verification','settling')`),
    // 同一账号只允许一个结算临界区。
    settlingUserUnique: uniqueIndex('manual_payment_details_settling_user_unique')
      .on(table.userId)
      .where(sql`status = 'settling'`),
  }),
)

/** 服务商订阅按外部 ID 幂等；账号购买名额由 Checkout 预留与状态守卫控制。 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('stripe'),
    customerId: text('customer_id'),
    subscriptionId: text('subscription_id').notNull(),
    status: text('status').notNull(),
    priceId: text('price_id'),
    productId: text('product_id'),
    offerId: text('offer_id'),
    amount: integer('amount'),
    currency: text('currency'),
    interval: text('interval'),
    intervalCount: integer('interval_count'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true, mode: 'date' }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true, mode: 'date' }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
    snapshotVersion: integer('snapshot_version').notNull().default(0),
    eventCreated: bigint('event_created', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('subscriptions_user_idx').on(table.userId),
    externalUnique: uniqueIndex('subscriptions_provider_external_unique').on(
      table.provider,
      table.subscriptionId,
    ),
  }),
)

export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    // 历史付款没有订单，留空；新付款关联对应订单。
    orderId: text('order_id').references(() => orders.id, { onDelete: 'set null' }),
    provider: text('provider').notNull().default('stripe'),
    externalId: text('external_id').notNull(),
    type: text('type').notNull(),
    invoiceId: text('invoice_id'),
    chargeId: text('charge_id'),
    subscriptionId: text('subscription_id'),
    status: text('status').notNull(),
    amount: integer('amount').notNull(),
    refundedAmount: integer('refunded_amount').notNull().default(0),
    currency: text('currency').notNull(),
    description: text('description'),
    productId: text('product_id'),
    offerId: text('offer_id'),
    customerId: text('customer_id'),
    eventCreated: bigint('event_created', { mode: 'number' }).notNull().default(0),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
    refundedAt: timestamp('refunded_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    externalUnique: uniqueIndex('payments_provider_external_unique').on(
      table.provider,
      table.externalId,
    ),
    userIdx: index('payments_user_idx').on(table.userId),
    orderIdx: index('payments_order_idx').on(table.orderId),
    chargeIdx: index('payments_charge_idx').on(table.provider, table.chargeId),
  }),
)

/** 订阅 Checkout 每账号一个预留；一次性购买不占用。 */
export const checkoutReservations = pgTable('checkout_reservations', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  // 订阅重试复用同一订单：预留是「未完成的结账」，订单是它的可统计记录。
  orderId: text('order_id').references(() => orders.id, { onDelete: 'set null' }),
  provider: text('provider').notNull(),
  token: text('token').notNull(),
  productId: text('product_id').notNull(),
  offerId: text('offer_id').notNull(),
  request: text('request').notNull(),
  sessionId: text('session_id'),
  url: text('url'),
  expiresAt: integer('expires_at').notNull(),
})

export const files = pgTable('files', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  r2Key: text('r2_key').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  folder: text('folder'),
  visibility: text('visibility').notNull().default('private'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

// `@better-auth/api-key` 插件生成的表，列以插件内置的 `apiKeySchema` 为唯一依据。
export const apikey = pgTable(
  'apikey',
  {
    id: text('id').primaryKey(),
    configId: text('config_id').notNull().default('default'),
    name: text('name'),
    start: text('start'),
    referenceId: text('reference_id').notNull(),
    prefix: text('prefix'),
    key: text('key').notNull(),
    enabled: boolean('enabled'),
    refillInterval: integer('refill_interval'),
    refillAmount: integer('refill_amount'),
    lastRefillAt: timestamp('last_refill_at', { withTimezone: true, mode: 'date' }),
    rateLimitEnabled: boolean('rate_limit_enabled'),
    rateLimitTimeWindow: integer('rate_limit_time_window'),
    rateLimitMax: integer('rate_limit_max'),
    requestCount: integer('request_count'),
    remaining: integer('remaining'),
    lastRequest: timestamp('last_request', { withTimezone: true, mode: 'date' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
    permissions: text('permissions'),
    metadata: text('metadata'),
  },
  (table) => ({
    configIdIdx: index('apikey_config_id_idx').on(table.configId),
    referenceIdIdx: index('apikey_reference_id_idx').on(table.referenceId),
    keyIdx: index('apikey_key_idx').on(table.key),
  }),
)

export const newsletterSubscriptions = pgTable('newsletter_subscriptions', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  provider: text('provider').notNull(),
  providerListId: text('provider_list_id'),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

// 幂等表：支付事件在业务幂等写入成功后标记 processedAt，失败由源端重投。
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull(),
    type: text('type').notNull(),
    payload: text('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    processedIdx: index('webhook_events_processed_idx').on(table.processedAt),
    sourceTypeIdx: index('webhook_events_source_type_idx').on(table.source, table.type),
  }),
)

/**
 * 站点配置：按分组存 JSON（`brand` / `seo` / `social` / `payment` / `mail` /
 * `modules`），后台改完即时生效。
 *
 * 只存**公开参数**与开关；支付 / 邮件的密钥仍只在 env 里——配置表不是密钥库。
 */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// 计费组：积分账本
//
// 与 SQLite 版逐表逐列对齐，由 `tests/unit/schema-parity.test.ts` 盯着漂移。
// 表放在共享 schema 里（业务逻辑在 `src/modules/*`）：drizzle-kit 要能从**一个**
// 入口拿到全部表才能生成迁移。
// ---------------------------------------------------------------------------

/** 积分余额：每个用户一行。余额只由账本事务改，别处不直接写。 */
export const creditBalances = pgTable('credit_balances', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  balance: integer('balance').notNull().default(0),
  totalGranted: integer('total_granted').notNull().default(0),
  totalConsumed: integer('total_consumed').notNull().default(0),
  totalRefunded: integer('total_refunded').notNull().default(0),
  /** 最近一次改动余额的幂等键：与流水表的幂等键一起挡住重复扣减。 */
  lastTxKey: text('last_tx_key'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

/** 积分批次：一次发放是一个桶；消费按到期时间先进先出扣桶。 */
export const creditGrants = pgTable(
  'credit_grants',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    remaining: integer('remaining').notNull(),
    source: text('source').notNull(),
    reference: text('reference'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('credit_grants_user_idx').on(table.userId),
    fifoIdx: index('credit_grants_fifo_idx').on(table.userId, table.expiresAt),
  }),
)

/** 积分流水：只追加，账本的事实源。 */
export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    reference: text('reference'),
    /** 附加信息（JSON 文本）：反扣时记录应扣 / 实际扣减 / 差额。 */
    metadata: text('metadata'),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('credit_transactions_user_idx').on(table.userId, table.createdAt),
    idempotencyUnique: uniqueIndex('credit_transactions_idempotency_unique').on(
      table.idempotencyKey,
    ),
  }),
)

/** 消费与发放批次的对应关系：退款要按原批次退回。 */
export const creditAllocations = pgTable(
  'credit_allocations',
  {
    id: text('id').primaryKey(),
    transactionId: text('transaction_id')
      .notNull()
      .references(() => creditTransactions.id, { onDelete: 'cascade' }),
    grantId: text('grant_id')
      .notNull()
      .references(() => creditGrants.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    transactionIdx: index('credit_allocations_transaction_idx').on(table.transactionId),
    grantIdx: index('credit_allocations_grant_idx').on(table.grantId),
  }),
)

// ---------------------------------------------------------------------------
// 核销型支付（manual-payments）
//
// 与 SQLite 版逐表逐列对齐，由 `tests/unit/schema-parity.test.ts` 盯着漂移。
// ---------------------------------------------------------------------------

/** 核销型支付的收款账户：只存运营对源码配置的覆盖。 */
export const manualPaymentAccounts = pgTable('manual_payment_accounts', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull(),
  displayName: text('display_name').notNull(),
  currency: text('currency').notNull(),
  qrImageKey: text('qr_image_key'),
  enabled: boolean('enabled').notNull().default(true),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

/** 核销型支付的购买意图与核验状态。 */
export const manualPaymentOrders = pgTable(
  'manual_payment_orders',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    channel: text('channel').notNull(),
    qrImageUrl: text('qr_image_url'),
    qrImageKey: text('qr_image_key'),
    productId: text('product_id').notNull(),
    offerId: text('offer_id').notNull(),
    kind: text('kind').notNull(),
    interval: text('interval'),
    intervalCount: integer('interval_count'),
    baseAmount: integer('base_amount').notNull(),
    fingerprint: integer('fingerprint').notNull(),
    payableAmount: integer('payable_amount').notNull(),
    currency: text('currency').notNull(),
    status: text('status').notNull(),
    payerNote: text('payer_note'),
    receiptKey: text('receipt_key'),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    observedAmount: integer('observed_amount'),
    externalReference: text('external_reference'),
    reviewNote: text('review_note'),
    reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    userStatusIdx: index('manual_payment_orders_user_status_idx').on(table.userId, table.status),
    statusExpiresIdx: index('manual_payment_orders_status_expires_idx').on(
      table.status,
      table.expiresAt,
    ),
    // 金额唯一性按收款账户而非「商品 + offer」约束：两个商品价格区间重叠时，
    // 仍可能出现同一收款码、同一时段、同一实付金额，人工无法区分。
    activeAmountUnique: uniqueIndex('manual_payment_orders_active_amount_unique')
      .on(table.accountId, table.payableAmount)
      .where(sql`status IN ('pending_payment','pending_verification','settling')`),
    // 同一账号只允许一个结算临界区。
    settlingUserUnique: uniqueIndex('manual_payment_orders_settling_user_unique')
      .on(table.userId)
      .where(sql`status = 'settling'`),
  }),
)

// ---------------------------------------------------------------------------
// 权限组与审计（rbac / audit）
// ---------------------------------------------------------------------------

/** 角色定义（如 super_admin / admin / editor / viewer）。 */
export const roles = pgTable(
  'roles',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('active'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('roles_status_idx').on(table.status),
  }),
)

/** 权限点定义（如 `*` / `admin.users.read` / `admin.roles.write`）。 */
export const permissions = pgTable(
  'permissions',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    resource: text('resource').notNull(),
    action: text('action').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    resourceActionIdx: index('permissions_resource_action_idx').on(table.resource, table.action),
  }),
)

/** 角色与权限点的多对多绑定。 */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: text('id').primaryKey(),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: text('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    rolePermissionUnique: uniqueIndex('role_permissions_role_permission_unique').on(
      table.roleId,
      table.permissionId,
    ),
  }),
)

/** 用户与角色的多对多绑定（支持临时授权过期时间）。 */
export const userRoles = pgTable(
  'user_roles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    userRoleUnique: uniqueIndex('user_roles_user_role_unique').on(table.userId, table.roleId),
    userExpiresIdx: index('user_roles_user_expires_idx').on(table.userId, table.expiresAt),
  }),
)

/** 审计日志：记录后台写操作与认证/支付关键事件，只追加不修改。 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorType: text('actor_type').notNull().default('admin'),
    operation: text('operation').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    summary: text('summary'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    actorCreatedIdx: index('audit_logs_actor_created_idx').on(table.actorId, table.createdAt),
    operationCreatedIdx: index('audit_logs_operation_created_idx').on(
      table.operation,
      table.createdAt,
    ),
    createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
  }),
)

// ---------------------------------------------------------------------------
// AI 任务原语（ai-tasks）
//
// 记录每次 AI 生成任务的输入、上游状态、积分预扣流水与失败自动退回（revoke）流水。
// ---------------------------------------------------------------------------

export const aiTasks = pgTable(
  'ai_tasks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaType: text('media_type').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    prompt: text('prompt').notNull(),
    options: text('options'),
    status: text('status').notNull().default('pending'),
    providerTaskId: text('provider_task_id'),
    output: text('output'),
    errorMessage: text('error_message'),
    costCredits: integer('cost_credits').notNull().default(0),
    creditTxId: text('credit_tx_id'),
    refundTxId: text('refund_tx_id'),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    userStatusIdx: index('ai_tasks_user_status_idx').on(table.userId, table.status),
    statusCreatedIdx: index('ai_tasks_status_created_idx').on(table.status, table.createdAt),
  }),
)

// ---------------------------------------------------------------------------
// 内容管理与运营组（M6：taxonomy / posts / changelogs / tickets / invite_codes）
// ---------------------------------------------------------------------------

export const taxonomies = pgTable(
  'taxonomies',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull().default('category'),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(100),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    typeSlugUnique: uniqueIndex('taxonomies_type_slug_unique').on(table.type, table.slug),
  }),
)

export const posts = pgTable(
  'posts',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    locale: text('locale').notNull().default('zh'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    content: text('content').notNull(),
    categorySlug: text('category_slug'),
    tags: text('tags'),
    status: text('status').notNull().default('published'),
    authorName: text('author_name').notNull().default('Admin'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    localeSlugUnique: uniqueIndex('posts_locale_slug_unique').on(table.locale, table.slug),
    statusPublishedIdx: index('posts_status_published_idx').on(table.status, table.publishedAt),
  }),
)

export const changelogs = pgTable(
  'changelogs',
  {
    id: text('id').primaryKey(),
    version: text('version').notNull(),
    locale: text('locale').notNull().default('zh'),
    title: text('title').notNull(),
    content: text('content').notNull(),
    status: text('status').notNull().default('published'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    localeVersionUnique: uniqueIndex('changelogs_locale_version_unique').on(
      table.locale,
      table.version,
    ),
  }),
)

export const tickets = pgTable(
  'tickets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    category: text('category').notNull().default('general'),
    priority: text('priority').notNull().default('normal'),
    content: text('content').notNull(),
    status: text('status').notNull().default('open'),
    adminReply: text('admin_reply'),
    repliedBy: text('replied_by'),
    repliedAt: timestamp('replied_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    userStatusIdx: index('tickets_user_status_idx').on(table.userId, table.status),
    statusCreatedIdx: index('tickets_status_created_idx').on(table.status, table.createdAt),
  }),
)

export const inviteCodes = pgTable(
  'invite_codes',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    bonusCredits: integer('bonus_credits').notNull().default(0),
    maxUses: integer('max_uses').notNull().default(1),
    usedCount: integer('used_count').notNull().default(0),
    status: text('status').notNull().default('active'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex('invite_codes_code_unique').on(table.code),
  }),
)
