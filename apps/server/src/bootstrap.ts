/** First-run defaults. Every value here is editable later in Settings; none is a business rule in code. */
import { count, eq } from "drizzle-orm";
import { uuidv7 } from "@jc/core";
import type { Db } from "./db/client";
import { paymentMethods, plateTypes, settings, users, warehouses } from "./db/schema";
import { hashPassword } from "./auth/auth";
import { ensureSeries } from "./modules/numbering";

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  "shop.nameAr": "جيب سيتي – الطنطاوي يو إس إيه",
  "shop.nameEn": "Jeep City – El Tantawy USA",
  "shop.address": "الرحاب، السوق الشرقي، القاهرة الجديدة",
  "shop.phones": [],
  "print.ack": "تم استلام السيارة بحالة جيدة و تم عمل الأصلاحات المطلوبة",
  "print.jobCardTerms": "",
  "discounts.categories": ["labor", "part"],
  "vat": { enabled: false, rateBp: {} },
  "session.idleMinutes": 15,
  "display.digits": "latn",
  "stock.defaultMinMilli": 2000,
  "workshop.longStayDays": 3,
  "numbers.deviceBlockSize": 20,
  "alerts.debtDays": 30,
  // Condition report (4c): the checks a new report starts with.
  "condition.checklist": [
    { system: "المحرك", item: "تهريب زيت" },
    { system: "المحرك", item: "مستوى الزيت" },
    { system: "المحرك", item: "سيور المحرك" },
    { system: "المحرك", item: "قواعد المحرك" },
    { system: "الفرامل", item: "تيل أمامي" },
    { system: "الفرامل", item: "تيل خلفي" },
    { system: "الفرامل", item: "طنابير" },
    { system: "الفرامل", item: "زيت الفرامل" },
    { system: "العفشة", item: "مساعدين أمامي" },
    { system: "العفشة", item: "مساعدين خلفي" },
    { system: "العفشة", item: "جلب المقصات" },
    { system: "العفشة", item: "بلي العجل" },
    { system: "التوجيه", item: "علبة الدريكسيون" },
    { system: "التوجيه", item: "أطراف الدريكسيون" },
    { system: "الإطارات", item: "حالة الإطارات" },
    { system: "الإطارات", item: "الاستبن" },
    { system: "السوائل", item: "مياه الرادياتير" },
    { system: "السوائل", item: "زيت الفتيس" },
    { system: "السوائل", item: "زيت الباور" },
    { system: "البطارية", item: "البطارية" },
    { system: "الكهرباء", item: "الإضاءة الخارجية" },
    { system: "الكهرباء", item: "الإضاءة الداخلية" },
    { system: "الكهرباء", item: "المساحات" },
    { system: "التكييف", item: "كفاءة التكييف" },
    { system: "التكييف", item: "فلتر التكييف" },
  ],
  "share.days": 30,
  // Public address of the server for QR status links (the VPS, Phase 6). Empty = this PC's own address.
  "share.baseUrl": "",
  // One-click WhatsApp texts (wa.me). Placeholders: {الاسم} {السيارة} {رقم_الأمر} {الموعد}
  "whatsapp.templates": [
    { id: "received", label: "تم استلام السيارة", text: "أهلًا {الاسم}، استلمنا {السيارة} في Jeep City. رقم أمر الشغل {رقم_الأمر}. هنبلغك أول ما نخلص الكشف." },
    { id: "estimate", label: "التكلفة محتاجة موافقة", text: "أهلًا {الاسم}، تكلفة إصلاح {السيارة} زادت عن التقدير. ممكن تتواصل معانا للموافقة؟" },
    { id: "ready", label: "السيارة جاهزة للاستلام", text: "أهلًا {الاسم}، {السيارة} جاهزة للاستلام من Jeep City الرحاب." },
    { id: "thanks", label: "شكرًا لزيارتك", text: "شكرًا {الاسم} لزيارتك Jeep City. نتمنى لك طريق آمن." },
    { id: "reminder", label: "تذكير بالصيانة", text: "أهلًا {الاسم}، ميعاد الصيانة القادمة لـ {السيارة} {الموعد}. احجز معانا في Jeep City الرحاب." },
  ],
};

// D-43: order to be finalized with Aslam; editable in Settings.
const PAYMENT_METHODS = [
  { id: "cash", label: "كاش", needsReference: false, isCredit: false, isCash: true, sort: 1 },
  { id: "instapay", label: "إنستا باي", needsReference: true, isCredit: false, isCash: false, sort: 2 },
  { id: "vodafone_cash", label: "فودافون كاش", needsReference: true, isCredit: false, isCash: false, sort: 3 },
  { id: "card", label: "فيزا", needsReference: true, isCredit: false, isCash: false, sort: 4 },
  { id: "credit", label: "آجل", needsReference: false, isCredit: true, isCash: false, sort: 5 },
];

// D-69: colors from the shop's description; no taxi type. Government and military styles wait for confirmation.
const LIGHT_BLUE = "#8DC2EC", DARK_BLUE = "#1F3A93", YELLOW = "#F2C200", BLACK = "#0B0B0B", WHITE = "#FFFFFF";
const PLATE_TYPES = [
  { id: "private", label: "ملاكي", barColor: LIGHT_BLUE, textColor: BLACK },
  { id: "transport", label: "نقل", barColor: "#D9372B", textColor: BLACK },
  { id: "bus", label: "أتوبيس / حكومة", barColor: "#9A9A9A", textColor: BLACK },
  { id: "limousine", label: "ليموزين وسياحة", barColor: "#E3D3AE", textColor: BLACK },
  { id: "diplomatic", label: "دبلوماسي", barColor: "#2E8B57", textColor: BLACK, digitsOnly: true },
  { id: "customs", label: "جمارك / مؤقت / ترانزيت", barColor: YELLOW, textColor: BLACK },
  { id: "free_zone", label: "منطقة حرة (بورسعيد)", barColor: YELLOW, textColor: BLACK },
  { id: "police", label: "شرطة", barColor: DARK_BLUE, textColor: WHITE },
  { id: "motorcycle", label: "دراجة نارية", barColor: LIGHT_BLUE, textColor: BLACK, small: true },
  { id: "police_motorcycle", label: "دراجة نارية شرطة", barColor: DARK_BLUE, textColor: WHITE, small: true },
  { id: "old_white", label: "لوحة قديمة (بيضاء)", barColor: WHITE, textColor: BLACK, active: false },
  { id: "government", label: "حكومي", barColor: null, textColor: BLACK, toConfirm: true, active: false },
  { id: "military", label: "قوات مسلحة", barColor: null, textColor: BLACK, toConfirm: true, active: false },
].map((t, i) => ({ ...t, sort: i + 1 }));

export async function bootstrap(db: Db, opts: { workOrderStart?: number; statementStart?: number } = {}) {
  const [{ n }] = await db.select({ n: count() }).from(warehouses);
  if (!n) await db.insert(warehouses).values({ id: uuidv7(), name: "المخزن الرئيسي" });
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) await db.insert(settings).values({ key, value }).onConflictDoNothing();
  // Identity of this database: a PC that synced with another one (demo, restore, import) drops its local copy.
  await db.insert(settings).values({ key: "system.dbId", value: uuidv7() }).onConflictDoNothing();
  for (const m of PAYMENT_METHODS) await db.insert(paymentMethods).values(m).onConflictDoNothing();
  for (const t of PLATE_TYPES) await db.insert(plateTypes).values(t).onConflictDoNothing();
  await ensureSeries(db, "work_order", opts.workOrderStart ?? 13548);
  await ensureSeries(db, "statement", opts.statementStart ?? 9309);
  await ensureSeries(db, "direct_sale", 400);
  await ensureSeries(db, "purchase", 1180);
  await ensureSeries(db, "purchase_return", 1);
  await ensureSeries(db, "sales_return", 1);
}

export async function createUser(db: Db, u: { username: string; displayName: string; role: "admin" | "engineer"; password: string }) {
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.username, u.username.toLowerCase()));
  if (exists) return exists.id;
  const id = uuidv7();
  await db.insert(users).values({ id, username: u.username.toLowerCase(), displayName: u.displayName, role: u.role, passwordHash: await hashPassword(u.password) });
  return id;
}
