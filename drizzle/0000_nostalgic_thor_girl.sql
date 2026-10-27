CREATE TABLE `service_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fare_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
