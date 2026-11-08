/** Suppliers, purchase invoices, purchase returns, supplier payments (Admin). Positive supplier balance = the shop owes. */
import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { egyptMobile, lineValuePt, searchKey, uuidv7 } from "@jc/core";
import { audit } from "../audit";
import { actorOf, requirePerm } from "../auth/auth";
import type { Db } from "../db/client";
import { cashMovements, paymentMethods, purchaseLines, purchases, stockLevels, supplierLedger, suppliers } from "../db/schema";
import { AppError, notFound } from "../errors";
import { nextNumber } from "./numbering";
import { move } from "./stock";
import { supplierBalancePt } from "./ledger";
import { Id, int, opt } from "../http";

const SupplierIn = z.object({ id: z.uuid().optional(), name: z.string().trim().min(2).max(120), contact: opt(80), phone: opt(30), whatsapp: opt(30), address: opt(200), notes: opt(1000), openingBalancePt: int.optional() });

async function payOut(tx: Db, actor: { id: string }, supplierId: string, methodId: string, amountPt: number, refType: string, refId: string, reference?: string) {
  const [m] = await tx.select().from(paymentMethods).where(eq(paymentMethods.id, methodId));
  if (!m || !m.active || m.isCredit) throw new AppError(422, "bad_method", "اختر طريقة دفع فعلية للمورد.");
  if (m.needsReference && !reference) throw new AppError(422, "reference_required", `اكتب رقم المرجع لدفعة ${m.label}.`);
  await tx.insert(supplierLedger).values({ id: uuidv7(), supplierId, amountPt: -amountPt, kind: "payment", refType, refId, createdBy: actor.id });
  if (m.isCash) await tx.insert(cashMovements).values({ id: uuidv7(), amountPt: -amountPt, kind: "supplier_payment", refType, refId, note: reference ?? null, movedAt: new Date(), createdBy: actor.id });
}

export function purchasingRoutes(app: FastifyInstance, db: Db, auth: preHandlerHookHandler) {
  const manage = [auth, requirePerm("supplier.manage")];

  app.get("/suppliers", { preHandler: manage }, async (req) => {
    const { q } = z.object({ q: z.string().max(60).optional() }).parse(req.query);
    const key = q ? searchKey(q) : "";
    const list = await db.select().from(suppliers).where(and(isNull(suppliers.archivedAt), key ? or(ilike(suppliers.nameKey, `%${key}%`), ilike(suppliers.phone, `%${key}%`)) : undefined)).orderBy(asc(suppliers.name));
    const ids = list.map((s) => s.id);
    const bal = ids.length ? await db.select({ id: supplierLedger.supplierId, b: sql<string>`sum(${supplierLedger.amountPt})` }).from(supplierLedger).where(inArray(supplierLedger.supplierId, ids)).groupBy(supplierLedger.supplierId) : [];
    const last = ids.length ? await db.select({ id: purchases.supplierId, d: sql<string>`max(${purchases.purchaseDate})` }).from(purchases).where(inArray(purchases.supplierId, ids)).groupBy(purchases.supplierId) : [];
    return list.map((s) => ({ ...s, balancePt: Number(bal.find((b) => b.id === s.id)?.b ?? 0), lastPurchase: last.find((l) => l.id === s.id)?.d ?? null, whatsappValid: !!egyptMobile(s.whatsapp ?? "") }));
  });

  app.post("/suppliers", { preHandler: manage }, async (req, reply) => {
    const s = SupplierIn.parse(req.body);
    if (s.whatsapp && !egyptMobile(s.whatsapp)) throw new AppError(422, "bad_whatsapp", "رقم الواتساب غير صحيح. اكتب رقم موبايل مصري مثل 01001234567.");
    const id = s.id ?? uuidv7();
    await db.transaction(async (tx) => {
      await tx.insert(suppliers).values({ ...s, id, nameKey: searchKey(s.name), openingBalancePt: s.openingBalancePt ?? 0, createdBy: actorOf(req).id });
      if (s.openingBalancePt) await tx.insert(supplierLedger).values({ id: uuidv7(), supplierId: id, amountPt: s.openingBalancePt, kind: "opening", createdBy: actorOf(req).id });
    });
    reply.status(201);
    return { id };
  });

  app.patch("/suppliers/:id", { preHandler: manage }, async (req) => {
    const { id } = Id.parse(req.params);
    const s = SupplierIn.partial().omit({ openingBalancePt: true }).parse(req.body);
    if (s.whatsapp && !egyptMobile(s.whatsapp)) throw new AppError(422, "bad_whatsapp", "رقم الواتساب غير صحيح. اكتب رقم موبايل مصري مثل 01001234567.");
    await db.update(suppliers).set({ ...s, ...(s.name ? { nameKey: searchKey(s.name) } : {}), updatedAt: new Date() }).where(eq(suppliers.id, id));
    return { id };
  });

  app.get("/suppliers/:id/ledger", { preHandler: manage }, async (req) => {
    const { id } = Id.parse(req.params);
    const rows = await db.select().from(supplierLedger).where(eq(supplierLedger.supplierId, id)).orderBy(asc(supplierLedger.createdAt));
    let bal = 0;
    return rows.map((r) => ({ at: r.createdAt, kind: r.kind, refType: r.refType, refId: r.refId, amountPt: r.amountPt, balancePt: (bal += r.amountPt) }));
  });

  app.post("/suppliers/:id/payments", { preHandler: [auth, requirePerm("supplier.manage"), requirePerm("cash.manage")] }, async (req, reply) => {
    const { id } = Id.parse(req.params);
    const p = z.object({ methodId: z.string(), amountPt: int.positive(), reference: z.string().trim().max(64).optional() }).parse(req.body);
    const actor = actorOf(req);
    await db.transaction(async (tx) => {
      const [s] = await tx.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, id));
      if (!s) throw notFound("المورد");
      const pid = uuidv7();
      await payOut(tx, actor, id, p.methodId, p.amountPt, "supplier_payment", pid, p.reference);
      await audit(tx, actor, "supplier.payment", "supplier", id, null, p);
    });
    reply.status(201);
    return { balancePt: await supplierBalancePt(db, id) };
  });

  /** Purchase invoice: stock in at cost (weighted average updates), supplier owes/paid. */
  const PurchaseIn = z.object({
    id: z.uuid(),
    supplierId: z.uuid(),
    purchaseDate: z.iso.date(),
    supplierRef: z.string().trim().max(40).optional(),
    payment: z.enum(["paid", "credit"]),
    paidMethodId: z.string().default("cash"),
    paidReference: z.string().trim().max(64).optional(),
    lines: z.array(z.object({ variantId: z.uuid(), qtyMilli: int.positive(), unitCostPt: int.nonnegative() })).min(1).max(200),
  });
  app.post("/purchases", { preHandler: manage }, async (req, reply) => {
    const p = PurchaseIn.parse(req.body);
    const actor = actorOf(req);
    const res = await db.transaction(async (tx) => {
      const [s] = await tx.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, p.supplierId));
      if (!s) throw notFound("المورد");
      const number = await nextNumber(tx, "purchase");
      const total = p.lines.reduce((a, l) => a + lineValuePt(l.qtyMilli, l.unitCostPt), 0);
      await tx.insert(purchases).values({ id: p.id, number, kind: "invoice", supplierId: p.supplierId, purchaseDate: p.purchaseDate, payment: p.payment, totalPt: total, supplierRef: p.supplierRef ?? null, createdBy: actor.id });
      for (const l of p.lines) {
        await tx.insert(purchaseLines).values({ id: uuidv7(), purchaseId: p.id, variantId: l.variantId, qtyMilli: l.qtyMilli, unitCostPt: l.unitCostPt });
        await move(tx, actor, { variantId: l.variantId, qtyMilli: l.qtyMilli, kind: "purchase_in", unitCostPt: l.unitCostPt, refType: "purchase", refId: p.id });
      }
      await tx.insert(supplierLedger).values({ id: uuidv7(), supplierId: p.supplierId, amountPt: total, kind: "purchase", refType: "purchase", refId: p.id, createdBy: actor.id });
      if (p.payment === "paid") await payOut(tx, actor, p.supplierId, p.paidMethodId, total, "purchase", p.id, p.paidReference);
      await audit(tx, actor, "purchase.create", "purchase", p.id, null, { number, totalPt: total, payment: p.payment });
      return { id: p.id, number, totalPt: total };
    });
    reply.status(201);
    return res;
  });

  /** Purchase return: stock out at the current average; the supplier owes us (or refunds cash). */
  const ReturnIn = z.object({
    id: z.uuid(), supplierId: z.uuid(), purchaseDate: z.iso.date(), refund: z.enum(["credit", "cash"]), reason: z.string().trim().min(3).max(300),
    lines: z.array(z.object({ variantId: z.uuid(), qtyMilli: int.positive(), unitCostPt: int.nonnegative() })).min(1).max(200),
  });
  app.post("/purchase-returns", { preHandler: manage }, async (req, reply) => {
    const r = ReturnIn.parse(req.body);
    const actor = actorOf(req);
    const res = await db.transaction(async (tx) => {
      const number = await nextNumber(tx, "purchase_return");
      const total = r.lines.reduce((a, l) => a + lineValuePt(l.qtyMilli, l.unitCostPt), 0);
      await tx.insert(purchases).values({ id: r.id, number, kind: "return", supplierId: r.supplierId, purchaseDate: r.purchaseDate, payment: r.refund === "cash" ? "paid" : "credit", totalPt: total, supplierRef: r.reason, createdBy: actor.id });
      for (const l of r.lines) {
        const [lvl] = await tx.select().from(stockLevels).where(eq(stockLevels.variantId, l.variantId));
        if ((lvl?.qtyMilli ?? 0) < l.qtyMilli) throw new AppError(422, "not_enough_stock", "الكمية المرتجعة أكبر من الموجود في المخزن.");
        await tx.insert(purchaseLines).values({ id: uuidv7(), purchaseId: r.id, variantId: l.variantId, qtyMilli: l.qtyMilli, unitCostPt: l.unitCostPt });
        await move(tx, actor, { variantId: l.variantId, qtyMilli: -l.qtyMilli, kind: "purchase_return", refType: "purchase", refId: r.id, reason: r.reason });
      }
      await tx.insert(supplierLedger).values({ id: uuidv7(), supplierId: r.supplierId, amountPt: -total, kind: "purchase_return", refType: "purchase", refId: r.id, createdBy: actor.id });
      if (r.refund === "cash") {
        await tx.insert(supplierLedger).values({ id: uuidv7(), supplierId: r.supplierId, amountPt: total, kind: "refund_received", refType: "purchase", refId: r.id, createdBy: actor.id });
        await tx.insert(cashMovements).values({ id: uuidv7(), amountPt: total, kind: "supplier_refund", refType: "purchase", refId: r.id, movedAt: new Date(), createdBy: actor.id });
      }
      await audit(tx, actor, "purchaseReturn.create", "purchase", r.id, null, { number, totalPt: total, reason: r.reason });
      return { id: r.id, number, totalPt: total };
    });
    reply.status(201);
    return res;
  });

  app.get("/purchases", { preHandler: manage }, async (req) => {
    const { supplierId } = z.object({ supplierId: z.uuid().optional() }).parse(req.query);
    return db.select().from(purchases).where(supplierId ? eq(purchases.supplierId, supplierId) : undefined).orderBy(sql`${purchases.purchaseDate} desc, ${purchases.number} desc`).limit(300);
  });
}
