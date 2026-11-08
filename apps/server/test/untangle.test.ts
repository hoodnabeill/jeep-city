/** Regression tests for defects found while untangling the server: each one failed before its fix. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { egp, qty, uuidv7 } from "@jc/core";
import { auditLog } from "../src/db/schema";
import { makeItem, makeWorkOrder, setup, stockIn } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); });
afterAll(async () => { await t.close(); });
const call = (method: "GET" | "POST" | "PATCH" | "PUT", url: string, token: string, payload?: unknown) => t.app.inject({ method, url, headers: t.as(token), payload: payload as object });

describe("untangle regressions", () => {
  it("a direct sale applies the VAT setting like a statement does", async () => {
    await call("PUT", "/settings/vat", t.adminToken, { value: { enabled: true, rateBp: { part: 1400 } } });
    const oil = await makeItem(t.db, { code: "V-1", name: "زيت للاختبار", type: "part", pricePt: egp(100) });
    await stockIn(t.db, oil.variantId, 5, egp(50));
    const { customerId } = await makeWorkOrder(t.db, t.engineerId);
    const r = await call("POST", "/direct-sales", t.engineerToken, { id: uuidv7(), customerId, lines: [{ variantId: oil.variantId, qtyMilli: qty(1) }], payments: [{ methodId: "cash", amountPt: egp(114) }] });
    expect(r.statusCode).toBe(201);
    expect(r.json().totals.amountDuePt).toBe(egp(114));
    await call("PUT", "/settings/vat", t.adminToken, { value: { enabled: false, rateBp: {} } });
  });

  it("raising a line quantity past the shelf is audited like a new issue", async () => {
    const part = await makeItem(t.db, { code: "O-1", name: "قطعة للصرف", type: "part", pricePt: egp(10) });
    await stockIn(t.db, part.variantId, 2, egp(5));
    const wo = await makeWorkOrder(t.db, t.engineerId);
    const issued = (await call("POST", `/work-orders/${wo.id}/issue`, t.adminToken, { variantId: part.variantId, qtyMilli: qty(2) })).json();
    const over = await call("PATCH", `/work-orders/${wo.id}/lines/${issued.lineId}`, t.engineerToken, { qtyMilli: qty(3) });
    expect(over.statusCode).toBe(409);
    expect((await call("PATCH", `/work-orders/${wo.id}/lines/${issued.lineId}`, t.adminToken, { qtyMilli: qty(3), reason: "جرد خاطئ" })).statusCode).toBe(200);
    const audited = await t.db.select().from(auditLog).where(eq(auditLog.action, "stock.over_issue"));
    expect(audited.length).toBeGreaterThan(0);
  });

  it("a partial variant PATCH keeps grade, minimum and active", async () => {
    const created = (await call("POST", "/items", t.adminToken, {
      code: "P-1", nameAr: "صنف بجودة", type: "part", unit: "قطعة",
      variants: [{ grade: "original", sellPricePt: egp(100), minQtyMilli: qty(4) }],
    })).json();
    const before = (await call("GET", `/items/${created.id}`, t.adminToken)).json().variants[0];
    expect((await call("PATCH", `/items/${created.id}`, t.adminToken, { variants: [{ id: before.id, sellPricePt: egp(120) }] })).statusCode).toBe(200);
    const after = (await call("GET", `/items/${created.id}`, t.adminToken)).json().variants[0];
    expect(after).toMatchObject({ grade: "original", minQtyMilli: qty(4), active: true, sellPricePt: egp(120) });
  });

  it("report text columns keep their leading zeros", async () => {
    const { customerId } = await makeWorkOrder(t.db, t.engineerId);
    await t.db.execute(sql`insert into customer_ledger (id, customer_id, amount_pt, kind) values (${uuidv7()}, ${customerId}, 10000, 'opening')`);
    const r = (await call("GET", "/reports/debts?from=2026-01-01&to=2026-12-31", t.adminToken)).json();
    const row = r.rows.find((x: { name: string }) => x.name === "خالد إبراهيم المصري");
    expect(row.mobile).toBe("01002345678");
    expect(row.balance).toBe(10000);
  });

  it("changing a customer's WhatsApp stores the normalised number", async () => {
    const { customerId } = await makeWorkOrder(t.db, t.engineerId);
    await call("PATCH", `/customers/${customerId}`, t.engineerToken, { whatsapp: "0100 111 2233" });
    expect((await call("GET", `/customers/${customerId}`, t.engineerToken)).json().whatsapp).toBe("201001112233");
    expect((await call("PATCH", `/customers/${customerId}`, t.engineerToken, { whatsapp: "123" })).statusCode).toBe(422);
  });

  it("an old statement stays editable after its discount category is switched off", async () => {
    const wo = await makeWorkOrder(t.db, t.adminId, 30001);
    const part = await makeItem(t.db, { code: "D-1", name: "قطعة بخصم", type: "part", pricePt: egp(100) });
    await stockIn(t.db, part.variantId, 3, egp(50));
    await call("POST", `/work-orders/${wo.id}/issue`, t.adminToken, { variantId: part.variantId, qtyMilli: qty(1) });
    const st = uuidv7();
    expect((await call("POST", "/statements", t.adminToken, { id: st, workOrderId: wo.id, discounts: { part: { mode: "amount", valuePt: egp(10) } }, payments: [{ methodId: "cash", amountPt: egp(90) }] })).statusCode).toBe(201);
    await call("PUT", "/settings/discounts.categories", t.adminToken, { value: ["labor"] });
    const edit = await call("PATCH", `/statements/${st}`, t.adminToken, { expectedVersion: 1, reason: "تصحيح ملاحظة", notDone: "x", discounts: { part: { mode: "amount", valuePt: egp(10) } } });
    expect(edit.statusCode).toBe(200);
    const added = await call("PATCH", `/statements/${st}`, t.adminToken, { expectedVersion: 2, reason: "خصم جديد", discounts: { part: { mode: "amount", valuePt: egp(20) } } });
    expect(added.statusCode).toBe(422);
    await call("PUT", "/settings/discounts.categories", t.adminToken, { value: ["labor", "part"] });
  });
});
