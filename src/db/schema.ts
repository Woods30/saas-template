import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// Better Auth 表：需与 better-auth CLI 输出保持一致。
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
  // 没有软删除列：admin 插件的 `removeUser` 是硬删除，写软删除字段不会有人读；
  // 需要「可恢复删除」应改用自定义插件，而不是留一个永远为 null 的列。
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
/** 服务商订阅按外部 ID 幂等；账号购买名额由 Checkout 预留与状态守卫控制。 */
export const subscriptions = sqliteTable(
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
    currentPeriodStart: integer('current_period_start', { mode: 'timestamp' }),
    currentPeriodEnd: integer('current_period_end', { mode: 'timestamp' }),
    cancelAtPeriodEnd: integer('cancel_at_period_end', { mode: 'boolean' }).default(false),
    snapshotVersion: integer('snapshot_version').notNull().default(0),
    eventCreated: integer('event_created').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    userIdx: index('subscriptions_user_idx').on(table.userId),
    externalUnique: uniqueIndex('subscriptions_provider_external_unique').on(
      table.provider,
      table.subscriptionId,
    ),
  }),
)

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
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
    eventCreated: integer('event_created').notNull().default(0),
    paidAt: integer('paid_at', { mode: 'timestamp' }),
    refundedAt: integer('refunded_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    externalUnique: uniqueIndex('payments_provider_external_unique').on(
      table.provider,
      table.externalId,
    ),
    userIdx: index('payments_user_idx').on(table.userId),
    chargeIdx: index('payments_charge_idx').on(table.provider, table.chargeId),
  }),
)

/** 订阅 Checkout 每账号一个预留；一次性购买不占用。 */
export const checkoutReservations = sqliteTable('checkout_reservations', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  token: text('token').notNull(),
  productId: text('product_id').notNull(),
  offerId: text('offer_id').notNull(),
  request: text('request').notNull(),
  sessionId: text('session_id'),
  url: text('url'),
  expiresAt: integer('expires_at').notNull(),
})

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

// `@better-auth/api-key` 插件生成的表，列以插件内置的 `apiKeySchema` 为唯一依据：
// 21 个声明字段 + 自动 id = 22 列；索引均为普通索引（非 unique）。
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

// 幂等表：支付事件在业务幂等写入成功后标记 processedAt，失败由源端重投。
export const webhookEvents = sqliteTable(
  'webhook_events',
  {
    id: text('id').primaryKey(), // source event id (e.g. `evt_xxx` for Stripe)
    source: text('source').notNull(),
    type: text('type').notNull(),
    payload: text('payload').notNull(),
    receivedAt: integer('received_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    processedAt: integer('processed_at', { mode: 'timestamp' }),
  },
  (table) => ({
    // 扫描「已收未处理」的事件（进程在 UPDATE processedAt 前崩溃会留下这类行）。
    processedIdx: index('webhook_events_processed_idx').on(table.processedAt),
    sourceTypeIdx: index('webhook_events_source_type_idx').on(table.source, table.type),
  }),
)
