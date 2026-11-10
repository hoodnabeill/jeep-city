/** Stock count: scan or type counts, approve posts only the real differences, once. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { egp, qty, uuidv7 } from "@jc/core";
import { stockMovements } from "../src/db/schema";
import { level } from "../src/modules/stock";
import { makeItem, makeWorkOrder, setup, stockIn } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); });
afterAll(async () => { await t.close(); });
const call = (method: "GET" | "POST" | "PUT", url: string, token: string, payload?: unknown) => t.app.inject({ method, url, headers: t.as(token), payload: payload as object });

describe("stock count", () => {
  it("counts by scan and by typing, ignores sales made during the count, and approves once", async () => {
    const filter = await makeItem(t.db, { code: "CN-1", name: "فلتر جرد", type: "part", pricePt: egp(100) });
    const oil = await makeItem(t.db, { code: "CN-2", name: "زيت جرد", type: "oil", pricePt: egp(50) });
    await stockIn(t.db, filter.variantId, 5, egp(40));
    await stockIn(t.db, oil.variantId, 10, egp(20));

    const { id } = (await call("POST", "/stock-counts", t.engineerToken, { note: "رف A" })).json();
    // Engineer scans the filter label 4 times: one is missing from the shelf.
    for (let i = 0; i < 4; i++) expect((await call("POST", `/stock-counts/${id}/scan`, t.engineerToken, { code: "JC-CN-1" })).statusCode).toBe(200);
    // Oil counted by typing: 10 on the shelf, then one is sold before approval (not a shortage).
    expect((await call("PUT", `/stock-counts/${id}/lines`, t.engineerToken, { variantId: oil.variantId, countedQtyMilli: qty(10) })).statusCode).toBe(200);
    const { customerId } = await makeWorkOrder(t.db, t.engineerId);
    expect((await call("POST", "/direct-sales", t.adminToken, { id: uuidv7(), customerId, lines: [{ variantId: oil.variantId, qtyMilli: qty(1) }], payments: [{ methodId: "cash", amountPt: egp(50) }] })).statusCode).toBe(201);

    const view = (await call("GET", `/stock-counts/${id}`, t.adminToken)).json();
    expect(view.lines.find((l: { code: string }) => l.code === "CN-1")).toMatchObject({ systemQtyMilli: qty(5), countedQtyMilli: qty(4), diffMilli: -qty(1), diffValuePt: -egp(40) });
    expect((await call("GET", `/stock-counts/${id}`, t.engineerToken)).json().lines[0].diffValuePt).toBeUndefined();

    expect((await call("POST", `/stock-counts/${id}/approve`, t.engineerToken)).statusCode).toBe(403);
    expect((await call("POST", `/stock-counts/${id}/approve`, t.adminToken)).json()).toEqual({ lines: 2, posted: 1 });
    expect((await level(t.db, filter.variantId)).qtyMilli).toBe(qty(4));
    expect((await level(t.db, oil.variantId)).qtyMilli).toBe(qty(9));
    const posted = await t.db.select().from(stockMovements).where(and(eq(stockMovements.refId, id), eq(stockMovements.kind, "count")));
    expect(posted).toHaveLength(1);

    expect((await call("POST", `/stock-counts/${id}/approve`, t.adminToken)).statusCode).toBe(409);
    expect((await call("POST", `/stock-counts/${id}/scan`, t.engineerToken, { code: "JC-CN-1" })).statusCode).toBe(409);
  });

  it("asks to pick the grade when an item code has more than one", async () => {
    const a = await makeItem(t.db, { code: "CN-3", name: "تيل جرد", type: "part", pricePt: egp(10), grade: "original" });
    await t.db.execute(`insert into item_variants (id, item_id, grade, sell_price_pt, min_qty_milli) values ('${uuidv7()}', '${a.itemId}', 'copy', 500, 0)`);
    const { id } = (await call("POST", "/stock-counts", t.engineerToken, { note: "تيل" })).json();
    expect((await call("POST", `/stock-counts/${id}/scan`, t.engineerToken, { code: "CN-3" })).statusCode).toBe(409);
    expect((await call("POST", `/stock-counts/${id}/scan`, t.engineerToken, { code: "nothing-here" })).statusCode).toBe(404);
  });
});
