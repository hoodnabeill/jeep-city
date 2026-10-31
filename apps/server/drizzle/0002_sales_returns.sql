CREATE TABLE "sales_return_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"return_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"variant_id" uuid,
	"qty_milli" bigint NOT NULL,
	"value_pt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_returns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"number" bigint NOT NULL,
	"statement_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"total_pt" bigint NOT NULL,
	"refund_method_id" text NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_return_lines" ADD CONSTRAINT "sales_return_lines_return_id_sales_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."sales_returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_return_lines" ADD CONSTRAINT "sales_return_lines_line_id_doc_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."doc_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_return_lines" ADD CONSTRAINT "sales_return_lines_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."item_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_refund_method_id_payment_methods_id_fk" FOREIGN KEY ("refund_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_returns_number_uq" ON "sales_returns" USING btree ("number");--> statement-breakpoint
CREATE TRIGGER sales_returns_seq_trg BEFORE UPDATE ON sales_returns FOR EACH ROW EXECUTE FUNCTION bump_server_seq();
--> statement-breakpoint
CREATE TRIGGER sales_return_lines_seq_trg BEFORE UPDATE ON sales_return_lines FOR EACH ROW EXECUTE FUNCTION bump_server_seq();
