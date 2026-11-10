CREATE TABLE "work_order_photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"work_order_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "work_order_photos" ADD CONSTRAINT "work_order_photos_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_photos" ADD CONSTRAINT "work_order_photos_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wo_photos_wo_ix" ON "work_order_photos" USING btree ("work_order_id");--> statement-breakpoint
CREATE TRIGGER work_order_photos_seq_trg BEFORE UPDATE ON work_order_photos FOR EACH ROW EXECUTE FUNCTION bump_server_seq();
