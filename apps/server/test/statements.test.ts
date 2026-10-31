import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { egp, qty, uuidv7 } from "@jc/core";
import { auditLog, cashMovements, statementRevisions, statements, stockMovements, workOrders } from "../src/db/schema";
import { customerBalancePt } from "../src/modules/statements";
import { level, onHandFromLedger } from "../src/modules/stock";
import { fixture9309, makeItem, makeWorkOrder, setup, stockIn } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); });
afterAll(async () => { await t.close(); });

const cashTotal = async () => Number((await t.db.select({ s: sql<string>`coalesce(sum(${cashMovements.amountPt}),0)` }).from(cashMovements))[0].s);

describe("finalize: work order → statement", () => {
  let woId: string, customerId: string, statementId: string;

  it("the real statement: totals, number 9309, words, split payment cash + Visa", async () => {
    const wo = await fixture9309(t.db, t.engineerId);
    woId = wo.id; customerId = wo.customerId; statementId = uuidv7();
    const r = await t.app.inject({
      method: "POST", url: "/statements", headers: t.as(t.engineerToken),
      payload: {
        id: statementId, workOrderId: woId,
        discounts: { labor: { mode: "amount", valuePt: egp(450) }, part: { mode: "amount", valuePt: egp(400) } },
        payments: [{ methodId: "cash", amountPt: egp(8000) }, { methodId: "card", amountPt: egp(5000), reference: "004512" }],
      },
    });
    expect(r.statusCode).toBe(201);
    const body = r.json();
    expect(body.number).toBe(9309);
    expect(body.totals.statementGrossPt).toBe(egp(13850));
    expect(body.totals.discountPt).toBe(egp(850));
    expect(body.totals.amountDuePt).toBe(egp(13000));
    expect(body.amountInWords).toBe("فقط ثلاثة عشر ألف جنيه مصري");
    expect(await customerBalancePt(t.db, customerId)).toBe(0);
    expect(await cashTotal()).toBe(egp(8000));
    const [wo2] = await t.db.select().from(workOrders).where(eq(workOrders.id, woId));
    expect(wo2.status).toBe("delivered");
  });

  it("refuses a second statement for the same work order", async () => {
    const r = await t.app.inject({ method: "POST", url: "/statements", headers: t.as(t.adminToken), payload: { id: uuidv7(), workOrderId: woId, payments: [{ methodId: "cash", amountPt: egp(13000) }] } });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.message).toContain("9309");
  });

  it("an engineer is rejected by the SERVER when editing a saved statement", async () => {
    const before = await t.db.select().from(statements).where(eq(statements.id, statementId));
    const r = await t.app.inject({
      method: "PATCH", url: `/statements/${statementId}`, headers: t.as(t.engineerToken),
      payload: { expectedVersion: 1, reason: "تغيير الخصم", discounts: { labor: { mode: "amount", valuePt: 0 } } },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.message).toBe("البيان محفوظ ولا يمكن تعديله إلا من الإدارة.");
    const after = await t.db.select().from(statements).where(eq(statements.id, statementId));
    expect(after).toEqual(before);
    expect((await t.db.select().from(statementRevisions)).length).toBe(0);
  });

  it("an engineer cannot cancel either", async () => {
    const r = await t.app.inject({ method: "POST", url: `/statements/${statementId}/cancel`, headers: t.as(t.engineerToken), payload: { reason: "خطأ" } });
    expect(r.statusCode).toBe(403);
  });

  it("an engineer sees the statement as locked", async () => {
    const r = await t.app.inject({ method: "GET", url: `/statements/${statementId}`, headers: t.as(t.engineerToken) });
    expect(r.statusCode).toBe(200);
    expect(r.json().locked).toBe(true);
    expect(r.json().lines).toHaveLength(9);
  });

  it("admin edit: new discount, payments re-split, revision with before/after, version check", async () => {
    const r = await t.app.inject({
      method: "PATCH", url: `/statements/${statementId}`, headers: t.as(t.adminToken),
      payload: {
        expectedVersion: 1, reason: "عميل دائم: خصم إضافي",
        discounts: { labor: { mode: "amount", valuePt: egp(500) }, part: { mode: "amount", valuePt: egp(400) } },
        payments: [{ methodId: "cash", amountPt: egp(7950) }, { methodId: "card", amountPt: egp(5000), reference: "004512" }],
      },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().totals.amountDuePt).toBe(egp(12950));
    expect(r.json().version).toBe(2);
    const [rev] = await t.db.select().from(statementRevisions).where(eq(statementRevisions.statementId, statementId));
    expect(rev.revNo).toBe(2);
    expect((rev.before as { amountDuePt: number }).amountDuePt).toBe(egp(13000));
    expect((rev.after as { amountDuePt: number }).amountDuePt).toBe(egp(12950));
    expect(await customerBalancePt(t.db, customerId)).toBe(0);
    expect(await cashTotal()).toBe(egp(7950)); // 8000 refunded, 7950 received

    const stale = await t.app.inject({ method: "PATCH", url: `/statements/${statementId}`, headers: t.as(t.adminToken), payload: { expectedVersion: 1, reason: "تعديل قديم", notDone: "x" } });
    expect(stale.statusCode).toBe(409);
  });

  it("admin edit that changes the amount without new payments is refused", async () => {
    const r = await t.app.inject({ method: "PATCH", url: `/statements/${statementId}`, headers: t.as(t.adminToken), payload: { expectedVersion: 2, reason: "خصم", discounts: { labor: { mode: "amount", valuePt: 0 } } } });
    expect(r.statusCode).toBe(422);
    expect(r.json().error.code).toBe("payments_mismatch");
  });
});

describe("payments validation", () => {
  it("sum must equal the amount due", async () => {
    // fresh work order numbers must be unique
    const wo = await makeWorkOrder(t.db, t.adminId, 20001);
    const { variantId } = await makeItem(t.db, { code: "L-9", name: "كشف", type: "labor", pricePt: egp(500) });
    await t.app.inject({ method: "POST", url: `/work-orders/${wo.id}/issue`, headers: t.as(t.adminToken), payload: { variantId, qtyMilli: qty(1) } });
    const r = await t.app.inject({ method: "POST", url: "/statements", headers: t.as(t.adminToken), payload: { id: uuidv7(), workOrderId: wo.id, payments: [{ methodId: "cash", amountPt: egp(400) }] } });
    expect(r.statusCode).toBe(422);
    expect(r.json().error.message).toBe("مجموع الدفعات (400) لا يساوي المطلوب (500).");
  });
  it("electronic methods need a reference; credit becomes customer debt", async () => {
    const wo = await makeWorkOrder(t.db, t.adminId, 20002);
    const { variantId } = await makeItem(t.db, { code: "L-10", name: "كشف كهرباء", type: "labor", pricePt: egp(1000) });
    await t.app.inject({ method: "POST", url: `/work-orders/${wo.id}/issue`, headers: t.as(t.adminToken), payload: { variantId, qtyMilli: qty(1) } });
    const noRef = await t.app.inject({ method: "POST", url: "/statements", headers: t.as(t.adminToken), payload: { id: uuidv7(), workOrderId: wo.id, payments: [{ methodId: "instapay", amountPt: egp(1000) }] } });
    expect(noRef.statusCode).toBe(422);
    expect(noRef.json().error.message).toBe("اكتب رقم المرجع لدفعة إنستا باي.");
    const ok = await t.app.inject({ method: "POST", url: "/statements", headers: t.as(t.adminToken), payload: { id: uuidv7(), workOrderId: wo.id, payments: [{ methodId: "instapay", amountPt: egp(400), reference: "IP-1" }, { methodId: "credit", amountPt: egp(600) }] } });
    expect(ok.statusCode).toBe(201);
    expect(await customerBalancePt(t.db, wo.customerId)).toBe(egp(600));
  });
  it("a refused finalize does not consume a statement number (gap-free)", async () => {
    const max = Math.max(...(await t.db.select({ n: statements.number }).from(statements)).map((x) => x.n));
    const wo = await fixture9309(t.db, t.adminId);
    const post = (payments: unknown[]) => t.app.inject({ method: "POST", url: "/statements", headers: t.as(t.adminToken), payload: { id: uuidv7(), workOrderId: wo.id, payments } });
    expect((await post([{ methodId: "cash", amountPt: 1 }])).statusCode).toBe(422);
    const ok = await post([{ methodId: "cash", amountPt: egp(13850) }]);
    expect(ok.statusCode).toBe(201);
    expect(ok.json().number).toBe(max + 1);
  });
});

describe("parts on a statement: admin edit and cancel move stock back", () => {
  it("edit reduces a part and cancel returns everything, refunds cash, clears the debt", async () => {
    const wo = await makeWorkOrder(t.db, t.adminId, 30001);
    const filter = await makeItem(t.db, { code: "P-2201", name: "فلتر زيت", type: "part", grade: "original", pricePt: egp(850) });
    await stockIn(t.db, filter.variantId, 10, egp(610));
    await t.app.inject({ method: "POST", url: `/work-orders/${wo.id}/issue`, headers: t.as(t.engineerToken), payload: { variantId: filter.variantId, qtyMilli: qty(2) } });
    expect((await level(t.db, filter.variantId)).qtyMilli).toBe(qty(8));

    const id = uuidv7();
    const fin = await t.app.inject({ method: "POST", url: "/statements", headers: t.as(t.engineerToken), payload: { id, workOrderId: wo.id, payments: [{ methodId: "cash", amountPt: egp(1000) }, { methodId: "credit", amountPt: egp(700) }] } });
    expect(fin.statusCode).toBe(201);
    const cashBefore = await cashTotal();

    const st = (await t.app.inject({ method: "GET", url: `/statements/${id}`, headers: t.as(t.adminToken) })).json();
    const edit = await t.app.inject({
      method: "PATCH", url: `/statements/${id}`, headers: t.as(t.adminToken),
      payload: { expectedVersion: 1, reason: "العميل رجّع فلتر", lines: [{ id: st.lines[0].id, qtyMilli: qty(1) }], payments: [{ methodId: "cash", amountPt: egp(850) }] },
    });
    expect(edit.statusCode).toBe(200);
    expect((await level(t.db, filter.variantId)).qtyMilli).toBe(qty(9));
    expect(await customerBalancePt(t.db, wo.customerId)).toBe(0);

    const cancel = await t.app.inject({ method: "POST", url: `/statements/${id}/cancel`, headers: t.as(t.adminToken), payload: { reason: "بيان مكرر بالخطأ" } });
    expect(cancel.statusCode).toBe(200);
    expect((await level(t.db, filter.variantId)).qtyMilli).toBe(qty(10));
    expect(await onHandFromLedger(t.db, filter.variantId)).toBe(qty(10));
    expect(await customerBalancePt(t.db, wo.customerId)).toBe(0);
    expect(await cashTotal()).toBe(cashBefore - egp(1000) + egp(850) - egp(850));
    const again = await t.app.inject({ method: "POST", url: `/statements/${id}/cancel`, headers: t.as(t.adminToken), payload: { reason: "مرة ثانية" } });
    expect(again.statusCode).toBe(409);

    const actions = (await t.db.select({ a: auditLog.action }).from(auditLog).where(eq(auditLog.entityId, id))).map((x) => x.a);
    expect(actions).toEqual(expect.arrayContaining(["statement.create", "statement.edit", "statement.cancel"]));
    const kinds = (await t.db.select({ k: stockMovements.kind }).from(stockMovements).where(eq(stockMovements.variantId, filter.variantId))).map((x) => x.k);
    expect(kinds).toEqual(["purchase_in", "issue_out", "statement_edit", "statement_cancel"]);
  });
});
