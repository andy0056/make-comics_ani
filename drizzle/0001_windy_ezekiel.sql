ALTER TABLE "stories" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_slug_unique" UNIQUE("slug");