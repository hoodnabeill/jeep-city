import { eq, sql } from "drizzle-orm";
import { uuidv7 } from "@jc/core";
import type { Db } from "../db/client";
import { numberBlocks, numberSeries } from "../db/schema";
import { AppError } from "../errors";

export type Series = "work_order" | "statement" | "direct_sale" | "purchase" | "purchase_return" | "sales_return";

/**
 * Next number of a series. Call inside the transaction that saves the document: if the transaction
 * rolls back, the number is not consumed, so statement numbers stay gap-free (D-16).
 */
export async function nextNumber(tx: Db, series: Series): Promise<number> {
  const rows = await tx.update(numberSeries).set({ nextValue: sql`${numberSeries.nextValue} + 1` })
    .where(eq(numberSeries.series, series)).returning({ next: numberSeries.nextValue });
  if (!rows.length) throw new AppError(500, "series_missing", "ترقيم هذا النوع غير مُعد في الإعدادات.");
  return rows[0].next - 1;
}

/** Reserve a block of numbers for one device, so it can number work orders offline (D-15). */
export async function reserveBlock(tx: Db, series: Series, deviceId: string, size: number) {
  if (!Number.isInteger(size) || size < 1 || size > 200) throw new AppError(422, "bad_block", "حجم رصيد الأرقام غير صحيح.");
  const rows = await tx.update(numberSeries).set({ nextValue: sql`${numberSeries.nextValue} + ${size}` })
    .where(eq(numberSeries.series, series)).returning({ next: numberSeries.nextValue });
  if (!rows.length) throw new AppError(500, "series_missing", "ترقيم هذا النوع غير مُعد في الإعدادات.");
  const from = rows[0].next - size, to = rows[0].next - 1;
  await tx.insert(numberBlocks).values({ id: uuidv7(), series, deviceId, fromValue: from, toValue: to });
  return { from, to };
}

/** Create a series if missing. Changing the start later is a settings action (Phase 3). */
export async function ensureSeries(db: Db, series: Series, start: number) {
  await db.insert(numberSeries).values({ series, nextValue: start }).onConflictDoNothing();
}
