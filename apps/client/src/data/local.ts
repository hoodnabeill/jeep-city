/**
 * This PC's copy of the shop data (pulled from /sync/pull) and its outbox of writes made while offline (D-28, D-29).
 * Online, screens read the server. Offline, reads come from here, and the counter's writes (receive a car,
 * add or change lines, hand over with a statement) are queued and applied to the local copy at once.
 */
import { normalizePlate, parsePlate, plateKey, searchKey, uuidv7, westernDigits, plateMatches, lookupRank } from "@jc/core";
import { kvClear, kvGet, kvSet } from "./store";
import type { CatalogHit, History, Line, LookupHit, WorkOrder, WorkOrderRow } from "./types";

type Row = Record<string, any>;
export type Mirror = Record<string, Row[]>;
export type Mutation = { id: string; method: "POST" | "PATCH" | "PUT" | "DELETE"; path: string; body?: any; createdAt: string; userId: string; label: string };
export type Failed = Mutation & { message: string };

let mirror: Mirror = {};
let cursor = 0;
let outbox: Mutation[] = [];
let failed: Failed[] = [];
let block: { from: number; to: number; next: number } | null = null;
let loaded: Promise<void> | null = null;

const listeners = new Set<() => void>();
export const onLocalChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const changed = () => listeners.forEach((f) => f());

export function loadLocal() {
  loaded ??= (async () => {
    mirror = (await kvGet<Mirror>("mirror")) ?? {};
    cursor = (await kvGet<number>("cursor")) ?? 0;
    outbox = (await kvGet<Mutation[]>("outbox")) ?? [];
    failed = (await kvGet<Failed[]>("failed")) ?? [];
    block = (await kvGet<typeof block>("numberBlock")) ?? null;
    changed();
  })();
  return loaded;
}

export const getCursor = () => cursor;
const T = (name: string) => (mirror[name] ??= []);
const keyOf = (name: string, r: Row) => (name === "settings" ? r.key : r.id);

/**
 * The server's database is not the one this PC synced with (demo data, a restore, the Byte import): drop the local copy,
 * cached pages and number reserve, and move unsent writes to the failures list so nothing reaches the wrong data.
 * Returns true when the copy was reset and the pull must start again from 0.
 */
export async function adoptDb(dbId: string | undefined) {
  if (!dbId) return false;
  await loadLocal();
  const known = await kvGet<string>("dbId");
  if (known === dbId) return false;
  const reset = !!known || cursor > 0;
  if (reset) {
    failed = [...failed, ...outbox.map((m) => ({ ...m, message: "تغيّرت قاعدة بيانات الخادم، فلم يُرسل هذا التغيير." }))];
    await kvClear();
    mirror = {}; cursor = 0; outbox = []; block = null;
    await kvSet("failed", failed);
  }
  await kvSet("dbId", dbId);
  changed();
  return reset;
}

export async function mergePull(rows: Record<string, Row[]>, nextCursor: number) {
  for (const [name, list] of Object.entries(rows)) {
    if (name === "paymentMethods" || name === "plateTypes") { mirror[name] = list; continue; }
    const byKey = new Map(T(name).map((r) => [keyOf(name, r), r]));
    for (const r of list) byKey.set(keyOf(name, r), r);
    mirror[name] = [...byKey.values()];
  }
  cursor = nextCursor;
  await kvSet("mirror", mirror);
  await kvSet("cursor", cursor);
  changed();
}

export const pending = () => outbox;
export const failures = () => failed;
export async function enqueue(m: Mutation) { outbox.push(m); await kvSet("outbox", outbox); changed(); }
export async function settle(done: string[], rejected: { id: string; message: string }[]) {
  const gone = new Set([...done, ...rejected.map((r) => r.id)]);
  failed.push(...rejected.map((r) => ({ ...outbox.find((m) => m.id === r.id)!, message: r.message })));
  outbox = outbox.filter((m) => !gone.has(m.id));
  await kvSet("outbox", outbox); await kvSet("failed", failed); changed();
}
export async function dismissFailure(id: string) { failed = failed.filter((f) => f.id !== id); await kvSet("failed", failed); changed(); }

/* ---------- Work-order numbers reserved for this PC (D-15) ---------- */
export const blockLeft = () => (block ? block.to - block.next + 1 : 0);
export async function setBlock(from: number, to: number) { block = { from, to, next: from }; await kvSet("numberBlock", block); }
async function takeNumber() {
  if (!block || block.next > block.to) throw new Error("لا يوجد رصيد أرقام أوامر شغل على هذا الجهاز. اتصل بالخادم مرة واحدة ليحجز الجهاز أرقامًا.");
  const n = block.next++;
  await kvSet("numberBlock", block);
  return n;
}

const live = (r: Row) => !r.archivedAt;
const userName = (id?: string | null) => T("users").find((u) => u.id === id)?.displayName ?? null;
const techName = (id?: string | null) => T("technicians").find((t) => t.id === id)?.name ?? null;

function vehicleRow(v: Row) {
  return { id: v.id, plateType: v.plateType ?? "private", plateLetters: v.plateLetters, plateDigits: v.plateDigits, chassis: v.chassis, make: v.make, model: v.model, variant: v.variant, year: v.year };
}

function woRow(w: Row): WorkOrderRow {
  const v = T("vehicles").find((x) => x.id === w.vehicleId);
  const c = T("customers").find((x) => x.id === w.customerId);
  return {
    id: w.id, number: w.number, type: w.type, status: w.status, enteredAt: w.enteredAt, expectedAt: w.expectedAt, complaint: w.complaint, engineerNotes: w.engineerNotes,
    engineerId: w.receptionUserId, engineer: userName(w.receptionUserId), customer: { id: w.customerId, name: c?.name ?? "" }, vehicle: v ? vehicleRow(v) : null,
  };
}

export function buildWorkOrder(id: string): WorkOrder | null {
  const w = T("workOrders").find((x) => x.id === id);
  if (!w) return null;
  const v = T("vehicles").find((x) => x.id === w.vehicleId) ?? null;
  const c = T("customers").find((x) => x.id === w.customerId);
  const st = T("statements").find((s) => s.workOrderId === id && s.status === "final");
  const prev = T("odometerReadings").filter((o) => o.vehicleId === w.vehicleId && o.workOrderId !== id).sort((a, b) => String(b.readAt).localeCompare(String(a.readAt)))[0];
  return {
    ...(w as WorkOrder), ...woRow(w), vehicle: v as WorkOrder["vehicle"],
    customer: { id: w.customerId, name: c?.name ?? "", mobile: c?.mobile ?? null, whatsapp: c?.whatsapp ?? null, internalNotes: c?.internalNotes ?? null },
    technicians: (w.technicianIds ?? []).map((t: string) => ({ id: t, name: techName(t) ?? "" })),
    marks: T("intakeMarks").filter((m) => m.workOrderId === id) as WorkOrder["marks"],
    approvals: T("estimateApprovals").filter((a) => a.workOrderId === id) as WorkOrder["approvals"],
    statement: st ? { id: st.id, number: st.number } : null,
    previousOdometer: prev ? { km: prev.km, at: prev.readAt } : null,
    editable: w.status === "open" || w.status === "ready",
    lines: T("docLines").filter((l) => l.workOrderId === id && live(l)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .map((l) => ({ ...(l as Line), technician: techName(l.technicianId) })),
  };
}

function catalog(q: string, kind?: string | null): CatalogHit[] {
  const text = q.trim(), key = searchKey(text);
  if (!key) return [];
  const items = new Map(T("items").filter((i) => live(i) && i.active).map((i) => [i.id, i]));
  return T("itemVariants").filter((v) => live(v) && v.active && items.has(v.itemId)).map((v) => ({ v, i: items.get(v.itemId)! }))
    .filter(({ i }) => (kind === "labor" ? i.type === "labor" : kind === "parts" ? i.type !== "labor" : true))
    .filter(({ i, v }) => String(i.nameKey).includes(key) || String(i.code).toLowerCase().includes(text.toLowerCase()) || v.barcode === text || String(i.nameEn ?? "").toLowerCase().includes(text.toLowerCase()))
    .slice(0, 20)
    .map(({ i, v }) => ({
      variantId: v.id, itemId: i.id, code: i.code, name: i.nameAr, nameEn: i.nameEn, type: i.type, unit: i.unit, location: i.location, grade: v.grade,
      sellPricePt: v.sellPricePt, trackStock: i.trackStock, qtyMilli: T("stockLevels").find((s) => s.variantId === v.id)?.qtyMilli ?? 0, minQtyMilli: v.minQtyMilli, barcode: v.barcode,
    }));
}

function lookup(q: string): LookupHit[] {
  const text = westernDigits(q).trim(), key = searchKey(text);
  if (key.length < 2) return [];
  const plate = parsePlate(text);
  const customers = new Map(T("customers").map((c) => [c.id, c]));
  return T("vehicles").filter(live).filter((v) => {
    const c = customers.get(v.customerId);
    const ch = String(v.chassis ?? "");
    return ch.includes(text.toUpperCase()) || (text.length >= 8 && ch.length >= 5 && text.toUpperCase().endsWith(ch))
      || (plate && plateMatches(text, { letters: String(v.plateLetters ?? ""), digits: String(v.plateDigits ?? "") }))
      || String(c?.nameKey ?? "").includes(key) || String(c?.mobile ?? "").replace(/\D/g, "").includes(key);
  }).map((v) => ({ v, rank: lookupRank(text, { plateLetters: String(v.plateLetters ?? ""), plateDigits: String(v.plateDigits ?? ""), chassis: String(v.chassis ?? "") }, String(customers.get(v.customerId)?.nameKey ?? "")) }))
    .sort((a, b) => a.rank - b.rank).slice(0, 30).map(({ v }) => {
    const c = customers.get(v.customerId);
    return { vehicle: v as LookupHit["vehicle"], customer: { id: v.customerId, name: c?.name ?? "", mobile: c?.mobile ?? null, whatsapp: c?.whatsapp ?? null } };
  });
}

/** Answer a GET from the local copy, or undefined when this PC has nothing to show. */
export function localGet(path: string): unknown {
  const [p, qs] = path.split("?");
  const q = new URLSearchParams(qs ?? "");
  let m: RegExpMatchArray | null;
  if (p === "/technicians") return T("technicians").filter(live);
  if (p === "/payment-methods") return mirror.paymentMethods;
  if (p === "/plate-types") return mirror.plateTypes;
  if (p === "/users") return T("users").filter((u) => live(u) && u.active).map((u) => ({ id: u.id, displayName: u.displayName, role: u.role, username: u.username, active: u.active }));
  if (p === "/settings") return Object.fromEntries(T("settings").map((s) => [s.key, s.value]));
  if (p === "/packages") return T("servicePackages").filter(live).map((s) => ({ ...s, lines: T("packageLines").filter((l) => l.packageId === s.id) }));
  if (p === "/catalog") return catalog(q.get("q") ?? "", q.get("kind"));
  if (p === "/lookup") return lookup(q.get("q") ?? "");
  if (p === "/work-orders") {
    const s = q.get("status");
    return T("workOrders").filter((w) => !s || (s === "in_shop" ? ["open", "ready"].includes(w.status) : w.status === s))
      .sort((a, b) => String(b.enteredAt).localeCompare(String(a.enteredAt))).slice(0, Number(q.get("limit") ?? 200)).map(woRow);
  }
  if ((m = p.match(/^\/work-orders\/([0-9a-f-]{36})$/))) return buildWorkOrder(m[1]) ?? undefined;
  if ((m = p.match(/^\/vehicles\/([0-9a-f-]{36})\/history$/))) {
    const v = T("vehicles").find((x) => x.id === m![1]);
    if (!v) return undefined;
    const h: History = {
      vehicle: v as History["vehicle"],
      odometer: T("odometerReadings").filter((o) => o.vehicleId === v.id).sort((a, b) => String(b.readAt).localeCompare(String(a.readAt))).map((o) => ({ km: o.km, at: o.readAt, workOrderId: o.workOrderId, overrideReason: o.overrideReason })),
      visits: T("workOrders").filter((w) => w.vehicleId === v.id).sort((a, b) => String(b.enteredAt).localeCompare(String(a.enteredAt))).map((w) => {
        const st = T("statements").find((s) => s.workOrderId === w.id && s.status === "final");
        return {
          workOrder: { id: w.id, number: w.number, type: w.type, status: w.status, enteredAt: w.enteredAt, odometerIn: w.odometerIn, complaint: w.complaint, engineer: userName(w.receptionUserId) },
          lines: T("docLines").filter((l) => l.workOrderId === w.id && live(l)).map((l) => ({ name: l.name, category: l.category })),
          statement: st ? { id: st.id, number: st.number, amountDuePt: st.amountDuePt, status: st.status, exitAt: st.exitAt } : null,
        };
      }),
    };
    return h;
  }
  if (p === "/dashboard") {
    const inShop = T("workOrders").filter((w) => ["open", "ready"].includes(w.status));
    const minOf = new Map(T("itemVariants").map((v) => [v.id, v.minQtyMilli]));
    return { carsInShop: inShop.length, readyForPickup: inShop.filter((w) => w.status === "ready").length, myOpen: 0, lowStock: T("stockLevels").filter((s) => (minOf.get(s.variantId) ?? 0) > 0 && s.qtyMilli <= minOf.get(s.variantId)).length };
  }
  return undefined;
}

const QUEUEABLE: [RegExp, string][] = [
  [/^POST \/customers$/, "عميل جديد"],
  [/^POST \/vehicles$/, "سيارة جديدة"],
  [/^POST \/work-orders$/, "فتح أمر شغل"],
  [/^PATCH \/work-orders\/[0-9a-f-]{36}$/, "تعديل أمر شغل"],
  [/^POST \/work-orders\/[0-9a-f-]{36}\/lines$/, "إضافة بند"],
  [/^PATCH \/work-orders\/[0-9a-f-]{36}\/lines\/[0-9a-f-]{36}$/, "تعديل بند"],
  [/^DELETE \/work-orders\/[0-9a-f-]{36}\/lines\/[0-9a-f-]{36}$/, "حذف بند"],
  [/^POST \/statements$/, "حفظ بيان"],
];
export const queueLabel = (method: string, path: string) => QUEUEABLE.find(([r]) => r.test(`${method} ${path}`))?.[1];

/** Apply an offline write to the local copy and return what the server would have answered (marked queued). */
export async function localWrite(method: string, path: string, body: any, userId: string): Promise<{ body: any; result: any }> {
  const now = new Date().toISOString();
  body = body && typeof body === "object" ? { ...body } : body;
  let m: RegExpMatchArray | null;
  if (method === "POST" && (path === "/customers" || path === "/vehicles")) {
    body.id ??= uuidv7();
    if (path === "/customers") T("customers").push({ ...body, nameKey: searchKey(body.name ?? ""), createdAt: now });
    else {
      const type = (mirror.plateTypes ?? []).find((t) => t.id === (body.plateType ?? "private"));
      const p = body.plateDigits ? normalizePlate({ letters: body.plateLetters, digits: body.plateDigits }, { digitsOnly: !!type?.digitsOnly }) : null;
      T("vehicles").push({ ...body, plateType: body.plateType ?? "private", plateLetters: p?.letters || null, plateDigits: p?.digits ?? null, plateKey: p ? plateKey(p) : null, createdAt: now });
    }
    await kvSet("mirror", mirror); changed();
    return { body, result: { id: body.id, queued: true } };
  }
  if (method === "POST" && path === "/work-orders") {
    body.id ??= uuidv7();
    body.number ??= await takeNumber();
    const v = T("vehicles").find((x) => x.id === body.vehicleId);
    const prev = T("odometerReadings").filter((o) => o.vehicleId === body.vehicleId).reduce((a, o) => Math.max(a, o.km), -1);
    T("workOrders").push({ ...body, customerId: v?.customerId, status: "open", type: body.type ?? "repair", receptionUserId: body.receptionUserId ?? userId, enteredAt: now, technicianIds: body.technicianIds ?? [], createdAt: now });
    T("odometerReadings").push({ id: uuidv7(), vehicleId: body.vehicleId, km: body.odometerIn, readAt: now, workOrderId: body.id });
    for (const mk of body.marks ?? []) T("intakeMarks").push({ id: uuidv7(), workOrderId: body.id, ...mk });
    await kvSet("mirror", mirror); changed();
    return { body, result: { id: body.id, number: body.number, previousKm: prev >= 0 ? prev : null, differenceKm: prev >= 0 ? body.odometerIn - prev : null, queued: true } };
  }
  if ((m = path.match(/^\/work-orders\/([0-9a-f-]{36})$/)) && method === "PATCH") {
    const w = T("workOrders").find((x) => x.id === m![1]);
    if (w) Object.assign(w, body, body.technicianIds ? { technicianIds: body.technicianIds } : {});
    await kvSet("mirror", mirror); changed();
    return { body, result: buildWorkOrder(m[1]) };
  }
  if ((m = path.match(/^\/work-orders\/([0-9a-f-]{36})\/lines$/)) && method === "POST") {
    body.id ??= uuidv7();
    const v = T("itemVariants").find((x) => x.id === body.variantId);
    const it = v && T("items").find((x) => x.id === v.itemId);
    if (!v || !it) throw new Error("الصنف غير موجود في النسخة المحلية على هذا الجهاز.");
    T("docLines").push({ id: body.id, workOrderId: m[1], category: it.type, itemId: it.id, variantId: v.id, code: it.code, name: it.nameAr, grade: v.grade, unit: it.unit, qtyMilli: body.qtyMilli, unitPricePt: v.sellPricePt, technicianId: body.technicianId ?? null, finishedAt: null, createdAt: now });
    const lvl = T("stockLevels").find((s) => s.variantId === v.id);
    if (lvl && it.trackStock) lvl.qtyMilli -= body.qtyMilli;
    await kvSet("mirror", mirror); changed();
    return { body, result: { lineId: body.id, lowStock: false, queued: true } };
  }
  if ((m = path.match(/^\/work-orders\/([0-9a-f-]{36})\/lines\/([0-9a-f-]{36})$/))) {
    const l = T("docLines").find((x) => x.id === m![2]);
    if (l && method === "DELETE") l.archivedAt = now;
    if (l && method === "PATCH") Object.assign(l, body);
    await kvSet("mirror", mirror); changed();
    return { body, result: buildWorkOrder(m[1]) };
  }
  if (method === "POST" && path === "/statements") {
    body.id ??= uuidv7();
    const w = T("workOrders").find((x) => x.id === body.workOrderId);
    if (w) w.status = "delivered";
    await kvSet("mirror", mirror); changed();
    return { body, result: { id: body.id, number: null, queued: true } };
  }
  throw new Error("هذا التغيير يحتاج اتصالًا بالخادم.");
}
