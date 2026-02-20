CREATE TABLE "story_remixes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_story_id" uuid NOT NULL,
	"remix_story_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"remix_type" text DEFAULT 'fork' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "story_remixes" ADD CONSTRAINT "story_remixes_source_story_id_stories_id_fk" FOREIGN KEY ("source_story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_remixes" ADD CONSTRAINT "story_remixes_remix_story_id_stories_id_fk" FOREIGN KEY ("remix_story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "story_remixes_source_remix_unique" ON "story_remixes" USING btree ("source_story_id","remix_story_id");--> statement-breakpoint
CREATE UNIQUE INDEX "story_remixes_remix_story_unique" ON "story_remixes" USING btree ("remix_story_id");