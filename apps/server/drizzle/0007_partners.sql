CREATE TABLE "partner_withdrawals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"partner_id" uuid NOT NULL,
	"amount_pt" bigint NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"from_cash" boolean DEFAULT true NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"archived_at" timestamp with time zone,
	"name" text NOT NULL,
	"share_bp" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partner_withdrawals" ADD CONSTRAINT "partner_withdrawals_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_withdrawals_partner_ix" ON "partner_withdrawals" USING btree ("partner_id","taken_at");--> statement-breakpoint
CREATE TRIGGER partners_seq_trg BEFORE UPDATE ON partners FOR EACH ROW EXECUTE FUNCTION bump_server_seq();
--> statement-breakpoint
CREATE TRIGGER partner_withdrawals_append_only BEFORE UPDATE OR DELETE ON partner_withdrawals FOR EACH ROW EXECUTE FUNCTION forbid_change();
