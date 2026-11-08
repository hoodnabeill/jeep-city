/**
 * Alerts and reminders (مذكرات وتنبيهات): service reminders by date or odometer, a simple notes list, and the
 * alert feed for the top bar: due reminders, customer debts older than `alerts.debtDays` (Admin only).
 * Low stock and long stays are read by the client from /items/low-stock and the work-order list.
 */
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { and, eq, isNull, sql } from "drizzle-orm";
import { can, uuidv7 } from "@jc/core";
import { z } from "zod";
import { actorOf } from "../auth/auth";
import type { Db } from "../db/client";
import { reminders } from "../db/schema";
import { getSetting } from "./settings";
import { AppError } from "../errors";
import { audit } from "../audit";

const cairoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const ReminderIn = z.object({
  id: z.uuid().optional(),
  kind: z.enum(["service", "note"]),
  vehicleId: z.uuid().nullable().optional(),
  customerId: z.uuid().nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
  dueKm: z.number().int().positive().max(5_000_000).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
}).refine((r) => r.dueDate || r.dueKm, { message: "حدد تاريخًا أو قراءة عداد للتذكير." });

/** Reminders with their car, customer and the car's last km; `due` when the date came or the car passed the km. */
async function listReminders(db: Db, where: ReturnType<typeof sql>) {
  const r = (await db.execute(sql`select r.id, r.kind, r.due_date as "dueDate", r.due_km as "dueKm", r.note, r.done_at as "doneAt", r.vehicle_id as "vehicleId", r.customer_id as "customerId",
      c.name as "customerName", c.mobile, c.whatsapp, v.make, v.model, v.plate_type as "plateType", v.plate_letters as "plateLetters", v.plate_digits as "plateDigits",
      (select max(o.km) from odometer_readings o where o.vehicle_id = r.vehicle_id) as "lastKm",
      (r.done_at is null and ((r.due_date is not null and r.due_date <= ${cairoToday()})
        or (r.due_km is not null and r.due_km <= coalesce((select max(o.km) from odometer_readings o where o.vehicle_id = r.vehicle_id), 0)))) as due
    from reminders r left join customers c on c.id = r.customer_id left join vehicles v on v.id = r.vehicle_id
    where r.archived_at is null and ${where} order by r.due_date nulls last, r.created_at desc limit 500`)) as unknown as { rows: Record<string, unknown>[] };
  return r.rows;
}

export function alertRoutes(app: FastifyInstance, db: Db, auth: preHandlerHookHandler) {
  app.get("/reminders", { preHandler: auth }, async (req) => {
    const q = z.object({ status: z.enum(["open", "due", "done"]).default("open"), vehicleId: z.uuid().optional() }).parse(req.query);
    const rows = await listReminders(db, sql`${q.status === "done" ? sql`r.done_at is not null` : sql`r.done_at is null`} ${q.vehicleId ? sql`and r.vehicle_id = ${q.vehicleId}` : sql``}`);
    return q.status === "due" ? rows.filter((r) => r.due) : rows;
  });

  app.post("/reminders", { preHandler: auth }, async (req, reply) => {
    const r = ReminderIn.parse(req.body);
    const actor = actorOf(req);
    const id = r.id ?? uuidv7();
    await db.insert(reminders).values({ id, kind: r.kind, vehicleId: r.vehicleId ?? null, customerId: r.customerId ?? null, dueDate: r.dueDate ?? null, dueKm: r.dueKm ?? null, note: r.note ?? null, createdBy: actor.id, deviceId: actor.deviceId ?? null });
    reply.status(201);
    return { id };
  });

  app.patch("/reminders/:id", { preHandler: auth }, async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const p = z.object({ done: z.boolean().optional(), archived: z.boolean().optional(), dueDate: z.iso.date().nullable().optional(), dueKm: z.number().int().positive().nullable().optional(), note: z.string().trim().max(500).nullable().optional() }).parse(req.body);
    const [r] = await db.select().from(reminders).where(and(eq(reminders.id, id), isNull(reminders.archivedAt)));
    if (!r) throw new AppError(404, "not_found", "التذكير غير موجود.");
    const { done, archived, ...rest } = p;
    await db.update(reminders).set({ ...rest, ...(done !== undefined ? { doneAt: done ? new Date() : null } : {}), ...(archived ? { archivedAt: new Date() } : {}), updatedAt: new Date() }).where(eq(reminders.id, id));
    await audit(db, actorOf(req), "reminder.update", "reminder", id, null, p);
    return { id };
  });

  /** The top-bar feed. Counts stay small; the full lists live on the alerts screen. */
  app.get("/alerts", { preHandler: auth }, async (req) => {
    const due = await listReminders(db, sql`r.done_at is null`).then((rs) => rs.filter((r) => r.due));
    if (!can(actorOf(req).role, "customer.viewBalance")) return { reminders: due, debts: [] };
    const days = Number(await getSetting(db, "alerts.debtDays"));
    const debts = (await db.execute(sql`select c.id, c.name, c.mobile, c.whatsapp, b.balance, b.since
      from (select customer_id, sum(amount_pt) as balance, max(created_at) as since from customer_ledger group by customer_id having sum(amount_pt) > 0) b
      join customers c on c.id = b.customer_id where b.since < now() - (${days} || ' days')::interval order by b.balance desc limit 200`)) as unknown as { rows: { balance: string }[] };
    return { reminders: due, debts: debts.rows.map((d) => ({ ...d, balance: Number(d.balance) })), debtDays: days };
  });
}
