import { egp, qty, searchKey, uuidv7 } from "@jc/core";
import { buildApp } from "../src/app";
import { bootstrap, createUser } from "../src/bootstrap";
import { loadConfig } from "../src/config";
import { openDb, type Db } from "../src/db/client";
import { customers, docLines, items, itemVariants, vehicles, workOrders } from "../src/db/schema";
import { mainWarehouseId, move } from "../src/modules/stock";

export const ADMIN = { username: "ahmed", displayName: "أحمد الطنطاوي", role: "admin" as const, password: "admin-pass-123" };
export const ENGINEER = { username: "mahmoud", displayName: "محمود سمير", role: "engineer" as const, password: "eng-pass-1234" };

/** A fresh in-memory Postgres (PGlite), migrated and bootstrapped, plus an app and two logged-in users. */
export async function setup() {
  const { db, close } = await openDb({});
  await bootstrap(db);
  const cfg = loadConfig({ NODE_ENV: "test", JWT_SECRET: "test-secret-".padEnd(48, "x"), LOGIN_ATTEMPTS_PER_MIN: "5" } as NodeJS.ProcessEnv);
  const app = await buildApp(db, cfg);
  const adminId = await createUser(db, ADMIN);
  const engineerId = await createUser(db, ENGINEER);
  const login = async (u: { username: string; password: string }, ip = "10.0.0.1") => {
    const r = await app.inject({ method: "POST", url: "/auth/login", payload: { username: u.username, password: u.password, deviceId: "pc-1" }, remoteAddress: ip });
    return r.json() as { accessToken: string; refreshToken: string };
  };
  const adminToken = (await login(ADMIN, "10.0.0.100")).accessToken;
  const engineerToken = (await login(ENGINEER, "10.0.0.101")).accessToken;
  const as = (token: string) => ({ authorization: `Bearer ${token}`, "x-device-id": "pc-1" });
  return {
    db, app, cfg, adminId, engineerId, adminToken, engineerToken, as, login,
    admin: { id: adminId, role: "admin" as const, deviceId: "pc-1" },
    engineer: { id: engineerId, role: "engineer" as const, deviceId: "pc-1" },
    close: async () => { await app.close(); await close(); },
  };
}

export async function makeItem(db: Db, o: { code: string; name: string; type: "part" | "oil" | "material" | "labor"; pricePt: number; grade?: "original" | "copy" | "used"; trackStock?: boolean; minMilli?: number; unit?: string }) {
  const itemId = uuidv7(), variantId = uuidv7();
  await db.insert(items).values({ id: itemId, code: o.code, nameAr: o.name, nameKey: searchKey(o.name), type: o.type, unit: o.unit ?? "قطعة", trackStock: o.trackStock ?? o.type !== "labor" });
  await db.insert(itemVariants).values({ id: variantId, itemId, grade: o.grade ?? null, sellPricePt: o.pricePt, minQtyMilli: o.minMilli ?? 0, barcode: `JC-${o.code}` });
  return { itemId, variantId };
}

export async function stockIn(db: Db, variantId: string, units: number, costPt: number) {
  return db.transaction((tx) => move(tx, null, { variantId, qtyMilli: qty(units), kind: "purchase_in", unitCostPt: costPt, refType: "test" }));
}

export async function makeCustomerCar(db: Db) {
  const customerId = uuidv7(), vehicleId = uuidv7();
  await db.insert(customers).values({ id: customerId, name: "خالد إبراهيم المصري", nameKey: searchKey("خالد إبراهيم المصري"), mobile: "01002345678" });
  await db.insert(vehicles).values({ id: vehicleId, customerId, plateType: "private", plateLetters: "ل ف و", plateDigits: "281", plateKey: "لفو281", chassis: "1C4RJFAG5FC625874", make: "Jeep", model: "Grand Cherokee", variant: "WK2", year: 2015 });
  return { customerId, vehicleId };
}

let woSeq = 13548;
export async function makeWorkOrder(db: Db, receptionUserId: string, number = woSeq++) {
  const { customerId, vehicleId } = await makeCustomerCar(db);
  const id = uuidv7();
  await db.insert(workOrders).values({ id, number, customerId, vehicleId, receptionUserId, enteredAt: new Date("2026-10-28T07:40:00Z"), odometerIn: 112640, complaint: "صيانة دورية", warehouseId: await mainWarehouseId(db) });
  return { id, customerId, vehicleId };
}

/**
 * The real statement 9309 as typed on the paper: labor 2500, and eight parts lines (oil and materials entered
 * as parts, D-08). Lines are inserted directly, as the old system had them; stock is not involved here.
 */
export async function fixture9309(db: Db, receptionUserId: string) {
  const wo = await makeWorkOrder(db, receptionUserId);
  const parts: [string, number, number][] = [
    ["زيت محرك 5W-30 MOPAR", 7, 750], ["فلتر زيت", 1, 850], ["جوان خرطوشة WK2", 1, 1850], ["خرطوم سيليكون", 1, 300],
    ["غطاء رادياتير", 1, 2000], ["سائل مساحات", 1, 300], ["فلتر تكييف", 1, 650], ["لحام", 1, 150],
  ];
  await db.insert(docLines).values([
    { id: uuidv7(), workOrderId: wo.id, category: "labor", name: "صيانة دورية شاملة", qtyMilli: qty(1), unitPricePt: egp(2500) },
    ...parts.map(([name, units, price]) => ({ id: uuidv7(), workOrderId: wo.id, category: "part" as const, name, qtyMilli: qty(units), unitPricePt: egp(price) })),
  ]);
  return wo;
}
