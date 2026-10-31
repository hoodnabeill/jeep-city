CREATE TYPE "public"."line_category" AS ENUM('labor', 'part', 'oil', 'material', 'paint');--> statement-breakpoint
CREATE TYPE "public"."check_status" AS ENUM('good', 'watch', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."grade" AS ENUM('original', 'copy', 'used');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('part', 'oil', 'material', 'labor', 'paint');--> statement-breakpoint
CREATE TYPE "public"."movement_kind" AS ENUM('opening', 'purchase_in', 'purchase_return', 'issue_out', 'issue_return', 'sale_out', 'sales_return', 'adjustment', 'count', 'statement_edit', 'statement_cancel');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('statement', 'debt_settlement', 'refund');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'engineer');--> statement-breakpoint
CREATE TYPE "public"."statement_kind" AS ENUM('statement', 'direct_sale');--> statement-breakpoint
CREATE TYPE "public"."statement_status" AS ENUM('final', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."wo_status" AS ENUM('open', 'ready', 'delivered', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."wo_type" AS ENUM('repair', 'inquiry', 'condition');--> statement-breakpoint
CREATE SEQUENCE "public"."change_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"device_id" text,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "bonuses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"user_id" uuid,
	"technician_id" uuid,
	"amount_pt" bigint NOT NULL,
	"given_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"statement_id" uuid
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"amount_pt" bigint NOT NULL,
	"kind" text NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"note" text,
	"moved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"opening_pt" bigint NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"expected_pt" bigint,
	"counted_pt" bigint,
	"difference_pt" bigint,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "condition_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"report_id" uuid NOT NULL,
	"system" text NOT NULL,
	"item" text NOT NULL,
	"status" "check_status" NOT NULL,
	"note" text,
	"photo_file_id" uuid,
	"recommended_variant_id" uuid,
	"recommended_text" text,
	"recommended_price_pt" bigint
);
--> statement-breakpoint
CREATE TABLE "condition_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"work_order_id" uuid NOT NULL,
	"vehicle_id" uuid
);
--> statement-breakpoint
CREATE TABLE "customer_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount_pt" bigint NOT NULL,
	"kind" text NOT NULL,
	"ref_type" text,
	"ref_id" uuid
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"archived_at" timestamp with time zone,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"mobile" text,
	"office_phone" text,
	"home_phone" text,
	"whatsapp" text,
	"governorate" text,
	"address" text,
	"occupation" text,
	"notes" text,
	"internal_notes" text,
	"opening_balance_pt" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "doc_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"archived_at" timestamp with time zone,
	"work_order_id" uuid,
	"statement_id" uuid,
	"category" "line_category" NOT NULL,
	"item_id" uuid,
	"variant_id" uuid,
	"code" text,
	"name" text NOT NULL,
	"grade" "grade",
	"unit" text,
	"qty_milli" bigint NOT NULL,
	"unit_price_pt" bigint NOT NULL,
	"technician_id" uuid,
	"finished_at" timestamp with time zone,
	"stock_qty_milli" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"work_order_id" uuid NOT NULL,
	"old_pt" bigint,
	"new_pt" bigint NOT NULL,
	"approved_by_name" text NOT NULL,
	"method" text NOT NULL,
	"approved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"archived_at" timestamp with time zone,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"category_id" uuid NOT NULL,
	"amount_pt" bigint NOT NULL,
	"spent_at" timestamp with time zone NOT NULL,
	"paid_by" text,
	"notes" text,
	"file_id" uuid,
	"from_cash" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"sha256" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"path" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_marks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"work_order_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"view" text DEFAULT 'top' NOT NULL,
	"x_permille" integer NOT NULL,
	"y_permille" integer NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"photo_file_id" uuid
);
--> statement-breakpoint
CREATE TABLE "item_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"archived_at" timestamp with time zone,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"archived_at" timestamp with time zone,
	"item_id" uuid NOT NULL,
	"grade" "grade",
	"sell_price_pt" bigint NOT NULL,
	"barcode" text,
	"min_qty_milli" bigint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"archived_at" timestamp with time zone,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"name_key" text NOT NULL,
	"type" "item_type" NOT NULL,
	"category_id" uuid,
	"unit" text NOT NULL,
	"location" text,
	"notes" text,
	"photo_file_id" uuid,
	"track_stock" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "number_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"series" text NOT NULL,
	"device_id" text NOT NULL,
	"from_value" bigint NOT NULL,
	"to_value" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "number_series" (
	"series" text PRIMARY KEY NOT NULL,
	"next_value" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "odometer_readings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"km" integer NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	"work_order_id" uuid,
	"override_reason" text
);
--> statement-breakpoint
CREATE TABLE "package_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"package_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"qty_milli" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"needs_reference" boolean DEFAULT false NOT NULL,
	"is_credit" boolean DEFAULT false NOT NULL,
	"is_cash" boolean DEFAULT false NOT NULL,
	"sort" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"statement_id" uuid,
	"customer_id" uuid NOT NULL,
	"method_id" text NOT NULL,
	"amount_pt" bigint NOT NULL,
	"reference" text,
	"kind" "payment_kind" NOT NULL,
	"paid_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"purchase_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"qty_milli" bigint NOT NULL,
	"unit_cost_pt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"number" bigint NOT NULL,
	"kind" text DEFAULT 'invoice' NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_date" text NOT NULL,
	"payment" text NOT NULL,
	"total_pt" bigint NOT NULL,
	"supplier_ref" text
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"archived_at" timestamp with time zone,
	"vehicle_id" uuid,
	"customer_id" uuid,
	"due_date" text,
	"due_km" integer,
	"kind" text NOT NULL,
	"note" text,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "service_packages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"archived_at" timestamp with time zone,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" text,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"token_hash" text NOT NULL,
	"doc_type" text NOT NULL,
	"doc_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "statement_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"statement_id" uuid NOT NULL,
	"rev_no" integer NOT NULL,
	"reason" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"number" bigint NOT NULL,
	"kind" "statement_kind" DEFAULT 'statement' NOT NULL,
	"work_order_id" uuid,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"statement_date" text NOT NULL,
	"exit_at" timestamp with time zone,
	"discounts" jsonb NOT NULL,
	"tax_exempt" boolean DEFAULT false NOT NULL,
	"totals" jsonb NOT NULL,
	"amount_due_pt" bigint NOT NULL,
	"not_done" text,
	"status" "statement_status" DEFAULT 'final' NOT NULL,
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_count_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"count_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"system_qty_milli" bigint NOT NULL,
	"counted_qty_milli" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "stock_levels" (
	"variant_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"qty_milli" bigint DEFAULT 0 NOT NULL,
	"avg_cost_pt" bigint DEFAULT 0 NOT NULL,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	CONSTRAINT "stock_levels_variant_id_warehouse_id_pk" PRIMARY KEY("variant_id","warehouse_id")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"variant_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"qty_milli" bigint NOT NULL,
	"kind" "movement_kind" NOT NULL,
	"unit_cost_pt" bigint NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "supplier_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"supplier_id" uuid NOT NULL,
	"amount_pt" bigint NOT NULL,
	"kind" text NOT NULL,
	"ref_type" text,
	"ref_id" uuid
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"archived_at" timestamp with time zone,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"contact" text,
	"phone" text,
	"whatsapp" text,
	"address" text,
	"notes" text,
	"opening_balance_pt" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_mutations" (
	"mutation_id" uuid PRIMARY KEY NOT NULL,
	"device_id" text,
	"user_id" uuid,
	"result" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technicians" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"archived_at" timestamp with time zone,
	"name" text NOT NULL,
	"phone" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"archived_at" timestamp with time zone,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "role" NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"archived_at" timestamp with time zone,
	"customer_id" uuid NOT NULL,
	"plate_letters" text,
	"plate_digits" text,
	"plate_key" text,
	"chassis" text,
	"license_no" text,
	"make" text,
	"model" text,
	"variant" text,
	"year" integer,
	"engine_size" text,
	"engine_no" text,
	"model_no" text,
	"color" text,
	"warranty_end" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_technicians" (
	"work_order_id" uuid NOT NULL,
	"technician_id" uuid NOT NULL,
	CONSTRAINT "work_order_technicians_work_order_id_technician_id_pk" PRIMARY KEY("work_order_id","technician_id")
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_id" text,
	"server_seq" bigint DEFAULT nextval('change_seq') NOT NULL,
	"archived_at" timestamp with time zone,
	"number" bigint,
	"type" "wo_type" DEFAULT 'repair' NOT NULL,
	"status" "wo_status" DEFAULT 'open' NOT NULL,
	"vehicle_id" uuid,
	"customer_id" uuid NOT NULL,
	"representative" text,
	"reception_user_id" uuid,
	"entered_at" timestamp with time zone NOT NULL,
	"expected_at" timestamp with time zone,
	"odometer_in" integer,
	"comeback" boolean DEFAULT false NOT NULL,
	"fault_type" text,
	"repair_type" text,
	"booking" text,
	"insurance_company" text,
	"complaint" text,
	"engineer_notes" text,
	"customer_notes" text,
	"internal_notes" text,
	"fuel_level" integer,
	"belongings" jsonb,
	"estimate_pt" bigint,
	"signature_file_id" uuid,
	"warehouse_id" uuid
);
--> statement-breakpoint
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_items" ADD CONSTRAINT "condition_items_report_id_condition_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."condition_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_reports" ADD CONSTRAINT "condition_reports_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_reports" ADD CONSTRAINT "condition_reports_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_ledger" ADD CONSTRAINT "customer_ledger_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_lines" ADD CONSTRAINT "doc_lines_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_lines" ADD CONSTRAINT "doc_lines_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_lines" ADD CONSTRAINT "doc_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_lines" ADD CONSTRAINT "doc_lines_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."item_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_lines" ADD CONSTRAINT "doc_lines_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_approvals" ADD CONSTRAINT "estimate_approvals_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_marks" ADD CONSTRAINT "intake_marks_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_marks" ADD CONSTRAINT "intake_marks_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odometer_readings" ADD CONSTRAINT "odometer_readings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_lines" ADD CONSTRAINT "package_lines_package_id_service_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."service_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_lines" ADD CONSTRAINT "package_lines_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."item_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_id_payment_methods_id_fk" FOREIGN KEY ("method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."item_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_revisions" ADD CONSTRAINT "statement_revisions_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_stock_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."stock_counts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."item_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."item_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."item_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ledger" ADD CONSTRAINT "supplier_ledger_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_technicians" ADD CONSTRAINT "work_order_technicians_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_technicians" ADD CONSTRAINT "work_order_technicians_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_reception_user_id_users_id_fk" FOREIGN KEY ("reception_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_at_ix" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_entity_ix" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "cash_moved_ix" ON "cash_movements" USING btree ("moved_at");--> statement-breakpoint
CREATE INDEX "cledger_customer_ix" ON "customer_ledger" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customers_name_key_ix" ON "customers" USING btree ("name_key");--> statement-breakpoint
CREATE INDEX "customers_mobile_ix" ON "customers" USING btree ("mobile");--> statement-breakpoint
CREATE INDEX "lines_wo_ix" ON "doc_lines" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "lines_statement_ix" ON "doc_lines" USING btree ("statement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_barcode_uq" ON "item_variants" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "variants_item_ix" ON "item_variants" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "items_code_uq" ON "items" USING btree ("code");--> statement-breakpoint
CREATE INDEX "items_name_key_ix" ON "items" USING btree ("name_key");--> statement-breakpoint
CREATE INDEX "odometer_vehicle_ix" ON "odometer_readings" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "payments_statement_ix" ON "payments" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "payments_customer_ix" ON "payments" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_kind_number_uq" ON "purchases" USING btree ("kind","number");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_family_ix" ON "sessions" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_token_uq" ON "share_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "statements_kind_number_uq" ON "statements" USING btree ("kind","number");--> statement-breakpoint
CREATE INDEX "statements_customer_ix" ON "statements" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "moves_variant_ix" ON "stock_movements" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "moves_ref_ix" ON "stock_movements" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uq" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "vehicles_plate_ix" ON "vehicles" USING btree ("plate_key");--> statement-breakpoint
CREATE INDEX "vehicles_chassis_ix" ON "vehicles" USING btree ("chassis");--> statement-breakpoint
CREATE INDEX "vehicles_customer_ix" ON "vehicles" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wo_number_uq" ON "work_orders" USING btree ("number");--> statement-breakpoint
CREATE INDEX "wo_vehicle_ix" ON "work_orders" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "wo_status_ix" ON "work_orders" USING btree ("status");