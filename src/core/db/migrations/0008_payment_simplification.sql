-- 支付模型精简；不转换旧业务数据。部署前应使用空白支付表，勿直接应用到生产。
ALTER TABLE subscriptions ADD COLUMN provider text NOT NULL DEFAULT 'stripe';
ALTER TABLE subscriptions ADD COLUMN offer_id text;
ALTER TABLE subscriptions ADD COLUMN interval_count integer;
ALTER TABLE subscriptions ADD COLUMN event_created integer NOT NULL DEFAULT 0;
ALTER TABLE subscriptions DROP COLUMN stripe_product_id;
ALTER TABLE subscriptions DROP COLUMN pending_price_id;
ALTER TABLE subscriptions DROP COLUMN pending_product_id;
ALTER TABLE subscriptions DROP COLUMN pending_stripe_product_id;
ALTER TABLE subscriptions DROP COLUMN pending_interval;
ALTER TABLE subscriptions DROP COLUMN pending_amount;
ALTER TABLE subscriptions DROP COLUMN pending_currency;
ALTER TABLE subscriptions DROP COLUMN pending_effective_at;
CREATE UNIQUE INDEX subscriptions_provider_external_unique ON subscriptions(provider, subscription_id);
ALTER TABLE payments ADD COLUMN external_id text;
ALTER TABLE payments ADD COLUMN offer_id text;
ALTER TABLE payments ADD COLUMN subscription_id text;
ALTER TABLE payments ADD COLUMN refunded_amount integer NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN event_created integer NOT NULL DEFAULT 0;
ALTER TABLE payments DROP COLUMN stripe_product_id;
CREATE UNIQUE INDEX payments_provider_external_unique ON payments(provider, external_id);
CREATE TABLE checkout_reservations (
  user_id text PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  token text NOT NULL,
  product_id text NOT NULL,
  offer_id text NOT NULL,
  request text NOT NULL,
  session_id text,
  url text,
  expires_at integer NOT NULL
);

CREATE TABLE __new_subscriptions (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "provider" text NOT NULL DEFAULT 'stripe',
  "customer_id" text,
  "subscription_id" text NOT NULL,
  "status" text NOT NULL,
  "price_id" text,
  "product_id" text,
  "offer_id" text,
  "amount" integer,
  "currency" text,
  "interval" text,
  "interval_count" integer,
  "current_period_start" integer,
  "current_period_end" integer,
  "cancel_at_period_end" integer DEFAULT 0,
  "event_created" integer NOT NULL DEFAULT 0,
  "created_at" integer NOT NULL DEFAULT (unixepoch()),
  "updated_at" integer NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
);
INSERT INTO __new_subscriptions ("id", "user_id", "provider", "customer_id", "subscription_id", "status", "price_id", "product_id", "offer_id", "amount", "currency", "interval", "interval_count", "current_period_start", "current_period_end", "cancel_at_period_end", "event_created", "created_at", "updated_at") SELECT "id", "user_id", "provider", "customer_id", "subscription_id", "status", "price_id", "product_id", "offer_id", "amount", "currency", "interval", "interval_count", "current_period_start", "current_period_end", "cancel_at_period_end", "event_created", "created_at", "updated_at" FROM subscriptions;
DROP TABLE subscriptions;
ALTER TABLE __new_subscriptions RENAME TO subscriptions;
CREATE INDEX subscriptions_user_idx ON subscriptions(user_id);
CREATE UNIQUE INDEX subscriptions_provider_external_unique ON subscriptions(provider, subscription_id);

CREATE TABLE __new_payments (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "provider" text NOT NULL DEFAULT 'stripe',
  "external_id" text NOT NULL,
  "type" text NOT NULL,
  "invoice_id" text,
  "charge_id" text,
  "subscription_id" text,
  "status" text NOT NULL,
  "amount" integer NOT NULL,
  "refunded_amount" integer NOT NULL DEFAULT 0,
  "currency" text NOT NULL,
  "description" text,
  "product_id" text,
  "offer_id" text,
  "customer_id" text,
  "event_created" integer NOT NULL DEFAULT 0,
  "paid_at" integer,
  "refunded_at" integer,
  "created_at" integer NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE set null
);
INSERT INTO __new_payments ("id", "user_id", "provider", "external_id", "type", "invoice_id", "charge_id", "subscription_id", "status", "amount", "refunded_amount", "currency", "description", "product_id", "offer_id", "customer_id", "event_created", "paid_at", "refunded_at", "created_at") SELECT "id", "user_id", "provider", "external_id", "type", "invoice_id", "charge_id", "subscription_id", "status", "amount", "refunded_amount", "currency", "description", "product_id", "offer_id", "customer_id", "event_created", "paid_at", "refunded_at", "created_at" FROM payments;
DROP TABLE payments;
ALTER TABLE __new_payments RENAME TO payments;
CREATE UNIQUE INDEX payments_provider_external_unique ON payments(provider, external_id);
CREATE INDEX payments_user_idx ON payments(user_id);
CREATE INDEX payments_charge_idx ON payments(provider, charge_id);

ALTER TABLE subscriptions ADD COLUMN snapshot_version integer NOT NULL DEFAULT 0;
