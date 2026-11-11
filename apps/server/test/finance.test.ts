/** Finance: the daily report and the income statement agree with the profit, and using stock raises the low-stock alert. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { egp, qty, uuidv7 } from "@jc/core";
import { makeItem, makeWorkOrder, setup, stockIn } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); });
afterAll(async () => { await t.close(); });
const call = (method: "GET" | "POST", url: string, token: string, payload?: unknown) => t.app.inject({ method, url, headers: t.as(token), payload: payload as object });
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
type Row = { section: string; item: string; count: number | null; amount: number | null };
const find = (rows: Row[], section: string, item: string) => rows.find((r) => r.section === section && r.item === item);

describe("finance", () => {
  it("one liter of oil taking stock from 21 to the minimum of 20 raises the low-stock alert", async () => {
    const oil = await makeItem(t.db, { code: "OIL-20", name: "زيت 5W-30", type: "oil", pricePt: egp(300), unit: "لتر", minMilli: qty(20) });
    await stockIn(t.db, oil.variantId, 21, egp(200));
    expect(((await call("GET", "/items/low-stock", t.adminToken)).json() as { variant: { id: string } }[]).some((x) => x.variant.id === oil.variantId)).toBe(false);
    const wo = await makeWorkOrder(t.db, t.engineerId);
    const r = await call("POST", `/work-orders/${wo.id}/lines`, t.engineerToken, { variantId: oil.variantId, qtyMilli: qty(1) });
    expect(r.statusCode).toBe(201);
    expect(r.json().lowStock).toBe(true);
    expect(((await call("GET", "/items/low-stock", t.adminToken)).json() as { variant: { id: string } }[]).some((x) => x.variant.id === oil.variantId)).toBe(true);
  });

  it("the daily report and income statement match the profit", async () => {
    const part = await makeItem(t.db, { code: "FN-1", name: "قطعة للمالية", type: "part", pricePt: egp(100) });
    await stockIn(t.db, part.variantId, 3, egp(60));
    const { customerId } = await makeWorkOrder(t.db, t.engineerId);
    expect((await call("POST", "/direct-sales", t.adminToken, { id: uuidv7(), customerId, lines: [{ variantId: part.variantId, qtyMilli: qty(1) }], payments: [{ methodId: "cash", amountPt: egp(100) }] })).statusCode).toBe(201);
    expect((await call("POST", "/staff/entries", t.adminToken, { userId: t.engineerId, kind: "expense", amountPt: egp(15), fromCash: true })).statusCode).toBe(201);

    const q = `from=${today}&to=${today}`;
    const sales = (await call("GET", `/reports/sales?${q}`, t.adminToken)).json();
    const daily = (await call("GET", `/reports/daily?${q}`, t.adminToken)).json() as { rows: Row[] };
    const income = (await call("GET", `/reports/income?${q}`, t.adminToken)).json() as { rows: Row[] };
    expect(find(daily.rows, "الربح", "صافي الربح")?.amount).toBe(sales.summary.profitPt);
    expect(find(income.rows, "النتيجة", "صافي الربح")?.amount).toBe(sales.summary.profitPt);
    expect(find(daily.rows, "التحصيل", "إجمالي اللي اتحصّل فعلًا")?.amount).toBe(egp(100));
    expect(find(daily.rows, "المصروفات والمدفوعات", "مصروفات الموظفين")).toMatchObject({ count: 1, amount: egp(15) });
    expect(find(daily.rows, "الخزنة", "صافي حركة الخزنة")?.amount).toBe(egp(85));
    expect(find(income.rows, "المصروفات", "مصروفات الموظفين")?.amount).toBe(-egp(15));
    // The income statement adds up: revenue − cost − expenses = net profit.
    const rev = find(income.rows, "الإيرادات", "صافي الإيرادات")!.amount!, gross = find(income.rows, "تكلفة المبيعات", "مجمل الربح")!.amount!;
    expect(gross + find(income.rows, "المصروفات", "إجمالي المصروفات")!.amount!).toBe(sales.summary.profitPt);
    expect(rev).toBeGreaterThan(gross);
    expect((await call("GET", `/reports/daily?${q}`, t.engineerToken)).statusCode).toBe(403);
  });
});
