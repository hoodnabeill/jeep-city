/**
 * Stock = an append-only movement ledger (PLAN §4). On hand = Σ movements; `stock_levels` caches the sum
 * and the weighted average cost, updated in the same transaction as each movement.
 *
 * Cost (D-13): weighted average, recomputed on every inbound movement that carries a cost. Every outbound
 * movement stores the average at that moment, so past profit never changes. If stock is zero or negative
 * when goods arrive, the average resets to the new cost.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { can, deniedMessage, divRound, uuidv7, type Category } from "@jc/core";
import { audit, type Actor } from "../audit";
import type { Db } from "../db/client";
import { docLines, items, itemVariants, stockLevels, stockMovements, warehouses, workOrders } from "../db/schema";
import { AppError, notFound } from "../errors";

type MoveKind = typeof stockMovements.$inferInsert.kind;
const INBOUND_WITH_COST: MoveKind[] = ["opening", "purchase_in"];

export async function mainWarehouseId(db: Db): Promise<string> {
  const [w] = await db.select({ id: warehouses.id }).from(warehouses).orderBy(warehouses.createdAt).limit(1);
  if (!w) throw new AppError(500, "no_warehouse", "لا يوجد مخزن مُعد.");
  return w.id;
}

async function lockLevel(tx: Db, variantId: string, warehouseId: string) {
  await tx.insert(stockLevels).values({ variantId, warehouseId }).onConflictDoNothing();
  const [lvl] = await tx.select().from(stockLevels)
    .where(and(eq(stockLevels.variantId, variantId), eq(stockLevels.warehouseId, warehouseId))).for("update");
  return lvl;
}

/** Write one movement and update the cached level. `qtyMilli` is signed (+ in, − out). */
export async function move(tx: Db, actor: Actor | null, m: {
  variantId: string; warehouseId?: string; qtyMilli: number; kind: MoveKind; unitCostPt?: number;
  refType?: string; refId?: string; reason?: string;
}) {
  if (!Number.isSafeInteger(m.qtyMilli) || m.qtyMilli === 0) throw new AppError(422, "bad_qty", "الكمية غير صحيحة.");
  const warehouseId = m.warehouseId ?? (await mainWarehouseId(tx));
  const lvl = await lockLevel(tx, m.variantId, warehouseId);
  let avg = lvl.avgCostPt;
  let unitCostPt = avg;
  if (INBOUND_WITH_COST.includes(m.kind)) {
    if (m.unitCostPt === undefined || m.unitCostPt < 0) throw new AppError(422, "cost_required", "اكتب تكلفة الوحدة.");
    unitCostPt = m.unitCostPt;
    avg = lvl.qtyMilli <= 0 ? m.unitCostPt : divRound(lvl.qtyMilli * lvl.avgCostPt + m.qtyMilli * m.unitCostPt, lvl.qtyMilli + m.qtyMilli);
  }
  const qtyAfter = lvl.qtyMilli + m.qtyMilli;
  await tx.update(stockLevels).set({ qtyMilli: qtyAfter, avgCostPt: avg })
    .where(and(eq(stockLevels.variantId, m.variantId), eq(stockLevels.warehouseId, warehouseId)));
  const id = uuidv7();
  await tx.insert(stockMovements).values({
    id, variantId: m.variantId, warehouseId, qtyMilli: m.qtyMilli, kind: m.kind, unitCostPt,
    refType: m.refType ?? null, refId: m.refId ?? null, reason: m.reason ?? null,
    createdBy: actor?.id ?? null, deviceId: actor?.deviceId ?? null,
  });
  return { movementId: id, qtyAfter, avgCostPt: avg, unitCostPt };
}

/** On hand from the ledger itself (the source of truth). */
export async function onHandFromLedger(db: Db, variantId: string): Promise<number> {
  const [r] = await db.select({ q: sql<string>`coalesce(sum(${stockMovements.qtyMilli}), 0)` }).from(stockMovements).where(eq(stockMovements.variantId, variantId));
  return Number(r.q);
}

export async function level(db: Db, variantId: string) {
  const [l] = await db.select().from(stockLevels).where(eq(stockLevels.variantId, variantId));
  return l ?? { variantId, qtyMilli: 0, avgCostPt: 0 };
}

const typeToCategory = (t: string): Category => (t === "labor" || t === "part" || t === "oil" || t === "material" || t === "paint" ? t : "part");

/**
 * Parts issue (إذن صرف): add a line to an open work order and take the stock out now (D-14).
 * More than available: engineers are refused; admins must give a reason (D-42).
 */
export async function issueToWorkOrder(db: Db, actor: Actor, input: { workOrderId: string; variantId: string; qtyMilli: number; reason?: string; lineId?: string; technicianId?: string }) {
  return db.transaction(async (tx) => {
    const [wo] = await tx.select().from(workOrders).where(eq(workOrders.id, input.workOrderId)).for("update");
    if (!wo) throw notFound("أمر الشغل");
    if (wo.status !== "open" && wo.status !== "ready") throw new AppError(409, "work_order_closed", "أمر الشغل مقفول. لا يمكن صرف قطع عليه.");
    const [v] = await tx.select().from(itemVariants).where(and(eq(itemVariants.id, input.variantId), isNull(itemVariants.archivedAt)));
    if (!v || !v.active) throw notFound("الصنف");
    const [it] = await tx.select().from(items).where(eq(items.id, v.itemId));
    if (!Number.isSafeInteger(input.qtyMilli) || input.qtyMilli <= 0) throw new AppError(422, "bad_qty", "الكمية لازم تكون أكبر من صفر.");

    let lowStock = false;
    if (it.trackStock) {
      const lvl = await lockLevel(tx, v.id, wo.warehouseId ?? (await mainWarehouseId(tx)));
      if (input.qtyMilli > lvl.qtyMilli) {
        if (actor.offline) {
          // The part already left the shelf while the PC was offline: accept it and flag it for Admin (D-42).
          await audit(tx, actor, "stock.offline_over_issue", "variant", v.id, { availableMilli: lvl.qtyMilli }, { qtyMilli: input.qtyMilli, workOrderId: wo.id });
        } else {
          if (!can(actor.role, "stock.issueOverAvailable")) throw new AppError(409, "not_enough_stock", deniedMessage("stock.issueOverAvailable"), { availableMilli: lvl.qtyMilli });
          if (!input.reason?.trim()) throw new AppError(422, "reason_required", "اكتب سبب الصرف بأكثر من المتاح.");
          await audit(tx, actor, "stock.over_issue", "variant", v.id, { availableMilli: lvl.qtyMilli }, { qtyMilli: input.qtyMilli, reason: input.reason, workOrderId: wo.id });
        }
      }
    }
    const lineId = input.lineId ?? uuidv7();
    await tx.insert(docLines).values({
      id: lineId, workOrderId: wo.id, category: typeToCategory(it.type), itemId: it.id, variantId: v.id, code: it.code, name: it.nameAr,
      grade: v.grade, unit: it.unit, qtyMilli: input.qtyMilli, unitPricePt: v.sellPricePt, technicianId: input.technicianId ?? null,
      stockQtyMilli: it.trackStock ? input.qtyMilli : 0, createdBy: actor.id, deviceId: actor.deviceId ?? null,
    });
    let after: { qtyAfter: number } | null = null;
    if (it.trackStock) {
      after = await move(tx, actor, { variantId: v.id, warehouseId: wo.warehouseId ?? undefined, qtyMilli: -input.qtyMilli, kind: "issue_out", refType: "doc_line", refId: lineId, reason: input.reason });
      lowStock = v.minQtyMilli > 0 && after.qtyAfter <= v.minQtyMilli;
    }
    return { lineId, qtyAfterMilli: after?.qtyAfter ?? null, lowStock };
  });
}

/** Manual adjustment (Admin only, with reason). */
export async function adjust(db: Db, actor: Actor, input: { variantId: string; qtyMilli: number; reason: string }) {
  if (!can(actor.role, "stock.adjust")) throw new AppError(403, "forbidden", deniedMessage("stock.adjust"));
  if (!input.reason.trim()) throw new AppError(422, "reason_required", "اكتب سبب التسوية.");
  return db.transaction(async (tx) => {
    const r = await move(tx, actor, { variantId: input.variantId, qtyMilli: input.qtyMilli, kind: "adjustment", reason: input.reason });
    await audit(tx, actor, "stock.adjust", "variant", input.variantId, null, { qtyMilli: input.qtyMilli, reason: input.reason });
    return r;
  });
}
