/** Partners: profit shares, the monthly split and each partner's withdrawals (Admin, partners.manage). */
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { BP, divRound, uuidv7 } from "@jc/core";
import { audit } from "../audit";
import { actorOf, requirePerm } from "../auth/auth";
import type { Db } from "../db/client";
import { cashMovements, partners, partnerWithdrawals } from "../db/schema";
import { AppError, notFound } from "../errors";
import { int } from "../http";
import { profitSummary } from "./reports";

const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "الشهر بالشكل 2026-11.");
const lastDay = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
const cairoDay = sql`(${partnerWithdrawals.takenAt} at time zone 'Africa/Cairo')::date`;
const BEGINNING = "2000-01-01";

export function partnerRoutes(app: FastifyInstance, db: Db, auth: preHandlerHookHandler) {
  const manage = [auth, requirePerm("partners.manage")];
  const active = () => db.select().from(partners).where(isNull(partners.archivedAt)).orderBy(asc(partners.createdAt));

  app.get("/partners", { preHandler: manage }, async () => active());

  /** Replace the whole list at once, so the shares always total 100%. */
  const Share = z.object({ id: z.uuid().optional(), name: z.string().trim().min(2).max(60), shareBp: int.min(1).max(BP) });
  app.put("/partners", { preHandler: manage }, async (req) => {
    const list = z.array(Share).min(1).max(10).parse(req.body);
    if (list.reduce((a, p) => a + p.shareBp, 0) !== BP) throw new AppError(422, "shares_total", "مجموع النسب لازم يكون 100%.");
    const actor = actorOf(req);
    await db.transaction(async (tx) => {
      const before = await tx.select().from(partners).where(isNull(partners.archivedAt));
      const keep = new Set(list.flatMap((p) => (p.id ? [p.id] : [])));
      for (const old of before) if (!keep.has(old.id)) await tx.update(partners).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(partners.id, old.id));
      for (const p of list) {
        if (p.id && !before.some((o) => o.id === p.id)) throw notFound("الشريك");
        if (p.id) await tx.update(partners).set({ name: p.name, shareBp: p.shareBp, updatedAt: new Date() }).where(eq(partners.id, p.id));
        else await tx.insert(partners).values({ id: uuidv7(), name: p.name, shareBp: p.shareBp, createdBy: actor.id });
      }
      await audit(tx, actor, "partners.update", "partners", undefined, before.map(({ id, name, shareBp }) => ({ id, name, shareBp })), list);
    });
    return active();
  });

  app.post("/partners/withdrawals", { preHandler: manage }, async (req, reply) => {
    const w = z.object({
      partnerId: z.uuid(), amountPt: int.refine((n) => n !== 0, "اكتب المبلغ."), takenAt: z.iso.date().optional(),
      fromCash: z.boolean().default(true), note: z.string().trim().max(300).optional(),
    }).parse(req.body);
    const actor = actorOf(req);
    const id = uuidv7();
    await db.transaction(async (tx) => {
      const [p] = await tx.select().from(partners).where(and(eq(partners.id, w.partnerId), isNull(partners.archivedAt)));
      if (!p) throw notFound("الشريك");
      const at = w.takenAt ? new Date(`${w.takenAt}T12:00:00+02:00`) : new Date();
      await tx.insert(partnerWithdrawals).values({ id, partnerId: p.id, amountPt: w.amountPt, takenAt: at, fromCash: w.fromCash, note: w.note ?? null, createdBy: actor.id });
      // Taken from the drawer: the drawer goes down (or up, for money paid back).
      if (w.fromCash) await tx.insert(cashMovements).values({ id: uuidv7(), amountPt: -w.amountPt, kind: "withdrawal", refType: "partner_withdrawal", refId: id, note: `مسحوبات: ${p.name}`, movedAt: at, createdBy: actor.id });
      await audit(tx, actor, "partner.withdrawal", "partner_withdrawal", id, null, w);
    });
    reply.status(201);
    return { id };
  });

  /** One month: the profit, each partner's share, what they took, and what the shop still owes them overall. */
  app.get("/partners/summary", { preHandler: manage }, async (req) => {
    const { month } = z.object({ month: Month }).parse(req.query);
    const from = `${month}-01`, to = lastDay(month);
    const [profit, total, list] = await Promise.all([profitSummary(db, from, to), profitSummary(db, BEGINNING, to), active()]);
    const taken = await db.select({
      partnerId: partnerWithdrawals.partnerId,
      monthPt: sql<string>`coalesce(sum(${partnerWithdrawals.amountPt}) filter (where ${cairoDay} between ${from}::date and ${to}::date), 0)`,
      allPt: sql<string>`coalesce(sum(${partnerWithdrawals.amountPt}), 0)`,
    }).from(partnerWithdrawals).where(lte(cairoDay, sql`${to}::date`)).groupBy(partnerWithdrawals.partnerId);
    const withdrawals = await db.select({ w: partnerWithdrawals, name: partners.name }).from(partnerWithdrawals).innerJoin(partners, eq(partners.id, partnerWithdrawals.partnerId))
      .where(sql`${cairoDay} between ${from}::date and ${to}::date`).orderBy(asc(partnerWithdrawals.takenAt));
    return {
      month, from, to, profit,
      partners: list.map((p) => {
        const t = taken.find((x) => x.partnerId === p.id);
        const monthTakenPt = Number(t?.monthPt ?? 0), allTakenPt = Number(t?.allPt ?? 0);
        // shortcut: the running balance applies today's shares to all past profit; fine while shares never change, revisit if they do.
        const earnedPt = divRound(total.profitPt * p.shareBp, BP);
        return { id: p.id, name: p.name, shareBp: p.shareBp, sharePt: divRound(profit.profitPt * p.shareBp, BP), monthTakenPt, earnedPt, allTakenPt, balancePt: earnedPt - allTakenPt };
      }),
      withdrawals: withdrawals.map((r) => ({ ...r.w, partner: r.name })),
    };
  });
}
