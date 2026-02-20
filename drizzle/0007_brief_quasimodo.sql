CREATE TABLE "character_dna_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"name" text NOT NULL,
	"visual_traits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"behavior_traits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"speech_traits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locked_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"story_id" uuid,
	"mission_type" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"last_prompted_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_worlds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"canon_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_dna_profiles" ADD CONSTRAINT "character_dna_profiles_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_dna_profiles" ADD CONSTRAINT "character_dna_profiles_character_id_story_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."story_characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_states" ADD CONSTRAINT "mission_states_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_worlds" ADD CONSTRAINT "story_worlds_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_dna_story_character_unique" ON "character_dna_profiles" USING btree ("story_id","character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mission_states_user_story_type_unique" ON "mission_states" USING btree ("user_id","story_id","mission_type");--> statement-breakpoint
CREATE UNIQUE INDEX "story_worlds_story_id_unique" ON "story_worlds" USING btree ("story_id");