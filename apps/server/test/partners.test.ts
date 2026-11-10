/** Partners: shares must total 100%, the monthly split follows net profit, withdrawals reduce the balance. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { egp, qty, uuidv7 } from "@jc/core";
import { cashMovements, partnerWithdrawals } from "../src/db/schema";
import { makeItem, makeWorkOrder, setup, stockIn } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); });
afterAll(async () => { await t.close(); });
const call = (method: "GET" | "POST" | "PUT", url: string, token: string, payload?: unknown) => t.app.inject({ method, url, headers: t.as(token), payload: payload as object });
const month = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }).slice(0, 7);

describe("partners", () => {
  it("refuses shares that do not total 100% and keeps engineers out", async () => {
    expect((await call("PUT", "/partners", t.adminToken, [{ name: "أحمد", shareBp: 6000 }, { name: "محمد", shareBp: 3000 }])).statusCode).toBe(422);
    expect((await call("GET", `/partners/summary?month=${month}`, t.engineerToken)).statusCode).toBe(403);
  });

  it("splits the month's net profit and subtracts withdrawals from the balance", async () => {
    const list = (await call("PUT", "/partners", t.adminToken, [{ name: "أحمد", shareBp: 6000 }, { name: "محمد", shareBp: 4000 }])).json();
    expect(list).toHaveLength(2);
    const ahmed = list.find((p: { name: string }) => p.name === "أحمد");

    // Sale of 100 EGP with a cost of 60, then a 5 EGP bonus: net profit 35.
    const part = await makeItem(t.db, { code: "PR-1", name: "قطعة للشركاء", type: "part", pricePt: egp(100) });
    await stockIn(t.db, part.variantId, 2, egp(60));
    const { customerId } = await makeWorkOrder(t.db, t.engineerId);
    expect((await call("POST", "/direct-sales", t.adminToken, { id: uuidv7(), customerId, lines: [{ variantId: part.variantId, qtyMilli: qty(1) }], payments: [{ methodId: "cash", amountPt: egp(100) }] })).statusCode).toBe(201);
    expect((await call("POST", "/bonuses", t.adminToken, { userId: t.engineerId, amountPt: egp(5), reason: "حافز شهري" })).statusCode).toBe(201);

    const w = await call("POST", "/partners/withdrawals", t.adminToken, { partnerId: ahmed.id, amountPt: egp(10), note: "سحب" });
    expect(w.statusCode).toBe(201);
    const [cash] = await t.db.select().from(cashMovements).where(eq(cashMovements.refId, w.json().id));
    expect(cash.amountPt).toBe(-egp(10));

    const s = (await call("GET", `/partners/summary?month=${month}`, t.adminToken)).json();
    expect(s.profit.profitPt).toBe(egp(35));
    const a = s.partners.find((p: { name: string }) => p.name === "أحمد");
    const m = s.partners.find((p: { name: string }) => p.name === "محمد");
    expect(a).toMatchObject({ sharePt: egp(21), monthTakenPt: egp(10), balancePt: egp(11) });
    expect(m).toMatchObject({ sharePt: egp(14), monthTakenPt: 0, balancePt: egp(14) });
    expect(s.withdrawals).toHaveLength(1);
  });

  it("never edits or deletes a recorded withdrawal", async () => {
    await expect(t.db.update(partnerWithdrawals).set({ amountPt: 1 })).rejects.toThrow();
  });
});
