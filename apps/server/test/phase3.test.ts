import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { egp, qty, uuidv7 } from "@jc/core";
import { auditLog } from "../src/db/schema";
import { level } from "../src/modules/stock";
import { setup } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); });
afterAll(async () => { await t.close(); });

const call = (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, token: string, payload?: unknown) =>
  t.app.inject({ method, url, headers: t.as(token), payload: payload as object });
const ids: Record<string, string> = {};

describe("items", () => {
  it("admin creates items with grades and opening stock; engineers cannot", async () => {
    const body = {
      code: "P-2201", nameAr: "فلتر زيت", nameEn: "Oil filter", type: "part", unit: "قطعة", location: "A-03",
      variants: [
        { grade: "original", sellPricePt: egp(850), barcode: "JC000201", minQtyMilli: qty(6), openingQtyMilli: qty(14), openingCostPt: egp(610) },
        { grade: "copy", sellPricePt: egp(420), barcode: "JC000202", minQtyMilli: qty(8), openingQtyMilli: qty(5), openingCostPt: egp(260) },
      ],
    };
    expect((await call("POST", "/items", t.engineerToken, body)).statusCode).toBe(403);
    const r = await call("POST", "/items", t.adminToken, body);
    expect(r.statusCode).toBe(201);
    ids.filter = r.json().id;
    expect((await call("POST", "/items", t.adminToken, body)).statusCode).toBe(409); // duplicate code
    const labor = await call("POST", "/items", t.adminToken, { code: "L-1010", nameAr: "تغيير زيت وفلتر", type: "labor", unit: "عملية", variants: [{ sellPricePt: egp(350) }] });
    ids.labor = labor.json().id;
    const oil = await call("POST", "/items", t.adminToken, { code: "O-0530", nameAr: "زيت محرك MOPAR 5W-30", type: "oil", unit: "لتر", variants: [{ sellPricePt: egp(750), minQtyMilli: qty(20), openingQtyMilli: qty(30), openingCostPt: egp(560) }] });
    ids.oil = oil.json().id;
  });

  it("engineers never receive cost; admins do; barcode and Arabic search find items; low stock is listed", async () => {
    const eng = (await call("GET", "/items?q=فلتر", t.engineerToken)).json();
    expect(eng.map((i: { code: string }) => i.code).sort()).toEqual(["L-1010", "P-2201"]); // «تغيير زيت وفلتر» matches too
    expect(eng.flatMap((i: { variants: { avgCostPt?: number }[] }) => i.variants).every((v: { avgCostPt?: number }) => v.avgCostPt === undefined)).toBe(true);
    const adm = (await call("GET", `/items/${ids.filter}`, t.adminToken)).json();
    expect(adm.variants.find((v: { grade: string }) => v.grade === "original").avgCostPt).toBe(egp(610));
    expect(adm.movements[0].unitCostPt).toBeDefined();
    expect((await call("GET", `/items/${ids.filter}`, t.engineerToken)).json().movements[0].unitCostPt).toBeUndefined();
    expect((await call("GET", "/items?q=JC000202", t.engineerToken)).json()[0].id).toBe(ids.filter);
    const low = (await call("GET", "/items/low-stock", t.engineerToken)).json();
    expect(low.map((l: { variant: { barcode: string } }) => l.variant.barcode)).toEqual(["JC000202"]); // 5 ≤ 8
  });

  it("price changes are audited", async () => {
    const it = (await call("GET", `/items/${ids.filter}`, t.adminToken)).json();
    const v = it.variants.find((x: { grade: string }) => x.grade === "original");
    await call("PATCH", `/items/${ids.filter}`, t.adminToken, { variants: [{ id: v.id, grade: "original", sellPricePt: egp(900), minQtyMilli: v.minQtyMilli }] });
    const a = await t.db.select().from(auditLog).where(eq(auditLog.action, "item.price_change"));
    expect(a[0].after).toEqual({ sellPricePt: egp(900) });
  });
});

describe("customers, vehicles, work orders", () => {
  it("validates WhatsApp numbers and parses plates", async () => {
    expect((await call("POST", "/customers", t.engineerToken, { name: "منى السيد", whatsapp: "123" })).statusCode).toBe(422);
    const c = await call("POST", "/customers", t.engineerToken, { name: "منى السيد", mobile: "0155 412 7809" });
    ids.customer = c.json().id;
    expect((await call("POST", "/vehicles", t.engineerToken, { customerId: ids.customer, plateLetters: "abc", plateDigits: "1" })).statusCode).toBe(422);
    expect((await call("POST", "/vehicles", t.engineerToken, { customerId: ids.customer, plateType: "diplomatic", plateLetters: "س", plateDigits: "12345" })).statusCode).toBe(422);
    expect((await call("POST", "/vehicles", t.engineerToken, { customerId: ids.customer, plateType: "taxi", plateDigits: "1" })).statusCode).toBe(422);
    const dip = await call("POST", "/vehicles", t.engineerToken, { customerId: ids.customer, plateType: "diplomatic", plateDigits: "123 - 45" });
    expect(dip.statusCode).toBe(201);
    const v = await call("POST", "/vehicles", t.engineerToken, { customerId: ids.customer, plateType: "private", plateLetters: "منق", plateDigits: "٧٦٢", chassis: "1fm5k8gc1mga41875", make: "Ford", model: "Explorer", year: 2021 });
    expect(v.statusCode).toBe(201);
    ids.vehicle = v.json().id;
    expect((await call("POST", "/vehicles", t.engineerToken, { customerId: ids.customer, chassis: "1FM5K8GC1MGA41875" })).statusCode).toBe(409);
    const types = (await call("GET", "/plate-types", t.engineerToken)).json() as { id: string; barColor: string | null; toConfirm: boolean }[];
    expect(types.map((x) => x.id)).not.toContain("taxi");
    expect(types.find((x) => x.id === "military")).toMatchObject({ barColor: null, toConfirm: true });
    expect((await call("PUT", "/plate-types", t.engineerToken, types)).statusCode).toBe(403);
    expect((await call("GET", `/lookup?q=12345`, t.engineerToken)).json().map((h: { vehicle: { id: string } }) => h.vehicle.id)).toContain(dip.json().id);
    for (const q of ["م ن ق 762", "762منق", "منق", "٧٦٢", "MGA41875", "منى"]) {
      const hits = (await call("GET", `/lookup?q=${encodeURIComponent(q)}`, t.engineerToken)).json();
      expect(hits.map((h: { vehicle: { id: string } }) => h.vehicle.id)).toContain(ids.vehicle);
    }
  });

  it("odometer rule: required; lower needs Admin and a reason", async () => {
    const first = await call("POST", "/work-orders", t.engineerToken, { id: uuidv7(), vehicleId: ids.vehicle, odometerIn: 52880, complaint: "صيانة" });
    expect(first.statusCode).toBe(201);
    expect(first.json().number).toBe(13548);
    ids.wo1 = first.json().id;
    await call("PATCH", `/work-orders/${ids.wo1}`, t.adminToken, { status: "closed", type: "inquiry" });
    expect((await call("POST", "/work-orders", t.engineerToken, { id: uuidv7(), vehicleId: ids.vehicle })).statusCode).toBe(422);
    const lower = { id: uuidv7(), vehicleId: ids.vehicle, odometerIn: 50000 };
    const eng = await call("POST", "/work-orders", t.engineerToken, lower);
    expect(eng.statusCode).toBe(409);
    expect(eng.json().error.details.previousKm).toBe(52880);
    expect((await call("POST", "/work-orders", t.adminToken, lower)).statusCode).toBe(422);
    const ok = await call("POST", "/work-orders", t.engineerToken, { id: uuidv7(), vehicleId: ids.vehicle, odometerIn: 58420, complaint: "التكييف لا يبرد", estimatePt: egp(4500), marks: [{ x: 700, y: 220, kind: "scratch", note: "صدام أمامي" }] });
    expect(ok.json()).toMatchObject({ number: 13549, previousKm: 52880, differenceKm: 5540 });
    ids.wo = ok.json().id;
  });

  it("work order numbers from a device block are accepted once", async () => {
    const blk = (await call("POST", "/numbers/blocks", t.engineerToken, { series: "work_order", size: 3 })).json();
    const wo = await call("POST", "/work-orders", t.engineerToken, { id: uuidv7(), vehicleId: ids.vehicle, odometerIn: 58420, number: blk.from, type: "inquiry" });
    expect(wo.json().number).toBe(blk.from);
    expect((await call("POST", "/work-orders", t.engineerToken, { id: uuidv7(), vehicleId: ids.vehicle, odometerIn: 58420, number: blk.from })).statusCode).toBe(409);
    expect((await call("POST", "/work-orders", t.engineerToken, { id: uuidv7(), vehicleId: ids.vehicle, odometerIn: 58420, number: 99999 })).statusCode).toBe(422);
    await call("PATCH", `/work-orders/${wo.json().id}`, t.adminToken, { status: "closed" });
  });

  it("lines: catalog issue, quantity change and removal move stock; free prices are Admin only", async () => {
    const filter = (await call("GET", "/catalog?q=JC000201&kind=parts", t.engineerToken)).json()[0];
    expect(filter).toMatchObject({ code: "P-2201", grade: "original", qtyMilli: qty(14) });
    expect(filter.avgCostPt).toBeUndefined();
    const add = await call("POST", `/work-orders/${ids.wo}/lines`, t.engineerToken, { variantId: filter.variantId, qtyMilli: qty(2) });
    expect(add.statusCode).toBe(201);
    const lineId = add.json().lineId;
    expect((await call("PATCH", `/work-orders/${ids.wo}/lines/${lineId}`, t.engineerToken, { qtyMilli: qty(1) })).statusCode).toBe(200);
    expect((await level(t.db, filter.variantId)).qtyMilli).toBe(qty(13));
    expect((await call("PATCH", `/work-orders/${ids.wo}/lines/${lineId}`, t.engineerToken, { unitPricePt: 1 })).statusCode).toBe(403);
    expect((await call("POST", `/work-orders/${ids.wo}/lines`, t.engineerToken, { category: "labor", name: "شغل إضافي", unitPricePt: egp(100), qtyMilli: qty(1) })).statusCode).toBe(403);
    const removed = await call("DELETE", `/work-orders/${ids.wo}/lines/${lineId}`, t.engineerToken);
    expect(removed.json().lines).toHaveLength(0);
    expect((await level(t.db, filter.variantId)).qtyMilli).toBe(qty(14));
  });

  it("packages issue several lines at once; approvals raise the estimate", async () => {
    const [labor] = (await call("GET", "/catalog?q=L-1010&kind=labor", t.engineerToken)).json();
    const [oil] = (await call("GET", "/catalog?q=O-0530", t.engineerToken)).json();
    const [filter] = (await call("GET", "/catalog?q=JC000201", t.engineerToken)).json();
    const pk = await call("POST", "/packages", t.adminToken, { name: "تغيير زيت WK2", lines: [{ variantId: labor.variantId, qtyMilli: qty(1) }, { variantId: oil.variantId, qtyMilli: qty(6) }, { variantId: filter.variantId, qtyMilli: qty(1) }] });
    const r = await call("POST", `/work-orders/${ids.wo}/packages/${pk.json().id}`, t.engineerToken);
    expect(r.statusCode).toBe(201);
    expect(r.json().lines).toHaveLength(3);
    const ap = await call("POST", `/work-orders/${ids.wo}/approvals`, t.engineerToken, { newPt: egp(6000), approvedByName: "منى السيد", method: "phone" });
    expect(ap.statusCode).toBe(201);
    const wo = (await call("GET", `/work-orders/${ids.wo}`, t.engineerToken)).json();
    expect(wo.estimatePt).toBe(egp(6000));
    expect(wo.approvals).toHaveLength(2);
    expect(wo.marks).toHaveLength(1);
    expect(wo.lines.map((l: { category: string }) => l.category).sort()).toEqual(["labor", "oil", "part"]);
  });

  it("the car file lists every visit with odometer, and the statement after finalize", async () => {
    const fin = await call("POST", "/statements", t.engineerToken, { id: uuidv7(), workOrderId: ids.wo, payments: [{ methodId: "cash", amountPt: egp(350 + 4500 + 900) }] }); // filter repriced to 900 above
    expect(fin.statusCode).toBe(201);
    ids.statement = fin.json().id;
    const h = (await call("GET", `/vehicles/${ids.vehicle}/history`, t.engineerToken)).json();
    expect(h.visits.find((v: { workOrder: { id: string } }) => v.workOrder.id === ids.wo).statement.number).toBe(fin.json().number);
    expect(h.odometer.map((o: { km: number }) => o.km)).toContain(58420);
    expect((await call("GET", "/work-orders?status=in_shop", t.engineerToken)).json().find((w: { id: string }) => w.id === ids.wo)).toBeUndefined();
  });
});

describe("direct sale, sales return, debt", () => {
  it("direct sale has its own series and takes stock out", async () => {
    const [oil] = (await call("GET", "/catalog?q=O-0530", t.engineerToken)).json();
    const before = (await level(t.db, oil.variantId)).qtyMilli;
    const r = await call("POST", "/direct-sales", t.engineerToken, { id: uuidv7(), customerId: ids.customer, lines: [{ variantId: oil.variantId, qtyMilli: qty(1) }], payments: [{ methodId: "cash", amountPt: egp(750) }] });
    expect(r.statusCode).toBe(201);
    expect(r.json().number).toBe(400);
    expect((await level(t.db, oil.variantId)).qtyMilli).toBe(before - qty(1));
  });

  it("sales return: Admin only, discount shared proportionally, stock back, cash refunded", async () => {
    const [filter] = (await call("GET", "/catalog?q=JC000202", t.engineerToken)).json();
    const wo = await call("POST", "/work-orders", t.engineerToken, { id: uuidv7(), vehicleId: ids.vehicle, odometerIn: 60000 });
    await call("POST", `/work-orders/${wo.json().id}/lines`, t.engineerToken, { variantId: filter.variantId, qtyMilli: qty(2) });
    const stId = uuidv7();
    await call("POST", "/statements", t.engineerToken, { id: stId, workOrderId: wo.json().id, discounts: { part: { mode: "percent", valueBp: 1000 } }, payments: [{ methodId: "cash", amountPt: egp(756) }] });
    const st = (await call("GET", `/statements/${stId}`, t.adminToken)).json();
    const body = { id: uuidv7(), statementId: stId, lines: [{ lineId: st.lines[0].id, qtyMilli: qty(1) }], refundMethodId: "cash", reason: "القطعة غير مناسبة" };
    expect((await call("POST", "/sales-returns", t.engineerToken, body)).statusCode).toBe(403);
    const before = (await level(t.db, filter.variantId)).qtyMilli;
    const r = await call("POST", "/sales-returns", t.adminToken, body);
    expect(r.statusCode).toBe(201);
    expect(r.json().totalPt).toBe(egp(378)); // 420 − 10 %
    expect((await level(t.db, filter.variantId)).qtyMilli).toBe(before + qty(1));
    expect((await call("POST", "/sales-returns", t.adminToken, { ...body, id: uuidv7(), lines: [{ lineId: st.lines[0].id, qtyMilli: qty(2) }] })).statusCode).toBe(422);
  });

  it("credit becomes debt; engineers see only that a debt exists; Admin collects it", async () => {
    const wo = await call("POST", "/work-orders", t.engineerToken, { id: uuidv7(), vehicleId: ids.vehicle, odometerIn: 60100 });
    const [labor] = (await call("GET", "/catalog?q=L-1010", t.engineerToken)).json();
    await call("POST", `/work-orders/${wo.json().id}/lines`, t.engineerToken, { variantId: labor.variantId, qtyMilli: qty(1) });
    await call("POST", "/statements", t.engineerToken, { id: uuidv7(), workOrderId: wo.json().id, payments: [{ methodId: "credit", amountPt: egp(350) }] });
    const asEng = (await call("GET", `/customers/${ids.customer}`, t.engineerToken)).json();
    expect(asEng).toMatchObject({ hasDebt: true });
    expect(asEng.balancePt).toBeUndefined();
    expect((await call("GET", `/customers/${ids.customer}`, t.adminToken)).json().balancePt).toBe(egp(350));
    expect((await call("POST", `/customers/${ids.customer}/payments`, t.engineerToken, { methodId: "cash", amountPt: egp(350) })).statusCode).toBe(403);
    expect((await call("POST", `/customers/${ids.customer}/payments`, t.adminToken, { methodId: "cash", amountPt: egp(400) })).statusCode).toBe(422);
    const pay = await call("POST", `/customers/${ids.customer}/payments`, t.adminToken, { methodId: "cash", amountPt: egp(350) });
    expect(pay.json().balancePt).toBe(0);
  });
});

describe("suppliers, purchases, cash drawer, expenses, bonuses", () => {
  it("purchase on credit raises stock and the supplier balance; payment and return lower it", async () => {
    expect((await call("POST", "/suppliers", t.engineerToken, { name: "المؤسسة الأمريكية" })).statusCode).toBe(403);
    const s = await call("POST", "/suppliers", t.adminToken, { name: "المؤسسة الأمريكية لقطع الغيار", phone: "0122 345 6789", whatsapp: "0122-345-6789" });
    ids.supplier = s.json().id;
    const [filter] = (await call("GET", "/catalog?q=JC000201", t.adminToken)).json();
    const before = await level(t.db, filter.variantId);
    const p = await call("POST", "/purchases", t.adminToken, { id: uuidv7(), supplierId: ids.supplier, purchaseDate: "2026-10-27", payment: "credit", lines: [{ variantId: filter.variantId, qtyMilli: qty(6), unitCostPt: egp(640) }] });
    expect(p.json()).toMatchObject({ number: 1180, totalPt: egp(3840) });
    const after = await level(t.db, filter.variantId);
    expect(after.qtyMilli).toBe(before.qtyMilli + qty(6));
    expect(after.avgCostPt).toBe(Math.round((before.qtyMilli * before.avgCostPt + qty(6) * egp(640)) / (before.qtyMilli + qty(6))));
    const list = (await call("GET", "/suppliers", t.adminToken)).json();
    expect(list[0]).toMatchObject({ balancePt: egp(3840), whatsappValid: true });
    await call("POST", "/cash/open", t.adminToken, { openingPt: egp(2000) });
    await call("POST", `/suppliers/${ids.supplier}/payments`, t.adminToken, { methodId: "cash", amountPt: egp(2000) });
    await call("POST", "/purchase-returns", t.adminToken, { id: uuidv7(), supplierId: ids.supplier, purchaseDate: "2026-10-28", refund: "credit", reason: "قطعة معيبة", lines: [{ variantId: filter.variantId, qtyMilli: qty(1), unitCostPt: egp(640) }] });
    const ledger = (await call("GET", `/suppliers/${ids.supplier}/ledger`, t.adminToken)).json();
    expect(ledger.at(-1).balancePt).toBe(egp(3840 - 2000 - 640));
  });

  it("cash drawer: expected = opening + movements; a difference needs a note", async () => {
    const cats = await call("POST", "/expense-categories", t.adminToken, { name: "بنزين ونقل قطع" });
    await call("POST", "/expenses", t.adminToken, { categoryId: cats.json().id, amountPt: egp(350), paidBy: "أحمد" });
    const cur = (await call("GET", "/cash/current", t.adminToken)).json();
    expect(cur.open).toBe(true);
    expect(cur.expectedPt).toBe(egp(2000) - egp(2000) - egp(350)); // supplier paid 2000 cash, expense 350
    expect((await call("GET", "/cash/current", t.engineerToken)).statusCode).toBe(403);
    expect((await call("POST", "/cash/close", t.adminToken, { countedPt: 0 })).statusCode).toBe(422);
    const closed = await call("POST", "/cash/close", t.adminToken, { countedPt: 0, note: "مراجعة" });
    expect(closed.json().differencePt).toBe(egp(350));
    expect((await call("GET", "/cash/current", t.adminToken)).json().open).toBe(false);
  });

  it("bonuses are manual and summed per person", async () => {
    expect((await call("POST", "/bonuses", t.adminToken, { amountPt: egp(500), reason: "شغل إضافي" })).statusCode).toBe(422);
    await call("POST", "/bonuses", t.adminToken, { userId: t.engineerId, amountPt: egp(500), reason: "شغل إضافي" });
    await call("POST", "/bonuses", t.adminToken, { userId: t.engineerId, amountPt: egp(250), reason: "يوم جمعة" });
    const b = (await call("GET", "/bonuses", t.adminToken)).json();
    expect(b.totals).toEqual([{ person: "محمود سمير", amountPt: egp(750) }]);
    expect((await call("GET", "/bonuses", t.engineerToken)).statusCode).toBe(403);
  });
});

describe("settings and dashboard", () => {
  it("engineers cannot change settings; numbering cannot go back over used numbers", async () => {
    expect((await call("PUT", "/settings/print.ack", t.engineerToken, { value: "x" })).statusCode).toBe(403);
    expect((await call("PUT", "/settings/print.ack", t.adminToken, { value: "تم الاستلام" })).statusCode).toBe(200);
    expect((await call("GET", "/settings", t.engineerToken)).json()["print.ack"]).toBe("تم الاستلام");
    expect((await call("PUT", "/numbers/work_order", t.adminToken, { next: 13549 })).statusCode).toBe(422);
    expect((await call("PUT", "/numbers/work_order", t.adminToken, { next: 20000 })).statusCode).toBe(200);
    expect((await call("PATCH", `/users/${t.adminId}`, t.adminToken, { active: false })).statusCode).toBe(422);
  });

  it("dashboard: money only for Admin", async () => {
    const eng = (await call("GET", "/dashboard", t.engineerToken)).json();
    expect(eng.salesTodayPt).toBeUndefined();
    expect(eng).toHaveProperty("carsInShop");
    const adm = (await call("GET", "/dashboard", t.adminToken)).json();
    expect(adm.salesTodayPt).toBeGreaterThan(0);
    expect(adm.lowStock).toBeGreaterThanOrEqual(0);
  });
});
