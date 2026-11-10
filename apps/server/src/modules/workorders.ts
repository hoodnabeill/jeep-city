/**
 * Work orders (أمر شغل): intake, odometer rule, labor and parts lines, intake marks, estimate approvals.
 * Converting to a statement lives in statements.ts (finalizeStatement).
 */
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, max, or, sql } from "drizzle-orm";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { can, deniedMessage, searchKey, uuidv7 } from "@jc/core";
import { audit, type Actor } from "../audit";
import { actorOf, requirePerm } from "../auth/auth";
import type { Db } from "../db/client";
import {
  customers, docLines, estimateApprovals, intakeMarks, items, itemVariants, numberBlocks, odometerReadings, packageLines, statements,
  stockLevels, technicians, users, vehicles, workOrders, workOrderTechnicians,
} from "../db/schema";
import { AppError, notFound } from "../errors";
import { nextNumber } from "./numbering";
import { guardOverIssue, issueToWorkOrder, lockLevel, mainWarehouseId, move } from "./stock";
import { Id, int, opt } from "../http";

const LineParams = z.object({ id: z.uuid(), lineId: z.uuid() });

const Header = z.object({
  type: z.enum(["repair", "inquiry", "condition"]).optional(),
  representative: opt(80), expectedAt: z.iso.datetime().nullable().optional(), comeback: z.boolean().optional(),
  faultType: opt(80), repairType: opt(80), booking: z.enum(["booked", "walk_in"]).nullable().optional(), insuranceCompany: opt(80),
  complaint: opt(2000), engineerNotes: opt(2000), customerNotes: opt(2000), internalNotes: opt(2000),
  fuelLevel: z.number().int().min(1).max(4).nullable().optional(), belongings: z.array(z.string().max(40)).max(20).optional(),
  estimatePt: int.nonnegative().nullable().optional(), technicianIds: z.array(z.uuid()).max(10).optional(),
});
export const CreateWO = Header.extend({
  id: z.uuid(),
  number: int.positive().optional(), // from this device's reserved block (D-15)
  vehicleId: z.uuid(),
  receptionUserId: z.uuid().optional(),
  enteredAt: z.iso.datetime().optional(),
  odometerIn: int.nonnegative({ message: "اكتب قراءة العداد الحالية." }),
  odometerReason: z.string().trim().max(300).optional(),
  marks: z.array(z.object({ x: z.number().int().min(0).max(1000), y: z.number().int().min(0).max(1000), kind: z.enum(["scratch", "dent", "damage"]), note: z.string().max(300).default("") })).max(40).optional(),
  signatureFileId: z.uuid().optional(),
});

const OPEN = ["open", "ready"] as const;
const isOpen = (s: string) => (OPEN as readonly string[]).includes(s);

async function setTechnicians(tx: Db, woId: string, ids: string[]) {
  await tx.delete(workOrderTechnicians).where(eq(workOrderTechnicians.workOrderId, woId));
  if (ids.length) await tx.insert(workOrderTechnicians).values(ids.map((t) => ({ workOrderId: woId, technicianId: t })));
}

export async function createWorkOrder(db: Db, actor: Actor, raw: unknown) {
  const w = CreateWO.parse(raw);
  return db.transaction(async (tx) => {
    const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, w.vehicleId));
    if (!v) throw notFound("السيارة");
    // Odometer rule (D-41): required; lower than the last reading needs Admin and a reason.
    const [last] = await tx.select({ km: max(odometerReadings.km) }).from(odometerReadings).where(eq(odometerReadings.vehicleId, v.id));
    const prev = last?.km ?? null;
    if (prev !== null && w.odometerIn < prev) {
      if (!can(actor, "odometer.lowerThanPrevious")) throw new AppError(409, "odometer_lower", deniedMessage("odometer.lowerThanPrevious"), { previousKm: prev });
      if (!w.odometerReason) throw new AppError(422, "reason_required", `القراءة أقل من آخر قراءة (${prev} كم). اكتب السبب، مثل تغيير العداد.`);
    }
    let number = w.number;
    if (number) {
      const deviceId = actor.deviceId ?? "";
      const [blk] = await tx.select().from(numberBlocks).where(and(eq(numberBlocks.series, "work_order"), eq(numberBlocks.deviceId, deviceId), lte(numberBlocks.fromValue, number), gte(numberBlocks.toValue, number)));
      if (!blk) throw new AppError(422, "number_not_reserved", "رقم أمر الشغل ليس من رصيد هذا الجهاز.");
      const [used] = await tx.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.number, number));
      if (used) throw new AppError(409, "number_used", `رقم أمر الشغل ${number} مستخدم من قبل.`);
    } else number = await nextNumber(tx, "work_order");

    await tx.insert(workOrders).values({
      id: w.id, number, type: w.type ?? "repair", vehicleId: v.id, customerId: v.customerId, representative: w.representative ?? null,
      receptionUserId: w.receptionUserId ?? actor.id, enteredAt: w.enteredAt ? new Date(w.enteredAt) : new Date(), expectedAt: w.expectedAt ? new Date(w.expectedAt) : null,
      odometerIn: w.odometerIn, comeback: w.comeback ?? false, faultType: w.faultType ?? null, repairType: w.repairType ?? null, booking: w.booking ?? null,
      insuranceCompany: w.insuranceCompany ?? null, complaint: w.complaint ?? null, engineerNotes: w.engineerNotes ?? null, customerNotes: w.customerNotes ?? null,
      internalNotes: w.internalNotes ?? null, fuelLevel: w.fuelLevel ?? null, belongings: w.belongings ?? [], estimatePt: w.estimatePt ?? null,
      signatureFileId: w.signatureFileId ?? null, warehouseId: await mainWarehouseId(tx), createdBy: actor.id, deviceId: actor.deviceId ?? null,
    });
    await tx.insert(odometerReadings).values({ id: uuidv7(), vehicleId: v.id, km: w.odometerIn, readAt: new Date(), workOrderId: w.id, overrideReason: prev !== null && w.odometerIn < prev ? w.odometerReason! : null, createdBy: actor.id });
    if (w.technicianIds?.length) await setTechnicians(tx, w.id, w.technicianIds);
    if (w.marks?.length) await tx.insert(intakeMarks).values(w.marks.map((m) => ({ id: uuidv7(), workOrderId: w.id, vehicleId: v.id, x: m.x, y: m.y, kind: m.kind, note: m.note, createdBy: actor.id })));
    if (w.estimatePt) await tx.insert(estimateApprovals).values({ id: uuidv7(), workOrderId: w.id, oldPt: null, newPt: w.estimatePt, approvedByName: "عند الاستلام", method: "in_person", approvedAt: new Date(), createdBy: actor.id });
    if (prev !== null && w.odometerIn < prev) await audit(tx, actor, "odometer.lower", "vehicle", v.id, { km: prev }, { km: w.odometerIn, reason: w.odometerReason });
    await audit(tx, actor, "workOrder.create", "work_order", w.id, null, { number, vehicleId: v.id, odometerIn: w.odometerIn });
    return { id: w.id, number, previousKm: prev, differenceKm: prev === null ? null : w.odometerIn - prev };
  });
}

export async function loadWorkOrder(db: Db, actor: Actor, id: string) {
  const [row] = await db.select({ wo: workOrders, engineer: users.displayName }).from(workOrders).leftJoin(users, eq(users.id, workOrders.receptionUserId)).where(eq(workOrders.id, id));
  if (!row) throw notFound("أمر الشغل");
  const wo = row.wo;
  const [v] = wo.vehicleId ? await db.select().from(vehicles).where(eq(vehicles.id, wo.vehicleId)) : [];
  const [c] = await db.select({ id: customers.id, name: customers.name, mobile: customers.mobile, whatsapp: customers.whatsapp, internalNotes: customers.internalNotes }).from(customers).where(eq(customers.id, wo.customerId));
  const lines = await db.select({ l: docLines, tech: technicians.name }).from(docLines).leftJoin(technicians, eq(technicians.id, docLines.technicianId)).where(and(eq(docLines.workOrderId, id), isNull(docLines.archivedAt))).orderBy(asc(docLines.createdAt));
  const techs = await db.select({ id: technicians.id, name: technicians.name }).from(workOrderTechnicians).innerJoin(technicians, eq(technicians.id, workOrderTechnicians.technicianId)).where(eq(workOrderTechnicians.workOrderId, id));
  const marks = await db.select().from(intakeMarks).where(eq(intakeMarks.workOrderId, id)).orderBy(asc(intakeMarks.createdAt));
  const approvals = await db.select().from(estimateApprovals).where(eq(estimateApprovals.workOrderId, id)).orderBy(asc(estimateApprovals.approvedAt));
  const [st] = await db.select({ id: statements.id, number: statements.number }).from(statements).where(and(eq(statements.workOrderId, id), eq(statements.status, "final")));
  const prev = wo.vehicleId ? await db.select({ km: odometerReadings.km, at: odometerReadings.readAt }).from(odometerReadings)
    .where(and(eq(odometerReadings.vehicleId, wo.vehicleId), sql`${odometerReadings.workOrderId} is distinct from ${id}`)).orderBy(desc(odometerReadings.readAt)).limit(1) : [];
  return {
    ...wo, engineer: row.engineer, vehicle: v ?? null, customer: c, technicians: techs, marks, approvals, statement: st ?? null,
    previousOdometer: prev[0] ?? null, editable: isOpen(wo.status),
    lines: lines.map(({ l, tech }) => ({ id: l.id, category: l.category, itemId: l.itemId, variantId: l.variantId, code: l.code, name: l.name, grade: l.grade, unit: l.unit, qtyMilli: l.qtyMilli, unitPricePt: l.unitPricePt, technicianId: l.technicianId, technician: tech, finishedAt: l.finishedAt })),
    canSeeCost: can(actor, "cost.view"),
  };
}

async function lockOpen(tx: Db, id: string) {
  const [wo] = await tx.select().from(workOrders).where(eq(workOrders.id, id)).for("update");
  if (!wo) throw notFound("أمر الشغل");
  if (!isOpen(wo.status)) throw new AppError(409, "work_order_closed", "أمر الشغل مقفول. التعديل على البيان من الإدارة.");
  return wo;
}

export function workOrderRoutes(app: FastifyInstance, db: Db, auth: preHandlerHookHandler) {
  const edit = [auth, requirePerm("workOrder.edit")];

  app.get("/work-orders", { preHandler: edit }, async (req) => {
    const q = z.object({ status: z.enum(["open", "ready", "delivered", "closed", "cancelled", "in_shop"]).optional(), engineerId: z.uuid().optional(), q: z.string().max(60).optional(), from: z.iso.date().optional(), to: z.iso.date().optional(), limit: z.coerce.number().int().min(1).max(500).default(200) }).parse(req.query);
    const key = q.q ? searchKey(q.q) : "";
    const rows = await db.select({ wo: workOrders, v: vehicles, c: { id: customers.id, name: customers.name }, engineer: users.displayName })
      .from(workOrders).leftJoin(vehicles, eq(vehicles.id, workOrders.vehicleId)).innerJoin(customers, eq(customers.id, workOrders.customerId)).leftJoin(users, eq(users.id, workOrders.receptionUserId))
      .where(and(
        q.status === "in_shop" ? inArray(workOrders.status, ["open", "ready"]) : q.status ? eq(workOrders.status, q.status) : undefined,
        q.engineerId ? eq(workOrders.receptionUserId, q.engineerId) : undefined,
        q.from ? gte(workOrders.enteredAt, new Date(q.from)) : undefined, q.to ? lte(workOrders.enteredAt, new Date(`${q.to}T23:59:59Z`)) : undefined,
        key ? or(sql`${workOrders.number}::text like ${"%" + key + "%"}`, ilike(vehicles.plateKey, `%${key}%`), ilike(vehicles.chassis, `%${q.q!.trim().toUpperCase()}%`), ilike(customers.nameKey, `%${key}%`)) : undefined,
      )).orderBy(desc(workOrders.enteredAt)).limit(q.limit);
    return rows.map(({ wo, v, c, engineer }) => ({
      id: wo.id, number: wo.number, type: wo.type, status: wo.status, enteredAt: wo.enteredAt, expectedAt: wo.expectedAt, complaint: wo.complaint, engineerNotes: wo.engineerNotes,
      engineerId: wo.receptionUserId, engineer, customer: c,
      vehicle: v ? { id: v.id, plateType: v.plateType, plateLetters: v.plateLetters, plateDigits: v.plateDigits, chassis: v.chassis, make: v.make, model: v.model, variant: v.variant, year: v.year } : null,
    }));
  });

  app.get("/work-orders/:id", { preHandler: edit }, async (req) => loadWorkOrder(db, actorOf(req), Id.parse(req.params).id));

  app.post("/work-orders", { preHandler: [auth, requirePerm("workOrder.create")] }, async (req, reply) => {
    reply.status(201);
    return createWorkOrder(db, actorOf(req), req.body);
  });

  app.patch("/work-orders/:id", { preHandler: edit }, async (req) => {
    const { id } = Id.parse(req.params);
    const p = Header.extend({ status: z.enum(["open", "ready", "closed"]).optional() }).parse(req.body);
    const actor = actorOf(req);
    await db.transaction(async (tx) => {
      const wo = await lockOpen(tx, id);
      const { technicianIds, expectedAt, ...rest } = p;
      // Closing without a statement is for inquiries and condition reports only.
      if (p.status === "closed" && wo.type === "repair") throw new AppError(422, "close_repair", "أمر الإصلاح يُقفل بتحويله إلى بيان عميل.");
      await tx.update(workOrders).set({ ...rest, ...(expectedAt !== undefined ? { expectedAt: expectedAt ? new Date(expectedAt) : null } : {}), updatedAt: new Date() }).where(eq(workOrders.id, id));
      if (technicianIds) await setTechnicians(tx, id, technicianIds);
      if (p.status && p.status !== wo.status) await audit(tx, actor, "workOrder.status", "work_order", id, { status: wo.status }, { status: p.status });
    });
    return loadWorkOrder(db, actor, id);
  });

  const LineIn = z.object({
    id: z.uuid().optional(),
    variantId: z.uuid().optional(),
    qtyMilli: int.positive(),
    reason: z.string().max(300).optional(),
    technicianId: z.uuid().optional(),
    // free line (no catalog item): Admin only, because it sets a price
    category: z.enum(["labor", "part", "oil", "material", "paint"]).optional(),
    name: z.string().trim().min(2).max(120).optional(),
    unitPricePt: int.nonnegative().optional(),
  });
  app.post("/work-orders/:id/lines", { preHandler: [auth, requirePerm("stock.issue")] }, async (req, reply) => {
    const { id } = Id.parse(req.params);
    const l = LineIn.parse(req.body);
    const actor = actorOf(req);
    reply.status(201);
    if (l.variantId) return issueToWorkOrder(db, actor, { workOrderId: id, variantId: l.variantId, qtyMilli: l.qtyMilli, reason: l.reason, lineId: l.id, technicianId: l.technicianId });
    if (!can(actor, "item.manage")) throw new AppError(403, "forbidden", "إضافة بند بسعر حر من صلاحية الإدارة. اختر الصنف من القائمة.");
    if (!l.category || !l.name || l.unitPricePt === undefined) throw new AppError(422, "bad_line", "البند يحتاج نوعًا واسمًا وسعرًا.");
    return db.transaction(async (tx) => {
      await lockOpen(tx, id);
      const lineId = l.id ?? uuidv7();
      await tx.insert(docLines).values({ id: lineId, workOrderId: id, category: l.category!, name: l.name!, qtyMilli: l.qtyMilli, unitPricePt: l.unitPricePt!, technicianId: l.technicianId ?? null, createdBy: actor.id });
      return { lineId, qtyAfterMilli: null, lowStock: false };
    });
  });

  app.patch("/work-orders/:id/lines/:lineId", { preHandler: edit }, async (req) => {
    const { id, lineId } = LineParams.parse(req.params);
    const p = z.object({ qtyMilli: int.positive().optional(), technicianId: z.uuid().nullable().optional(), finishedAt: z.iso.datetime().nullable().optional(), unitPricePt: int.nonnegative().optional(), reason: z.string().max(300).optional() }).parse(req.body);
    const actor = actorOf(req);
    if (p.unitPricePt !== undefined && !can(actor, "item.manage")) throw new AppError(403, "forbidden", "تغيير السعر من صلاحية الإدارة.");
    await db.transaction(async (tx) => {
      const wo = await lockOpen(tx, id);
      const [line] = await tx.select().from(docLines).where(and(eq(docLines.id, lineId), eq(docLines.workOrderId, id), isNull(docLines.archivedAt)));
      if (!line) throw notFound("البند");
      if (p.qtyMilli !== undefined && line.stockQtyMilli && line.variantId && p.qtyMilli !== line.stockQtyMilli) {
        const more = p.qtyMilli - line.stockQtyMilli;
        if (more > 0) {
          const lvl = await lockLevel(tx, line.variantId, wo.warehouseId ?? (await mainWarehouseId(tx)));
          await guardOverIssue(tx, actor, { variantId: line.variantId, availableMilli: lvl.qtyMilli, qtyMilli: more, reason: p.reason, workOrderId: id });
        }
        await move(tx, actor, { variantId: line.variantId, warehouseId: wo.warehouseId ?? undefined, qtyMilli: -more, kind: more > 0 ? "issue_out" : "issue_return", refType: "doc_line", refId: line.id, reason: p.reason });
      }
      await tx.update(docLines).set({
        qtyMilli: p.qtyMilli ?? line.qtyMilli, stockQtyMilli: line.stockQtyMilli && p.qtyMilli ? p.qtyMilli : line.stockQtyMilli,
        technicianId: p.technicianId === undefined ? line.technicianId : p.technicianId,
        finishedAt: p.finishedAt === undefined ? line.finishedAt : p.finishedAt ? new Date(p.finishedAt) : null,
        unitPricePt: p.unitPricePt ?? line.unitPricePt, updatedAt: new Date(),
      }).where(eq(docLines.id, lineId));
      if (p.unitPricePt !== undefined && p.unitPricePt !== line.unitPricePt) await audit(tx, actor, "line.price_change", "doc_line", lineId, { unitPricePt: line.unitPricePt }, { unitPricePt: p.unitPricePt });
    });
    return loadWorkOrder(db, actor, id);
  });

  /** Remove a line; unused parts go back to stock. */
  app.delete("/work-orders/:id/lines/:lineId", { preHandler: edit }, async (req) => {
    const { id, lineId } = LineParams.parse(req.params);
    const actor = actorOf(req);
    await db.transaction(async (tx) => {
      const wo = await lockOpen(tx, id);
      const [line] = await tx.select().from(docLines).where(and(eq(docLines.id, lineId), eq(docLines.workOrderId, id), isNull(docLines.archivedAt)));
      if (!line) throw notFound("البند");
      if (line.stockQtyMilli && line.variantId) await move(tx, actor, { variantId: line.variantId, warehouseId: wo.warehouseId ?? undefined, qtyMilli: line.stockQtyMilli, kind: "issue_return", refType: "doc_line", refId: line.id });
      await tx.update(docLines).set({ archivedAt: new Date(), stockQtyMilli: 0, updatedAt: new Date() }).where(eq(docLines.id, lineId));
    });
    return loadWorkOrder(db, actor, id);
  });

  /** Ready-made package (درج صيانة): every line issued in one transaction. */
  app.post("/work-orders/:id/packages/:packageId", { preHandler: [auth, requirePerm("stock.issue")] }, async (req, reply) => {
    const { id, packageId } = z.object({ id: z.uuid(), packageId: z.uuid() }).parse(req.params);
    const actor = actorOf(req);
    const lines = await db.select().from(packageLines).where(eq(packageLines.packageId, packageId));
    if (!lines.length) throw notFound("الدرج");
    const results = await db.transaction(async (tx) => {
      const out = [];
      for (const l of lines) out.push(await issueToWorkOrder(tx, actor, { workOrderId: id, variantId: l.variantId, qtyMilli: l.qtyMilli }));
      return out;
    });
    reply.status(201);
    return { lines: results, lowStock: results.some((r) => r.lowStock) };
  });

  app.post("/work-orders/:id/marks", { preHandler: edit }, async (req, reply) => {
    const { id } = Id.parse(req.params);
    const m = z.object({ id: z.uuid().optional(), x: z.number().int().min(0).max(1000), y: z.number().int().min(0).max(1000), kind: z.enum(["scratch", "dent", "damage"]), note: z.string().max(300).default(""), photoFileId: z.uuid().optional() }).parse(req.body);
    const [wo] = await db.select({ vehicleId: workOrders.vehicleId }).from(workOrders).where(eq(workOrders.id, id));
    if (!wo) throw notFound("أمر الشغل");
    const mid = m.id ?? uuidv7();
    await db.insert(intakeMarks).values({ id: mid, workOrderId: id, vehicleId: wo.vehicleId, x: m.x, y: m.y, kind: m.kind, note: m.note, photoFileId: m.photoFileId ?? null, createdBy: actorOf(req).id });
    reply.status(201);
    return { id: mid };
  });

  app.post("/work-orders/:id/approvals", { preHandler: [auth, requirePerm("estimate.approve")] }, async (req, reply) => {
    const { id } = Id.parse(req.params);
    const a = z.object({ newPt: int.positive(), approvedByName: z.string().trim().min(2).max(80), method: z.enum(["phone", "whatsapp", "in_person"]), note: z.string().max(300).optional() }).parse(req.body);
    const actor = actorOf(req);
    const res = await db.transaction(async (tx) => {
      const wo = await lockOpen(tx, id);
      const aid = uuidv7();
      await tx.insert(estimateApprovals).values({ id: aid, workOrderId: id, oldPt: wo.estimatePt, newPt: a.newPt, approvedByName: a.approvedByName, method: a.method, approvedAt: new Date(), createdBy: actor.id });
      await tx.update(workOrders).set({ estimatePt: a.newPt, updatedAt: new Date() }).where(eq(workOrders.id, id));
      await audit(tx, actor, "estimate.approve", "work_order", id, { estimatePt: wo.estimatePt }, a);
      return { id: aid };
    });
    reply.status(201);
    return res;
  });

  /** Catalog for the line picker: active variants with stock and price; no cost. */
  app.get("/catalog", { preHandler: [auth, requirePerm("item.view")] }, async (req) => {
    const q = z.object({ q: z.string().max(80), kind: z.enum(["labor", "parts"]).optional() }).parse(req.query);
    const text = q.q.trim(), key = searchKey(text);
    if (!key) return [];
    const rows = await db.select({ i: items, v: itemVariants, qtyMilli: stockLevels.qtyMilli }).from(itemVariants)
      .innerJoin(items, eq(items.id, itemVariants.itemId)).leftJoin(stockLevels, eq(stockLevels.variantId, itemVariants.id))
      .where(and(isNull(items.archivedAt), isNull(itemVariants.archivedAt), eq(items.active, true), eq(itemVariants.active, true),
        q.kind === "labor" ? eq(items.type, "labor") : q.kind === "parts" ? sql`${items.type} <> 'labor'` : undefined,
        or(ilike(items.nameKey, `%${key}%`), ilike(items.code, `%${text}%`), eq(itemVariants.barcode, text), ilike(items.nameEn, `%${text}%`))))
      .orderBy(items.code).limit(20);
    return rows.map(({ i, v, qtyMilli }) => ({
      variantId: v.id, itemId: i.id, code: i.code, name: i.nameAr, nameEn: i.nameEn, type: i.type, unit: i.unit, location: i.location, grade: v.grade,
      sellPricePt: v.sellPricePt, trackStock: i.trackStock, qtyMilli: qtyMilli ?? 0, minQtyMilli: v.minQtyMilli, barcode: v.barcode,
    }));
  });
}
