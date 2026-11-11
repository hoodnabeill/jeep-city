/**
 * Staff (الموظفين), staff.manage: every engineer and technician with what they owe the shop, and the month's
 * advances, debts, repayments, expenses spent on them and bonuses. Entries are append-only; a mistake is fixed
 * with an opposite entry (a repayment cancels an advance).
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { uuidv7 } from "@jc/core";
import { audit } from "../audit";
import { actorOf, requirePerm } from "../auth/auth";
import type { Db } from "../db/client";
import { cashMovements, staffEntries, technicians, users } from "../db/schema";
import { AppError, notFound } from "../errors";
import { int } from "../http";

export const STAFF_KINDS = ["advance", "debt", "repayment", "expense"] as const;
const KIND_LABEL: Record<(typeof STAFF_KINDS)[number], string> = { advance: "سلفة", debt: "مديونية", repayment: "سداد", expense: "مصروف" };
/** Cash drawer: an advance or expense leaves it, a repayment comes back into it. */
const CASH: Partial<Record<(typeof STAFF_KINDS)[number], { sign: 1 | -1; kind: string }>> = {
  advance: { sign: -1, kind: "withdrawal" }, expense: { sign: -1, kind: "expense" }, repayment: { sign: 1, kind: "deposit" },
};
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "الشهر بالشكل 2026-11.");
const lastDay = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);

type Row = Record<string, unknown>;
const rows = async (db: Db, q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: Row[] }).rows;

export function staffRoutes(app: FastifyInstance, db: Db, auth: preHandlerHookHandler) {
  const manage = [auth, requirePerm("staff.manage")];

  app.get("/staff", { preHandler: manage }, async (req) => {
    const { month } = z.object({ month: Month }).parse(req.query);
    const from = `${month}-01`, to = lastDay(month);
    const inMonth = (col: string) => sql.raw(`(${col} at time zone 'Africa/Cairo')::date between '${from}'::date and '${to}'::date`);
    const people = await rows(db, sql`
      with people as (
        select u.id as uid, null::uuid as tid, u.display_name as name, case when u.role = 'admin' then 'إدارة' else 'مهندس' end as role, u.active from users u where u.archived_at is null
        union all select null, t.id, t.name, 'فني', t.active from technicians t where t.archived_at is null
      )
      select p.uid as "userId", p.tid as "technicianId", p.name, p.role, p.active,
        coalesce(sum(case e.kind when 'repayment' then -e.amount_pt when 'expense' then 0 else e.amount_pt end), 0) as "owedPt",
        coalesce(sum(e.amount_pt) filter (where e.kind = 'advance' and ${inMonth("e.at")}), 0) as "advancePt",
        coalesce(sum(e.amount_pt) filter (where e.kind = 'debt' and ${inMonth("e.at")}), 0) as "debtPt",
        coalesce(sum(e.amount_pt) filter (where e.kind = 'repayment' and ${inMonth("e.at")}), 0) as "repaymentPt",
        coalesce(sum(e.amount_pt) filter (where e.kind = 'expense' and ${inMonth("e.at")}), 0) as "expensePt",
        (select coalesce(sum(b.amount_pt), 0) from bonuses b where (b.user_id = p.uid or b.technician_id = p.tid) and ${inMonth("b.given_at")}) as "bonusPt"
      from people p left join staff_entries e on e.user_id = p.uid or e.technician_id = p.tid
      group by p.uid, p.tid, p.name, p.role, p.active
      order by p.active desc, p.role, p.name`);
    const entries = await rows(db, sql`
      select e.id, e.kind, coalesce(u.display_name, t.name) as person, e.amount_pt as "amountPt", e.at, e.from_cash as "fromCash", e.note
        from staff_entries e left join users u on u.id = e.user_id left join technicians t on t.id = e.technician_id where ${inMonth("e.at")}
      union all
      select b.id, 'bonus', coalesce(u.display_name, t.name), b.amount_pt, b.given_at, false, b.reason
        from bonuses b left join users u on u.id = b.user_id left join technicians t on t.id = b.technician_id where ${inMonth("b.given_at")}
      order by at desc`);
    const num = ["owedPt", "advancePt", "debtPt", "repaymentPt", "expensePt", "bonusPt", "amountPt"];
    const typed = (r: Row) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, num.includes(k) ? Number(v) : v]));
    return { month, people: people.map(typed), entries: entries.map(typed) };
  });

  app.post("/staff/entries", { preHandler: manage }, async (req, reply) => {
    const e = z.object({
      userId: z.uuid().optional(), technicianId: z.uuid().optional(), kind: z.enum(STAFF_KINDS),
      amountPt: int.positive(), at: z.iso.date().optional(), fromCash: z.boolean().default(false), note: z.string().trim().max(300).optional(),
    }).refine((x) => !!x.userId !== !!x.technicianId, "اختار موظف واحد.").parse(req.body);
    const actor = actorOf(req);
    const id = uuidv7();
    await db.transaction(async (tx) => {
      const [person] = e.userId
        ? await tx.select({ name: users.displayName }).from(users).where(and(eq(users.id, e.userId), isNull(users.archivedAt)))
        : await tx.select({ name: technicians.name }).from(technicians).where(and(eq(technicians.id, e.technicianId!), isNull(technicians.archivedAt)));
      if (!person) throw notFound("الموظف");
      const cash = e.fromCash ? CASH[e.kind] : undefined;
      if (e.fromCash && !cash) throw new AppError(422, "no_cash", "المديونية مش بتطلع من الخزنة. سجّلها من غير الخزنة.");
      const at = e.at ? new Date(`${e.at}T12:00:00+02:00`) : new Date();
      await tx.insert(staffEntries).values({ id, userId: e.userId ?? null, technicianId: e.technicianId ?? null, kind: e.kind, amountPt: e.amountPt, at, fromCash: !!cash, note: e.note ?? null, createdBy: actor.id });
      if (cash) await tx.insert(cashMovements).values({ id: uuidv7(), amountPt: cash.sign * e.amountPt, kind: cash.kind, refType: "staff_entry", refId: id, note: `${KIND_LABEL[e.kind]}: ${person.name}`, movedAt: at, createdBy: actor.id });
      await audit(tx, actor, `staff.${e.kind}`, "staff_entry", id, null, e);
    });
    reply.status(201);
    return { id };
  });
}
