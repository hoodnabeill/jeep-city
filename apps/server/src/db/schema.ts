/**
 * Database schema (PLAN §4). Money columns end in `Pt` (piasters), quantities in `Milli` (thousandths).
 * Synced rows carry: client-generated UUIDv7 `id`, `server_seq` (global change counter for pull, bumped on
 * every insert/update by trigger), `created_by`, `device_id`. Nothing is hard-deleted: `archived_at` instead.
 * Ledgers (stock_movements, cash_movements, customer_ledger, supplier_ledger, payments, audit_log) are append-only.
 */
import { sql } from "drizzle-orm";
import {
  bigint, boolean, index, integer, jsonb, pgEnum, pgSequence, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

export const changeSeq = pgSequence("change_seq");

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string) => bigint(name, { mode: "number" });
const base = () => ({
  id: uuid("id").primaryKey(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  createdBy: uuid("created_by"),
  deviceId: text("device_id"),
  serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(sql`nextval('change_seq')`),
});
const archived = () => ({ archivedAt: ts("archived_at") });

export const roleEnum = pgEnum("role", ["admin", "engineer"]);
export const itemTypeEnum = pgEnum("item_type", ["part", "oil", "material", "labor", "paint"]);
export const gradeEnum = pgEnum("grade", ["original", "copy", "used"]);
export const categoryEnum = pgEnum("line_category", ["labor", "part", "oil", "material", "paint"]);
export const woTypeEnum = pgEnum("wo_type", ["repair", "inquiry", "condition"]);
export const woStatusEnum = pgEnum("wo_status", ["open", "ready", "delivered", "closed", "cancelled"]);
export const stKindEnum = pgEnum("statement_kind", ["statement", "direct_sale", "byte"]);
export const stStatusEnum = pgEnum("statement_status", ["final", "cancelled"]);
export const moveKindEnum = pgEnum("movement_kind", [
  "opening", "purchase_in", "purchase_return", "issue_out", "issue_return", "sale_out", "sales_return", "adjustment", "count", "statement_edit", "statement_cancel",
]);
export const payKindEnum = pgEnum("payment_kind", ["statement", "debt_settlement", "refund"]);
export const checkEnum = pgEnum("check_status", ["good", "watch", "urgent"]);

export const users = pgTable("users", {
  ...base(), ...archived(),
  username: text("username").notNull(),
  displayName: text("display_name").notNull(),
  role: roleEnum("role").notNull(),
  passwordHash: text("password_hash").notNull(),
  active: boolean("active").notNull().default(true),
}, (t) => [uniqueIndex("users_username_uq").on(t.username)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  deviceId: text("device_id"),
  familyId: uuid("family_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_family_ix").on(t.familyId)]);

export const devices = pgTable("devices", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  lastSeenAt: ts("last_seen_at"),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
  serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(sql`nextval('change_seq')`),
});

export const technicians = pgTable("technicians", {
  ...base(), ...archived(),
  name: text("name").notNull(),
  phone: text("phone"),
  active: boolean("active").notNull().default(true),
});

export const files = pgTable("files", {
  ...base(),
  sha256: text("sha256").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull(),
});

export const customers = pgTable("customers", {
  ...base(), ...archived(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  mobile: text("mobile"),
  officePhone: text("office_phone"),
  homePhone: text("home_phone"),
  whatsapp: text("whatsapp"),
  governorate: text("governorate"),
  address: text("address"),
  occupation: text("occupation"),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  openingBalancePt: money("opening_balance_pt").notNull().default(0),
}, (t) => [index("customers_name_key_ix").on(t.nameKey), index("customers_mobile_ix").on(t.mobile)]);

/** Egyptian plate types (D-69): editable in Settings. A null bar color means the style is not confirmed yet. */
export const plateTypes = pgTable("plate_types", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  barColor: text("bar_color"),
  textColor: text("text_color").notNull().default("#0B0B0B"),
  digitsOnly: boolean("digits_only").notNull().default(false),
  small: boolean("small").notNull().default(false),
  toConfirm: boolean("to_confirm").notNull().default(false),
  sort: integer("sort").notNull(),
  active: boolean("active").notNull().default(true),
});

export const vehicles = pgTable("vehicles", {
  ...base(), ...archived(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  plateType: text("plate_type").notNull().default("private").references(() => plateTypes.id),
  plateLetters: text("plate_letters"),
  plateDigits: text("plate_digits"),
  plateKey: text("plate_key"),
  chassis: text("chassis"),
  licenseNo: text("license_no"),
  make: text("make"),
  model: text("model"),
  variant: text("variant"),
  year: integer("year"),
  engineSize: text("engine_size"),
  engineNo: text("engine_no"),
  modelNo: text("model_no"),
  color: text("color"),
  warrantyEnd: text("warranty_end"),
  notes: text("notes"),
}, (t) => [index("vehicles_plate_ix").on(t.plateKey), index("vehicles_chassis_ix").on(t.chassis), index("vehicles_customer_ix").on(t.customerId)]);

export const odometerReadings = pgTable("odometer_readings", {
  ...base(),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
  km: integer("km").notNull(),
  readAt: ts("read_at").notNull(),
  workOrderId: uuid("work_order_id"),
  overrideReason: text("override_reason"),
}, (t) => [index("odometer_vehicle_ix").on(t.vehicleId)]);

export const warehouses = pgTable("warehouses", { ...base(), name: text("name").notNull() });

export const itemCategories = pgTable("item_categories", { ...base(), ...archived(), name: text("name").notNull() });

export const items = pgTable("items", {
  ...base(), ...archived(),
  code: text("code").notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  nameKey: text("name_key").notNull(),
  type: itemTypeEnum("type").notNull(),
  categoryId: uuid("category_id").references(() => itemCategories.id),
  unit: text("unit").notNull(),
  location: text("location"),
  notes: text("notes"),
  photoFileId: uuid("photo_file_id"),
  /** labor and services (welding) are not stock-tracked */
  trackStock: boolean("track_stock").notNull().default(true),
  active: boolean("active").notNull().default(true),
}, (t) => [uniqueIndex("items_code_uq").on(t.code), index("items_name_key_ix").on(t.nameKey)]);

export const itemVariants = pgTable("item_variants", {
  ...base(), ...archived(),
  itemId: uuid("item_id").notNull().references(() => items.id),
  grade: gradeEnum("grade"),
  sellPricePt: money("sell_price_pt").notNull(),
  barcode: text("barcode"),
  minQtyMilli: bigint("min_qty_milli", { mode: "number" }).notNull().default(0),
  active: boolean("active").notNull().default(true),
}, (t) => [uniqueIndex("variants_barcode_uq").on(t.barcode), index("variants_item_ix").on(t.itemId)]);

/** Cached on-hand and weighted average cost, updated in the same transaction as each movement. */
export const stockLevels = pgTable("stock_levels", {
  variantId: uuid("variant_id").notNull().references(() => itemVariants.id),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  qtyMilli: bigint("qty_milli", { mode: "number" }).notNull().default(0),
  avgCostPt: money("avg_cost_pt").notNull().default(0),
  serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(sql`nextval('change_seq')`),
}, (t) => [primaryKey({ columns: [t.variantId, t.warehouseId] })]);

export const stockMovements = pgTable("stock_movements", {
  ...base(),
  variantId: uuid("variant_id").notNull().references(() => itemVariants.id),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  qtyMilli: bigint("qty_milli", { mode: "number" }).notNull(),
  kind: moveKindEnum("kind").notNull(),
  unitCostPt: money("unit_cost_pt").notNull(),
  refType: text("ref_type"),
  refId: uuid("ref_id"),
  reason: text("reason"),
}, (t) => [index("moves_variant_ix").on(t.variantId), index("moves_ref_ix").on(t.refType, t.refId)]);

export const stockCounts = pgTable("stock_counts", {
  ...base(),
  status: text("status").notNull().default("open"),
  approvedBy: uuid("approved_by"),
  approvedAt: ts("approved_at"),
  note: text("note"),
});
export const stockCountLines = pgTable("stock_count_lines", {
  ...base(),
  countId: uuid("count_id").notNull().references(() => stockCounts.id),
  variantId: uuid("variant_id").notNull().references(() => itemVariants.id),
  systemQtyMilli: bigint("system_qty_milli", { mode: "number" }).notNull(),
  countedQtyMilli: bigint("counted_qty_milli", { mode: "number" }).notNull(),
});

export const servicePackages = pgTable("service_packages", { ...base(), ...archived(), name: text("name").notNull() });
export const packageLines = pgTable("package_lines", {
  ...base(),
  packageId: uuid("package_id").notNull().references(() => servicePackages.id),
  variantId: uuid("variant_id").notNull().references(() => itemVariants.id),
  qtyMilli: bigint("qty_milli", { mode: "number" }).notNull(),
});

export const workOrders = pgTable("work_orders", {
  ...base(), ...archived(),
  number: bigint("number", { mode: "number" }),
  type: woTypeEnum("type").notNull().default("repair"),
  status: woStatusEnum("status").notNull().default("open"),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  representative: text("representative"),
  receptionUserId: uuid("reception_user_id").references(() => users.id),
  enteredAt: ts("entered_at").notNull(),
  expectedAt: ts("expected_at"),
  odometerIn: integer("odometer_in"),
  comeback: boolean("comeback").notNull().default(false),
  faultType: text("fault_type"),
  repairType: text("repair_type"),
  booking: text("booking"),
  insuranceCompany: text("insurance_company"),
  complaint: text("complaint"),
  engineerNotes: text("engineer_notes"),
  customerNotes: text("customer_notes"),
  internalNotes: text("internal_notes"),
  fuelLevel: integer("fuel_level"),
  belongings: jsonb("belongings").$type<string[]>(),
  estimatePt: money("estimate_pt"),
  signatureFileId: uuid("signature_file_id"),
  warehouseId: uuid("warehouse_id").references(() => warehouses.id),
}, (t) => [uniqueIndex("wo_number_uq").on(t.number), index("wo_vehicle_ix").on(t.vehicleId), index("wo_status_ix").on(t.status), index("wo_customer_ix").on(t.customerId)]);

export const workOrderTechnicians = pgTable("work_order_technicians", {
  workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id),
  technicianId: uuid("technician_id").notNull().references(() => technicians.id),
}, (t) => [primaryKey({ columns: [t.workOrderId, t.technicianId] })]);

export const intakeMarks = pgTable("intake_marks", {
  ...base(),
  workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id),
  view: text("view").notNull().default("top"),
  x: integer("x_permille").notNull(),
  y: integer("y_permille").notNull(),
  kind: text("kind").notNull(),
  note: text("note"),
  photoFileId: uuid("photo_file_id"),
});

export const estimateApprovals = pgTable("estimate_approvals", {
  ...base(),
  workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id),
  oldPt: money("old_pt"),
  newPt: money("new_pt").notNull(),
  approvedByName: text("approved_by_name").notNull(),
  method: text("method").notNull(),
  approvedAt: ts("approved_at").notNull(),
});

export const conditionReports = pgTable("condition_reports", {
  ...base(),
  workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id),
});
export const conditionItems = pgTable("condition_items", {
  ...base(),
  reportId: uuid("report_id").notNull().references(() => conditionReports.id),
  system: text("system").notNull(),
  item: text("item").notNull(),
  status: checkEnum("status").notNull(),
  note: text("note"),
  photoFileId: uuid("photo_file_id"),
  recommendedVariantId: uuid("recommended_variant_id"),
  recommendedText: text("recommended_text"),
  recommendedPricePt: money("recommended_price_pt"),
});

export const statements = pgTable("statements", {
  ...base(),
  /** assigned by the server at finalize, gap-free (D-16) */
  number: bigint("number", { mode: "number" }).notNull(),
  kind: stKindEnum("kind").notNull().default("statement"),
  workOrderId: uuid("work_order_id").references(() => workOrders.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id),
  statementDate: text("statement_date").notNull(),
  exitAt: ts("exit_at"),
  discounts: jsonb("discounts").notNull(),
  taxExempt: boolean("tax_exempt").notNull().default(false),
  /** full totals snapshot from @jc/core computeTotals, frozen at save */
  totals: jsonb("totals").notNull(),
  amountDuePt: money("amount_due_pt").notNull(),
  notDone: text("not_done"),
  status: stStatusEnum("status").notNull().default("final"),
  cancelReason: text("cancel_reason"),
  cancelledAt: ts("cancelled_at"),
  version: integer("version").notNull().default(1),
}, (t) => [uniqueIndex("statements_kind_number_uq").on(t.kind, t.number), index("statements_customer_ix").on(t.customerId)]);

export const docLines = pgTable("doc_lines", {
  ...base(), ...archived(),
  workOrderId: uuid("work_order_id").references(() => workOrders.id),
  statementId: uuid("statement_id").references(() => statements.id),
  category: categoryEnum("category").notNull(),
  itemId: uuid("item_id").references(() => items.id),
  variantId: uuid("variant_id").references(() => itemVariants.id),
  code: text("code"),
  name: text("name").notNull(),
  grade: gradeEnum("grade"),
  unit: text("unit"),
  qtyMilli: bigint("qty_milli", { mode: "number" }).notNull(),
  unitPricePt: money("unit_price_pt").notNull(),
  technicianId: uuid("technician_id").references(() => technicians.id),
  finishedAt: ts("finished_at"),
  /** stock already moved for this line (issued to the work order or sold) */
  stockQtyMilli: bigint("stock_qty_milli", { mode: "number" }).notNull().default(0),
}, (t) => [index("lines_wo_ix").on(t.workOrderId), index("lines_statement_ix").on(t.statementId)]);

export const statementRevisions = pgTable("statement_revisions", {
  ...base(),
  statementId: uuid("statement_id").notNull().references(() => statements.id),
  revNo: integer("rev_no").notNull(),
  reason: text("reason").notNull(),
  before: jsonb("before").notNull(),
  after: jsonb("after").notNull(),
});

export const paymentMethods = pgTable("payment_methods", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  needsReference: boolean("needs_reference").notNull().default(false),
  isCredit: boolean("is_credit").notNull().default(false),
  isCash: boolean("is_cash").notNull().default(false),
  sort: integer("sort").notNull(),
  active: boolean("active").notNull().default(true),
});

export const payments = pgTable("payments", {
  ...base(),
  statementId: uuid("statement_id").references(() => statements.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  methodId: text("method_id").notNull().references(() => paymentMethods.id),
  /** refunds are negative */
  amountPt: money("amount_pt").notNull(),
  reference: text("reference"),
  kind: payKindEnum("kind").notNull(),
  paidAt: ts("paid_at").notNull(),
}, (t) => [index("payments_statement_ix").on(t.statementId), index("payments_customer_ix").on(t.customerId)]);

/** Positive = the customer owes the shop. Balance = Σ amount. */
export const customerLedger = pgTable("customer_ledger", {
  ...base(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  amountPt: money("amount_pt").notNull(),
  kind: text("kind").notNull(),
  refType: text("ref_type"),
  refId: uuid("ref_id"),
}, (t) => [index("cledger_customer_ix").on(t.customerId)]);

export const suppliers = pgTable("suppliers", {
  ...base(), ...archived(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  contact: text("contact"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  address: text("address"),
  notes: text("notes"),
  openingBalancePt: money("opening_balance_pt").notNull().default(0),
});

export const purchases = pgTable("purchases", {
  ...base(),
  number: bigint("number", { mode: "number" }).notNull(),
  kind: text("kind").notNull().default("invoice"), // invoice | return
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  purchaseDate: text("purchase_date").notNull(),
  payment: text("payment").notNull(), // paid | credit
  totalPt: money("total_pt").notNull(),
  supplierRef: text("supplier_ref"),
}, (t) => [uniqueIndex("purchases_kind_number_uq").on(t.kind, t.number)]);

export const purchaseLines = pgTable("purchase_lines", {
  ...base(),
  purchaseId: uuid("purchase_id").notNull().references(() => purchases.id),
  variantId: uuid("variant_id").notNull().references(() => itemVariants.id),
  qtyMilli: bigint("qty_milli", { mode: "number" }).notNull(),
  unitCostPt: money("unit_cost_pt").notNull(),
});

/** Positive = the shop owes the supplier. */
export const supplierLedger = pgTable("supplier_ledger", {
  ...base(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  amountPt: money("amount_pt").notNull(),
  kind: text("kind").notNull(),
  refType: text("ref_type"),
  refId: uuid("ref_id"),
});

export const cashSessions = pgTable("cash_sessions", {
  ...base(),
  openedAt: ts("opened_at").notNull(),
  openingPt: money("opening_pt").notNull(),
  closedAt: ts("closed_at"),
  closedBy: uuid("closed_by"),
  expectedPt: money("expected_pt"),
  countedPt: money("counted_pt"),
  differencePt: money("difference_pt"),
  note: text("note"),
});

/** Append-only. A session's expected cash = opening + Σ movements between its open and close times. */
export const cashMovements = pgTable("cash_movements", {
  ...base(),
  amountPt: money("amount_pt").notNull(),
  kind: text("kind").notNull(), // statement_payment | debt_payment | refund | expense | supplier_payment | deposit | withdrawal
  refType: text("ref_type"),
  refId: uuid("ref_id"),
  note: text("note"),
  movedAt: ts("moved_at").notNull(),
}, (t) => [index("cash_moved_ix").on(t.movedAt)]);

export const expenseCategories = pgTable("expense_categories", { ...base(), ...archived(), name: text("name").notNull() });
export const expenses = pgTable("expenses", {
  ...base(),
  categoryId: uuid("category_id").notNull().references(() => expenseCategories.id),
  amountPt: money("amount_pt").notNull(),
  spentAt: ts("spent_at").notNull(),
  paidBy: text("paid_by"),
  notes: text("notes"),
  fileId: uuid("file_id"),
  fromCash: boolean("from_cash").notNull().default(true),
});

export const bonuses = pgTable("bonuses", {
  ...base(),
  userId: uuid("user_id").references(() => users.id),
  technicianId: uuid("technician_id").references(() => technicians.id),
  amountPt: money("amount_pt").notNull(),
  givenAt: ts("given_at").notNull(),
  reason: text("reason").notNull(),
  statementId: uuid("statement_id").references(() => statements.id),
});

export const reminders = pgTable("reminders", {
  ...base(), ...archived(),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id),
  customerId: uuid("customer_id").references(() => customers.id),
  dueDate: text("due_date"),
  dueKm: integer("due_km"),
  kind: text("kind").notNull(),
  note: text("note"),
  doneAt: ts("done_at"),
});

export const shareTokens = pgTable("share_tokens", {
  ...base(),
  tokenHash: text("token_hash").notNull(),
  docType: text("doc_type").notNull(),
  docId: uuid("doc_id").notNull(),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
}, (t) => [uniqueIndex("share_token_uq").on(t.tokenHash)]);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey(),
  at: ts("at").notNull().defaultNow(),
  userId: uuid("user_id"),
  deviceId: text("device_id"),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: text("ip"),
}, (t) => [index("audit_at_ix").on(t.at), index("audit_entity_ix").on(t.entity, t.entityId)]);

export const numberSeries = pgTable("number_series", {
  series: text("series").primaryKey(),
  nextValue: bigint("next_value", { mode: "number" }).notNull(),
});

export const numberBlocks = pgTable("number_blocks", {
  id: uuid("id").primaryKey(),
  series: text("series").notNull(),
  deviceId: text("device_id").notNull(),
  fromValue: bigint("from_value", { mode: "number" }).notNull(),
  toValue: bigint("to_value", { mode: "number" }).notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const syncMutations = pgTable("sync_mutations", {
  mutationId: uuid("mutation_id").primaryKey(),
  deviceId: text("device_id"),
  userId: uuid("user_id"),
  result: jsonb("result"),
  at: ts("at").notNull().defaultNow(),
});

export const salesReturns = pgTable("sales_returns", {
  ...base(),
  number: bigint("number", { mode: "number" }).notNull(),
  statementId: uuid("statement_id").notNull().references(() => statements.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  totalPt: money("total_pt").notNull(),
  refundMethodId: text("refund_method_id").notNull().references(() => paymentMethods.id),
  reason: text("reason").notNull(),
}, (t) => [uniqueIndex("sales_returns_number_uq").on(t.number)]);

export const salesReturnLines = pgTable("sales_return_lines", {
  ...base(),
  returnId: uuid("return_id").notNull().references(() => salesReturns.id),
  lineId: uuid("line_id").notNull().references(() => docLines.id),
  variantId: uuid("variant_id").references(() => itemVariants.id),
  qtyMilli: bigint("qty_milli", { mode: "number" }).notNull(),
  valuePt: money("value_pt").notNull(),
});
