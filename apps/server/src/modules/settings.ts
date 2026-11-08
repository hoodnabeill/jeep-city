/** Shop settings: the first-run defaults, and one reader that falls back to them. */
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { settings } from "../db/schema";

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
  "workshop.longStayDays": 3,
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

export async function getSetting<T = unknown>(db: Db, key: string): Promise<T> {
  const [r] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
  return (r?.value ?? DEFAULT_SETTINGS[key]) as T;
}
