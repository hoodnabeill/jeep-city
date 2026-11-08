/** Balances read from the ledgers. Positive = the customer owes the shop; for a supplier, positive = the shop owes them. */
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { customerLedger, supplierLedger } from "../db/schema";

export async function customerBalancePt(db: Db, customerId: string) {
  const [r] = await db.select({ b: sql<string>`coalesce(sum(${customerLedger.amountPt}), 0)` }).from(customerLedger).where(eq(customerLedger.customerId, customerId));
  return Number(r.b);
}

export async function supplierBalancePt(db: Db, supplierId: string) {
  const [r] = await db.select({ b: sql<string>`coalesce(sum(${supplierLedger.amountPt}), 0)` }).from(supplierLedger).where(eq(supplierLedger.supplierId, supplierId));
  return Number(r.b);
}
