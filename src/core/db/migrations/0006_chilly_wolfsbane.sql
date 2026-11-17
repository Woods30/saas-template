ALTER TABLE `payments` ADD `product_id` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `stripe_product_id` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `interval` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `customer_id` text;--> statement-breakpoint
CREATE INDEX `payments_customer_idx` ON `payments` (`customer_id`);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `product_id` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `stripe_product_id` text;