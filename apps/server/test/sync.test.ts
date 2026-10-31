import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { egp, qty, uuidv7 } from "@jc/core";
import { createUser } from "../src/bootstrap";
import { auditLog, statements, workOrders } from "../src/db/schema";
import { level } from "../src/modules/stock";
import { makeCustomerCar, makeItem, setup, stockIn } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
let tokenB = "";
beforeAll(async () => {
  t = await setup();
  await createUser(t.db, { username: "karim", displayName: "كريم عادل", role: "engineer", password: "eng-pass-5678" });
  tokenB = (await t.login({ username: "karim", password: "eng-pass-5678" }, "10.9.0.2")).accessToken;
});
afterAll(async () => { await t.close(); });

type M = { id: string; method: "POST" | "PATCH" | "PUT" | "DELETE"; path: string; body?: unknown; createdAt?: string };
const push = (token: string, device: string, mutations: M[]) =>
  t.app.inject({ method: "POST", url: "/sync/push", headers: { authorization: `Bearer ${token}`, "x-device-id": device }, payload: { mutations } });
const block = async (token: string, device: string, size = 5) =>
  (await t.app.inject({ method: "POST", url: "/numbers/blocks", headers: { authorization: `Bearer ${token}`, "x-device-id": device }, payload: { series: "work_order", size } })).json() as { from: number; to: number };

/** What a PC writes to its outbox while offline: receive a car, issue a part, hand over with a statement. */
function offlineVisit(vehicleId: string, number: number, variantId: string, method: string, amountPt: number, odometerIn: number): M[] {
  const wo = uuidv7(), line = uuidv7();
  return [
    { id: uuidv7(), method: "POST", path: "/work-orders", body: { id: wo, number, vehicleId, odometerIn, complaint: "صيانة" } },
    { id: uuidv7(), method: "POST", path: `/work-orders/${wo}/lines`, body: { id: line, variantId, qtyMilli: qty(1) } },
    { id: uuidv7(), method: "POST", path: "/statements", body: { id: uuidv7(), workOrderId: wo, payments: [{ methodId: method, amountPt }] } },
  ];
}

describe("two PCs offline at the same time", () => {
  let filter: string, carA: string, carB: string, batchA: M[], batchB: M[], blockA: { from: number }, blockB: { from: number };

  beforeAll(async () => {
    filter = (await makeItem(t.db, { code: "P-2215", name: "جوان خرطوشة", type: "part", grade: "original", pricePt: egp(1850) })).variantId;
    await stockIn(t.db, filter, 1, egp(1320)); // only ONE on the shelf
    carA = (await makeCustomerCar(t.db)).vehicleId;
    carB = (await makeCustomerCar(t.db)).vehicleId;
    // While online, each PC reserves its own work-order numbers.
    blockA = await block(t.engineerToken, "pc-a");
    blockB = await block(tokenB, "pc-b");
    batchA = offlineVisit(carA, blockA.from, filter, "cash", egp(1850), 1000);
    batchB = offlineVisit(carB, blockB.from, filter, "credit", egp(1850), 2000);
  });

  it("both outboxes replay in order; numbers never collide; the last part is sold twice and flagged", async () => {
    const rb = await push(tokenB, "pc-b", batchB);
    const ra = await push(t.engineerToken, "pc-a", batchA);
    expect(rb.json().results.map((r: { status: string }) => r.status)).toEqual(["ok", "ok", "ok"]);
    expect(ra.json().results.map((r: { status: string }) => r.status)).toEqual(["ok", "ok", "ok"]);
    expect(rb.json().results[0].body.number).toBe(blockB.from);
    expect(ra.json().results[0].body.number).toBe(blockA.from);
    // Statement numbers come only from the server: consecutive, in arrival order, no gap.
    expect(rb.json().results[2].body.number).toBe(9309);
    expect(ra.json().results[2].body.number).toBe(9310);
    expect((await level(t.db, filter)).qtyMilli).toBe(qty(-1));
    const flags = await t.db.select().from(auditLog).where(eq(auditLog.action, "stock.offline_over_issue"));
    expect(flags).toHaveLength(1);
  });

  it("pushing the same outbox again changes nothing (exactly once)", async () => {
    const before = (await t.db.select().from(statements)).length;
    const again = await push(t.engineerToken, "pc-a", batchA);
    expect(again.json().results.map((r: { status: string }) => r.status)).toEqual(["ok", "ok", "ok"]);
    expect(again.json().results[2].body.number).toBe(9310);
    expect((await t.db.select().from(statements)).length).toBe(before);
    expect((await level(t.db, filter)).qtyMilli).toBe(qty(-1));
  });

  it("another user cannot reuse someone else's mutation id", async () => {
    const r = await push(tokenB, "pc-b", [batchA[0]]);
    expect(r.json().results[0]).toMatchObject({ status: "rejected", httpStatus: 409 });
  });

  it("the offline exception cannot be claimed from outside the push", async () => {
    const wo = (await t.app.inject({ method: "POST", url: "/work-orders", headers: t.as(t.engineerToken), payload: { id: uuidv7(), vehicleId: carA, odometerIn: 1500 } })).json();
    const r = await t.app.inject({ method: "POST", url: `/work-orders/${wo.id}/lines`, headers: { ...t.as(t.engineerToken), "x-sync-replay": "guess" }, payload: { variantId: filter, qtyMilli: qty(1) } });
    expect(r.statusCode).toBe(409);
  });
});

describe("conflicts", () => {
  it("different fields of the same work order from two PCs both apply (last write wins per field)", async () => {
    const { vehicleId } = await makeCustomerCar(t.db);
    const wo = (await t.app.inject({ method: "POST", url: "/work-orders", headers: t.as(t.engineerToken), payload: { id: uuidv7(), vehicleId, odometerIn: 10 } })).json();
    await push(t.engineerToken, "pc-a", [{ id: uuidv7(), method: "PATCH", path: `/work-orders/${wo.id}`, body: { complaint: "صوت من العفشة" } }]);
    await push(tokenB, "pc-b", [{ id: uuidv7(), method: "PATCH", path: `/work-orders/${wo.id}`, body: { engineerNotes: "بانتظار قطعة" } }]);
    const [row] = await t.db.select().from(workOrders).where(eq(workOrders.id, wo.id));
    expect(row).toMatchObject({ complaint: "صوت من العفشة", engineerNotes: "بانتظار قطعة" });
  });

  it("two admin edits of the same saved statement: the second is rejected and reported", async () => {
    const [st] = await t.db.select().from(statements).where(eq(statements.number, 9309));
    const edit = (reason: string) => ({ id: uuidv7(), method: "PATCH" as const, path: `/statements/${st.id}`, body: { expectedVersion: 1, reason, notDone: reason } });
    const first = await push(t.adminToken, "pc-office", [edit("تعديل أول")]);
    const second = await push(t.adminToken, "pc-office", [edit("تعديل ثاني")]);
    expect(first.json().results[0].status).toBe("ok");
    expect(second.json().results[0]).toMatchObject({ status: "rejected", httpStatus: 409 });
    expect(second.json().results[0].body.error.message).toContain("عدّل شخص آخر");
  });

  it("writes that need a live connection are refused from the outbox", async () => {
    const r = await push(t.adminToken, "pc-office", [{ id: uuidv7(), method: "POST", path: "/stock/adjust", body: {} }]);
    expect(r.json().results[0]).toMatchObject({ status: "rejected", httpStatus: 403 });
  });

  it("server-side permission checks still apply to replayed writes", async () => {
    const [st] = await t.db.select().from(statements).where(eq(statements.number, 9310));
    const r = await push(t.engineerToken, "pc-a", [{ id: uuidv7(), method: "POST", path: `/statements/${st.id}/cancel`, body: { reason: "خطأ" } }]);
    expect(r.json().results[0]).toMatchObject({ status: "rejected", httpStatus: 403 });
  });
});

describe("pull", () => {
  it("sends what a PC may keep, never cost, cash or ledgers", async () => {
    const r = (await t.app.inject({ method: "GET", url: "/sync/pull?since=0", headers: t.as(t.engineerToken) })).json();
    expect(Object.keys(r.rows)).not.toContain("cashMovements");
    expect(Object.keys(r.rows)).not.toContain("customerLedger");
    expect(r.rows.stockLevels.every((s: object) => !("avgCostPt" in s))).toBe(true);
    expect(r.rows.users.every((u: object) => !("passwordHash" in u))).toBe(true);
    expect(r.rows.customers.every((c: object) => !("openingBalancePt" in c))).toBe(true);
    expect(r.rows.workOrders[0]).toHaveProperty("technicianIds");
    expect(r.rows.paymentMethods.length).toBeGreaterThan(0);
    expect(r.cursor).toBeGreaterThan(0);
    expect(r.more).toBe(false);
  });

  it("after the cursor only changed rows come back", async () => {
    const { cursor } = (await t.app.inject({ method: "GET", url: "/sync/pull?since=0", headers: t.as(t.engineerToken) })).json();
    const { vehicleId } = await makeCustomerCar(t.db);
    const r = (await t.app.inject({ method: "GET", url: `/sync/pull?since=${cursor}`, headers: t.as(t.engineerToken) })).json();
    expect(r.rows.vehicles.map((v: { id: string }) => v.id)).toEqual([vehicleId]);
    expect(r.rows.workOrders).toHaveLength(0);
  });

  it("paging with a small limit never skips a row", async () => {
    const all = (await t.app.inject({ method: "GET", url: "/sync/pull?since=0", headers: t.as(t.engineerToken) })).json().rows.vehicles.length;
    let since = 0, seen = 0, rounds = 0;
    for (;;) {
      const r = (await t.app.inject({ method: "GET", url: `/sync/pull?since=${since}&limit=2`, headers: t.as(t.engineerToken) })).json();
      seen += r.rows.vehicles.length; since = r.cursor; rounds++;
      if (!r.more || rounds > 50) break;
    }
    expect(seen).toBe(all);
  });
});

describe("live events", () => {
  it("a write on one PC reaches the others' event stream", async () => {
    const address = await t.app.listen({ port: 0, host: "127.0.0.1" });
    const res = await fetch(`${address}/sync/events`, { headers: { authorization: `Bearer ${t.engineerToken}` } });
    const reader = res.body!.getReader();
    const next = async () => {
      let buf = "";
      for (;;) {
        const { value } = await reader.read();
        buf += new TextDecoder().decode(value);
        const m = buf.match(/event: seq\ndata: (\d+)/);
        if (m) return Number(m[1]);
      }
    };
    const first = await next();
    await fetch(`${address}/customers`, { method: "POST", headers: { authorization: `Bearer ${tokenB}`, "content-type": "application/json" }, body: JSON.stringify({ name: "عميل جديد من جهاز آخر" }) });
    const second = await next();
    expect(second).toBeGreaterThan(first);
    await reader.cancel();
    const flagged = await t.db.select().from(auditLog).where(and(eq(auditLog.action, "stock.offline_over_issue")));
    expect(flagged.length).toBe(1);
  });
});
