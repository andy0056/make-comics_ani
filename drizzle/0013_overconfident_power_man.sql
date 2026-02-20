CREATE TABLE "story_co_creation_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"room_id" uuid,
	"actor_user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"resource" text,
	"target_user_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "story_co_creation_audit_events" ADD CONSTRAINT "story_co_creation_audit_events_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_co_creation_audit_events" ADD CONSTRAINT "story_co_creation_audit_events_room_id_story_co_creation_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."story_co_creation_rooms"("id") ON DELETE set null ON UPDATE no action;