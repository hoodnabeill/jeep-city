/** Statement list, direct sale (بيع مباشر, no car), sales returns (مرتجع المبيعات). */
import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { amountInWords, computeTotals, divRound, searchKey, uuidv7 } from "@jc/core";
import { audit } from "../audit";
import { actorOf, requirePerm } from "../auth/auth";
import type { Db } from "../db/client";
import {
  cashMovements, customerLedger, customers, docLines, items, itemVariants, paymentMethods, payments, salesReturnLines, salesReturns,
  statements, users, vehicles, workOrders,
} from "../db/schema";
import { AppError, notFound } from "../errors";
import { nextNumber } from "./numbering";
import { recordPayments, totalsFor, validatePayments } from "./statements";
import { move } from "./stock";

const int = z.number().int().safe();

export function salesRoutes(app: FastifyInstance, db: Db, auth: preHandlerHookHandler) {
  app.get("/statements", { preHandler: auth }, async (req) => {
    const q = z.object({ q: z.string().max(60).optional(), status: z.enum(["final", "cancelled"]).optional(), kind: z.enum(["statement", "direct_sale", "byte"]).optional(), from: z.iso.date().optional(), to: z.iso.date().optional(), customerId: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(500).default(200) }).parse(req.query);
    const key = q.q ? searchKey(q.q) : "";
    const rows = await db.select({ s: statements, c: { id: customers.id, name: customers.name }, v: { id: vehicles.id, plateType: vehicles.plateType, plateLetters: vehicles.plateLetters, plateDigits: vehicles.plateDigits }, woNumber: workOrders.number, by: users.displayName })
      .from(statements).innerJoin(customers, eq(customers.id, statements.customerId)).leftJoin(vehicles, eq(vehicles.id, statements.vehicleId))
      .leftJoin(workOrders, eq(workOrders.id, statements.workOrderId)).leftJoin(users, eq(users.id, statements.createdBy))
      .where(and(
        q.status ? eq(statements.status, q.status) : undefined, q.kind ? eq(statements.kind, q.kind) : undefined, q.customerId ? eq(statements.customerId, q.customerId) : undefined,
        q.from ? gte(statements.statementDate, q.from) : undefined, q.to ? lte(statements.statementDate, q.to) : undefined,
        key ? or(sql`${statements.number}::text like ${"%" + key + "%"}`, ilike(customers.nameKey, `%${key}%`), ilike(vehicles.plateKey, `%${key}%`)) : undefined,
      )).orderBy(desc(statements.statementDate), desc(statements.createdAt)).limit(q.limit);
    const ids = rows.map((r) => r.s.id);
    const pays = ids.length ? await db.select({ statementId: payments.statementId, methodId: payments.methodId, net: sql<string>`sum(${payments.amountPt})` }).from(payments).where(inArray(payments.statementId, ids)).groupBy(payments.statementId, payments.methodId) : [];
    const methods = await db.select().from(paymentMethods);
    return rows.map(({ s, c, v, woNumber, by }) => {
      const mine = pays.filter((p) => p.statementId === s.id && Number(p.net) > 0);
      const paidPt = mine.filter((p) => !methods.find((m) => m.id === p.methodId)?.isCredit).reduce((a, p) => a + Number(p.net), 0);
      return {
        id: s.id, number: s.number, kind: s.kind, status: s.status, date: s.statementDate, exitAt: s.exitAt, amountDuePt: s.amountDuePt, paidPt,
        methods: mine.map((p) => p.methodId), customer: c, vehicle: v?.id ? v : null, workOrderNumber: woNumber, by,
      };
    });
  });

  /* Direct sale: a statement with its own lines and number series, no car or work order. */
  const DirectSale = z.object({
    id: z.uuid(),
    customerId: z.uuid(),
    lines: z.array(z.object({ variantId: z.uuid(), qtyMilli: int.positive() })).min(1).max(50),
    payments: z.array(z.object({ methodId: z.string(), amountPt: int.positive(), reference: z.string().trim().max(64).optional() })).max(10),
  });
  app.post("/direct-sales", { preHandler: [auth, requirePerm("statement.create")] }, async (req, reply) => {
    const d = DirectSale.parse(req.body);
    const actor = actorOf(req);
    const res = await db.transaction(async (tx) => {
      const [c] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, d.customerId));
      if (!c) throw notFound("العميل");
      const lines = [];
      for (const l of d.lines) {
        const [row] = await tx.select({ v: itemVariants, i: items }).from(itemVariants).innerJoin(items, eq(items.id, itemVariants.itemId)).where(eq(itemVariants.id, l.variantId));
        if (!row) throw notFound("الصنف");
        lines.push({ ...l, v: row.v, i: row.i });
      }
      const totals = await totalsFor(tx, lines.map((l) => ({ category: l.i.type, qtyMilli: l.qtyMilli, unitPricePt: l.v.sellPricePt })), {}, false);
      const methods = await validatePayments(tx, d.payments, totals.amountDuePt);
      const number = await nextNumber(tx, "direct_sale");
      const now = new Date();
      await tx.insert(statements).values({ id: d.id, number, kind: "direct_sale", customerId: d.customerId, statementDate: now.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }), exitAt: now, discounts: {}, totals, amountDuePt: totals.amountDuePt, createdBy: actor.id, deviceId: actor.deviceId ?? null });
      for (const l of lines) {
        const lineId = uuidv7();
        await tx.insert(docLines).values({ id: lineId, statementId: d.id, category: l.i.type, itemId: l.i.id, variantId: l.v.id, code: l.i.code, name: l.i.nameAr, grade: l.v.grade, unit: l.i.unit, qtyMilli: l.qtyMilli, unitPricePt: l.v.sellPricePt, stockQtyMilli: l.i.trackStock ? l.qtyMilli : 0, createdBy: actor.id });
        if (l.i.trackStock) await move(tx, actor, { variantId: l.v.id, qtyMilli: -l.qtyMilli, kind: "sale_out", refType: "doc_line", refId: lineId });
      }
      await tx.insert(customerLedger).values({ id: uuidv7(), customerId: d.customerId, amountPt: totals.amountDuePt, kind: "statement", refType: "statement", refId: d.id, createdBy: actor.id });
      await recordPayments(tx, actor, { id: d.id, customerId: d.customerId }, d.payments, methods, "statement");
      await audit(tx, actor, "directSale.create", "statement", d.id, null, { number, amountDuePt: totals.amountDuePt });
      return { id: d.id, number, totals, amountInWords: amountInWords(totals.amountDuePt) };
    });
    reply.status(201);
    return res;
  });

  /**
   * Sales return (Admin). Value per line = qty × unit price, less the line's share of its category discount
   * (proportional, D-59, to confirm with Aslam). Parts go back to stock; refund in cash or as customer credit.
   */
  const Return = z.object({
    id: z.uuid(),
    statementId: z.uuid(),
    lines: z.array(z.object({ lineId: z.uuid(), qtyMilli: int.positive() })).min(1).max(50),
    refundMethodId: z.string(),
    reason: z.string().trim().min(3, "اكتب سبب المرتجع.").max(300),
  });
  app.post("/sales-returns", { preHandler: [auth, requirePerm("salesReturn.manage")] }, async (req, reply) => {
    const r = Return.parse(req.body);
    const actor = actorOf(req);
    const res = await db.transaction(async (tx) => {
      const [st] = await tx.select().from(statements).where(eq(statements.id, r.statementId)).for("update");
      if (!st) throw notFound("البيان");
      if (st.status === "cancelled") throw new AppError(409, "cancelled", "البيان ملغي. لا يمكن عمل مرتجع منه.");
      const [m] = await tx.select().from(paymentMethods).where(eq(paymentMethods.id, r.refundMethodId));
      if (!m || !m.active) throw new AppError(422, "bad_method", "اختر طريقة رد المبلغ.");
      const totals = st.totals as { gross: Record<string, number>; discount: Record<string, number> };
      let total = 0;
      const out: { lineId: string; variantId: string | null; qtyMilli: number; valuePt: number }[] = [];
      for (const rl of r.lines) {
        const [line] = await tx.select().from(docLines).where(and(eq(docLines.id, rl.lineId), eq(docLines.statementId, st.id), isNull(docLines.archivedAt)));
        if (!line) throw notFound("بند البيان");
        const [{ done }] = await tx.select({ done: sql<string>`coalesce(sum(${salesReturnLines.qtyMilli}), 0)` }).from(salesReturnLines).where(eq(salesReturnLines.lineId, line.id));
        if (rl.qtyMilli > line.qtyMilli - Number(done)) throw new AppError(422, "over_return", `الكمية المرتجعة من «${line.name}» أكبر من المباع.`);
        const gross = divRound(rl.qtyMilli * line.unitPricePt, 1000);
        const g = totals.gross[line.category] ?? 0, dsc = totals.discount[line.category] ?? 0;
        const value = g ? gross - divRound(gross * dsc, g) : gross;
        total += value;
        out.push({ lineId: line.id, variantId: line.variantId, qtyMilli: rl.qtyMilli, valuePt: value });
        if (line.stockQtyMilli && line.variantId) await move(tx, actor, { variantId: line.variantId, qtyMilli: rl.qtyMilli, kind: "sales_return", refType: "sales_return", refId: r.id, reason: r.reason });
      }
      const number = await nextNumber(tx, "sales_return");
      await tx.insert(salesReturns).values({ id: r.id, number, statementId: st.id, customerId: st.customerId, totalPt: total, refundMethodId: m.id, reason: r.reason, createdBy: actor.id });
      await tx.insert(salesReturnLines).values(out.map((o) => ({ id: uuidv7(), returnId: r.id, ...o })));
      // The customer owes less; if money goes back to them, it leaves the drawer.
      await tx.insert(customerLedger).values({ id: uuidv7(), customerId: st.customerId, amountPt: -total, kind: "sales_return", refType: "sales_return", refId: r.id, createdBy: actor.id });
      if (!m.isCredit) {
        const pid = uuidv7();
        await tx.insert(payments).values({ id: pid, statementId: st.id, customerId: st.customerId, methodId: m.id, amountPt: -total, kind: "refund", paidAt: new Date(), createdBy: actor.id });
        await tx.insert(customerLedger).values({ id: uuidv7(), customerId: st.customerId, amountPt: total, kind: "refund", refType: "payment", refId: pid, createdBy: actor.id });
        if (m.isCash) await tx.insert(cashMovements).values({ id: uuidv7(), amountPt: -total, kind: "refund", refType: "sales_return", refId: r.id, movedAt: new Date(), createdBy: actor.id });
      }
      await audit(tx, actor, "salesReturn.create", "statement", st.id, null, { number, totalPt: total, lines: out, reason: r.reason });
      return { id: r.id, number, totalPt: total };
    });
    reply.status(201);
    return res;
  });
}
