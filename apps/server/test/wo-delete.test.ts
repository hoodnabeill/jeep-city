/** Deleting an open work order: Admin only, with a reason; parts go back to stock and the order leaves every list. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { egp, qty } from "@jc/core";
import { level } from "../src/modules/stock";
import { makeItem, makeWorkOrder, setup, stockIn } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); });
afterAll(async () => { await t.close(); });
const call = (method: "GET" | "POST" | "DELETE", url: string, token: string, payload?: unknown) => t.app.inject({ method, url, headers: t.as(token), payload: payload as object });

describe("work order delete", () => {
  it("returns issued parts to stock and hides the order", async () => {
    const part = await makeItem(t.db, { code: "DEL-1", name: "قطعة للمسح", type: "part", pricePt: egp(50) });
    await stockIn(t.db, part.variantId, 5, egp(30));
    const wo = await makeWorkOrder(t.db, t.engineerId);
    expect((await call("POST", `/work-orders/${wo.id}/lines`, t.engineerToken, { variantId: part.variantId, qtyMilli: qty(2) })).statusCode).toBe(201);
    expect((await level(t.db, part.variantId)).qtyMilli).toBe(qty(3));

    expect((await call("DELETE", `/work-orders/${wo.id}`, t.engineerToken, { reason: "اتفتح بالغلط" })).statusCode).toBe(403);
    expect((await call("DELETE", `/work-orders/${wo.id}`, t.adminToken, {})).statusCode).toBe(422);
    expect((await call("DELETE", `/work-orders/${wo.id}`, t.adminToken, { reason: "اتفتح بالغلط" })).statusCode).toBe(200);

    expect((await level(t.db, part.variantId)).qtyMilli).toBe(qty(5));
    const list = (await call("GET", "/work-orders?status=in_shop", t.adminToken)).json() as { id: string }[];
    expect(list.some((w) => w.id === wo.id)).toBe(false);
    expect((await call("DELETE", `/work-orders/${wo.id}`, t.adminToken, { reason: "مرة تانية" })).statusCode).toBe(409);
  });
});
