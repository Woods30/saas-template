import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// Better Auth 自动生成的表（与 better-auth CLI 输出一致）
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  name: text('name'),
  image: text('image'),
  role: text('role').notNull().default('user'),
  banned: integer('banned', { mode: 'boolean' }).default(false),
  banReason: text('ban_reason'),
  banExpires: integer('ban_expires', { mode: 'timestamp' }),
  // 注意：这里**没有**软删除列。admin 插件的 `removeUser` 是硬删除（连同会话与账号
  // 一并级联），写任何软删除字段都不会有人读；需要「可恢复删除」时应改用自定义
  // 插件或 `adminUpdateUser` + 自有字段，而不是留一个永远为 null 的列。
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  // better-auth admin 插件：记录「被谁 impersonate」的管理员 id（可空）。
  impersonatedBy: text('impersonated_by'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  // better-auth 1.7.10 的 session 模型要求 updatedAt（required，onUpdate）。
  // 缺列会让 drizzle 适配器在运行时报 `SchemaMismatchError: Missing columns: session.updatedAt`。
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const accounts = sqliteTable(
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
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
    scope: text('scope'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    providerAccountUnique: uniqueIndex('accounts_provider_account_unique').on(
      table.providerId,
      table.accountId,
    ),
  }),
)

export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

// 业务表
/**
 * 订阅。
 *
 * `customerId` / `subscriptionId` 是**外部系统主键**，列名不绑定供应商（见
 * `payments` 的说明）。`subscription_id` / `customer_id` / `user_id` 三列各建一个
 * 普通索引：webhook 每个事件都按 subscription_id 更新、按 customer_id 反查用户，
 * 而工作台与 portal 端点都按 user_id 取当前订阅。此前三者都无索引，是整表扫描。
 *
 * 不建唯一索引：Stripe 允许同一用户有多个订阅（历史遗留、升降级并存），
 * 强行唯一会在合法场景下让 webhook 写入失败。
 */
export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    customerId: text('customer_id'),
    subscriptionId: text('subscription_id'),
    status: text('status').notNull(),
    priceId: text('price_id'),
    amount: integer('amount'),
    currency: text('currency'),
    interval: text('interval'),
    currentPeriodStart: integer('current_period_start', { mode: 'timestamp' }),
    currentPeriodEnd: integer('current_period_end', { mode: 'timestamp' }),
    cancelAtPeriodEnd: integer('cancel_at_period_end', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    userIdx: index('subscriptions_user_idx').on(table.userId),
    customerIdx: index('subscriptions_customer_idx').on(table.customerId),
    subscriptionIdx: index('subscriptions_subscription_idx').on(table.subscriptionId),
  }),
)

/**
 * 支付流水。
 *
 * 列名刻意保持**供应商中立**（`provider` / `invoiceId` / `chargeId` 而非
 * `stripeInvoiceId`）：Stripe 是当前唯一的 provider，但模板的 provider 注册表允许
 * 接入 Creem / Waffo 等。若把供应商写进列名，新增 provider 时要么改表、要么在新列
 * 里重复同一语义，两种做法都会让「一个用户的所有流水」查询变成按 provider 分支。
 *
 * `subscriptionId` / `customerId` 同理：它们是外部系统的主键，语义跨供应商一致。
 */
export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** 产生该流水的 provider（`stripe` / 未来的 `creem` 等）。 */
    provider: text('provider').notNull().default('stripe'),
    type: text('type').notNull(),
    invoiceId: text('invoice_id'),
    chargeId: text('charge_id'),
    status: text('status').notNull(),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull(),
    description: text('description'),
    paidAt: integer('paid_at', { mode: 'timestamp' }),
    refundedAt: integer('refunded_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    // 退款按 chargeId 回写、对账按 invoiceId 查询，两者都走点查。
    invoiceIdx: index('payments_invoice_idx').on(table.invoiceId),
    chargeIdx: index('payments_charge_idx').on(table.chargeId),
    userIdx: index('payments_user_idx').on(table.userId),
  }),
)

export const files = sqliteTable('files', {
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
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

// Better Auth `@better-auth/api-key` 插件生成的表。
// 列以插件内置的 `apiKeySchema`（node_modules/@better-auth/api-key）为唯一依据：
// 21 个声明字段 + 自动 id = 22 列；索引在 config_id / reference_id / key（均为普通索引，非 unique）。
export const apikey = sqliteTable(
  'apikey',
  {
    id: text('id').primaryKey(),
    configId: text('config_id').notNull().default('default'),
    name: text('name'),
    start: text('start'),
    referenceId: text('reference_id').notNull(),
    prefix: text('prefix'),
    key: text('key').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }),
    refillInterval: integer('refill_interval'),
    refillAmount: integer('refill_amount'),
    lastRefillAt: integer('last_refill_at', { mode: 'timestamp' }),
    rateLimitEnabled: integer('rate_limit_enabled', { mode: 'boolean' }),
    rateLimitTimeWindow: integer('rate_limit_time_window'),
    rateLimitMax: integer('rate_limit_max'),
    requestCount: integer('request_count'),
    remaining: integer('remaining'),
    lastRequest: integer('last_request', { mode: 'timestamp' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    // 插件 schema 里 createdAt / updatedAt 为 required 且无默认值，故此处 notNull() 不加 default。
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    permissions: text('permissions'),
    metadata: text('metadata'),
  },
  (table) => ({
    configIdIdx: index('apikey_config_id_idx').on(table.configId),
    referenceIdIdx: index('apikey_reference_id_idx').on(table.referenceId),
    keyIdx: index('apikey_key_idx').on(table.key),
  }),
)

export const newsletterSubscriptions = sqliteTable('newsletter_subscriptions', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  provider: text('provider').notNull(),
  providerListId: text('provider_list_id'),
  status: text('status').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

// 幂等表：所有外部 webhook 统一落点，避免重投/乱序造成重复副作用。
// 业务 handler 在 transaction 中先 INSERT event id，成功后 UPDATE processedAt；
// 失败 DELETE 整行让源端重投。
export const webhookEvents = sqliteTable(
  'webhook_events',
  {
    id: text('id').primaryKey(), // source event id (e.g. `evt_xxx` for Stripe)
    source: text('source').notNull(), // 'stripe' / 'github' / ...
    type: text('type').notNull(),
    payload: text('payload').notNull(), // raw JSON for replay
    receivedAt: integer('received_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    processedAt: integer('processed_at', { mode: 'timestamp' }),
  },
  (table) => ({
    // 补处理：扫描「已收未处理」的事件（进程在 UPDATE processedAt 前崩溃会留下这类行）。
    processedIdx: index('webhook_events_processed_idx').on(table.processedAt),
    // 排障按来源 + 类型过滤。
    sourceTypeIdx: index('webhook_events_source_type_idx').on(table.source, table.type),
  }),
)
