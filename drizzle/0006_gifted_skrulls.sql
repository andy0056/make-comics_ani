CREATE TABLE "story_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"appearance" text,
	"personality" text,
	"speech_style" text,
	"reference_image_url" text,
	"is_locked" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "uses_own_api_key" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "story_characters" ADD CONSTRAINT "story_characters_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pages_story_id_page_number_unique" ON "pages" USING btree ("story_id","page_number");