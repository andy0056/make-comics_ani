CREATE TABLE "story_edit_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"resource" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_editor_presence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"page_number" integer DEFAULT 1 NOT NULL,
	"active_panel" text,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "story_edit_locks" ADD CONSTRAINT "story_edit_locks_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_editor_presence" ADD CONSTRAINT "story_editor_presence_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "story_edit_locks_story_resource_unique" ON "story_edit_locks" USING btree ("story_id","resource");--> statement-breakpoint
CREATE UNIQUE INDEX "story_editor_presence_story_user_unique" ON "story_editor_presence" USING btree ("story_id","user_id");