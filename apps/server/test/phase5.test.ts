import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { egp, qty, uuidv7 } from "@jc/core";
import { REPORTS } from "../src/modules/reports";
import { makeItem, makeWorkOrder, setup, stockIn } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); });
afterAll(async () => { await t.close(); });
const call = (method: "GET" | "POST" | "PATCH" | "PUT", url: string, token: string, payload?: unknown) => t.app.inject({ method, url, headers: t.as(token), payload: payload as object });
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
// A window around today, so a test running across midnight (Cairo) still sees its own rows.
const shiftDay = (d: number) => new Date(Date.now() + d * 864e5).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const around = `from=${shiftDay(-1)}&to=${shiftDay(1)}`;

describe("general report", () => {
  it("sales, cost and profit come from real statements and issue costs", async () => {
    const filter = await makeItem(t.db, { code: "F-1", name: "فلتر زيت", type: "part", pricePt: egp(850), minMilli: qty(5) });
    await stockIn(t.db, filter.variantId, 3, egp(400));
    const wo = await makeWorkOrder(t.db, t.engineerId);
    expect((await call("POST", `/work-orders/${wo.id}/issue`, t.engineerToken, { variantId: filter.variantId, qtyMilli: qty(2) })).statusCode).toBe(201);
    expect((await call("POST", `/work-orders/${wo.id}/lines`, t.adminToken, { category: "labor", name: "تغيير فلتر", qtyMilli: qty(1), unitPricePt: egp(300) })).statusCode).toBe(201); // free-text lines are Admin only (D-61)
    const st = await call("POST", "/statements", t.adminToken, { id: uuidv7(), workOrderId: wo.id, payments: [{ methodId: "cash", amountPt: egp(2000) }] });
    expect(st.statusCode).toBe(201);
    await call("POST", "/expenses", t.adminToken, { categoryId: (await call("POST", "/expense-categories", t.adminToken, { name: "كهرباء" })).json().id, amountPt: egp(100) });

    const r = (await call("GET", `/reports/sales?${around}`, t.adminToken)).json();
    expect(r.totals.total).toBe(egp(2000));
    expect(r.totals.parts).toBe(egp(1700));
    expect(r.summary).toMatchObject({ newSalesPt: egp(2000), cogsPt: egp(800), expensesPt: egp(100), profitPt: egp(1100) });

    const top = (await call("GET", `/reports/top-items?${around}`, t.adminToken)).json();
    expect(top.rows[0]).toMatchObject({ name: "فلتر زيت", qty: qty(2), value: egp(1700) });
    const low = (await call("GET", `/reports/low-stock?${around}`, t.adminToken)).json();
    expect(low.rows.map((x: { name: string }) => x.name)).toContain("فلتر زيت");
    const people = (await call("GET", `/reports/people?${around}`, t.adminToken)).json();
    expect(people.rows.find((x: { role: string }) => x.role === "مهندس")).toMatchObject({ orders: 1, labor: egp(300) });
  });

  it("every report runs and is Admin only", async () => {
    for (const id of Object.keys(REPORTS)) {
      const r = await call("GET", `/reports/${id}?from=2026-01-01&to=${today}`, t.adminToken);
      expect(r.statusCode, id).toBe(200);
      expect(Array.isArray(r.json().columns), id).toBe(true);
    }
    expect((await call("GET", `/reports/sales?from=${today}&to=${today}`, t.engineerToken)).statusCode).toBe(403);
    expect((await call("GET", `/reports/sales?from=2026-02-01&to=2026-01-01`, t.adminToken)).statusCode).toBe(422);
  });
});

describe("reminders and alerts", () => {
  it("a service reminder is due by date or by the car's odometer", async () => {
    const wo = await makeWorkOrder(t.db, t.engineerId); // odometer 112,640 comes from the reading on this work order
    await t.db.execute(sql`insert into odometer_readings (id, vehicle_id, km, read_at) values (${uuidv7()}, ${wo.vehicleId}, 112640, now())`);
    const byKm = await call("POST", "/reminders", t.engineerToken, { kind: "service", vehicleId: wo.vehicleId, customerId: wo.customerId, dueKm: 112000, note: "تغيير زيت" });
    expect(byKm.statusCode).toBe(201);
    await call("POST", "/reminders", t.engineerToken, { kind: "service", vehicleId: wo.vehicleId, customerId: wo.customerId, dueDate: "2099-01-01" });
    expect((await call("POST", "/reminders", t.engineerToken, { kind: "note" })).statusCode).toBe(422);
    const due = (await call("GET", "/reminders?status=due", t.engineerToken)).json();
    expect(due.map((r: { id: string }) => r.id)).toEqual([byKm.json().id]);
    expect(due[0]).toMatchObject({ lastKm: 112640, customerName: "خالد إبراهيم المصري" });
    expect((await call("GET", "/alerts", t.engineerToken)).json()).toMatchObject({ debts: [] });
    await call("PATCH", `/reminders/${byKm.json().id}`, t.engineerToken, { done: true });
    expect((await call("GET", "/reminders?status=due", t.engineerToken)).json()).toEqual([]);
  });
  it("debts older than the setting appear for Admin only", async () => {
    const { customerId } = await makeWorkOrder(t.db, t.engineerId);
    await t.db.execute(sql`insert into customer_ledger (id, customer_id, amount_pt, kind, created_at) values (${uuidv7()}, ${customerId}, 50000, 'opening', now() - interval '45 days')`);
    const a = (await call("GET", "/alerts", t.adminToken)).json();
    expect(a.debtDays).toBe(30);
    expect(a.debts.find((d: { id: string }) => d.id === customerId)).toMatchObject({ balance: 50000 });
  });
});

describe("QR labels", () => {
  it("assigns a stable ASCII barcode once and finds the item by it", async () => {
    const it1 = await makeItem(t.db, { code: "فلتر-عربي", name: "فلتر بكود عربي", type: "part", pricePt: egp(100) });
    await t.db.execute(sql`update item_variants set barcode = null where id = ${it1.variantId}`);
    const first = (await call("POST", "/items/barcodes", t.engineerToken, { variantIds: [it1.variantId] })).json();
    expect(first[0].barcode).toMatch(/^JC\d{8}$/);
    const again = (await call("POST", "/items/barcodes", t.engineerToken, { variantIds: [it1.variantId] })).json();
    expect(again[0].barcode).toBe(first[0].barcode);
    const found = (await call("GET", `/items?q=${first[0].barcode}`, t.engineerToken)).json();
    expect(found.map((x: { id: string }) => x.id)).toEqual([it1.itemId]);
  });
});

describe("customer status link", () => {
  it("opens one visit without login, stores only a hash, expires", async () => {
    const wo = await makeWorkOrder(t.db, t.engineerId);
    const s = await call("POST", "/share", t.engineerToken, { workOrderId: wo.id });
    expect(s.statusCode).toBe(201);
    const { token } = s.json();
    expect(token.length).toBeGreaterThanOrEqual(30);
    const stored = (await t.db.execute(sql`select token_hash from share_tokens`)) as unknown as { rows: { token_hash: string }[] };
    expect(stored.rows.some((r) => r.token_hash === token)).toBe(false);
    const pub = await t.app.inject({ method: "GET", url: `/public/status/${token}` });
    expect(pub.statusCode).toBe(200);
    const body = pub.json();
    expect(body).toMatchObject({ greeting: "خالد", workOrder: { status: "open" }, vehicle: { plateDigits: "281" } });
    expect(JSON.stringify(body)).not.toContain("01002345678");
    expect((await t.app.inject({ method: "GET", url: `/public/status/${"x".repeat(32)}` })).statusCode).toBe(404);
    await t.db.execute(sql`update share_tokens set expires_at = now() - interval '1 day'`);
    expect((await t.app.inject({ method: "GET", url: `/public/status/${token}` })).statusCode).toBe(404);
  });
});

describe("condition report", () => {
  it("starts from the checklist, saves, and converts recommendations (Admin)", async () => {
    const wo = await makeWorkOrder(t.db, t.engineerId);
    const fresh = (await call("GET", `/work-orders/${wo.id}/condition`, t.engineerToken)).json();
    expect(fresh.saved).toBe(false);
    expect(fresh.items.length).toBeGreaterThan(10);
    const items = fresh.items.map((x: { system: string; item: string }, i: number) => ({ ...x, status: i === 0 ? "urgent" : "good", ...(i === 0 ? { note: "تهريب واضح", recommendedText: "تغيير جوان غطاء البلوف", recommendedPricePt: egp(1200) } : {}) }));
    expect((await call("PUT", `/work-orders/${wo.id}/condition`, t.engineerToken, { items })).statusCode).toBe(200);
    const saved = (await call("GET", `/work-orders/${wo.id}/condition`, t.engineerToken)).json();
    expect(saved.saved).toBe(true);
    expect(saved.items[0]).toMatchObject({ status: "urgent", recommendedPricePt: egp(1200) });
    const pick = { itemIds: [saved.items[0].id] };
    expect((await call("POST", `/work-orders/${wo.id}/condition/convert`, t.engineerToken, pick)).statusCode).toBe(403);
    expect((await call("POST", `/work-orders/${wo.id}/condition/convert`, t.adminToken, pick)).json()).toEqual({ added: 1 });
    const w = (await call("GET", `/work-orders/${wo.id}`, t.adminToken)).json();
    expect(w.lines.map((l: { name: string }) => l.name)).toContain("تغيير جوان غطاء البلوف");
  });
});

describe("customer signature", () => {
  it("saves a PNG on the work order and reads it back; rejects anything else", async () => {
    const wo = await makeWorkOrder(t.db, t.engineerId);
    // 1×1 transparent PNG
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    expect((await call("POST", `/work-orders/${wo.id}/signature`, t.engineerToken, { dataUrl: "data:image/png;base64,AAAA" })).statusCode).toBe(422);
    expect((await call("POST", `/work-orders/${wo.id}/signature`, t.engineerToken, { dataUrl: png })).statusCode).toBe(201);
    const r = (await call("GET", `/work-orders/${wo.id}/signature`, t.engineerToken)).json();
    expect(r.dataUrl).toBe(png);
  });
});

describe("chassis search", () => {
  it("finds a Byte car that has only the last digits of its VIN", async () => {
    const { customerId } = await makeWorkOrder(t.db, t.engineerId);
    const vid = uuidv7();
    await t.db.execute(sql`insert into vehicles (id, customer_id, plate_type, chassis) values (${vid}, ${customerId}, 'private', '9003817')`);
    for (const q of ["9003817", "003817", "1C4RJFAG5FC9003817"]) {
      const hits = (await call("GET", `/lookup?q=${q}`, t.engineerToken)).json();
      expect(hits.map((h: { vehicle: { id: string } }) => h.vehicle.id), q).toContain(vid);
    }
    expect((await call("GET", `/lookup?q=1C4RJFAG5FC9003818`, t.engineerToken)).json().map((h: { vehicle: { id: string } }) => h.vehicle.id)).not.toContain(vid);
  });
});

describe("health and app origins", () => {
  it("reports the database and allows the desktop and phone app origins only", async () => {
    expect((await t.app.inject({ method: "GET", url: "/health" })).json()).toMatchObject({ ok: true, db: true });
    const pre = (origin: string) => t.app.inject({ method: "OPTIONS", url: "/auth/login", headers: { origin, "access-control-request-method": "POST" } });
    expect((await pre("tauri://localhost")).headers["access-control-allow-origin"]).toBe("tauri://localhost");
    expect((await pre("capacitor://localhost")).headers["access-control-allow-origin"]).toBe("capacitor://localhost");
    expect((await pre("https://evil.example")).headers["access-control-allow-origin"]).toBeUndefined();
  });
});
