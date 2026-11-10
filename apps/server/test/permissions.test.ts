/** Per-user permission switches: a user's own list overrides the role, live on the next request. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { egp, roleDefaults } from "@jc/core";
import { makeItem, makeWorkOrder, setup, stockIn } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); });
afterAll(async () => { await t.close(); });
const call = (method: "GET" | "PATCH", url: string, token: string, payload?: unknown) => t.app.inject({ method, url, headers: t.as(token), payload: payload as object });
const setPerms = (permissions: string[] | null) => call("PATCH", `/users/${t.engineerId}`, t.adminToken, { permissions });

describe("per-user permissions", () => {
  it("a trusted engineer can be given cost prices without becoming an admin", async () => {
    const part = await makeItem(t.db, { code: "PP-1", name: "قطعة تكلفة", type: "part", pricePt: egp(100) });
    await stockIn(t.db, part.variantId, 2, egp(60));
    expect((await call("GET", `/stock/${part.variantId}`, t.engineerToken)).json().avgCostPt).toBeUndefined();
    expect((await setPerms([...roleDefaults("engineer"), "cost.view"])).statusCode).toBe(200);
    expect((await call("GET", `/stock/${part.variantId}`, t.engineerToken)).json().avgCostPt).toBe(egp(60));
    expect((await call("GET", "/reports/debts?from=2026-01-01&to=2026-12-31", t.engineerToken)).statusCode).toBe(403);
  });

  it("a switched-off default is refused by the server, and null restores the role defaults", async () => {
    const { customerId } = await makeWorkOrder(t.db, t.engineerId);
    await setPerms(roleDefaults("engineer").filter((a) => a !== "customer.manage"));
    expect((await call("PATCH", `/customers/${customerId}`, t.engineerToken, { notes: "x" })).statusCode).toBe(403);
    await setPerms(null);
    expect((await call("PATCH", `/customers/${customerId}`, t.engineerToken, { notes: "x" })).statusCode).toBe(200);
  });

  it("an admin cannot take user management away from themself", async () => {
    const r = await call("PATCH", `/users/${t.adminId}`, t.adminToken, { permissions: roleDefaults("admin").filter((a) => a !== "settings.manage") });
    expect(r.statusCode).toBe(422);
    expect((await call("PATCH", `/users/${t.adminId}`, t.adminToken, { permissions: ["nope.fake"] })).statusCode).toBe(422);
  });
});
