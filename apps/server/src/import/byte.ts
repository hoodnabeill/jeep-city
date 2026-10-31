/**
 * Byte migration, step 2: load the JSON exported by scripts/byte/export.ps1 into an EMPTY database (D-71..D-76).
 * Imports customers, cars, work orders with their lines, Byte's closed work orders as read-only statements (D-80), technicians,
 * items with opening stock, and moves the work-order numbering past Byte's last number.
 * Usage: IMPORT_ADMIN_PASSWORD=... PGLITE_DIR=./.data/byte npm run import:byte -w @jc/server -- <export folder>
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { count, eq, sql } from "drizzle-orm";
import { searchKey, uuidv7 } from "@jc/core";
import { bootstrap, createUser } from "../bootstrap";
import { loadConfig } from "../config";
import { openDb, type Db } from "../db/client";
import {
  customerLedger, customers, docLines, payments, statements, itemCategories, items, itemVariants, numberSeries, odometerReadings, stockLevels, stockMovements,
  technicians, vehicles, warehouses, workOrders,
} from "../db/schema";
import { byteTotals, cairoTime, clean, customerKey, localMobile, mapPlate, milli, pickMobile, pt, splitKind, year } from "./byte-map";

type R = Record<string, any>;
const dir = process.argv[2];
const password = process.env.IMPORT_ADMIN_PASSWORD;
if (!dir) { console.error("Usage: npm run import:byte -- <export folder>"); process.exit(1); }
if (!password || password.length < 8) { console.error("Set IMPORT_ADMIN_PASSWORD (8+ characters) for the admin user."); process.exit(1); }
const read = (name: string): R[] => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
const cars = read("cars"), wos = read("workorders").sort((a, b) => a.no - b.no), lines = read("lines"), itemRows = read("items");

const cfg = loadConfig();
if (!cfg.databaseUrl) mkdirSync(cfg.pgliteDir, { recursive: true });
const { db, close } = await openDb({ databaseUrl: cfg.databaseUrl, dataDir: cfg.pgliteDir });
const [{ n: existing }] = await db.select({ n: count() }).from(customers);
if (existing) { console.error("The target database already has customers. The Byte import only runs into an empty database."); process.exit(1); }
await bootstrap(db);
await createUser(db, { username: process.env.IMPORT_ADMIN_USER ?? "ahmed", displayName: "أحمد الطنطاوي", role: "admin", password });

const importedAt = new Date();
const recentFrom = new Date(importedAt.getTime() - 30 * 864e5); // D-76
const stats: Record<string, number> = {};
const bump = (k: string, by = 1) => { stats[k] = (stats[k] ?? 0) + by; };

/* ---------- Customers ---------- */
type Cust = { id: string; name: string; mobile: string | null; home: string | null; work: string | null; address: string | null; governorate: string | null; company: string | null; at: Date; balancePt: number };
const custs = new Map<string, Cust>();
const UNKNOWN = "بدون اسم (من بايت)";
function customerOf(r: R, at: Date, fallbackKey?: string): Cust {
  const name = clean(r.name);
  const mobile = pickMobile(r.mobile, r.home, r.work);
  const key = customerKey(name, mobile) ?? `unknown:${fallbackKey}`;
  let c = custs.get(key);
  if (!c) { c = { id: uuidv7(at.getTime()), name: name ?? UNKNOWN, mobile, home: null, work: null, address: null, governorate: null, company: null, at, balancePt: 0 }; custs.set(key, c); }
  if (at < c.at) c.at = at;
  // Fill blanks from later rows; never overwrite what is already known.
  const home = clean(r.home), work = clean(r.work);
  c.home ??= home && pickMobile(home) !== mobile ? home : null;
  c.work ??= work;
  c.address ??= clean(r.address);
  c.governorate ??= clean(r.governorate);
  c.company ??= clean(r.company) !== c.name ? clean(r.company) : null;
  return c;
}

/* ---------- Vehicles: tCars_Data first, then cars that only appear on work orders ---------- */
type Car = { id: string; owner: Cust | null; lastWoOwner: Cust | null; row: R; plate: ReturnType<typeof mapPlate>; chassis: string | null; at: Date };
const byChassis = new Map<string, Car>(), byPlate = new Map<string, Car>(), carList: Car[] = [];
// Byte usually stores only the last 4–8 characters of the VIN: keep what is there (3+ characters).
const chassisOf = (v: unknown) => { const s = clean(v)?.toUpperCase().replace(/\s/g, "") ?? null; return s && s.length >= 3 ? s : null; };
/** A chassis (even partial) identifies the same car only from 6 characters; shorter ones collide. */
const chassisKey = (v: unknown) => { const s = chassisOf(v); return s && s.length >= 6 ? s : null; };
function addCar(row: R, owner: Cust | null, at: Date): Car {
  const car: Car = { id: uuidv7(at.getTime()), owner, lastWoOwner: null, row, plate: mapPlate(row.plate), chassis: chassisOf(row.chassis), at };
  carList.push(car);
  if (chassisKey(car.chassis)) byChassis.set(car.chassis!, car);
  if (car.plate.plateKey) byPlate.set(car.plate.plateKey, car);
  return car;
}
const findCar = (row: R) => {
  const ch = chassisKey(row.chassis), pk = mapPlate(row.plate).plateKey;
  return (ch && byChassis.get(ch)) || (pk && byPlate.get(pk)) || null;
};
const woPlates = new Set(wos.map((w) => mapPlate(w.plate).plateKey).filter(Boolean));
const woChassis = new Set(wos.map((w) => chassisKey(w.chassis)).filter(Boolean));
for (const r of cars) {
  if (!clean(r.name) && !pickMobile(r.mobile, r.home, r.work) && !clean(r.home) && !mapPlate(r.plate).plateKey
    && !(chassisOf(r.chassis) && woChassis.has(chassisOf(r.chassis)))) { bump("cars.emptyRowSkipped"); continue; }
  if (!clean(r.name) && !woPlates.has(mapPlate(r.plate).plateKey) && !(chassisOf(r.chassis) && woChassis.has(chassisOf(r.chassis)))) bump("cars.noOwnerNoVisit");
  const at = cairoTime(r.storedAt) ?? importedAt; // no date: the first work order sets it
  if (findCar(r)) { bump("cars.duplicate"); continue; }
  addCar(r, clean(r.name) ? customerOf(r, at) : null, at);
}

/* ---------- Technicians (names typed on lines) ---------- */
const techIds = new Map<string, string>();
for (const l of lines) { const t = clean(l.tech); if (t && !techIds.has(searchKey(t))) techIds.set(searchKey(t), uuidv7()); }
const techNames = new Map<string, string>();
for (const l of lines) { const t = clean(l.tech); if (t) techNames.set(searchKey(t), t); }

/* ---------- Work orders ---------- */
const [main] = await db.select().from(warehouses).limit(1);
const woRows: R[] = [], odoRows: R[] = [];
const woIdByNo = new Map<number, { id: string; at: Date; w: R; customerId: string; vehicleId: string; billed: boolean }>();
for (const w of wos) {
  const at = cairoTime(w.d, w.t !== "00:00:00" ? w.t : w.outAt) ?? importedAt;
  let car = findCar(w);
  const cust = clean(w.name) ? customerOf(w, at) : null;
  if (!car) { car = addCar({ ...w, year: null, color: null, engineNo: null }, cust, at); bump("cars.fromWorkOrders"); }
  if (cust) car.lastWoOwner = cust;
  if (at < car.at) car.at = at;
  const owner = cust ?? car.owner ?? customerOf({ name: null }, at, car.id);
  const open = clean(w.status) === "مفتوح";
  const keepOpen = open && at >= recentFrom;
  if (open && !keepOpen) bump("workOrders.closedOnImport");
  if (Number(w.due) > 0 && !keepOpen) owner.balancePt += pt(w.due);
  const complaint = clean(w.complaint) ?? clean(w.notes);
  const notes = [
    clean(w.repair) && `الإصلاح: ${clean(w.repair)}`,
    clean(w.complaint) && clean(w.notes) && `ملاحظات: ${clean(w.notes)}`,
    clean(w.receiver) && `استقبال: ${clean(w.receiver)}`,
    `إجمالي بايت: ${Number(w.totalNet || 0).toFixed(2)}`,
    open && !keepOpen && "أُغلق عند الاستيراد من بايت (كان مفتوحًا).",
  ].filter(Boolean).join("\n");
  const id = uuidv7(at.getTime());
  woIdByNo.set(w.no, { id, at, w, customerId: owner.id, vehicleId: car.id, billed: clean(w.status) === "مغلق" });
  const km = Number(w.km) > 0 ? Math.round(Number(w.km)) : null;
  woRows.push({
    id, number: w.no, type: "repair", status: keepOpen ? "open" : "closed", vehicleId: car.id, customerId: owner.id, enteredAt: at,
    odometerIn: km, complaint, internalNotes: notes, insuranceCompany: clean(w.insurer), warehouseId: main.id, createdAt: at, updatedAt: at,
  });
  if (km) odoRows.push({ id: uuidv7(at.getTime()), vehicleId: car.id, km, readAt: at, workOrderId: id, createdAt: at, updatedAt: at });
}

/* ---------- Items, categories, opening stock ---------- */
const catIds = new Map<string, string>(), catRows: R[] = [];
const itemRowsOut: R[] = [], variantRows: R[] = [], moveRows: R[] = [], levelRows: R[] = [];
const usedCodes = new Set<string>();
const variantByCode = new Map<string, { itemId: string; variantId: string; name: string }>(), variantByName = new Map<string, { itemId: string; variantId: string; name: string }>();
itemRows.forEach((r, n) => {
  const name = clean(r.name) ?? `صنف ${n + 1}`;
  let code = clean(r.code) ?? clean(r.code2) ?? `BYTE-${n + 1}`;
  for (let k = 2; usedCodes.has(code.toUpperCase()); k++) code = `${clean(r.code) ?? clean(r.code2) ?? "BYTE"}-${k}`;
  usedCodes.add(code.toUpperCase());
  const grp = clean(r.grp);
  if (grp && !catIds.has(grp)) { const id = uuidv7(); catIds.set(grp, id); catRows.push({ id, name: grp }); }
  const itemId = uuidv7(), variantId = uuidv7();
  itemRowsOut.push({ id: itemId, code, nameAr: name, nameKey: searchKey(name), type: "part", categoryId: grp ? catIds.get(grp) : null, unit: clean(r.unit) ?? "قطعة", location: clean(r.location), notes: clean(r.car) });
  variantRows.push({ id: variantId, itemId, grade: null, sellPricePt: pt(r.price), minQtyMilli: Math.max(0, milli(r.minQty)) });
  const ref = { itemId, variantId, name };
  for (const c of [clean(r.code), clean(r.code2)]) if (c && !variantByCode.has(c.toUpperCase())) variantByCode.set(c.toUpperCase(), ref);
  if (!variantByName.has(searchKey(name))) variantByName.set(searchKey(name), ref);
  const onHand = (JSON.parse(r.stock || "[]") as { qty: number }[]).reduce((a, s) => a + Number(s.qty || 0), 0);
  if (onHand < 0) bump("items.negativeStockSetToZero");
  const q = Math.max(0, milli(onHand));
  if (q > 0) {
    moveRows.push({ id: uuidv7(), variantId, warehouseId: main.id, qtyMilli: q, kind: "opening", unitCostPt: pt(r.cost), reason: "رصيد افتتاحي من بايت" });
    levelRows.push({ variantId, warehouseId: main.id, qtyMilli: q, avgCostPt: pt(r.cost) });
  }
});

/* ---------- Lines (history: stock already moved in Byte) ---------- */
const lineRows: R[] = [];
const tick = new Map<string, number>();
for (const l of lines) {
  const wo = woIdByNo.get(l.no);
  if (!wo) { bump("lines.orphan"); continue; }
  const code = clean(l.code), name = clean(l.name) ?? code ?? "بند";
  const ref = l.cat === "part" ? ((code && variantByCode.get(code.toUpperCase())) || variantByName.get(searchKey(name)) || null) : null;
  if (l.cat === "part") bump(ref ? "lines.partsMatched" : "lines.partsFreeText");
  const qty = milli(l.qty ?? 1) || 1000;
  const k = (tick.get(wo.id) ?? 0) + 1; tick.set(wo.id, k);
  const at = new Date(wo.at.getTime() + k); // keeps Byte's line order on screen
  const t = clean(l.tech);
  const price = pt(l.price);
  if (price < 0) bump("lines.negativePriceAsDiscount");
  lineRows.push({
    id: uuidv7(at.getTime()), workOrderId: wo.id, category: l.cat, itemId: ref?.itemId ?? null, variantId: ref?.variantId ?? null, code, name: price < 0 ? `${name} (خصم ${(-price / 100).toFixed(2)} في بايت)` : name,
    unit: l.cat === "labor" ? null : "قطعة", qtyMilli: qty, unitPricePt: Math.max(0, price), technicianId: t ? techIds.get(searchKey(t)) : null,
    finishedAt: cairoTime(l.doneAt), stockQtyMilli: ref ? qty : 0, createdAt: at, updatedAt: at,
  });
}

/* ---------- Byte statements (D-80): closed work orders, read-only, numbered by the work order ---------- */
const stRows: R[] = [], payRows: R[] = [];
const linesByWo = new Map<string, R[]>();
for (const l of lineRows) (linesByWo.get(l.workOrderId) ?? linesByWo.set(l.workOrderId, []).get(l.workOrderId)!).push(l);
for (const [no, wo] of woIdByNo) {
  if (!wo.billed) continue;
  const ls = linesByWo.get(wo.id) ?? [];
  const { discounts, totals, above } = byteTotals(ls.map((l) => ({ category: l.category, qtyMilli: l.qtyMilli, unitPricePt: l.unitPricePt })), pt(wo.w.totalNet));
  if (above) bump("statements.byteTotalAboveLines");
  const id = uuidv7(wo.at.getTime());
  for (const l of ls) l.statementId = id;
  stRows.push({
    id, number: no, kind: "byte", workOrderId: wo.id, customerId: wo.customerId, vehicleId: wo.vehicleId, statementDate: wo.at.toISOString().slice(0, 10),
    discounts, totals, amountDuePt: totals.amountDuePt, notDone: above ? `إجمالي بايت أعلى من البنود بـ ${(above / 100).toFixed(2)}` : null, createdAt: wo.at, updatedAt: wo.at,
  });
  // Paid = what Byte says is not still due; the card part is Byte's visa amount. Shown only: no ledger or cash rows (balances come from D-77).
  const paid = Math.max(0, totals.amountDuePt - Math.max(0, pt(wo.w.due)));
  const card = Math.min(paid, Math.max(0, pt(wo.w.visa)));
  for (const [methodId, amountPt] of [["card", card], ["cash", paid - card]] as const)
    if (amountPt > 0) payRows.push({ id: uuidv7(wo.at.getTime()), statementId: id, customerId: wo.customerId, methodId, amountPt, reference: "بايت", kind: "statement", paidAt: wo.at, createdAt: wo.at, updatedAt: wo.at });
}

/* ---------- Write ---------- */
const vehRows = carList.map((car) => {
  const owner = car.owner ?? car.lastWoOwner ?? customerOf({ name: null }, car.at, car.id);
  const { make, model } = splitKind(car.row.kind ?? car.row.model);
  const review = car.plate.review ? `استيراد بايت: راجع اللوحة ونوعها (الأصل: ${clean(car.row.plate) ?? "فارغ"}).` : null;
  if (car.plate.review) bump("cars.plateReview");
  return {
    id: car.id, customerId: owner.id, plateType: "private", plateLetters: car.plate.plateLetters, plateDigits: car.plate.plateDigits, plateKey: car.plate.plateKey,
    chassis: car.chassis, make, model, year: year(car.row.year), color: clean(car.row.color), engineNo: clean(car.row.engineNo),
    notes: [review, clean(car.row.notes)].filter(Boolean).join("\n") || null, createdAt: car.at, updatedAt: car.at,
  };
});
const custRows = [...custs.values()].map((c) => ({
  id: c.id, name: c.name, nameKey: searchKey(c.name), mobile: localMobile(c.mobile), whatsapp: c.mobile, homePhone: c.home, officePhone: c.work,
  address: c.address, governorate: c.governorate, notes: c.company ? `الشركة: ${c.company}` : null, openingBalancePt: c.balancePt, createdAt: c.at, updatedAt: c.at,
}));
await db.transaction(async (tx) => {
  const t = tx as unknown as Db;
  const ins = async (table: any, rows: R[]) => { for (let i = 0; i < rows.length; i += 500) await t.insert(table).values(rows.slice(i, i + 500)); };
  await ins(customers, custRows);
  await ins(customerLedger, custRows.filter((c) => c.openingBalancePt > 0).map((c) => ({ id: uuidv7(), customerId: c.id, amountPt: c.openingBalancePt, kind: "opening", refType: "byte", createdAt: c.createdAt, updatedAt: c.createdAt })));
  await ins(vehicles, vehRows);
  await ins(technicians, [...techIds].map(([k, id]) => ({ id, name: techNames.get(k)! })));
  await ins(itemCategories, catRows);
  await ins(items, itemRowsOut);
  await ins(itemVariants, variantRows);
  await ins(stockMovements, moveRows);
  await ins(stockLevels, levelRows);
  await ins(workOrders, woRows);
  await ins(odometerReadings, odoRows);
  await ins(statements, stRows);
  await ins(docLines, lineRows);
  await ins(payments, payRows);
  const last = Math.max(0, ...wos.map((w) => w.no));
  await t.update(numberSeries).set({ nextValue: sql`greatest(${numberSeries.nextValue}, ${last + 1})` }).where(eq(numberSeries.series, "work_order"));
});

console.log(JSON.stringify({
  customers: custRows.length, vehicles: vehRows.length, workOrders: woRows.length, open: woRows.filter((w) => w.status === "open").length,
  lines: lineRows.length, statements: stRows.length, payments: payRows.length, items: itemRowsOut.length, stocked: levelRows.length, technicians: techIds.size, odometer: odoRows.length, ...stats,
}, null, 1));
await close();
