/**
 * Money module: customer statement (بيان عميل) finalize, admin edit (with revision), cancel.
 * Totals always come from @jc/core computeTotals over the saved lines. Every effect is a ledger row:
 * stock movements, customer ledger (+ owes / − paid), cash movements for cash payments.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { amountInWords, can, CATEGORIES, computeTotals, deniedMessage, uuidv7, type Category, type Discount } from "@jc/core";
import { audit, type Actor } from "../audit";
import type { Db } from "../db/client";
import {
  cashMovements, customerLedger, docLines, items, itemVariants, paymentMethods, payments, statementRevisions, statements, workOrders,
} from "../db/schema";
import { getSetting } from "./settings";
import { AppError, notFound } from "../errors";
import { nextNumber } from "./numbering";
import { move } from "./stock";
import { int } from "../http";

const DiscountIn = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("amount"), valuePt: int.nonnegative() }),
  z.object({ mode: z.literal("percent"), valueBp: int.min(0).max(10_000) }),
]);
const DiscountsIn = z.partialRecord(z.enum(CATEGORIES), DiscountIn);
const PaymentIn = z.object({ methodId: z.string().min(1), amountPt: int.positive(), reference: z.string().trim().max(64).optional() });

export const FinalizeIn = z.object({
  id: z.uuid(),
  workOrderId: z.uuid(),
  discounts: DiscountsIn.default({}),
  payments: z.array(PaymentIn).max(10),
  notDone: z.string().max(2000).optional(),
  exitAt: z.iso.datetime().optional(),
  taxExempt: z.boolean().default(false),
});
const LineEdit = z.object({
  id: z.uuid().optional(),
  variantId: z.uuid().optional(),
  qtyMilli: int.positive().optional(),
  unitPricePt: int.nonnegative().optional(),
  remove: z.boolean().optional(),
});
export const EditIn = z.object({
  expectedVersion: int.positive(),
  reason: z.string().trim().min(3, "اكتب سبب التعديل.").max(500),
  discounts: DiscountsIn.optional(),
  notDone: z.string().max(2000).optional(),
  lines: z.array(LineEdit).max(200).optional(),
  payments: z.array(PaymentIn).max(10).optional(),
});
export const CancelIn = z.object({ reason: z.string().trim().min(3, "اكتب سبب الإلغاء.").max(500), expectedVersion: int.positive().optional() });

export async function totalsFor(tx: Db, statementLines: { category: Category; qtyMilli: number; unitPricePt: number }[], discounts: Partial<Record<Category, Discount>>, taxExempt: boolean, saved: Partial<Record<Category, Discount>> = {}) {
  const enabled = await getSetting<Category[]>(tx, "discounts.categories");
  for (const c of Object.keys(discounts) as Category[]) {
    // A discount already on the saved statement stays editable after its category is switched off in Settings.
    if (!enabled.includes(c) && JSON.stringify(discounts[c]) !== JSON.stringify(saved[c])) throw new AppError(422, "discount_disabled", "هذا النوع من الخصم غير مفعّل في الإعدادات.");
  }
  const vat = await getSetting<{ enabled: boolean; rateBp: Partial<Record<Category, number>> }>(tx, "vat");
  return computeTotals({ lines: statementLines, discounts, vatBp: vat.enabled ? vat.rateBp : undefined, taxExempt });
}

const fmt = (pt: number) => (pt / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

export async function validatePayments(tx: Db, list: z.infer<typeof PaymentIn>[], duePt: number) {
  const methods = await tx.select().from(paymentMethods);
  for (const p of list) {
    const m = methods.find((x) => x.id === p.methodId);
    if (!m || !m.active) throw new AppError(422, "bad_method", "طريقة الدفع غير موجودة أو غير مفعّلة.");
    if (m.needsReference && !p.reference) throw new AppError(422, "reference_required", `اكتب رقم المرجع لدفعة ${m.label}.`);
  }
  const sum = list.reduce((a, p) => a + p.amountPt, 0);
  if (sum !== duePt) throw new AppError(422, "payments_mismatch", `مجموع الدفعات (${fmt(sum)}) لا يساوي المطلوب (${fmt(duePt)}).`, { sumPt: sum, duePt });
  return methods;
}

/** Record payments of a statement: payment rows, cash for cash methods, ledger credit for non-credit methods. */
export async function recordPayments(tx: Db, actor: Actor, st: { id: string; customerId: string }, list: z.infer<typeof PaymentIn>[], methods: (typeof paymentMethods.$inferSelect)[], kind: "statement" | "refund") {
  for (const p of list) {
    const m = methods.find((x) => x.id === p.methodId)!;
    const amount = kind === "refund" ? -p.amountPt : p.amountPt;
    const id = uuidv7();
    await tx.insert(payments).values({ id, statementId: st.id, customerId: st.customerId, methodId: m.id, amountPt: amount, reference: p.reference ?? null, kind, paidAt: new Date(), createdBy: actor.id, deviceId: actor.deviceId ?? null });
    if (m.isCash) await tx.insert(cashMovements).values({ id: uuidv7(), amountPt: amount, kind: kind === "refund" ? "refund" : "statement_payment", refType: "payment", refId: id, movedAt: new Date(), createdBy: actor.id, deviceId: actor.deviceId ?? null });
    // Credit (آجل) leaves the amount on the customer's balance; every other method pays it off.
    if (!m.isCredit) await tx.insert(customerLedger).values({ id: uuidv7(), customerId: st.customerId, amountPt: -amount, kind: kind === "refund" ? "refund" : "payment", refType: "payment", refId: id, createdBy: actor.id });
  }
}

/** Net paid per method for a statement (payments minus refunds). */
async function netPayments(tx: Db, statementId: string) {
  const rows = await tx.select({ methodId: payments.methodId, net: sql<string>`sum(${payments.amountPt})` }).from(payments).where(eq(payments.statementId, statementId)).groupBy(payments.methodId);
  return rows.map((r) => ({ methodId: r.methodId, amountPt: Number(r.net) })).filter((r) => r.amountPt > 0);
}

async function snapshot(tx: Db, statementId: string) {
  const [st] = await tx.select().from(statements).where(eq(statements.id, statementId));
  const lines = await tx.select({ id: docLines.id, name: docLines.name, category: docLines.category, qtyMilli: docLines.qtyMilli, unitPricePt: docLines.unitPricePt, archivedAt: docLines.archivedAt })
    .from(docLines).where(eq(docLines.statementId, statementId));
  return {
    amountDuePt: st.amountDuePt, discounts: st.discounts, notDone: st.notDone, status: st.status, version: st.version,
    lines: lines.filter((l) => !l.archivedAt).map(({ archivedAt: _, ...l }) => l),
    payments: await netPayments(tx, statementId),
  };
}

const activeLines = (tx: Db, statementId: string) => tx.select().from(docLines).where(and(eq(docLines.statementId, statementId), isNull(docLines.archivedAt)));

export async function finalizeStatement(db: Db, actor: Actor, raw: unknown) {
  const input = FinalizeIn.parse(raw);
  if (!can(actor, "statement.create")) throw new AppError(403, "forbidden", deniedMessage("statement.create"));
  return db.transaction(async (tx) => {
    const [wo] = await tx.select().from(workOrders).where(eq(workOrders.id, input.workOrderId)).for("update");
    if (!wo) throw notFound("أمر الشغل");
    const [existing] = await tx.select({ id: statements.id, number: statements.number }).from(statements).where(and(eq(statements.workOrderId, wo.id), eq(statements.status, "final")));
    if (existing || wo.status === "delivered" || wo.status === "closed" || wo.status === "cancelled")
      throw new AppError(409, "already_invoiced", existing ? `تم تحويل أمر الشغل إلى البيان رقم ${existing.number} من قبل.` : "أمر الشغل مقفول.");
    const lines = await tx.select().from(docLines).where(and(eq(docLines.workOrderId, wo.id), isNull(docLines.archivedAt)));
    if (!lines.length) throw new AppError(422, "no_lines", "لا يمكن حفظ بيان بدون بنود.");

    const totals = await totalsFor(tx, lines, input.discounts, input.taxExempt);
    const methods = await validatePayments(tx, input.payments, totals.amountDuePt);
    const number = await nextNumber(tx, "statement");
    const exitAt = input.exitAt ? new Date(input.exitAt) : new Date();
    const cairoDate = exitAt.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

    await tx.insert(statements).values({
      id: input.id, number, workOrderId: wo.id, customerId: wo.customerId, vehicleId: wo.vehicleId, statementDate: cairoDate, exitAt,
      discounts: input.discounts, taxExempt: input.taxExempt, totals, amountDuePt: totals.amountDuePt, notDone: input.notDone ?? null,
      createdBy: actor.id, deviceId: actor.deviceId ?? null,
    });
    await tx.update(docLines).set({ statementId: input.id, updatedAt: new Date() }).where(and(eq(docLines.workOrderId, wo.id), isNull(docLines.archivedAt)));
    if (totals.amountDuePt) await tx.insert(customerLedger).values({ id: uuidv7(), customerId: wo.customerId, amountPt: totals.amountDuePt, kind: "statement", refType: "statement", refId: input.id, createdBy: actor.id });
    await recordPayments(tx, actor, { id: input.id, customerId: wo.customerId }, input.payments, methods, "statement");
    await tx.update(workOrders).set({ status: "delivered", updatedAt: new Date() }).where(eq(workOrders.id, wo.id));
    await audit(tx, actor, "statement.create", "statement", input.id, null, { number, amountDuePt: totals.amountDuePt, payments: input.payments });
    return { id: input.id, number, totals, amountInWords: amountInWords(totals.amountDuePt) };
  });
}

const BYTE_LOCKED = "هذا بيان قديم من بايت للأرشيف فقط، ولا يُعدّل أو يُلغى.";

export async function editStatement(db: Db, actor: Actor, statementId: string, raw: unknown) {
  // Checked again here (the route checks first): saved statements are locked for engineers.
  if (!can(actor, "statement.editSaved")) throw new AppError(403, "forbidden", deniedMessage("statement.editSaved"));
  const input = EditIn.parse(raw);
  return db.transaction(async (tx) => {
    const [st] = await tx.select().from(statements).where(eq(statements.id, statementId)).for("update");
    if (!st) throw notFound("البيان");
    if (st.kind === "byte") throw new AppError(409, "byte_statement", BYTE_LOCKED);
    if (st.status === "cancelled") throw new AppError(409, "cancelled", "البيان ملغي ولا يمكن تعديله.");
    if (st.version !== input.expectedVersion) throw new AppError(409, "version_conflict", "عدّل شخص آخر هذا البيان. حدّث الصفحة وأعد التعديل.", { currentVersion: st.version });
    const before = await snapshot(tx, st.id);
    const ref = { refType: "statement", refId: st.id, reason: input.reason };

    // Lines: changes, removals, additions, each with its compensating stock movement.
    for (const le of input.lines ?? []) {
      if (le.id) {
        const [line] = await tx.select().from(docLines).where(and(eq(docLines.id, le.id), eq(docLines.statementId, st.id), isNull(docLines.archivedAt)));
        if (!line) throw notFound("بند البيان");
        if (le.remove) {
          if (line.stockQtyMilli && line.variantId) await move(tx, actor, { variantId: line.variantId, qtyMilli: line.stockQtyMilli, kind: "statement_edit", ...ref });
          await tx.update(docLines).set({ archivedAt: new Date(), stockQtyMilli: 0, updatedAt: new Date() }).where(eq(docLines.id, line.id));
          continue;
        }
        const qty = le.qtyMilli ?? line.qtyMilli;
        if (line.stockQtyMilli && line.variantId && qty !== line.stockQtyMilli)
          await move(tx, actor, { variantId: line.variantId, qtyMilli: line.stockQtyMilli - qty, kind: "statement_edit", ...ref });
        await tx.update(docLines).set({ qtyMilli: qty, unitPricePt: le.unitPricePt ?? line.unitPricePt, stockQtyMilli: line.stockQtyMilli ? qty : 0, updatedAt: new Date() }).where(eq(docLines.id, line.id));
      } else {
        if (!le.variantId || !le.qtyMilli) throw new AppError(422, "bad_line", "البند الجديد يحتاج صنفًا وكمية.");
        const [v] = await tx.select().from(itemVariants).where(eq(itemVariants.id, le.variantId));
        if (!v) throw notFound("الصنف");
        const [it] = await tx.select().from(items).where(eq(items.id, v.itemId));
        const id = uuidv7();
        await tx.insert(docLines).values({
          id, workOrderId: st.workOrderId, statementId: st.id, category: it.type, itemId: it.id, variantId: v.id, code: it.code, name: it.nameAr,
          grade: v.grade, unit: it.unit, qtyMilli: le.qtyMilli, unitPricePt: le.unitPricePt ?? v.sellPricePt, stockQtyMilli: it.trackStock ? le.qtyMilli : 0, createdBy: actor.id,
        });
        if (it.trackStock) await move(tx, actor, { variantId: v.id, qtyMilli: -le.qtyMilli, kind: "statement_edit", ...ref });
      }
    }

    const discounts = (input.discounts ?? st.discounts) as Partial<Record<Category, Discount>>;
    const totals = await totalsFor(tx, await activeLines(tx, st.id), discounts, st.taxExempt, st.discounts as Partial<Record<Category, Discount>>);
    const methods = await tx.select().from(paymentMethods);

    if (input.payments) {
      await validatePayments(tx, input.payments, totals.amountDuePt);
      // Simplest audit trail: refund what was paid, then record the new split.
      await recordPayments(tx, actor, st, await netPayments(tx, st.id), methods, "refund");
      await recordPayments(tx, actor, st, input.payments, methods, "statement");
    } else {
      const paid = (await netPayments(tx, st.id)).reduce((a, p) => a + p.amountPt, 0);
      if (paid !== totals.amountDuePt) throw new AppError(422, "payments_mismatch", `المطلوب أصبح ${fmt(totals.amountDuePt)}. عدّل الدفعات ليساوي مجموعها المطلوب الجديد.`, { duePt: totals.amountDuePt, paidPt: paid });
    }
    const delta = totals.amountDuePt - st.amountDuePt;
    if (delta) await tx.insert(customerLedger).values({ id: uuidv7(), customerId: st.customerId, amountPt: delta, kind: "statement_edit", refType: "statement", refId: st.id, createdBy: actor.id });

    const version = st.version + 1;
    await tx.update(statements).set({ discounts, totals, amountDuePt: totals.amountDuePt, notDone: input.notDone ?? st.notDone, version, updatedAt: new Date() }).where(eq(statements.id, st.id));
    const after = await snapshot(tx, st.id);
    await tx.insert(statementRevisions).values({ id: uuidv7(), statementId: st.id, revNo: version, reason: input.reason, before, after, createdBy: actor.id, deviceId: actor.deviceId ?? null });
    await audit(tx, actor, "statement.edit", "statement", st.id, before, { ...after, reason: input.reason });
    return { id: st.id, number: st.number, version, totals, amountInWords: amountInWords(totals.amountDuePt) };
  });
}

/* ---------- Cancel (Admin, with reason): nothing is deleted ---------- */
export async function cancelStatement(db: Db, actor: Actor, statementId: string, raw: unknown) {
  if (!can(actor, "statement.cancel")) throw new AppError(403, "forbidden", deniedMessage("statement.cancel"));
  const input = CancelIn.parse(raw);
  return db.transaction(async (tx) => {
    const [st] = await tx.select().from(statements).where(eq(statements.id, statementId)).for("update");
    if (!st) throw notFound("البيان");
    if (st.kind === "byte") throw new AppError(409, "byte_statement", BYTE_LOCKED);
    if (st.status === "cancelled") throw new AppError(409, "cancelled", "البيان ملغي من قبل.");
    if (input.expectedVersion && st.version !== input.expectedVersion) throw new AppError(409, "version_conflict", "عدّل شخص آخر هذا البيان. حدّث الصفحة وأعد المحاولة.");
    const before = await snapshot(tx, st.id);
    const ref = { refType: "statement", refId: st.id, reason: input.reason };
    // Issued parts return to stock (D-25).
    for (const l of await activeLines(tx, st.id)) {
      if (l.stockQtyMilli && l.variantId) {
        await move(tx, actor, { variantId: l.variantId, qtyMilli: l.stockQtyMilli, kind: "statement_cancel", ...ref });
        await tx.update(docLines).set({ stockQtyMilli: 0, updatedAt: new Date() }).where(eq(docLines.id, l.id));
      }
    }
    // Payments are refunded (cash leaves the drawer), then the statement's debt is reversed.
    const methods = await tx.select().from(paymentMethods);
    await recordPayments(tx, actor, st, await netPayments(tx, st.id), methods, "refund");
    if (st.amountDuePt) await tx.insert(customerLedger).values({ id: uuidv7(), customerId: st.customerId, amountPt: -st.amountDuePt, kind: "statement_cancel", refType: "statement", refId: st.id, createdBy: actor.id });
    await tx.update(statements).set({ status: "cancelled", cancelReason: input.reason, cancelledAt: new Date(), version: st.version + 1, updatedAt: new Date() }).where(eq(statements.id, st.id));
    await audit(tx, actor, "statement.cancel", "statement", st.id, before, { reason: input.reason });
    return { id: st.id, number: st.number, status: "cancelled" as const };
  });
}

export async function getStatement(db: Db, actor: Actor, statementId: string) {
  const [st] = await db.select().from(statements).where(eq(statements.id, statementId));
  if (!st) throw notFound("البيان");
  const lines = await activeLines(db, st.id);
  const pays = await db.select().from(payments).where(eq(payments.statementId, st.id));
  return {
    ...st,
    amountInWords: amountInWords(st.amountDuePt),
    locked: !can(actor, "statement.editSaved"),
    lines: lines.map(({ stockQtyMilli: _s, ...l }) => l),
    payments: pays,
  };
}

