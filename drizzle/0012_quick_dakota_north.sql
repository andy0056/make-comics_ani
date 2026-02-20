CREATE TABLE "story_co_creation_room_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"active_panel" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_co_creation_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mode" text DEFAULT 'writers_room' NOT NULL,
	"objective" text,
	"created_by_user_id" text NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "story_co_creation_room_sessions" ADD CONSTRAINT "story_co_creation_room_sessions_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_co_creation_room_sessions" ADD CONSTRAINT "story_co_creation_room_sessions_room_id_story_co_creation_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."story_co_creation_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_co_creation_rooms" ADD CONSTRAINT "story_co_creation_rooms_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "story_co_creation_room_sessions_room_user_unique" ON "story_co_creation_room_sessions" USING btree ("room_id","user_id");