ALTER TABLE "stories" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "style" text DEFAULT 'noir' NOT NULL;