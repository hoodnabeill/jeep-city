/** Staff: advances and debts add to what a person owes, repayments take from it, expenses hit profit, and the performance report moved to staff.manage. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { egp } from "@jc/core";
import { cashMovements, staffEntries } from "../src/db/schema";
import { setup } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); });
afterAll(async () => { await t.close(); });
const call = (method: "GET" | "POST", url: string, token: string, payload?: unknown) => t.app.inject({ method, url, headers: t.as(token), payload: payload as object });
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const month = today.slice(0, 7);

describe("staff", () => {
  it("keeps engineers out and the performance report off the general report list", async () => {
    expect((await call("GET", `/staff?month=${month}`, t.engineerToken)).statusCode).toBe(403);
    const list = (await call("GET", "/reports", t.adminToken)).json() as { id: string }[];
    expect(list.map((r) => r.id)).not.toContain("people");
    expect((await call("GET", `/reports/people?from=${today}&to=${today}`, t.adminToken)).statusCode).toBe(200);
    expect((await call("GET", `/reports/people?from=${today}&to=${today}`, t.engineerToken)).statusCode).toBe(403);
  });

  it("tracks what each person owes and moves the cash drawer", async () => {
    const add = (body: object) => call("POST", "/staff/entries", t.adminToken, { userId: t.engineerId, ...body });
    const adv = await add({ kind: "advance", amountPt: egp(500), fromCash: true, note: "سلفة" });
    expect(adv.statusCode).toBe(201);
    expect((await add({ kind: "debt", amountPt: egp(200) })).statusCode).toBe(201);
    expect((await add({ kind: "repayment", amountPt: egp(150), fromCash: true })).statusCode).toBe(201);
    expect((await add({ kind: "expense", amountPt: egp(40), fromCash: true, note: "مواصلات" })).statusCode).toBe(201);
    expect((await add({ kind: "debt", amountPt: egp(1), fromCash: true })).statusCode).toBe(422);

    const [cash] = await t.db.select().from(cashMovements).where(eq(cashMovements.refId, adv.json().id));
    expect(cash.amountPt).toBe(-egp(500));

    const s = (await call("GET", `/staff?month=${month}`, t.adminToken)).json();
    const me = s.people.find((p: { userId: string }) => p.userId === t.engineerId);
    expect(me).toMatchObject({ owedPt: egp(550), advancePt: egp(500), debtPt: egp(200), repaymentPt: egp(150), expensePt: egp(40) });
    expect(s.entries).toHaveLength(4);

    const profit = (await call("GET", `/reports/sales?from=${today}&to=${today}`, t.adminToken)).json();
    expect(profit.summary.expensesPt).toBe(egp(40));
    const exp = (await call("GET", `/reports/expenses?from=${today}&to=${today}`, t.adminToken)).json();
    expect(exp.rows).toContainEqual({ category: "مصروفات الموظفين", count: 1, amount: egp(40) });
  });

  it("never edits or deletes a recorded entry", async () => {
    await expect(t.db.update(staffEntries).set({ amountPt: 1 })).rejects.toThrow();
  });
});
