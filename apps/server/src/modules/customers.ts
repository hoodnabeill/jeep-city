/** Customers, their vehicles, the car file (history, odometer), customer ledger and debt collection. */
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { can, egyptMobile, normalizePlate, parsePlate, plateKey, searchKey, uuidv7, westernDigits } from "@jc/core";
import { audit } from "../audit";
import { actorOf, requirePerm } from "../auth/auth";
import type { Db } from "../db/client";
import {
  cashMovements, customerLedger, customers, docLines, odometerReadings, paymentMethods, payments, plateTypes, statements, users, vehicles, workOrders,
} from "../db/schema";
import { AppError, notFound } from "../errors";
import { customerBalancePt } from "./statements";

const Id = z.object({ id: z.uuid() });
const opt = (max: number) => z.string().trim().max(max).nullable().optional();
const CustomerIn = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "اكتب اسم العميل.").max(120),
  mobile: opt(30), officePhone: opt(30), homePhone: opt(30), whatsapp: opt(30),
  governorate: opt(40), address: opt(200), occupation: opt(60), notes: opt(1000), internalNotes: opt(1000),
  openingBalancePt: z.number().int().safe().optional(),
});
const VehicleIn = z.object({
  id: z.uuid().optional(),
  customerId: z.uuid(),
  plateType: z.string().max(32).optional(),
  plateLetters: z.string().max(12).nullable().optional(),
  plateDigits: z.string().max(12).nullable().optional(),
  chassis: z.string().trim().toUpperCase().max(17).nullable().optional(),
  licenseNo: opt(30), make: opt(40), model: opt(60), variant: opt(40), year: z.number().int().min(1950).max(2100).nullable().optional(),
  engineSize: opt(20), engineNo: opt(40), modelNo: opt(40), color: opt(30), warrantyEnd: opt(10), notes: opt(1000),
});

function checkPhones(c: z.infer<typeof CustomerIn>) {
  const wa = c.whatsapp ?? c.mobile;
  if (c.whatsapp && !egyptMobile(c.whatsapp)) throw new AppError(422, "bad_whatsapp", "رقم الواتساب غير صحيح. اكتب رقم موبايل مصري مثل 01001234567.");
  return wa && egyptMobile(wa) ? egyptMobile(wa) : null;
}

/** Structured plate (D-69): type + letters + digits, sent together. No digits = no plate yet. */
async function plateFields(db: Db, v: { plateType?: string; plateLetters?: string | null; plateDigits?: string | null }) {
  if (v.plateType === undefined && v.plateLetters === undefined && v.plateDigits === undefined) return {};
  const [type] = await db.select().from(plateTypes).where(eq(plateTypes.id, v.plateType ?? "private"));
  if (!type) throw new AppError(422, "bad_plate_type", "نوع اللوحة غير موجود. اختر نوعًا من القائمة.");
  if (!v.plateDigits?.trim() && !v.plateLetters?.trim()) return { plateType: type.id, plateLetters: null, plateDigits: null, plateKey: null };
  try {
    const p = normalizePlate({ letters: v.plateLetters, digits: v.plateDigits }, { digitsOnly: type.digitsOnly });
    return { plateType: type.id, plateLetters: p.letters || null, plateDigits: p.digits, plateKey: plateKey(p) };
  } catch {
    throw new AppError(422, "bad_plate", type.digitsOnly
      ? "لوحة هذا النوع أرقام فقط، مثل: 123 - 45."
      : "رقم اللوحة غير صحيح. اكتب حتى 3 حروف عربية ثم الأرقام، مثل: ل ف و 281.");
  }
}

/** Free-text lookup across customers and their cars: name, phone, plate (any order), chassis (any part). */
export async function lookup(db: Db, q: string) {
  const text = westernDigits(q).trim();
  const key = searchKey(text);
  if (key.length < 2) return [];
  const plate = parsePlate(text);
  const vMatch = await db.select({ v: vehicles, c: customers }).from(vehicles).innerJoin(customers, eq(customers.id, vehicles.customerId))
    .where(and(isNull(vehicles.archivedAt), or(
      ilike(vehicles.chassis, `%${text.toUpperCase()}%`),
      text.length >= 8 ? sql`length(${vehicles.chassis}) >= 5 and ${text.toUpperCase()} like '%' || upper(${vehicles.chassis})` : undefined,
      plate?.letters ? ilike(vehicles.plateKey, `%${searchKey(plate.letters)}%${plate.digits}%`) : undefined,
      plate && !plate.letters && plate.digits ? ilike(vehicles.plateDigits, `%${plate.digits}%`) : undefined,
      ilike(customers.nameKey, `%${key}%`), ilike(customers.mobile, `%${key}%`),
    ))).limit(30);
  return vMatch.map(({ v, c }) => ({ vehicle: v, customer: { id: c.id, name: c.name, mobile: c.mobile, whatsapp: c.whatsapp } }));
}

export function customerRoutes(app: FastifyInstance, db: Db, auth: preHandlerHookHandler) {
  const manage = [auth, requirePerm("customer.manage")];

  app.get("/customers", { preHandler: manage }, async (req) => {
    const q = z.object({ q: z.string().max(80).optional(), debt: z.string().optional() }).parse(req.query);
    const key = q.q ? searchKey(q.q) : "";
    const showBal = can(actorOf(req).role, "customer.viewBalance");
    const owing = sql`${customers.id} in (select ${customerLedger.customerId} from ${customerLedger} group by ${customerLedger.customerId} having sum(${customerLedger.amountPt}) > 0)`;
    const where = and(isNull(customers.archivedAt), key ? or(ilike(customers.nameKey, `%${key}%`), ilike(customers.mobile, `%${key}%`)) : undefined, q.debt && showBal ? owing : undefined);
    // Most recent visit first; customers never seen in the shop go last. One grouped pass over work orders, not one lookup per customer.
    const lv = db.select({ customerId: workOrders.customerId, last: sql<Date>`max(${workOrders.enteredAt})`.as("last_visit") }).from(workOrders).groupBy(workOrders.customerId).as("lv");
    const list = (await db.select({ c: customers }).from(customers).leftJoin(lv, eq(lv.customerId, customers.id)).where(where).orderBy(sql`${lv.last} desc nulls last`, desc(customers.createdAt)).limit(300)).map((r) => r.c);
    const [{ total }] = await db.select({ total: count() }).from(customers).where(where);
    const ids = list.map((c) => c.id);
    const cars = ids.length ? await db.select().from(vehicles).where(and(inArray(vehicles.customerId, ids), isNull(vehicles.archivedAt))) : [];
    const bal = ids.length ? await db.select({ id: customerLedger.customerId, b: sql<string>`sum(${customerLedger.amountPt})` }).from(customerLedger).where(inArray(customerLedger.customerId, ids)).groupBy(customerLedger.customerId) : [];
    const out = list.map((c) => {
      const { openingBalancePt: _o, ...pub } = c;
      const balance = Number(bal.find((b) => b.id === c.id)?.b ?? 0);
      // Engineers see that a debt exists, not the amount (D-23).
      return { ...(showBal ? c : pub), vehicles: cars.filter((v) => v.customerId === c.id), ...(showBal ? { balancePt: balance } : { hasDebt: balance > 0 }) };
    });
    return { rows: out, total };
  });

  app.get("/lookup", { preHandler: manage }, async (req) => lookup(db, z.object({ q: z.string().max(80) }).parse(req.query).q));

  app.get("/customers/:id", { preHandler: manage }, async (req) => {
    const { id } = Id.parse(req.params);
    const [c] = await db.select().from(customers).where(eq(customers.id, id));
    if (!c) throw notFound("العميل");
    const cars = await db.select().from(vehicles).where(and(eq(vehicles.customerId, id), isNull(vehicles.archivedAt)));
    const balancePt = await customerBalancePt(db, id);
    // Engineers see that a debt exists, not the amount or history (D-23).
    return can(actorOf(req).role, "customer.viewBalance") ? { ...c, vehicles: cars, balancePt } : { ...c, openingBalancePt: undefined, vehicles: cars, hasDebt: balancePt > 0 };
  });

  app.post("/customers", { preHandler: manage }, async (req, reply) => {
    const c = CustomerIn.parse(req.body);
    const actor = actorOf(req);
    if (c.openingBalancePt && !can(actor.role, "customer.viewBalance")) throw new AppError(403, "forbidden", "الرصيد الافتتاحي من صلاحية الإدارة.");
    const wa = checkPhones(c);
    const id = c.id ?? uuidv7();
    await db.transaction(async (tx) => {
      await tx.insert(customers).values({ ...c, id, whatsapp: wa ?? c.whatsapp ?? null, nameKey: searchKey(c.name), openingBalancePt: c.openingBalancePt ?? 0, createdBy: actor.id, deviceId: actor.deviceId ?? null });
      if (c.openingBalancePt) await tx.insert(customerLedger).values({ id: uuidv7(), customerId: id, amountPt: c.openingBalancePt, kind: "opening", createdBy: actor.id });
    });
    reply.status(201);
    return { id };
  });

  app.patch("/customers/:id", { preHandler: manage }, async (req) => {
    const { id } = Id.parse(req.params);
    const c = CustomerIn.partial().omit({ openingBalancePt: true }).parse(req.body);
    const [old] = await db.select().from(customers).where(eq(customers.id, id));
    if (!old) throw notFound("العميل");
    if (c.whatsapp && !egyptMobile(c.whatsapp)) throw new AppError(422, "bad_whatsapp", "رقم الواتساب غير صحيح. اكتب رقم موبايل مصري مثل 01001234567.");
    await db.update(customers).set({ ...c, ...(c.name ? { nameKey: searchKey(c.name) } : {}), updatedAt: new Date() }).where(eq(customers.id, id));
    await audit(db, actorOf(req), "customer.update", "customer", id, old, c);
    return { id };
  });

  app.post("/vehicles", { preHandler: manage }, async (req, reply) => {
    const v = VehicleIn.parse(req.body);
    const id = v.id ?? uuidv7();
    if (v.chassis) {
      const [dup] = await db.select({ id: vehicles.id }).from(vehicles).where(and(eq(vehicles.chassis, v.chassis), isNull(vehicles.archivedAt)));
      if (dup) throw new AppError(409, "chassis_exists", "رقم الشاسيه مسجل لسيارة أخرى. ابحث عنها وافتح ملفها.", { vehicleId: dup.id });
    }
    const { plateType, plateLetters, plateDigits, ...rest } = v;
    await db.insert(vehicles).values({ ...rest, ...(await plateFields(db, { plateType, plateLetters, plateDigits })), id, createdBy: actorOf(req).id, deviceId: actorOf(req).deviceId ?? null });
    reply.status(201);
    return { id };
  });

  app.patch("/vehicles/:id", { preHandler: manage }, async (req) => {
    const { id } = Id.parse(req.params);
    const v = VehicleIn.partial().parse(req.body);
    const { plateType, plateLetters, plateDigits, ...rest } = v;
    await db.update(vehicles).set({ ...rest, ...(await plateFields(db, { plateType, plateLetters, plateDigits })), updatedAt: new Date() }).where(eq(vehicles.id, id));
    await audit(db, actorOf(req), "vehicle.update", "vehicle", id, null, v);
    return { id };
  });

  /** Car file: every visit with odometer, lines, statement; newest first. */
  app.get("/vehicles/:id/history", { preHandler: manage }, async (req) => {
    const { id } = Id.parse(req.params);
    const [v] = await db.select().from(vehicles).where(eq(vehicles.id, id));
    if (!v) throw notFound("السيارة");
    const wos = await db.select({ wo: workOrders, engineer: users.displayName }).from(workOrders).leftJoin(users, eq(users.id, workOrders.receptionUserId))
      .where(eq(workOrders.vehicleId, id)).orderBy(desc(workOrders.enteredAt));
    const woIds = wos.map((w) => w.wo.id);
    const lines = woIds.length ? await db.select({ workOrderId: docLines.workOrderId, name: docLines.name, category: docLines.category }).from(docLines).where(and(inArray(docLines.workOrderId, woIds), isNull(docLines.archivedAt))) : [];
    const sts = woIds.length ? await db.select({ id: statements.id, number: statements.number, workOrderId: statements.workOrderId, amountDuePt: statements.amountDuePt, status: statements.status, exitAt: statements.exitAt }).from(statements).where(inArray(statements.workOrderId, woIds)) : [];
    const odo = await db.select().from(odometerReadings).where(eq(odometerReadings.vehicleId, id)).orderBy(desc(odometerReadings.readAt));
    return {
      vehicle: v,
      odometer: odo.map((o) => ({ km: o.km, at: o.readAt, workOrderId: o.workOrderId, overrideReason: o.overrideReason })),
      visits: wos.map(({ wo, engineer }) => ({
        workOrder: { id: wo.id, number: wo.number, type: wo.type, status: wo.status, enteredAt: wo.enteredAt, odometerIn: wo.odometerIn, complaint: wo.complaint, engineer },
        lines: lines.filter((l) => l.workOrderId === wo.id).map((l) => ({ name: l.name, category: l.category })),
        statement: sts.find((s) => s.workOrderId === wo.id && s.status === "final") ?? null,
      })),
    };
  });

  /* Customer ledger and debt collection (Admin) */
  app.get("/customers/:id/ledger", { preHandler: [auth, requirePerm("customer.viewBalance")] }, async (req) => {
    const { id } = Id.parse(req.params);
    const rows = await db.select().from(customerLedger).where(eq(customerLedger.customerId, id)).orderBy(asc(customerLedger.createdAt));
    let bal = 0;
    return rows.map((r) => ({ at: r.createdAt, kind: r.kind, refType: r.refType, refId: r.refId, amountPt: r.amountPt, balancePt: (bal += r.amountPt) }));
  });

  app.post("/customers/:id/payments", { preHandler: [auth, requirePerm("payment.collectDebt")] }, async (req, reply) => {
    const { id } = Id.parse(req.params);
    const p = z.object({ id: z.uuid().optional(), methodId: z.string(), amountPt: z.number().int().positive(), reference: z.string().trim().max(64).optional() }).parse(req.body);
    const actor = actorOf(req);
    const result = await db.transaction(async (tx) => {
      const [m] = await tx.select().from(paymentMethods).where(eq(paymentMethods.id, p.methodId));
      if (!m || !m.active || m.isCredit) throw new AppError(422, "bad_method", "اختر طريقة دفع فعلية (كاش، فيزا، تحويل).");
      if (m.needsReference && !p.reference) throw new AppError(422, "reference_required", `اكتب رقم المرجع لدفعة ${m.label}.`);
      const balance = await customerBalancePt(tx, id);
      if (p.amountPt > balance) throw new AppError(422, "over_payment", "المبلغ أكبر من مديونية العميل.", { balancePt: balance });
      const pid = p.id ?? uuidv7();
      await tx.insert(payments).values({ id: pid, customerId: id, methodId: m.id, amountPt: p.amountPt, reference: p.reference ?? null, kind: "debt_settlement", paidAt: new Date(), createdBy: actor.id, deviceId: actor.deviceId ?? null });
      await tx.insert(customerLedger).values({ id: uuidv7(), customerId: id, amountPt: -p.amountPt, kind: "debt_payment", refType: "payment", refId: pid, createdBy: actor.id });
      if (m.isCash) await tx.insert(cashMovements).values({ id: uuidv7(), amountPt: p.amountPt, kind: "debt_payment", refType: "payment", refId: pid, movedAt: new Date(), createdBy: actor.id });
      await audit(tx, actor, "payment.debt", "customer", id, { balancePt: balance }, { amountPt: p.amountPt, methodId: m.id });
      return { id: pid, balancePt: balance - p.amountPt };
    });
    reply.status(201);
    return result;
  });
}
