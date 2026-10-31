/**
 * Vehicle condition report (تقرير حالة السيارة, 4c): one per work order. A new report starts from the checklist in
 * Settings (`condition.checklist`). Recommendations become work-order lines only through Admin (free prices, D-61).
 */
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { can, uuidv7 } from "@jc/core";
import { z } from "zod";
import { actorOf } from "../auth/auth";
import { audit } from "../audit";
import type { Db } from "../db/client";
import { conditionItems, conditionReports, docLines, settings, workOrders } from "../db/schema";
import { AppError } from "../errors";

const Item = z.object({
  id: z.uuid().optional(),
  system: z.string().trim().min(1).max(60),
  item: z.string().trim().min(1).max(80),
  status: z.enum(["good", "watch", "urgent"]),
  note: z.string().trim().max(300).nullable().optional(),
  recommendedText: z.string().trim().max(200).nullable().optional(),
  recommendedPricePt: z.number().int().nonnegative().safe().nullable().optional(),
});

async function load(db: Db, workOrderId: string) {
  const [wo] = await db.select({ id: workOrders.id, vehicleId: workOrders.vehicleId, status: workOrders.status }).from(workOrders).where(eq(workOrders.id, workOrderId));
  if (!wo) throw new AppError(404, "not_found", "أمر الشغل غير موجود.");
  const [report] = await db.select().from(conditionReports).where(eq(conditionReports.workOrderId, workOrderId));
  return { wo, report };
}

export function conditionRoutes(app: FastifyInstance, db: Db, auth: preHandlerHookHandler) {
  app.get("/work-orders/:id/condition", { preHandler: auth }, async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const { report } = await load(db, id);
    if (report) return { saved: true, updatedAt: report.updatedAt, items: await db.select().from(conditionItems).where(eq(conditionItems.reportId, report.id)).orderBy(asc(conditionItems.createdAt)) };
    const [s] = await db.select({ v: settings.value }).from(settings).where(eq(settings.key, "condition.checklist"));
    const list = (s?.v as { system: string; item: string }[] | undefined) ?? [];
    return { saved: false, updatedAt: null, items: list.map((x) => ({ ...x, status: "good", note: null, recommendedText: null, recommendedPricePt: null })) };
  });

  app.put("/work-orders/:id/condition", { preHandler: auth }, async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const { items } = z.object({ items: z.array(Item).min(1).max(200) }).parse(req.body);
    const actor = actorOf(req);
    return db.transaction(async (tx) => {
      const { wo, report } = await load(tx as unknown as Db, id);
      const reportId = report?.id ?? uuidv7();
      if (!report) await tx.insert(conditionReports).values({ id: reportId, workOrderId: id, vehicleId: wo.vehicleId, createdBy: actor.id, deviceId: actor.deviceId ?? null });
      else await tx.update(conditionReports).set({ updatedAt: new Date() }).where(eq(conditionReports.id, reportId));
      const now = Date.now();
      for (const [i, it] of items.entries()) {
        const values = { system: it.system, item: it.item, status: it.status, note: it.note ?? null, recommendedText: it.recommendedText ?? null, recommendedPricePt: it.recommendedPricePt ?? null };
        if (it.id) await tx.update(conditionItems).set({ ...values, updatedAt: new Date() }).where(and(eq(conditionItems.id, it.id), eq(conditionItems.reportId, reportId)));
        else await tx.insert(conditionItems).values({ id: uuidv7(now + i), reportId, ...values, createdAt: new Date(now + i), createdBy: actor.id });
      }
      await audit(tx as unknown as Db, actor, "condition.save", "work_order", id, null, { items: items.length });
      return { id: reportId };
    });
  });

  /** Picked recommendations become labor lines at the recommended price (Admin only: free prices, D-61). */
  app.post("/work-orders/:id/condition/convert", { preHandler: auth }, async (req, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const { itemIds } = z.object({ itemIds: z.array(z.uuid()).min(1).max(100) }).parse(req.body);
    const actor = actorOf(req);
    if (!can(actor.role, "item.manage")) throw new AppError(403, "forbidden", "تحويل الأعمال المقترحة بأسعارها لأمر الشغل من صلاحية الإدارة.");
    const { wo, report } = await load(db, id);
    if (!report) throw new AppError(409, "no_report", "احفظ تقرير الحالة أولًا.");
    if (wo.status !== "open" && wo.status !== "ready") throw new AppError(409, "work_order_closed", "أمر الشغل مقفول.");
    const picked = (await db.select().from(conditionItems).where(eq(conditionItems.reportId, report.id))).filter((x) => itemIds.includes(x.id) && x.recommendedText);
    for (const x of picked) await db.insert(docLines).values({ id: uuidv7(), workOrderId: id, category: "labor", name: x.recommendedText!, qtyMilli: 1000, unitPricePt: x.recommendedPricePt ?? 0, createdBy: actor.id, deviceId: actor.deviceId ?? null });
    await audit(db, actor, "condition.convert", "work_order", id, null, { items: picked.map((x) => x.id) });
    reply.status(201);
    return { added: picked.length };
  });
}
