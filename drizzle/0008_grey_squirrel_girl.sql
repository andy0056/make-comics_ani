CREATE TABLE "creator_twin_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"preferred_arc_page_count" integer DEFAULT 3 NOT NULL,
	"preferred_dialogue_mode" text DEFAULT 'balanced' NOT NULL,
	"preferred_audience_mode" text DEFAULT 'general' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_twin_profiles_user_id_unique" UNIQUE("user_id")
);
