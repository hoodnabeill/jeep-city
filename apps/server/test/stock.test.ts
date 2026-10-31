import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { egp, qty } from "@jc/core";
import { auditLog, docLines, stockMovements } from "../src/db/schema";
import { level, onHandFromLedger } from "../src/modules/stock";
import { makeItem, makeWorkOrder, setup, stockIn } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); });
afterAll(async () => { await t.close(); });

describe("stock ledger", () => {
  it("weighted average cost on purchases; issues carry the cost of that moment", async () => {
    const { variantId } = await makeItem(t.db, { code: "P-3104", name: "تيل فرامل أمامي", type: "part", grade: "original", pricePt: egp(4800) });
    await stockIn(t.db, variantId, 4, egp(3600));
    await stockIn(t.db, variantId, 2, egp(3900)); // (4×3600 + 2×3900) / 6 = 3700
    expect(await level(t.db, variantId)).toMatchObject({ qtyMilli: qty(6), avgCostPt: egp(3700) });
    const wo = await makeWorkOrder(t.db, t.adminId);
    const r = await t.app.inject({ method: "POST", url: `/work-orders/${wo.id}/issue`, headers: t.as(t.engineerToken), payload: { variantId, qtyMilli: qty(1) } });
    expect(r.statusCode).toBe(201);
    const [out] = await t.db.select().from(stockMovements).where(eq(stockMovements.kind, "issue_out"));
    expect(out.unitCostPt).toBe(egp(3700));
    await stockIn(t.db, variantId, 5, egp(4000)); // (5×3700 + 5×4000) / 10 = 3850
    expect((await level(t.db, variantId)).avgCostPt).toBe(egp(3850));
    expect(await onHandFromLedger(t.db, variantId)).toBe((await level(t.db, variantId)).qtyMilli);
  });

  it("average resets to the new cost when stock was zero or negative", async () => {
    const { variantId } = await makeItem(t.db, { code: "P-7300", name: "كمبروسر", type: "part", grade: "used", pricePt: egp(9500) });
    await stockIn(t.db, variantId, 1, egp(5000));
    const wo = await makeWorkOrder(t.db, t.adminId);
    await t.app.inject({ method: "POST", url: `/work-orders/${wo.id}/issue`, headers: t.as(t.adminToken), payload: { variantId, qtyMilli: qty(2), reason: "قطعة وصلت ولم تُسجل" } });
    expect((await level(t.db, variantId)).qtyMilli).toBe(qty(-1));
    await stockIn(t.db, variantId, 3, egp(5600));
    expect(await level(t.db, variantId)).toMatchObject({ qtyMilli: qty(2), avgCostPt: egp(5600) });
  });

  it("oils issue in decimal litres", async () => {
    const { variantId } = await makeItem(t.db, { code: "O-0530", name: "زيت MOPAR 5W-30", type: "oil", unit: "لتر", pricePt: egp(750), minMilli: qty(20) });
    await stockIn(t.db, variantId, 24, egp(560));
    const wo = await makeWorkOrder(t.db, t.adminId);
    const r = await t.app.inject({ method: "POST", url: `/work-orders/${wo.id}/issue`, headers: t.as(t.engineerToken), payload: { variantId, qtyMilli: qty(6.5) } });
    expect(r.json()).toMatchObject({ qtyAfterMilli: qty(17.5), lowStock: true });
    const [line] = await t.db.select().from(docLines).where(eq(docLines.id, r.json().lineId));
    expect(line).toMatchObject({ category: "oil", qtyMilli: 6500, unitPricePt: egp(750) });
  });

  it("over-issue: engineer refused, admin needs a reason, and it is audited", async () => {
    const { variantId } = await makeItem(t.db, { code: "P-4410", name: "غطاء رادياتير", type: "part", grade: "copy", pricePt: egp(750) });
    await stockIn(t.db, variantId, 1, egp(430));
    const wo = await makeWorkOrder(t.db, t.adminId);
    const eng = await t.app.inject({ method: "POST", url: `/work-orders/${wo.id}/issue`, headers: t.as(t.engineerToken), payload: { variantId, qtyMilli: qty(2) } });
    expect(eng.statusCode).toBe(409);
    expect(eng.json().error.message).toContain("الصرف بالسالب من صلاحية الإدارة فقط");
    const noReason = await t.app.inject({ method: "POST", url: `/work-orders/${wo.id}/issue`, headers: t.as(t.adminToken), payload: { variantId, qtyMilli: qty(2) } });
    expect(noReason.statusCode).toBe(422);
    const ok = await t.app.inject({ method: "POST", url: `/work-orders/${wo.id}/issue`, headers: t.as(t.adminToken), payload: { variantId, qtyMilli: qty(2), reason: "القطعة على الرف ولم تُسجل" } });
    expect(ok.statusCode).toBe(201);
    expect((await level(t.db, variantId)).qtyMilli).toBe(qty(-1));
    const audits = await t.db.select().from(auditLog).where(and(eq(auditLog.action, "stock.over_issue"), eq(auditLog.entityId, variantId)));
    expect(audits.length).toBe(1);
  });

  it("labor is not stock-tracked", async () => {
    const { variantId } = await makeItem(t.db, { code: "L-1001", name: "صيانة دورية", type: "labor", pricePt: egp(2500) });
    const wo = await makeWorkOrder(t.db, t.adminId);
    const r = await t.app.inject({ method: "POST", url: `/work-orders/${wo.id}/issue`, headers: t.as(t.engineerToken), payload: { variantId, qtyMilli: qty(1) } });
    expect(r.statusCode).toBe(201);
    expect(r.json().qtyAfterMilli).toBeNull();
    expect(await onHandFromLedger(t.db, variantId)).toBe(0);
  });

  it("adjustments are admin only; cost is hidden from engineers", async () => {
    const { variantId } = await makeItem(t.db, { code: "P-5120", name: "فلتر تكييف", type: "part", grade: "copy", pricePt: egp(650) });
    await stockIn(t.db, variantId, 10, egp(380));
    const eng = await t.app.inject({ method: "POST", url: "/stock/adjust", headers: t.as(t.engineerToken), payload: { variantId, qtyMilli: qty(-1), reason: "عجز جرد" } });
    expect(eng.statusCode).toBe(403);
    const adm = await t.app.inject({ method: "POST", url: "/stock/adjust", headers: t.as(t.adminToken), payload: { variantId, qtyMilli: qty(-1), reason: "عجز جرد" } });
    expect(adm.statusCode).toBe(200);
    const asEng = (await t.app.inject({ method: "GET", url: `/stock/${variantId}`, headers: t.as(t.engineerToken) })).json();
    const asAdm = (await t.app.inject({ method: "GET", url: `/stock/${variantId}`, headers: t.as(t.adminToken) })).json();
    expect(asEng).toEqual({ qtyMilli: qty(9) });
    expect(asAdm).toEqual({ qtyMilli: qty(9), avgCostPt: egp(380) });
  });

  it("issuing on a delivered work order is refused", async () => {
    const { variantId } = await makeItem(t.db, { code: "P-4502", name: "خرطوم", type: "part", pricePt: egp(300) });
    const wo = await makeWorkOrder(t.db, t.adminId);
    await t.db.execute(sql`update work_orders set status = 'delivered' where id = ${wo.id}`);
    const r = await t.app.inject({ method: "POST", url: `/work-orders/${wo.id}/issue`, headers: t.as(t.adminToken), payload: { variantId, qtyMilli: qty(1) } });
    expect(r.statusCode).toBe(409);
  });

  it("the ledger is append-only in the database itself", async () => {
    // Drizzle wraps the database error; the trigger's message is on `cause`.
    const dbError = (p: Promise<unknown>) => p.then(() => "no error", (e: { cause?: { message?: string } }) => e.cause?.message ?? "");
    expect(await dbError(t.db.execute(sql`update stock_movements set qty_milli = 0`))).toMatch(/append-only/);
    expect(await dbError(t.db.execute(sql`delete from stock_movements`))).toMatch(/append-only/);
    expect(await dbError(t.db.execute(sql`delete from audit_log`))).toMatch(/append-only/);
    expect(await dbError(t.db.execute(sql`update audit_log set action = 'x'`))).toMatch(/append-only/);
  });

  it("on hand from the ledger equals the cached level for every variant", async () => {
    const rows = await t.db.execute(sql`
      select l.variant_id, l.qty_milli as cached, coalesce(sum(m.qty_milli), 0) as ledger
      from stock_levels l left join stock_movements m on m.variant_id = l.variant_id
      group by l.variant_id, l.qty_milli`);
    for (const r of (rows as unknown as { rows: { cached: string; ledger: string }[] }).rows) expect(Number(r.cached)).toBe(Number(r.ledger));
  });
});
