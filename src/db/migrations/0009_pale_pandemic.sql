CREATE TABLE `collection_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`display_name` text NOT NULL,
	`currency` text NOT NULL,
	`qr_image_key` text,
	`enabled` integer DEFAULT true NOT NULL,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `collection_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`channel` text NOT NULL,
	`qr_image_url` text,
	`qr_image_key` text,
	`product_id` text NOT NULL,
	`offer_id` text NOT NULL,
	`kind` text NOT NULL,
	`interval` text,
	`interval_count` integer,
	`base_amount` integer NOT NULL,
	`fingerprint` integer NOT NULL,
	`payable_amount` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`payer_note` text,
	`receipt_key` text,
	`submitted_at` integer,
	`observed_amount` integer,
	`external_reference` text,
	`review_note` text,
	`reviewed_by` text,
	`reviewed_at` integer,
	`expires_at` integer NOT NULL,
	`settled_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `collection_orders_user_status_idx` ON `collection_orders` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `collection_orders_status_expires_idx` ON `collection_orders` (`status`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `collection_orders_active_amount_unique` ON `collection_orders` (`account_id`,`payable_amount`) WHERE status IN ('pending_payment','pending_verification','settling');--> statement-breakpoint
CREATE UNIQUE INDEX `collection_orders_settling_user_unique` ON `collection_orders` (`user_id`) WHERE status = 'settling';