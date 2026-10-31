/**
 * Synthetic demo data for local review only (the same shop story as the Phase 1 prototype). Goes through the
 * real API, so every number is produced by the real rules. Never run against the shop's production database.
 * Usage: DEMO_PASSWORD=... npm run demo -w @jc/server   (users: ahmed = admin, mahmoud / karim = engineers)
 */
import { mkdirSync } from "node:fs";
import { egp, qty, uuidv7 } from "@jc/core";
import { buildApp } from "./app";
import { bootstrap, createUser } from "./bootstrap";
import { loadConfig } from "./config";
import { openDb } from "./db/client";

const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 8) { console.error("Set DEMO_PASSWORD (8+ characters)."); process.exit(1); }
const cfg = loadConfig();
if (cfg.databaseUrl) { console.error("Refusing to load demo data into DATABASE_URL. Demo data is for the local PGlite folder only."); process.exit(1); }
mkdirSync(cfg.pgliteDir, { recursive: true });
const { db, close } = await openDb({ dataDir: cfg.pgliteDir });
await bootstrap(db);
await createUser(db, { username: "ahmed", displayName: "أحمد الطنطاوي", role: "admin", password });
await createUser(db, { username: "mahmoud", displayName: "محمود سمير", role: "engineer", password });
await createUser(db, { username: "karim", displayName: "كريم عادل", role: "engineer", password });
const app = await buildApp(db, cfg);

async function as(username: string) {
  const r = await app.inject({ method: "POST", url: "/auth/login", payload: { username, password, deviceId: "demo" } });
  const token = r.json().accessToken as string;
  return async (method: "GET" | "POST" | "PATCH" | "PUT", url: string, payload?: unknown) => {
    const res = await app.inject({ method, url, payload: payload as object, headers: { authorization: `Bearer ${token}`, "x-device-id": "demo" } });
    if (res.statusCode >= 400) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body}`);
    return res.json();
  };
}
const admin = await as("ahmed"), eng = await as("mahmoud"), eng2 = await as("karim");

const existing = await admin("GET", "/items");
if (existing.length) { console.log("Demo data already loaded."); await app.close(); await close(); process.exit(0); }

for (const name of ["حسن عبد الله", "سيد رمضان", "مصطفى فتحي", "عمرو جمال"]) await admin("POST", "/technicians", { name });
const techs: { id: string; name: string }[] = await admin("GET", "/technicians");
const tech = (n: string) => techs.find((t) => t.name === n)!.id;

type V = { grade?: "original" | "copy" | "used"; price: number; min?: number; barcode?: string };
const ITEMS: { code: string; name: string; en?: string; type: "part" | "oil" | "material" | "labor"; unit: string; loc?: string; track?: boolean; v: V[] }[] = [
  { code: "P-2201", name: "فلتر زيت", en: "Oil filter 68191349AA", type: "part", unit: "قطعة", loc: "A-03", v: [{ grade: "original", price: 850, min: 6, barcode: "JC000201" }, { grade: "copy", price: 420, min: 8, barcode: "JC000202" }] },
  { code: "P-2215", name: "جوان خرطوشة زيت", en: "Oil cooler gasket", type: "part", unit: "قطعة", loc: "A-07", v: [{ grade: "original", price: 1850, min: 4, barcode: "JC000215" }, { grade: "copy", price: 900, min: 4, barcode: "JC000216" }] },
  { code: "P-3104", name: "طقم تيل فرامل أمامي", en: "Front brake pads", type: "part", unit: "طقم", loc: "B-01", v: [{ grade: "original", price: 4800, min: 2, barcode: "JC000310" }, { grade: "copy", price: 2400, min: 3, barcode: "JC000311" }] },
  { code: "P-3120", name: "طنبورة فرامل أمامي", en: "Front brake rotor", type: "part", unit: "قطعة", loc: "B-02", v: [{ grade: "original", price: 6500, min: 2, barcode: "JC000312" }, { grade: "used", price: 2800, barcode: "JC000313" }] },
  { code: "P-4410", name: "غطاء رادياتير", en: "Radiator cap", type: "part", unit: "قطعة", loc: "C-04", v: [{ grade: "original", price: 2000, min: 2, barcode: "JC000441" }, { grade: "copy", price: 750, min: 3, barcode: "JC000442" }] },
  { code: "P-4502", name: "خرطوم سيليكون رادياتير", en: "Silicone radiator hose", type: "part", unit: "قطعة", loc: "C-06", v: [{ grade: "copy", price: 300, min: 4, barcode: "JC000450" }] },
  { code: "P-5120", name: "فلتر تكييف", en: "Cabin A/C filter", type: "part", unit: "قطعة", loc: "A-05", v: [{ grade: "original", price: 1100, min: 3, barcode: "JC000512" }, { grade: "copy", price: 650, min: 5, barcode: "JC000513" }] },
  { code: "O-0530", name: "زيت محرك MOPAR 5W-30", en: "MOPAR 5W-30", type: "oil", unit: "لتر", loc: "زيوت-1", v: [{ price: 750, min: 20, barcode: "JC000053" }] },
  { code: "O-0040", name: "زيت Pennzoil Ultra Platinum 0W-40", en: "Pennzoil 0W-40", type: "oil", unit: "لتر", loc: "زيوت-2", v: [{ price: 980, min: 20, barcode: "JC000004" }] },
  { code: "M-0101", name: "سائل مساحات", type: "material", unit: "عبوة", loc: "E-02", v: [{ price: 300, min: 10, barcode: "JC000101" }] },
  { code: "M-0140", name: "لحام", type: "material", unit: "خدمة", track: false, v: [{ price: 150 }] },
  { code: "L-1001", name: "صيانة دورية شاملة وكشف كمبيوتر", type: "labor", unit: "عملية", v: [{ price: 2500 }] },
  { code: "L-1010", name: "تغيير زيت وفلتر", type: "labor", unit: "عملية", v: [{ price: 350 }] },
  { code: "L-1022", name: "تغيير تيل فرامل أمامي", type: "labor", unit: "عملية", v: [{ price: 600 }] },
  { code: "L-1050", name: "كشف كمبيوتر", type: "labor", unit: "ساعة", v: [{ price: 500 }] },
  { code: "L-1080", name: "شحن فريون تكييف", type: "labor", unit: "عملية", v: [{ price: 900 }] },
  { code: "L-1102", name: "تغيير طنابير فرامل أمامي", type: "labor", unit: "عملية", v: [{ price: 800 }] },
];
for (const it of ITEMS) await admin("POST", "/items", {
  code: it.code, nameAr: it.name, nameEn: it.en ?? null, type: it.type, unit: it.unit, location: it.loc ?? null, trackStock: it.track,
  variants: it.v.map((v) => ({ grade: v.grade ?? null, sellPricePt: egp(v.price), minQtyMilli: qty(v.min ?? 0), barcode: v.barcode ?? null })),
});
const variant = async (barcodeOrCode: string) => (await admin("GET", `/catalog?q=${encodeURIComponent(barcodeOrCode)}`))[0].variantId as string;

const sup = await admin("POST", "/suppliers", { name: "المؤسسة الأمريكية لقطع الغيار", contact: "عادل منير", phone: "0122 345 6789", whatsapp: "0122-345-6789", address: "التوفيقية، وسط البلد", openingBalancePt: egp(18000) });
await admin("POST", "/suppliers", { name: "موبار مصر – الموزع", contact: "شريف حمدي", phone: "0100 777 2154", whatsapp: "01007772154", address: "مدينة نصر" });
await admin("POST", "/suppliers", { name: "النور للفلاتر والكوبي", contact: "أيمن نور", phone: "02 2590 4417", address: "العباسية" });
const stock: [string, number, number][] = [
  ["JC000201", 14, 610], ["JC000202", 22, 260], ["JC000215", 5, 1320], ["JC000216", 6, 560], ["JC000310", 4, 3650], ["JC000311", 9, 1500],
  ["JC000312", 4, 4900], ["JC000313", 1, 1400], ["JC000441", 5, 1450], ["JC000450", 11, 160], ["JC000512", 7, 790], ["JC000513", 18, 380],
  ["JC000053", 72, 560], ["JC000004", 12, 745], ["JC000101", 40, 170],
];
const lines = [];
for (const [b, q, c] of stock) lines.push({ variantId: await variant(b), qtyMilli: qty(q), unitCostPt: egp(c) });
await admin("POST", "/purchases", { id: uuidv7(), supplierId: sup.id, purchaseDate: "2026-10-20", payment: "credit", supplierRef: "INV-77812", lines });
await admin("POST", "/packages", { name: "تغيير زيت WK2", lines: [{ variantId: await variant("L-1010"), qtyMilli: qty(1) }, { variantId: await variant("JC000053"), qtyMilli: qty(6) }, { variantId: await variant("JC000201"), qtyMilli: qty(1) }] });
await admin("POST", "/packages", { name: "فرامل أمامي كاملة", lines: [{ variantId: await variant("L-1022"), qtyMilli: qty(1) }, { variantId: await variant("JC000310"), qtyMilli: qty(1) }] });

const CARS = [
  { c: { name: "خالد إبراهيم المصري", mobile: "0100 234 5678", governorate: "القاهرة", address: "الرحاب، المرحلة الرابعة، مجموعة 112", internalNotes: "يفضل قطع أصلي دائمًا. يتصل قبل الاستلام." }, v: { plateLetters: "ل ف و", plateDigits: "281", chassis: "1C4RJFAG5FC625874", make: "Jeep", model: "Grand Cherokee", variant: "WK2", year: 2015, color: "أسود", engineSize: "3.6L V6" } },
  { c: { name: "شركة النيل للمقاولات", mobile: "0122 870 4411", officePhone: "02 2614 7788", address: "التجمع الخامس، شارع التسعين" }, v: { plateLetters: "س ط ج", plateDigits: "4127", chassis: "1C4HJXEG2LW213659", make: "Jeep", model: "Wrangler", variant: "JL", year: 2020, color: "أبيض" } },
  { c: { name: "هشام عبد الرحمن", mobile: "0111 905 3320", address: "مدينتي، B6" }, v: { plateLetters: "ر أ ب", plateDigits: "9035", chassis: "2C3CDXCT8JH157420", make: "Dodge", model: "Charger", variant: "LD", year: 2018, color: "رمادي" } },
  { c: { name: "منى السيد", mobile: "0155 412 7809", address: "الشيخ زايد، الحي 16" }, v: { plateLetters: "م ن ق", plateDigits: "762", chassis: "1FM5K8GC1MGA41875", make: "Ford", model: "Explorer", year: 2021, color: "أزرق" } },
  { c: { name: "طارق فوزي", mobile: "0101 667 2290", address: "الرحاب، المرحلة الأولى" }, v: { plateType: "diplomatic", plateDigits: "12345", chassis: "1GNSKCKD4PR108236", make: "Chevrolet", model: "Tahoe", year: 2023, color: "أسود" } },
  { c: { name: "ياسر الشريف", mobile: "0127 334 9081", address: "القاهرة الجديدة، اللوتس" }, v: { plateType: "limousine", plateLetters: "هـ ط ل", plateDigits: "3048", chassis: "1GYS4BKL6NR254913", make: "Cadillac", model: "Escalade", year: 2022, color: "فضي" } },
];
const cars: string[] = [];
for (const x of CARS) {
  const c = await eng("POST", "/customers", { ...x.c, whatsapp: x.c.mobile });
  cars.push((await eng("POST", "/vehicles", { customerId: c.id, ...x.v })).id);
}

// The real statement 9309: a delivered visit for the Grand Cherokee.
const wo1 = await eng("POST", "/work-orders", { id: uuidv7(), vehicleId: cars[0], odometerIn: 112640, complaint: "صيانة دورية + تسريب مياه من الرادياتير.", repairType: "PM", booking: "booked", fuelLevel: 2, belongings: ["موبايل", "استبن"], technicianIds: [tech("حسن عبد الله")] });
for (const [b, q] of [["L-1001", 1], ["JC000053", 7], ["JC000201", 1], ["JC000215", 1], ["JC000450", 1], ["JC000441", 1], ["JC000101", 1], ["JC000513", 1], ["M-0140", 1]] as [string, number][])
  await eng("POST", `/work-orders/${wo1.id}/lines`, { variantId: await variant(b), qtyMilli: qty(q), technicianId: tech("حسن عبد الله") });
await eng("POST", "/statements", {
  id: uuidv7(), workOrderId: wo1.id, notDone: "يحتاج تغيير مساعدين خلفي قريبًا. العميل أجّل.",
  discounts: { labor: { mode: "amount", valuePt: egp(450) }, part: { mode: "amount", valuePt: egp(400) } },
  payments: [{ methodId: "cash", amountPt: egp(8000) }, { methodId: "card", amountPt: egp(5000), reference: "004512" }],
});

// Cars in the shop now.
const wo2 = await eng("POST", "/work-orders", { id: uuidv7(), vehicleId: cars[1], odometerIn: 73900, complaint: "لمبة Check Engine منورة + تهريب زيت من أسفل المحرك.", faultType: "تهريب زيت", booking: "booked", fuelLevel: 2, belongings: ["إريال راديو", "استبن", "ولاعة سجاير"], estimatePt: egp(9000), technicianIds: [tech("حسن عبد الله"), tech("عمرو جمال")], marks: [{ x: 220, y: 300, kind: "scratch", note: "خدوش بالرفرف الأمامي شمال" }, { x: 520, y: 880, kind: "dent", note: "دقة صغيرة بالصدام الخلفي" }] });
await eng("POST", `/work-orders/${wo2.id}/lines`, { variantId: await variant("L-1050"), qtyMilli: qty(1), technicianId: tech("عمرو جمال") });
await eng("POST", `/work-orders/${wo2.id}/lines`, { variantId: await variant("JC000215"), qtyMilli: qty(1) });
const wo3 = await eng2("POST", "/work-orders", { id: uuidv7(), vehicleId: cars[2], odometerIn: 96350, complaint: "تغيير تيل وطنابير أمامي. اهتزاز في الدركسيون عند الفرملة.", fuelLevel: 2, belongings: ["موبايل", "عدة"], estimatePt: egp(16000), technicianIds: [tech("حسن عبد الله")] });
for (const [b, q] of [["L-1022", 1], ["L-1102", 1], ["JC000310", 1], ["JC000312", 2]] as [string, number][]) await eng2("POST", `/work-orders/${wo3.id}/lines`, { variantId: await variant(b), qtyMilli: qty(q), technicianId: tech("حسن عبد الله") });
await eng2("PATCH", `/work-orders/${wo3.id}`, { status: "ready" });
const wo4 = await eng("POST", "/work-orders", { id: uuidv7(), vehicleId: cars[3], odometerIn: 58420, complaint: "التكييف لا يبرد جيدًا + صيانة دورية.", repairType: "PM", fuelLevel: 2, estimatePt: egp(4500), technicianIds: [tech("مصطفى فتحي")] });
await eng("POST", `/work-orders/${wo4.id}/lines`, { variantId: await variant("L-1080"), qtyMilli: qty(1), technicianId: tech("مصطفى فتحي") });
await eng("POST", `/work-orders/${wo4.id}/lines`, { variantId: await variant("JC000513"), qtyMilli: qty(1) });
await eng2("POST", "/work-orders", { id: uuidv7(), vehicleId: cars[5], odometerIn: 41250, type: "inquiry", complaint: "صوت طقطقة من العفشة الأمامية عند المطبات. يريد عرض سعر قبل البدء.", fuelLevel: 3 });

await admin("POST", "/cash/open", { openingPt: egp(2000) });
const cat = await admin("POST", "/expense-categories", { name: "بنزين ونقل قطع" });
await admin("POST", "/expense-categories", { name: "وجبات العمال" });
await admin("POST", "/expenses", { categoryId: cat.id, amountPt: egp(350), paidBy: "أحمد الطنطاوي" });
console.log("Demo data loaded. Log in as ahmed (admin) or mahmoud / karim (engineers) with DEMO_PASSWORD.");
await app.close();
await close();
