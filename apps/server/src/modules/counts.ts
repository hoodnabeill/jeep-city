/**
 * Stock count (جرد): anyone with stockCount.enter counts shelves by scanning or typing; stockCount.approve posts the
 * differences as `count` movements. One warehouse, so a count is just a list of counted variants.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { can, MILLI, uuidv7 } from "@jc/core";
import { audit } from "../audit";
import { actorOf, requirePerm } from "../auth/auth";
import type { Db } from "../db/client";
import { items, itemVariants, stockCountLines, stockCounts, stockLevels, users } from "../db/schema";
import { AppError, notFound } from "../errors";
import { Id, int } from "../http";
import { level, move } from "./stock";

async function openCount(db: Db, id: string) {
  const [c] = await db.select().from(stockCounts).where(eq(stockCounts.id, id));
  if (!c) throw notFound("الجرد");
  if (c.status !== "open") throw new AppError(409, "count_closed", "الجرد ده اتقفل، مينفعش يتعدل.");
  return c;
}

/**
 * Set a variant's counted quantity. The system quantity is snapped at the same moment, so sales made while the
 * shelf is being counted do not show up as a shortage.
 */
async function setLine(db: Db, countId: string, variantId: string, counted: (prev: number) => number, actorId: string) {
  return db.transaction(async (tx) => {
    const [prev] = await tx.select().from(stockCountLines).where(and(eq(stockCountLines.countId, countId), eq(stockCountLines.variantId, variantId))).for("update");
    const countedQtyMilli = counted(prev?.countedQtyMilli ?? 0);
    if (countedQtyMilli < 0) throw new AppError(422, "bad_qty", "الكمية المعدودة مينفعش تبقى بالسالب.");
    const systemQtyMilli = (await level(tx, variantId)).qtyMilli;
    if (prev) await tx.update(stockCountLines).set({ countedQtyMilli, systemQtyMilli, updatedAt: new Date() }).where(eq(stockCountLines.id, prev.id));
    else await tx.insert(stockCountLines).values({ id: uuidv7(), countId, variantId, countedQtyMilli, systemQtyMilli, createdBy: actorId });
    return { variantId, countedQtyMilli, systemQtyMilli };
  });
}

export function countRoutes(app: FastifyInstance, db: Db, auth: preHandlerHookHandler) {
  const enter = [auth, requirePerm("stockCount.enter")];
  const approve = [auth, requirePerm("stockCount.approve")];

  app.get("/stock-counts", { preHandler: enter }, async () =>
    db.select({
      id: stockCounts.id, status: stockCounts.status, note: stockCounts.note, createdAt: stockCounts.createdAt, approvedAt: stockCounts.approvedAt,
      by: users.displayName, lines: sql<number>`(select count(*)::int from stock_count_lines l where l.count_id = ${stockCounts.id})`,
    }).from(stockCounts).leftJoin(users, eq(users.id, stockCounts.createdBy)).orderBy(desc(stockCounts.createdAt)).limit(100));

  app.post("/stock-counts", { preHandler: enter }, async (req, reply) => {
    const { note } = z.object({ note: z.string().trim().min(1, "اكتب اسم للجرد، زي: رف A.").max(120) }).parse(req.body);
    const id = uuidv7();
    await db.insert(stockCounts).values({ id, note, createdBy: actorOf(req).id });
    await audit(db, actorOf(req), "stock_count.open", "stock_count", id, null, { note });
    reply.status(201);
    return { id };
  });

  app.get("/stock-counts/:id", { preHandler: enter }, async (req) => {
    const { id } = Id.parse(req.params);
    const [c] = await db.select().from(stockCounts).where(eq(stockCounts.id, id));
    if (!c) throw notFound("الجرد");
    const showCost = can(actorOf(req), "cost.view");
    const lines = await db.select({ l: stockCountLines, code: items.code, name: items.nameAr, unit: items.unit, location: items.location, grade: itemVariants.grade, itemId: items.id, avgCostPt: stockLevels.avgCostPt })
      .from(stockCountLines).innerJoin(itemVariants, eq(itemVariants.id, stockCountLines.variantId)).innerJoin(items, eq(items.id, itemVariants.itemId))
      .leftJoin(stockLevels, eq(stockLevels.variantId, stockCountLines.variantId)).where(eq(stockCountLines.countId, id)).orderBy(asc(items.location), asc(items.code));
    return {
      ...c,
      lines: lines.map((r) => {
        const diffMilli = r.l.countedQtyMilli - r.l.systemQtyMilli;
        return {
          variantId: r.l.variantId, itemId: r.itemId, code: r.code, name: r.name, unit: r.unit, location: r.location, grade: r.grade,
          systemQtyMilli: r.l.systemQtyMilli, countedQtyMilli: r.l.countedQtyMilli, diffMilli,
          ...(showCost ? { diffValuePt: Math.round((diffMilli * (r.avgCostPt ?? 0)) / MILLI) } : {}),
        };
      }),
    };
  });

  /** Type a quantity for a variant (replaces what was counted). */
  app.put("/stock-counts/:id/lines", { preHandler: enter }, async (req) => {
    const { id } = Id.parse(req.params);
    const b = z.object({ variantId: z.uuid(), countedQtyMilli: int.nonnegative() }).parse(req.body);
    await openCount(db, id);
    return setLine(db, id, b.variantId, () => b.countedQtyMilli, actorOf(req).id);
  });

  /** A scanner reads a label (barcode) or an item code: add one unit to that variant. */
  app.post("/stock-counts/:id/scan", { preHandler: enter }, async (req) => {
    const { id } = Id.parse(req.params);
    const { code } = z.object({ code: z.string().trim().min(1).max(64) }).parse(req.body);
    await openCount(db, id);
    let [v] = await db.select({ id: itemVariants.id }).from(itemVariants).where(eq(itemVariants.barcode, code));
    if (!v) {
      const byCode = await db.select({ id: itemVariants.id }).from(itemVariants).innerJoin(items, eq(items.id, itemVariants.itemId)).where(eq(items.code, code));
      if (byCode.length > 1) throw new AppError(409, "pick_grade", "الصنف ده ليه أكتر من جودة: اختاره من البحث أو امسح ملصق الجودة نفسها.");
      v = byCode[0];
    }
    if (!v) throw new AppError(404, "not_found", `مفيش صنف بالكود ده: ${code}`);
    return setLine(db, id, v.id, (prev) => prev + MILLI, actorOf(req).id);
  });

  app.delete("/stock-counts/:id/lines/:variantId", { preHandler: enter }, async (req) => {
    const { id, variantId } = z.object({ id: z.uuid(), variantId: z.uuid() }).parse(req.params);
    await openCount(db, id);
    await db.delete(stockCountLines).where(and(eq(stockCountLines.countId, id), eq(stockCountLines.variantId, variantId)));
    return { ok: true };
  });

  /** Post every difference as a `count` movement, once. */
  app.post("/stock-counts/:id/approve", { preHandler: approve }, async (req) => {
    const { id } = Id.parse(req.params);
    const actor = actorOf(req);
    return db.transaction(async (tx) => {
      const [c] = await tx.select().from(stockCounts).where(eq(stockCounts.id, id)).for("update");
      if (!c) throw notFound("الجرد");
      if (c.status !== "open") throw new AppError(409, "count_closed", "الجرد ده اتقفل قبل كده.");
      const lines = await tx.select().from(stockCountLines).where(eq(stockCountLines.countId, id));
      let posted = 0;
      for (const l of lines) {
        const diff = l.countedQtyMilli - l.systemQtyMilli;
        if (!diff) continue;
        await move(tx, actor, { variantId: l.variantId, qtyMilli: diff, kind: "count", refType: "stock_count", refId: id, reason: `جرد: ${c.note ?? ""}` });
        posted++;
      }
      await tx.update(stockCounts).set({ status: "approved", approvedBy: actor.id, approvedAt: new Date(), updatedAt: new Date() }).where(eq(stockCounts.id, id));
      await audit(tx, actor, "stock_count.approve", "stock_count", id, null, { lines: lines.length, posted });
      return { lines: lines.length, posted };
    });
  });

  app.post("/stock-counts/:id/cancel", { preHandler: approve }, async (req) => {
    const { id } = Id.parse(req.params);
    await openCount(db, id);
    await db.update(stockCounts).set({ status: "cancelled", updatedAt: new Date() }).where(eq(stockCounts.id, id));
    await audit(db, actorOf(req), "stock_count.cancel", "stock_count", id);
    return { ok: true };
  });
}
