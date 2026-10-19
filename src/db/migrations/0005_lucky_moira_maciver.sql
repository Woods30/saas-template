-- `payments` 的列名改为供应商中立，并补上 webhook 实际用到的索引。
--
-- 列名改动（`stripe_invoice_id` → `invoice_id`、`stripe_charge_id` → `charge_id`）
-- 是重命名而非删旧建新：`payments` 在真实环境已有数据，DROP 会永久丢失历史流水。
-- SQLite 3.25+ 支持 `ALTER TABLE ... RENAME COLUMN`，数据与索引定义一并保留。
--
-- 同时新增 `provider` 列，默认 `stripe`：模板的 provider 注册表允许接入 Creem /
-- Waffo 等其他支付渠道（见 `src/payment/types.ts` 的 `PaymentProvider`），列名里
-- 写死 Stripe 会让新增 provider 时要么改表、要么另起一套同义列。默认值让既有行
-- 自动归到 stripe，无需回填脚本。
ALTER TABLE `payments` RENAME COLUMN `stripe_invoice_id` TO `invoice_id`;--> statement-breakpoint
ALTER TABLE `payments` RENAME COLUMN `stripe_charge_id` TO `charge_id`;--> statement-breakpoint
ALTER TABLE `payments` ADD `provider` text DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
CREATE INDEX `payments_invoice_idx` ON `payments` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `payments_charge_idx` ON `payments` (`charge_id`);--> statement-breakpoint
CREATE INDEX `payments_user_idx` ON `payments` (`user_id`);--> statement-breakpoint
-- `subscriptions` 的 webhook 查询路径：每个事件都按 subscription_id 更新、
-- 按 customer_id 反查用户。此前两者都无索引，是整表扫描。
CREATE INDEX `subscriptions_user_idx` ON `subscriptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_customer_idx` ON `subscriptions` (`customer_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_subscription_idx` ON `subscriptions` (`subscription_id`);--> statement-breakpoint
-- `webhook_events`：补处理要扫「已收未处理」的行（`processed_at IS NULL`），
-- 排障要按 source + type 过滤。
CREATE INDEX `webhook_events_processed_idx` ON `webhook_events` (`processed_at`);--> statement-breakpoint
CREATE INDEX `webhook_events_source_type_idx` ON `webhook_events` (`source`, `type`);
