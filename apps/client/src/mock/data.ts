// Synthetic prototype data (Phase 1). No real customers, items or suppliers yet: the YAZSYS export comes later.
// Money is in piasters, as the real system will store it (D-07).
import type { Grade } from "@jc/ui";

export const egp = (pounds: number) => Math.round(pounds * 100);

export type Role = "admin" | "engineer";
export type User = { id: string; name: string; username: string; role: Role };
export const users: User[] = [
  { id: "u1", name: "أحمد الطنطاوي", username: "ahmed", role: "admin" },
  { id: "u2", name: "محمود سمير", username: "mahmoud", role: "engineer" },
  { id: "u3", name: "كريم عادل", username: "karim", role: "engineer" },
];
export const technicians = ["حسن عبد الله", "سيد رمضان", "مصطفى فتحي", "عمرو جمال"];

export type Customer = {
  id: string; name: string; mobile: string; office?: string; whatsapp: string; governorate: string; address: string;
  notes?: string; internalNotes?: string; balancePt: number; since: string;
};
export const customers: Customer[] = [
  { id: "c1", name: "خالد إبراهيم المصري", mobile: "0100 234 5678", whatsapp: "0100 234 5678", governorate: "القاهرة", address: "الرحاب، المرحلة الرابعة، مجموعة 112", balancePt: 0, since: "2023-03-14", internalNotes: "يفضل قطع أصلي دائمًا. يتصل قبل الاستلام." },
  { id: "c2", name: "شركة النيل للمقاولات", mobile: "0122 870 4411", office: "02 2614 7788", whatsapp: "0122-870-4411", governorate: "القاهرة", address: "التجمع الخامس، شارع التسعين", balancePt: egp(18500), since: "2022-11-02", notes: "أسطول 4 سيارات. الدفع آجل بموافقة الإدارة." },
  { id: "c3", name: "هشام عبد الرحمن", mobile: "0111 905 3320", whatsapp: "01119053320", governorate: "القاهرة", address: "مدينتي، B6", balancePt: 0, since: "2024-06-21" },
  { id: "c4", name: "منى السيد", mobile: "0155 412 7809", whatsapp: "+20 155 412 7809", governorate: "الجيزة", address: "الشيخ زايد، الحي 16", balancePt: 0, since: "2025-01-09" },
  { id: "c5", name: "طارق فوزي", mobile: "0101 667 2290", whatsapp: "01016672290", governorate: "القاهرة", address: "الرحاب، المرحلة الأولى", balancePt: egp(2750), since: "2021-08-30" },
  { id: "c6", name: "ياسر الشريف", mobile: "0127 334 9081", whatsapp: "01273349081", governorate: "القاهرة", address: "القاهرة الجديدة، اللوتس", balancePt: 0, since: "2025-09-12" },
];

export type Vehicle = {
  id: string; customerId: string; letters: string; digits: string; chassis: string; make: string; model: string;
  code?: string; year: number; color: string; engine: string; licenseNo: string;
};
export const vehicles: Vehicle[] = [
  { id: "v1", customerId: "c1", letters: "ل ف و", digits: "281", chassis: "1C4RJFAG5FC625874", make: "Jeep", model: "Grand Cherokee", code: "WK2", year: 2015, color: "أسود", engine: "3.6L V6", licenseNo: "2817364" },
  { id: "v2", customerId: "c2", letters: "س ط ج", digits: "4127", chassis: "1C4HJXEG2LW213659", make: "Jeep", model: "Wrangler", code: "JL", year: 2020, color: "أبيض", engine: "3.6L V6", licenseNo: "4127730" },
  { id: "v3", customerId: "c3", letters: "ر أ ب", digits: "9035", chassis: "2C3CDXCT8JH157420", make: "Dodge", model: "Charger", code: "LD", year: 2018, color: "رمادي", engine: "5.7L HEMI", licenseNo: "9035112" },
  { id: "v4", customerId: "c4", letters: "م ن ق", digits: "762", chassis: "1FM5K8GC1MGA41875", make: "Ford", model: "Explorer", year: 2021, color: "أزرق", engine: "2.3L EcoBoost", licenseNo: "7620581" },
  { id: "v5", customerId: "c5", letters: "ع ص د", digits: "5519", chassis: "1GNSKCKD4PR108236", make: "Chevrolet", model: "Tahoe", year: 2023, color: "أسود", engine: "5.3L V8", licenseNo: "5519046" },
  { id: "v6", customerId: "c6", letters: "ه ط ل", digits: "3048", chassis: "1GYS4BKL6NR254913", make: "Cadillac", model: "Escalade", year: 2022, color: "فضي", engine: "6.2L V8", licenseNo: "3048297" },
  { id: "v7", customerId: "c2", letters: "ب و س", digits: "1290", chassis: "1GKS2CKJ7KR301572", make: "GMC", model: "Yukon", year: 2019, color: "أسود", engine: "5.3L V8", licenseNo: "1290884" },
  { id: "v8", customerId: "c1", letters: "ق ر ع", digits: "688", chassis: "1C4PJMDX3HD210487", make: "Jeep", model: "Cherokee", code: "KL", year: 2017, color: "أحمر", engine: "3.2L V6", licenseNo: "6880413" },
];

export type ItemType = "part" | "oil" | "material" | "labor";
export const TYPE_LABEL: Record<ItemType, string> = { part: "قطع غيار", oil: "زيوت", material: "خامات", labor: "مصنعيات" };
export type Variant = { grade?: Grade; pricePt: number; costPt: number; stock: number; min: number; barcode: string };
export type Item = { id: string; code: string; name: string; nameEn?: string; type: ItemType; unit: string; category: string; location?: string; fits?: string; variants: Variant[] };

export const items: Item[] = [
  { id: "i1", code: "P-2201", name: "فلتر زيت", nameEn: "Oil filter 68191349AA", type: "part", unit: "قطعة", category: "فلاتر", location: "A-03", fits: "WK2 · JL 3.6", variants: [
    { grade: "original", pricePt: egp(850), costPt: egp(610), stock: 14, min: 6, barcode: "JC000201" },
    { grade: "copy", pricePt: egp(420), costPt: egp(260), stock: 22, min: 8, barcode: "JC000202" } ] },
  { id: "i2", code: "P-2215", name: "جوان خرطوشة زيت", nameEn: "Oil cooler gasket", type: "part", unit: "قطعة", category: "جوانات", location: "A-07", fits: "WK2 3.6", variants: [
    { grade: "original", pricePt: egp(1850), costPt: egp(1320), stock: 3, min: 4, barcode: "JC000215" },
    { grade: "copy", pricePt: egp(900), costPt: egp(560), stock: 6, min: 4, barcode: "JC000216" } ] },
  { id: "i3", code: "P-3104", name: "طقم تيل فرامل أمامي", nameEn: "Front brake pads", type: "part", unit: "طقم", category: "فرامل", location: "B-01", fits: "WK2", variants: [
    { grade: "original", pricePt: egp(4800), costPt: egp(3650), stock: 4, min: 2, barcode: "JC000310" },
    { grade: "copy", pricePt: egp(2400), costPt: egp(1500), stock: 9, min: 3, barcode: "JC000311" } ] },
  { id: "i4", code: "P-3120", name: "طنبورة فرامل أمامي", nameEn: "Front brake rotor", type: "part", unit: "قطعة", category: "فرامل", location: "B-02", fits: "WK2", variants: [
    { grade: "original", pricePt: egp(6500), costPt: egp(4900), stock: 2, min: 2, barcode: "JC000312" },
    { grade: "used", pricePt: egp(2800), costPt: egp(1400), stock: 1, min: 0, barcode: "JC000313" } ] },
  { id: "i5", code: "P-4410", name: "غطاء رادياتير", nameEn: "Radiator cap", type: "part", unit: "قطعة", category: "تبريد", location: "C-04", fits: "WK2 · KL", variants: [
    { grade: "original", pricePt: egp(2000), costPt: egp(1450), stock: 5, min: 2, barcode: "JC000441" },
    { grade: "copy", pricePt: egp(750), costPt: egp(430), stock: 0, min: 3, barcode: "JC000442" } ] },
  { id: "i6", code: "P-4502", name: "خرطوم سيليكون رادياتير", nameEn: "Silicone radiator hose", type: "part", unit: "قطعة", category: "تبريد", location: "C-06", variants: [
    { grade: "copy", pricePt: egp(300), costPt: egp(160), stock: 11, min: 4, barcode: "JC000450" } ] },
  { id: "i7", code: "P-5120", name: "فلتر تكييف", nameEn: "Cabin A/C filter", type: "part", unit: "قطعة", category: "فلاتر", location: "A-05", fits: "WK2 · JL", variants: [
    { grade: "original", pricePt: egp(1100), costPt: egp(790), stock: 7, min: 3, barcode: "JC000512" },
    { grade: "copy", pricePt: egp(650), costPt: egp(380), stock: 18, min: 5, barcode: "JC000513" } ] },
  { id: "i8", code: "P-7300", name: "كمبروسر تكييف", nameEn: "A/C compressor", type: "part", unit: "قطعة", category: "تكييف", location: "D-01", fits: "WK2 3.6", variants: [
    { grade: "original", pricePt: egp(32000), costPt: egp(26500), stock: 0, min: 1, barcode: "JC000730" },
    { grade: "used", pricePt: egp(9500), costPt: egp(5000), stock: 1, min: 0, barcode: "JC000731" } ] },
  { id: "i9", code: "O-0530", name: "زيت محرك MOPAR 5W-30", nameEn: "MOPAR 5W-30", type: "oil", unit: "لتر", category: "زيت محرك", location: "زيوت-1", variants: [
    { pricePt: egp(750), costPt: egp(560), stock: 64.5, min: 20, barcode: "JC000053" } ] },
  { id: "i10", code: "O-0040", name: "زيت Pennzoil Ultra Platinum 0W-40", nameEn: "Pennzoil 0W-40", type: "oil", unit: "لتر", category: "زيت محرك", location: "زيوت-2", variants: [
    { pricePt: egp(980), costPt: egp(745), stock: 12, min: 20, barcode: "JC000004" } ] },
  { id: "i11", code: "O-1200", name: "زيت فتيس ATF+4", nameEn: "ATF+4", type: "oil", unit: "لتر", category: "زيت فتيس", location: "زيوت-3", variants: [
    { pricePt: egp(620), costPt: egp(455), stock: 28, min: 10, barcode: "JC000120" } ] },
  { id: "i12", code: "M-0101", name: "سائل مساحات", type: "material", unit: "عبوة", category: "سوائل", location: "E-02", variants: [
    { pricePt: egp(300), costPt: egp(170), stock: 40, min: 10, barcode: "JC000101" } ] },
  { id: "i13", code: "M-0140", name: "لحام", type: "material", unit: "خدمة", category: "خامات ورشة", variants: [
    { pricePt: egp(150), costPt: egp(60), stock: 999, min: 0, barcode: "JC000140" } ] },
  { id: "i14", code: "L-1001", name: "صيانة دورية شاملة وكشف كمبيوتر", type: "labor", unit: "عملية", category: "صيانة دورية", variants: [{ pricePt: egp(2500), costPt: 0, stock: 0, min: 0, barcode: "" }] },
  { id: "i15", code: "L-1010", name: "تغيير زيت وفلتر", type: "labor", unit: "عملية", category: "صيانة دورية", variants: [{ pricePt: egp(350), costPt: 0, stock: 0, min: 0, barcode: "" }] },
  { id: "i16", code: "L-1022", name: "تغيير تيل فرامل أمامي", type: "labor", unit: "عملية", category: "فرامل", variants: [{ pricePt: egp(600), costPt: 0, stock: 0, min: 0, barcode: "" }] },
  { id: "i17", code: "L-1050", name: "كشف كمبيوتر", type: "labor", unit: "ساعة", category: "كهرباء", variants: [{ pricePt: egp(500), costPt: 0, stock: 0, min: 0, barcode: "" }] },
  { id: "i18", code: "L-1080", name: "شحن فريون تكييف", type: "labor", unit: "عملية", category: "تكييف", variants: [{ pricePt: egp(900), costPt: 0, stock: 0, min: 0, barcode: "" }] },
  { id: "i19", code: "L-1102", name: "تغيير طنابير فرامل أمامي", type: "labor", unit: "عملية", category: "فرامل", variants: [{ pricePt: egp(800), costPt: 0, stock: 0, min: 0, barcode: "" }] },
];
export const itemById = (id: string) => items.find((i) => i.id === id)!;
export const isLow = (v: Variant) => v.min > 0 && v.stock <= v.min;
export const lowStock = items.flatMap((i) => i.variants.filter(isLow).map((v) => ({ item: i, variant: v })));

export const packages = [
  { id: "pk1", name: "تغيير زيت WK2", lines: [{ itemId: "i15", qty: 1 }, { itemId: "i9", qty: 6 }, { itemId: "i1", qty: 1, grade: "original" as Grade }] },
  { id: "pk2", name: "فرامل أمامي كاملة", lines: [{ itemId: "i16", qty: 1 }, { itemId: "i3", qty: 1, grade: "original" as Grade }] },
  { id: "pk3", name: "صيانة تكييف", lines: [{ itemId: "i18", qty: 1 }, { itemId: "i7", qty: 1, grade: "copy" as Grade }] },
];

export type Line = {
  id: string; itemId: string; code: string; name: string; type: ItemType; grade?: Grade; qty: number; unit: string;
  pricePt: number; tech?: string; finishedAt?: string;
  /** totals category; defaults to the item type (D-08). The real-statement fixture enters oil and materials as parts. */
  cat?: ItemType;
};
export const line = (id: string, itemId: string, qty: number, grade?: Grade, extra: Partial<Line> = {}): Line => {
  const it = itemById(itemId);
  const v = it.variants.find((x) => x.grade === grade) ?? it.variants[0];
  return { id, itemId, code: it.code, name: it.name, type: it.type, grade: v.grade, qty, unit: it.unit, pricePt: v.pricePt, ...extra };
};

export type WOStatus = "open" | "ready" | "delivered";
export const WO_STATUS: Record<WOStatus, { label: string; tone: "work" | "ok" | "neutral" }> = {
  open: { label: "جاري الشغل", tone: "work" },
  ready: { label: "جاهز للتسليم", tone: "ok" },
  delivered: { label: "تم التسليم", tone: "neutral" },
};
export type WOType = "repair" | "inquiry" | "condition";
export const WO_TYPE: Record<WOType, string> = { repair: "عميل", inquiry: "استعلام", condition: "تقرير حالة" };

export type Mark = { id: number; x: number; y: number; kind: "scratch" | "dent" | "damage"; note: string; photo?: boolean };
export type WorkOrder = {
  id: string; number: number; vehicleId: string; customerId: string; type: WOType; status: WOStatus; engineerId: string;
  technicians: string[]; enteredAt: string; expectedAt?: string; odometer: number; prevOdometer?: number; complaint: string;
  faultType?: string; repairType?: string; booking: "booked" | "walk_in"; comeback?: boolean; fuel: 1 | 2 | 3 | 4;
  belongings: string[]; marks: Mark[]; estimatePt?: number; engineerNotes?: string; customerNotes?: string;
  lines: Line[]; statementNo?: number; photos: number;
};

export const workOrders: WorkOrder[] = [
  { id: "w13556", number: 13556, vehicleId: "v6", customerId: "c6", type: "inquiry", status: "open", engineerId: "u3", technicians: [], enteredAt: "2026-10-30T11:40:00", odometer: 41250, prevOdometer: 36100, complaint: "صوت طقطقة من العفشة الأمامية عند المطبات. يريد عرض سعر قبل البدء.", booking: "walk_in", fuel: 3, belongings: ["موبايل"], marks: [], photos: 2, lines: [line("l1", "i17", 1)] },
  { id: "w13555", number: 13555, vehicleId: "v4", customerId: "c4", type: "repair", status: "open", engineerId: "u2", technicians: ["مصطفى فتحي"], enteredAt: "2026-10-30T10:05:00", expectedAt: "2026-10-30T17:00:00", odometer: 58420, prevOdometer: 52880, complaint: "التكييف لا يبرد جيدًا + صيانة دورية.", repairType: "PM", booking: "booked", fuel: 2, belongings: ["إريال راديو", "استبن"], marks: [{ id: 1, x: 70, y: 22, kind: "scratch", note: "خدش خفيف بالصدام الأمامي يمين" }], photos: 4, estimatePt: egp(4500), lines: [line("l1", "i18", 1, undefined, { tech: "مصطفى فتحي" }), line("l2", "i7", 1, "copy")] },
  { id: "w13554", number: 13554, vehicleId: "v5", customerId: "c5", type: "condition", status: "open", engineerId: "u2", technicians: ["سيد رمضان"], enteredAt: "2026-10-30T09:20:00", odometer: 22180, prevOdometer: 15020, complaint: "فحص شامل قبل السفر.", booking: "booked", fuel: 4, belongings: [], marks: [], photos: 3, lines: [line("l1", "i17", 1, undefined, { tech: "سيد رمضان" })] },
  { id: "w13553", number: 13553, vehicleId: "v3", customerId: "c3", type: "repair", status: "ready", engineerId: "u3", technicians: ["حسن عبد الله"], enteredAt: "2026-10-29T16:30:00", expectedAt: "2026-10-30T13:00:00", odometer: 96350, prevOdometer: 88900, complaint: "تغيير تيل وطنابير أمامي. اهتزاز في الدركسيون عند الفرملة.", booking: "walk_in", fuel: 2, belongings: ["موبايل", "عدة"], marks: [{ id: 1, x: 31, y: 78, kind: "dent", note: "دقة بالباب الخلفي شمال" }], photos: 5, estimatePt: egp(16000),
    lines: [line("l1", "i16", 1, undefined, { tech: "حسن عبد الله", finishedAt: "2026-10-30T12:15:00" }), line("l2", "i19", 1, undefined, { tech: "حسن عبد الله", finishedAt: "2026-10-30T12:40:00" }), line("l3", "i3", 1, "original"), line("l4", "i4", 2, "original")] },
  { id: "w13552", number: 13552, vehicleId: "v2", customerId: "c2", type: "repair", status: "open", engineerId: "u2", technicians: ["حسن عبد الله", "عمرو جمال"], enteredAt: "2026-10-30T09:15:00", expectedAt: "2026-10-31T14:00:00", odometer: 73900, prevOdometer: 67450, complaint: "لمبة Check Engine منورة + تهريب زيت من أسفل المحرك.", faultType: "تهريب زيت", booking: "booked", fuel: 2, belongings: ["إريال راديو", "استبن", "ولاعة سجاير"], marks: [{ id: 1, x: 22, y: 30, kind: "scratch", note: "خدوش بالرفرف الأمامي شمال" }, { id: 2, x: 52, y: 88, kind: "dent", note: "دقة صغيرة بالصدام الخلفي" }], photos: 6, estimatePt: egp(9000),
    lines: [line("l1", "i17", 1, undefined, { tech: "عمرو جمال", finishedAt: "2026-10-30T10:30:00" }), line("l2", "i2", 1, "original")] },
  { id: "w13549", number: 13549, vehicleId: "v7", customerId: "c2", type: "repair", status: "open", engineerId: "u3", technicians: ["سيد رمضان"], enteredAt: "2026-10-26T12:00:00", expectedAt: "2026-10-28T15:00:00", odometer: 128400, prevOdometer: 119800, complaint: "تغيير كمبروسر التكييف. بانتظار وصول القطعة من المورد.", booking: "walk_in", fuel: 1, belongings: ["استبن"], marks: [], photos: 3, estimatePt: egp(36000), engineerNotes: "القطعة الأصلية غير متوفرة. تم طلبها من المؤسسة الأمريكية.", lines: [line("l1", "i17", 1, undefined, { tech: "سيد رمضان" })] },
  // The real statement used as the totals fixture (labor 2500, parts 11350, discount 850, due 13000).
  { id: "w13548", number: 13548, vehicleId: "v1", customerId: "c1", type: "repair", status: "delivered", engineerId: "u2", technicians: ["حسن عبد الله"], enteredAt: "2026-10-28T09:40:00", odometer: 112640, prevOdometer: 104980, complaint: "صيانة دورية + تسريب مياه من الرادياتير.", repairType: "PM", booking: "booked", fuel: 2, belongings: ["موبايل", "استبن"], marks: [], photos: 4, statementNo: 9309,
    lines: [
      line("l1", "i14", 1, undefined, { tech: "حسن عبد الله", finishedAt: "2026-10-28T14:10:00" }),
      line("l2", "i9", 7, undefined, { cat: "part" }), line("l3", "i1", 1, "original"), line("l4", "i2", 1, "original"), line("l5", "i6", 1, "copy"),
      line("l6", "i5", 1, "original"), line("l7", "i12", 1, undefined, { cat: "part" }), line("l8", "i7", 1, "copy"), line("l9", "i13", 1, undefined, { cat: "part" }),
    ] },
];
export const woById = (id: string) => workOrders.find((w) => w.id === id)!;
export const vehicleById = (id: string) => vehicles.find((v) => v.id === id)!;
export const customerById = (id: string) => customers.find((c) => c.id === id)!;
export const userById = (id: string) => users.find((u) => u.id === id)!;
export const inShop = workOrders.filter((w) => w.status !== "delivered");

export type PayMethod = "cash" | "instapay" | "vodafone" | "card" | "credit";
export const PAY_METHODS: { id: PayMethod; label: string; ref: boolean }[] = [
  { id: "cash", label: "كاش", ref: false },
  { id: "instapay", label: "إنستا باي", ref: true },
  { id: "vodafone", label: "فودافون كاش", ref: true },
  { id: "card", label: "فيزا", ref: true },
  { id: "credit", label: "آجل", ref: false },
];

export type Payment = { id: string; method: PayMethod; amountPt: number; ref?: string; at: string };
export type Statement = {
  number: number; woId?: string; customerId: string; vehicleId?: string; date: string; exitAt: string;
  laborDiscPt: number; partsDiscPt: number; duePt: number; payments: Payment[]; status: "final" | "cancelled"; notDone?: string; byId: string;
};
export const statements: Statement[] = [
  { number: 9309, woId: "w13548", customerId: "c1", vehicleId: "v1", date: "2026-10-28", exitAt: "2026-10-28T17:25:00", laborDiscPt: egp(450), partsDiscPt: egp(400), duePt: egp(13000), byId: "u2",
    notDone: "يحتاج تغيير مساعدين خلفي قريبًا. العميل أجّل.", payments: [{ id: "p1", method: "cash", amountPt: egp(8000), at: "2026-10-28T17:20:00" }, { id: "p2", method: "card", amountPt: egp(5000), ref: "004512", at: "2026-10-28T17:21:00" }], status: "final" },
  { number: 9308, customerId: "c4", vehicleId: "v4", date: "2026-10-28", exitAt: "2026-10-28T15:05:00", laborDiscPt: 0, partsDiscPt: 0, duePt: egp(4850), byId: "u3", payments: [{ id: "p1", method: "instapay", amountPt: egp(4850), ref: "IP-77310452", at: "2026-10-28T15:00:00" }], status: "final" },
  { number: 9307, customerId: "c2", vehicleId: "v2", date: "2026-10-27", exitAt: "2026-10-27T18:40:00", laborDiscPt: egp(300), partsDiscPt: egp(1200), duePt: egp(18500), byId: "u2", payments: [{ id: "p1", method: "credit", amountPt: egp(18500), at: "2026-10-27T18:40:00" }], status: "final" },
  { number: 9306, customerId: "c5", vehicleId: "v5", date: "2026-10-27", exitAt: "2026-10-27T13:15:00", laborDiscPt: 0, partsDiscPt: egp(250), duePt: egp(7250), byId: "u3", payments: [{ id: "p1", method: "cash", amountPt: egp(4500), at: "2026-10-27T13:10:00" }, { id: "p2", method: "credit", amountPt: egp(2750), at: "2026-10-27T13:10:00" }], status: "final" },
  { number: 9305, customerId: "c3", vehicleId: "v3", date: "2026-10-26", exitAt: "2026-10-26T16:00:00", laborDiscPt: 0, partsDiscPt: 0, duePt: egp(1350), byId: "u2", payments: [], status: "cancelled" },
  { number: 9304, customerId: "c6", vehicleId: "v6", date: "2026-10-25", exitAt: "2026-10-25T14:30:00", laborDiscPt: egp(200), partsDiscPt: 0, duePt: egp(3600), byId: "u3", payments: [{ id: "p1", method: "vodafone", amountPt: egp(3600), ref: "VF-55120", at: "2026-10-25T14:28:00" }], status: "final" },
  { number: 9303, customerId: "c1", vehicleId: "v8", date: "2026-10-24", exitAt: "2026-10-24T12:10:00", laborDiscPt: 0, partsDiscPt: egp(100), duePt: egp(2950), byId: "u2", payments: [{ id: "p1", method: "cash", amountPt: egp(2950), at: "2026-10-24T12:05:00" }], status: "final" },
];
export const paidPt = (s: Statement) => s.payments.filter((p) => p.method !== "credit").reduce((a, p) => a + p.amountPt, 0);

export type Supplier = { id: string; name: string; contact: string; phone: string; whatsapp: string; address: string; balancePt: number; lastPurchase: string; category: string };
export const suppliers: Supplier[] = [
  { id: "s1", name: "المؤسسة الأمريكية لقطع الغيار", contact: "عادل منير", phone: "0122 345 6789", whatsapp: "0122-345-6789", address: "التوفيقية، وسط البلد", balancePt: egp(42300), lastPurchase: "2026-10-27", category: "قطع أصلي" },
  { id: "s2", name: "موبار مصر – الموزع", contact: "شريف حمدي", phone: "0100 777 2154", whatsapp: "01007772154", address: "مدينة نصر، المنطقة الثامنة", balancePt: egp(15600), lastPurchase: "2026-10-22", category: "زيوت" },
  { id: "s3", name: "الشريف لزيوت السيارات", contact: "محمد الشريف", phone: "0111 248 9930", whatsapp: "+20 111 248 9930", address: "عين شمس", balancePt: 0, lastPurchase: "2026-10-15", category: "زيوت" },
  { id: "s4", name: "مستعمل المعادي", contact: "رامي فؤاد", phone: "0155 019 6672", whatsapp: "0155 019 6672", address: "المعادي، شارع 9", balancePt: egp(6000), lastPurchase: "2026-10-19", category: "قطع مستعمل" },
  { id: "s5", name: "النور للفلاتر والكوبي", contact: "أيمن نور", phone: "02 2590 4417", whatsapp: "", address: "شارع الجيش، العباسية", balancePt: egp(3250), lastPurchase: "2026-10-10", category: "قطع كوبي" },
];

export const supplierLedger = [
  { date: "2026-10-01", desc: "رصيد افتتاحي", ref: "", debitPt: 0, creditPt: egp(18000) },
  { date: "2026-10-08", desc: "فاتورة مشتريات", ref: "م-1182", debitPt: 0, creditPt: egp(26400) },
  { date: "2026-10-12", desc: "دفعة نقدية", ref: "ص-0412", debitPt: egp(20000), creditPt: 0 },
  { date: "2026-10-19", desc: "مرتجع مشتريات", ref: "مر-0031", debitPt: egp(2100), creditPt: 0 },
  { date: "2026-10-27", desc: "فاتورة مشتريات", ref: "م-1197", debitPt: 0, creditPt: egp(20000) },
];

export const cashSession = {
  openedAt: "2026-10-30T08:55:00", openedBy: "u1", openingPt: egp(2000),
  moves: [
    { at: "2026-10-30T09:40:00", kind: "in", desc: "تحصيل مديونية – شركة النيل للمقاولات", ref: "تح-0218", amountPt: egp(5000), by: "u1" },
    { at: "2026-10-30T10:10:00", kind: "out", desc: "مصروف: بنزين ونقل قطع", ref: "مص-0733", amountPt: egp(350), by: "u1" },
    { at: "2026-10-30T11:05:00", kind: "in", desc: "بيان 9310 – منى السيد", ref: "9310", amountPt: egp(3200), by: "u2" },
    { at: "2026-10-30T12:30:00", kind: "out", desc: "دفعة لمورد – المؤسسة الأمريكية", ref: "ص-0419", amountPt: egp(6000), by: "u1" },
    { at: "2026-10-30T13:15:00", kind: "out", desc: "مصروف: وجبات العمال", ref: "مص-0734", amountPt: egp(420), by: "u1" },
    { at: "2026-10-30T13:50:00", kind: "in", desc: "بيع مباشر 412 – سائل مساحات × 2", ref: "ب-412", amountPt: egp(600), by: "u3" },
  ],
};
export const cashHistory = [
  { date: "2026-10-29", openingPt: egp(2000), inPt: egp(21450), outPt: egp(8900), countedPt: egp(14550), diffPt: 0 },
  { date: "2026-10-28", openingPt: egp(2000), inPt: egp(13000), outPt: egp(4200), countedPt: egp(10700), diffPt: egp(-100) },
  { date: "2026-10-27", openingPt: egp(2000), inPt: egp(9750), outPt: egp(3100), countedPt: egp(8650), diffPt: 0 },
  { date: "2026-10-26", openingPt: egp(2000), inPt: egp(6400), outPt: egp(1250), countedPt: egp(7200), diffPt: egp(50) },
];

// Daily sales, October 2026 (synthetic): labor / parts / oils in pounds.
export const dailySales = Array.from({ length: 30 }, (_, i) => {
  const day = i + 1;
  const dow = new Date(2026, 9, day).getDay(); // 5 = Friday, the shop's quiet day
  const k = dow === 5 ? 0.25 : 0.7 + ((day * 37) % 11) / 10;
  return { date: `2026-10-${String(day).padStart(2, "0")}`, labor: Math.round(5200 * k), parts: Math.round(11800 * k), oils: Math.round(3900 * k), count: Math.max(1, Math.round(6 * k)) };
});

export type Check = { system: string; item: string; status: "good" | "watch" | "urgent"; note?: string; recommend?: { text: string; pricePt: number } };
export const conditionReport: Check[] = [
  { system: "المحرك", item: "تهريب زيت", status: "good" },
  { system: "المحرك", item: "سيور المحرك", status: "watch", note: "تشققات خفيفة بسير المكيف", recommend: { text: "تغيير سير المكيف", pricePt: egp(1650) } },
  { system: "المحرك", item: "قواعد المحرك", status: "good" },
  { system: "الفرامل", item: "تيل أمامي", status: "urgent", note: "السمك المتبقي 2 مم", recommend: { text: "تغيير تيل فرامل أمامي أصلي", pricePt: egp(5400) } },
  { system: "الفرامل", item: "تيل خلفي", status: "good", note: "السمك 7 مم" },
  { system: "الفرامل", item: "زيت الفرامل", status: "watch", note: "نسبة رطوبة 2%", recommend: { text: "تغيير زيت الفرامل", pricePt: egp(900) } },
  { system: "العفشة", item: "مساعدين أمامي", status: "good" },
  { system: "العفشة", item: "جلب المقصات", status: "good" },
  { system: "الإطارات", item: "حالة الإطارات", status: "watch", note: "تآكل غير منتظم أمامي – يحتاج ضبط زوايا", recommend: { text: "ضبط زوايا وترصيص", pricePt: egp(750) } },
  { system: "السوائل", item: "مياه الرادياتير", status: "good" },
  { system: "البطارية", item: "البطارية", status: "good", note: "12.6 فولت" },
  { system: "الكهرباء", item: "الإضاءة الخارجية", status: "good" },
  { system: "التكييف", item: "كفاءة التبريد", status: "good", note: "6° عند الفتحة" },
  { system: "الهيكل", item: "الصاج والدهان", status: "good" },
];

export const WORDS: Record<number, string> = {
  9309: "فقط ثلاثة عشر ألف جنيه مصري",
  9308: "فقط أربعة آلاف وثمانمائة وخمسون جنيه مصري",
  9307: "فقط ثمانية عشر ألف وخمسمائة جنيه مصري",
};

export const shop = {
  name: "Jeep City – El Tantawy USA",
  nameAr: "جيب سيتي – الطنطاوي يو إس إيه",
  address: "الرحاب، السوق الشرقي، القاهرة الجديدة",
  phones: "يُضاف من الإعدادات",
  ack: "تم استلام السيارة بحالة جيدة و تم عمل الأصلاحات المطلوبة",
};
