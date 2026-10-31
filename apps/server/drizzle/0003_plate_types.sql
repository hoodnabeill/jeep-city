CREATE TABLE "plate_types" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"bar_color" text,
	"text_color" text DEFAULT '#0B0B0B' NOT NULL,
	"digits_only" boolean DEFAULT false NOT NULL,
	"small" boolean DEFAULT false NOT NULL,
	"to_confirm" boolean DEFAULT false NOT NULL,
	"sort" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
-- Existing vehicles get the default type before the foreign key is added; bootstrap seeds the rest.
INSERT INTO "plate_types" ("id", "label", "bar_color", "text_color", "sort") VALUES ('private', 'ملاكي', '#8DC2EC', '#0B0B0B', 1) ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "plate_type" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_plate_type_plate_types_id_fk" FOREIGN KEY ("plate_type") REFERENCES "public"."plate_types"("id") ON DELETE no action ON UPDATE no action;