ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "is_public_share" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "share_token" text;
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "share_updated_at" timestamp;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stories_share_token_unique" ON "stories" USING btree ("share_token") WHERE "share_token" IS NOT NULL;
