CREATE TABLE "staff_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"user_id" uuid,
	"technician_id" uuid,
	"kind" text NOT NULL,
	"amount_pt" bigint NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"from_cash" boolean DEFAULT false NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "staff_entries" ADD CONSTRAINT "staff_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_entries" ADD CONSTRAINT "staff_entries_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_entries_at_ix" ON "staff_entries" USING btree ("at");--> statement-breakpoint
CREATE TRIGGER staff_entries_append_only BEFORE UPDATE OR DELETE ON staff_entries FOR EACH ROW EXECUTE FUNCTION forbid_change();
