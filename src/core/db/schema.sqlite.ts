import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * 本文件所属的方言。
 *
 * 生成物 `schema.ts` 重导出本文件，运行期据此校验「生成时的方言」与
 * 「运行时声明的 provider」是否一致——两者不一致时 SQL 会静默跑错方言，
 * 必须当场报错而不是等到写数据才暴露。
 */
export const SCHEMA_DIALECT = 'sqlite' as const

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

/**
 * 站点配置：按分组存 JSON（`brand` / `seo` / `social` / `payment` / `mail` /
 * `modules`），后台改完即时生效。
 *
 * 只存**公开参数**与开关；支付 / 邮件的密钥仍只在 env 里——配置表不是密钥库。
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

// ---------------------------------------------------------------------------
// 计费组：积分账本
//
// 表放在共享 schema 里（业务逻辑在 `src/modules/*`）：drizzle-kit 要能从**一个**
// 入口拿到全部表才能生成迁移，模块各自带一份方言定义会让「双 schema 漂移」的
// 面积翻倍。模块之间不互相读表，要跨模块取数据就走对方的 `service.ts`。
// ---------------------------------------------------------------------------

/** 积分余额：每个用户一行。余额只由账本事务改，别处不直接写。 */
export const creditBalances = sqliteTable('credit_balances', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  balance: integer('balance').notNull().default(0),
  totalGranted: integer('total_granted').notNull().default(0),
  totalConsumed: integer('total_consumed').notNull().default(0),
  totalRefunded: integer('total_refunded').notNull().default(0),
  /**
   * 最近一次改动余额的幂等键。
   *
   * 同一键重放时靠它挡住第二次扣减——它与 `credit_transactions.idempotency_key`
   * 是两道闸：流水表挡住「任何一次重放」，这一列挡住「流水表写入前就崩了」的窗口。
   */
  lastTxKey: text('last_tx_key'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

/**
 * 积分批次：一次发放是一个桶。
 *
 * 消费按到期时间**先进先出**扣桶；桶到期后剩余量作废（`expire` 事务）。
 * 没有批次就无法回答「这些积分什么时候过期」，也就没法按期退款。
 */
export const creditGrants = sqliteTable(
  'credit_grants',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    /** 还没被消费掉的余额。 */
    remaining: integer('remaining').notNull(),
    /** 发放来源：`purchase` / `admin` / `bonus` / `refund` / `adjust`。 */
    source: text('source').notNull(),
    /** 外部引用：订单号、支付流水号等。 */
    reference: text('reference'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    userIdx: index('credit_grants_user_idx').on(table.userId),
    /** 消费顺序：先到期先扣，没有到期的排最后。 */
    fifoIdx: index('credit_grants_fifo_idx').on(table.userId, table.expiresAt),
  }),
)

/** 积分流水：只追加，账本的事实源。 */
export const creditTransactions = sqliteTable(
  'credit_transactions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `grant` / `consume` / `refund` / `expire` / `adjust`。 */
    type: text('type').notNull(),
    /** 有符号：发放为正，消费为负，退款为正。 */
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    reference: text('reference'),
    /** 附加信息（JSON 文本）：反扣时记录应扣 / 实际扣减 / 差额。 */
    metadata: text('metadata'),
    /** 幂等键：同一个键重复提交只生效一次。 */
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    userIdx: index('credit_transactions_user_idx').on(table.userId, table.createdAt),
    idempotencyUnique: uniqueIndex('credit_transactions_idempotency_unique').on(
      table.idempotencyKey,
    ),
  }),
)

/** 消费与发放批次的对应关系：退款要按原批次退回。 */
export const creditAllocations = sqliteTable(
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
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    transactionIdx: index('credit_allocations_transaction_idx').on(table.transactionId),
    grantIdx: index('credit_allocations_grant_idx').on(table.grantId),
  }),
)

// ---------------------------------------------------------------------------
// 核销型支付（manual-payments）
//
// 收款账户只存运营对源码配置的覆盖，不复制源码默认值；核销订单表达
// 「先有意图、后由人确认」，已核验的资金事实仍只写 `payments` / `subscriptions`。
// ---------------------------------------------------------------------------

/** 核销型支付的收款账户：只存运营对源码配置的覆盖。 */
export const manualPaymentAccounts = sqliteTable('manual_payment_accounts', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull(),
  displayName: text('display_name').notNull(),
  currency: text('currency').notNull(),
  qrImageKey: text('qr_image_key'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

/** 核销型支付的购买意图与核验状态。 */
export const manualPaymentOrders = sqliteTable(
  'manual_payment_orders',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // 收款账户快照 ID，不设外键：账户可能只存在于源码配置里。
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
    submittedAt: integer('submitted_at', { mode: 'timestamp' }),
    observedAmount: integer('observed_amount'),
    externalReference: text('external_reference'),
    reviewNote: text('review_note'),
    reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    settledAt: integer('settled_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
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
//
// 角色（roles）与权限点（permissions）通过 `role_permissions` 多对多关联；
// 用户（users）通过 `user_roles` 绑定一个或多个角色（可带过期时间）。
// 审计日志（audit_logs）只追加不修改，记录后台写操作与关键认证/支付事件。
// ---------------------------------------------------------------------------

/** 角色定义（如 super_admin / admin / editor / viewer）。 */
export const roles = sqliteTable(
  'roles',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    title: text('title').notNull(),
    description: text('description'),
    /** `active` | `disabled` */
    status: text('status').notNull().default('active'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    statusIdx: index('roles_status_idx').on(table.status),
  }),
)

/** 权限点定义（如 `*` / `admin.users.read` / `admin.roles.write`）。 */
export const permissions = sqliteTable(
  'permissions',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    resource: text('resource').notNull(),
    action: text('action').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    resourceActionIdx: index('permissions_resource_action_idx').on(table.resource, table.action),
  }),
)

/** 角色与权限点的多对多绑定。 */
export const rolePermissions = sqliteTable(
  'role_permissions',
  {
    id: text('id').primaryKey(),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: text('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    rolePermissionUnique: uniqueIndex('role_permissions_role_permission_unique').on(
      table.roleId,
      table.permissionId,
    ),
  }),
)

/** 用户与角色的多对多绑定（支持临时授权过期时间）。 */
export const userRoles = sqliteTable(
  'user_roles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    userRoleUnique: uniqueIndex('user_roles_user_role_unique').on(table.userId, table.roleId),
    userExpiresIdx: index('user_roles_user_expires_idx').on(table.userId, table.expiresAt),
  }),
)

/** 审计日志：记录后台写操作与认证/支付关键事件，只追加不修改。 */
export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    /** `user` | `admin` | `system` | `apikey` */
    actorType: text('actor_type').notNull().default('admin'),
    operation: text('operation').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    summary: text('summary'),
    ipAddress: text('ip_address'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
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

export const aiTasks = sqliteTable(
  'ai_tasks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `text` | `image` | `video` | `audio` | `speech` */
    mediaType: text('media_type').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    prompt: text('prompt').notNull(),
    /** 附加参数 JSON 文本。 */
    options: text('options'),
    /** `pending` | `processing` | `succeeded` | `failed` | `canceled` */
    status: text('status').notNull().default('pending'),
    providerTaskId: text('provider_task_id'),
    /** 生成结果 JSON 文本（如图片/视频 URL 列表或文本内容）。 */
    output: text('output'),
    errorMessage: text('error_message'),
    costCredits: integer('cost_credits').notNull().default(0),
    /** 预扣积分对应的 `credit_transactions.id`。 */
    creditTxId: text('credit_tx_id'),
    /** 失败自动退回（revoke）对应的 `credit_transactions.id`，非空代表已退回。 */
    refundTxId: text('refund_tx_id'),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    userStatusIdx: index('ai_tasks_user_status_idx').on(table.userId, table.status),
    statusCreatedIdx: index('ai_tasks_status_created_idx').on(table.status, table.createdAt),
  }),
)

// ---------------------------------------------------------------------------
// 内容管理与运营组（M6：taxonomy / posts / changelogs / tickets / invite_codes）
// ---------------------------------------------------------------------------

export const taxonomies = sqliteTable(
  'taxonomies',
  {
    id: text('id').primaryKey(),
    /** `category` | `tag`。 */
    type: text('type').notNull().default('category'),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(100),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    typeSlugUnique: uniqueIndex('taxonomies_type_slug_unique').on(table.type, table.slug),
  }),
)

export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    locale: text('locale').notNull().default('zh'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    content: text('content').notNull(),
    categorySlug: text('category_slug'),
    /** JSON 数组字符串，如 `["ai","saas"]`。 */
    tags: text('tags'),
    /** `draft` | `published`。 */
    status: text('status').notNull().default('published'),
    authorName: text('author_name').notNull().default('Admin'),
    publishedAt: integer('published_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    localeSlugUnique: uniqueIndex('posts_locale_slug_unique').on(table.locale, table.slug),
    statusPublishedIdx: index('posts_status_published_idx').on(table.status, table.publishedAt),
  }),
)

export const changelogs = sqliteTable(
  'changelogs',
  {
    id: text('id').primaryKey(),
    version: text('version').notNull(),
    locale: text('locale').notNull().default('zh'),
    title: text('title').notNull(),
    content: text('content').notNull(),
    /** `draft` | `published`。 */
    status: text('status').notNull().default('published'),
    publishedAt: integer('published_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    localeVersionUnique: uniqueIndex('changelogs_locale_version_unique').on(
      table.locale,
      table.version,
    ),
  }),
)

export const tickets = sqliteTable(
  'tickets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    category: text('category').notNull().default('general'),
    /** `low` | `normal` | `high`。 */
    priority: text('priority').notNull().default('normal'),
    content: text('content').notNull(),
    /** `open` | `replied` | `closed`。 */
    status: text('status').notNull().default('open'),
    adminReply: text('admin_reply'),
    repliedBy: text('replied_by'),
    repliedAt: integer('replied_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    userStatusIdx: index('tickets_user_status_idx').on(table.userId, table.status),
    statusCreatedIdx: index('tickets_status_created_idx').on(table.status, table.createdAt),
  }),
)

export const inviteCodes = sqliteTable(
  'invite_codes',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    bonusCredits: integer('bonus_credits').notNull().default(0),
    maxUses: integer('max_uses').notNull().default(1),
    usedCount: integer('used_count').notNull().default(0),
    /** `active` | `disabled`。 */
    status: text('status').notNull().default('active'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    createdBy: text('created_by'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    codeUnique: uniqueIndex('invite_codes_code_unique').on(table.code),
  }),
)
