ALTER TABLE `subscriptions` ADD `pending_price_id` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `pending_product_id` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `pending_stripe_product_id` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `pending_interval` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `pending_amount` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `pending_currency` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `pending_effective_at` integer;