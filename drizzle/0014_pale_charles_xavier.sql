CREATE TABLE "story_creator_economy_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"sprint_objective" text NOT NULL,
	"horizon_days" integer DEFAULT 7 NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"baseline_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome_notes" text,
	"outcome_decision" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "story_creator_economy_runs" ADD CONSTRAINT "story_creator_economy_runs_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;