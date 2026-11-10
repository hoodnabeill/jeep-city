/** Shapes the server returns (apps/server/src/modules). Money in piasters, quantities in thousandths. */
import type { Category, Role, Totals } from "@jc/core";

export type Grade = "original" | "copy" | "used";
export type WOStatus = "open" | "ready" | "delivered" | "closed" | "cancelled";
export type WOType = "repair" | "inquiry" | "condition";

export type Vehicle = {
  id: string; customerId: string; plateType: string; plateLetters: string | null; plateDigits: string | null; chassis: string | null; licenseNo: string | null;
  make: string | null; model: string | null; variant: string | null; year: number | null; color: string | null; engineSize: string | null; notes: string | null;
};
export type Customer = {
  id: string; name: string; mobile: string | null; officePhone: string | null; homePhone: string | null; whatsapp: string | null;
  governorate: string | null; address: string | null; notes: string | null; internalNotes: string | null; createdAt: string;
  vehicles: Vehicle[]; balancePt?: number; hasDebt?: boolean;
};
export type User = { id: string; displayName: string; username?: string; role: Role; permissions?: string[] | null; active?: boolean };
export type Technician = { id: string; name: string; phone: string | null; active: boolean };

export type WorkOrderRow = {
  id: string; number: number; type: WOType; status: WOStatus; enteredAt: string; expectedAt: string | null; complaint: string | null; engineerNotes: string | null;
  engineerId: string | null; engineer: string | null; customer: { id: string; name: string };
  vehicle: Pick<Vehicle, "id" | "plateType" | "plateLetters" | "plateDigits" | "chassis" | "make" | "model" | "variant" | "year"> | null;
};
export type Line = {
  id: string; category: Category; itemId: string | null; variantId: string | null; code: string | null; name: string; grade: Grade | null; unit: string | null;
  qtyMilli: number; unitPricePt: number; technicianId: string | null; technician?: string | null; finishedAt: string | null;
};
export type Mark = { id: string; x: number; y: number; kind: "scratch" | "dent" | "damage"; note: string | null };
export type Approval = { id: string; oldPt: number | null; newPt: number; approvedByName: string; method: string; approvedAt: string };
export type WorkOrder = WorkOrderRow & {
  odometerIn: number | null; representative: string | null; comeback: boolean; faultType: string | null; repairType: string | null; booking: string | null;
  customerNotes: string | null; internalNotes: string | null; fuelLevel: number | null; belongings: string[] | null; estimatePt: number | null;
  receptionUserId: string | null; vehicle: Vehicle | null;
  customer: { id: string; name: string; mobile: string | null; whatsapp: string | null; internalNotes: string | null };
  technicians: { id: string; name: string }[]; marks: Mark[]; approvals: Approval[]; statement: { id: string; number: number } | null;
  previousOdometer: { km: number; at: string } | null; editable: boolean; lines: Line[];
};

export type StatementRow = {
  id: string; number: number; kind: "statement" | "direct_sale" | "byte"; status: "final" | "cancelled"; date: string; exitAt: string | null; amountDuePt: number; paidPt: number;
  methods: string[]; customer: { id: string; name: string }; vehicle: { id: string; plateType: string; plateLetters: string | null; plateDigits: string | null } | null; workOrderNumber: number | null; by: string | null;
};
export type Payment = { id: string; methodId: string; amountPt: number; reference: string | null; kind: "statement" | "debt_settlement" | "refund"; paidAt: string };
export type Statement = {
  id: string; number: number; kind: "statement" | "direct_sale" | "byte"; workOrderId: string | null; customerId: string; vehicleId: string | null; statementDate: string; exitAt: string | null;
  discounts: Record<string, { mode: "amount"; valuePt: number } | { mode: "percent"; valueBp: number }>; totals: Totals; amountDuePt: number; notDone: string | null;
  status: "final" | "cancelled"; cancelReason: string | null; version: number; createdBy: string | null; createdAt: string; amountInWords: string; locked: boolean;
  lines: Line[]; payments: Payment[];
};
export const STATEMENT_KIND: Record<"statement" | "direct_sale" | "byte", string> = { statement: "بيان عميل", direct_sale: "بيع مباشر", byte: "بيان من بايت" };
export type PlateType = { id: string; label: string; barColor: string | null; textColor: string; digitsOnly: boolean; small: boolean; toConfirm: boolean; sort: number; active: boolean };
export type PaymentMethod = { id: string; label: string; needsReference: boolean; isCredit: boolean; isCash: boolean; sort: number; active: boolean };

export type Variant = { id: string; itemId: string; grade: Grade | null; sellPricePt: number; barcode: string | null; minQtyMilli: number; active: boolean; qtyMilli: number; avgCostPt?: number };
export type Item = {
  id: string; code: string; nameAr: string; nameEn: string | null; type: Category; unit: string; location: string | null; notes: string | null; trackStock: boolean; active: boolean;
  variants: Variant[];
};
export type Movement = { id: string; at: string; variantId: string; kind: string; qtyMilli: number; refType: string | null; reason: string | null; by: string | null; unitCostPt?: number };
export type CatalogHit = {
  variantId: string; itemId: string; code: string; name: string; nameEn: string | null; type: Category; unit: string; location: string | null; grade: Grade | null;
  sellPricePt: number; trackStock: boolean; qtyMilli: number; minQtyMilli: number; barcode: string | null;
};
export type Package = { id: string; name: string; lines: { variantId: string; qtyMilli: number }[] };

export type Supplier = { id: string; name: string; contact: string | null; phone: string | null; whatsapp: string | null; address: string | null; balancePt: number; lastPurchase: string | null; whatsappValid: boolean };
export type LedgerRow = { at: string; kind: string; refType: string | null; refId: string | null; amountPt: number; balancePt: number };
export type CashCurrent =
  | { open: false }
  | { open: true; session: { id: string; openedAt: string; openingPt: number; createdBy: string }; inPt: number; outPt: number; expectedPt: number; movements: { id: string; amountPt: number; kind: string; note: string | null; movedAt: string; by: string | null; refType: string | null }[] };
export type Dashboard = { carsInShop: number; readyForPickup: number; myOpen: number; lowStock: number; salesTodayPt?: number; statementsToday?: number; cashInDrawerPt?: number | null; customerDebtPt?: number };
export type History = {
  vehicle: Vehicle; odometer: { km: number; at: string; workOrderId: string | null; overrideReason: string | null }[];
  visits: { workOrder: { id: string; number: number; type: WOType; status: WOStatus; enteredAt: string; odometerIn: number | null; complaint: string | null; engineer: string | null }; lines: { name: string; category: Category }[]; statement: { id: string; number: number; amountDuePt: number; status: string; exitAt: string } | null }[];
};
export type LookupHit = { vehicle: Vehicle; customer: { id: string; name: string; mobile: string | null; whatsapp: string | null } };
