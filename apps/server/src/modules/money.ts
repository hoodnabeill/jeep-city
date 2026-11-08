/** Cash drawer, expenses, bonuses (Admin) and the home dashboard. */
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { can, uuidv7 } from "@jc/core";
import { audit } from "../audit";
import { actorOf, requirePerm } from "../auth/auth";
import type { Db } from "../db/client";
import {
  bonuses, cashMovements, cashSessions, customerLedger, expenseCategories, expenses, itemVariants, items, statements, stockLevels, technicians, users, workOrders,
} from "../db/schema";
import { AppError, notFound } from "../errors";
import { int } from "../http";


async function openSession(db: Db) {
  const [s] = await db.select().from(cashSessions).where(isNull(cashSessions.closedAt)).orderBy(desc(cashSessions.openedAt)).limit(1);
  return s ?? null;
}

/** Expected cash = opening + Σ movements from the session's opening time (to its close, or now). */
async function expected(db: Db, s: typeof cashSessions.$inferSelect, until?: Date) {
  const [r] = await db.select({ inPt: sql<string>`coalesce(sum(case when ${cashMovements.amountPt} > 0 then ${cashMovements.amountPt} end), 0)`, outPt: sql<string>`coalesce(sum(case when ${cashMovements.amountPt} < 0 then -${cashMovements.amountPt} end), 0)` })
    .from(cashMovements).where(and(gte(cashMovements.movedAt, s.openedAt), until ? lt(cashMovements.movedAt, until) : undefined));
  const inPt = Number(r.inPt), outPt = Number(r.outPt);
  return { inPt, outPt, expectedPt: s.openingPt + inPt - outPt };
}

export function moneyRoutes(app: FastifyInstance, db: Db, auth: preHandlerHookHandler) {
  const cash = [auth, requirePerm("cash.manage")];

  app.get("/cash/current", { preHandler: cash }, async () => {
    const s = await openSession(db);
    if (!s) return { open: false };
    const moves = await db.select({ m: cashMovements, by: users.displayName }).from(cashMovements).leftJoin(users, eq(users.id, cashMovements.createdBy)).where(gte(cashMovements.movedAt, s.openedAt)).orderBy(asc(cashMovements.movedAt));
    return { open: true, session: s, ...(await expected(db, s)), movements: moves.map(({ m, by }) => ({ ...m, by })) };
  });

  app.post("/cash/open", { preHandler: cash }, async (req, reply) => {
    const { openingPt } = z.object({ openingPt: int.nonnegative() }).parse(req.body);
    if (await openSession(db)) throw new AppError(409, "already_open", "يومية الصندوق مفتوحة بالفعل.");
    const id = uuidv7();
    await db.insert(cashSessions).values({ id, openedAt: new Date(), openingPt, createdBy: actorOf(req).id });
    await audit(db, actorOf(req), "cash.open", "cash_session", id, null, { openingPt });
    reply.status(201);
    return { id };
  });

  app.post("/cash/close", { preHandler: cash }, async (req) => {
    const p = z.object({ countedPt: int.nonnegative(), note: z.string().trim().max(500).optional() }).parse(req.body);
    const s = await openSession(db);
    if (!s) throw new AppError(409, "not_open", "لا توجد يومية مفتوحة.");
    const now = new Date();
    const e = await expected(db, s, now);
    const diff = p.countedPt - e.expectedPt;
    if (diff !== 0 && !p.note) throw new AppError(422, "note_required", "يوجد فرق بين المفروض والفعلي. اكتب سبب الفرق.", { expectedPt: e.expectedPt, differencePt: diff });
    await db.update(cashSessions).set({ closedAt: now, closedBy: actorOf(req).id, expectedPt: e.expectedPt, countedPt: p.countedPt, differencePt: diff, note: p.note ?? null, updatedAt: now }).where(eq(cashSessions.id, s.id));
    await audit(db, actorOf(req), "cash.close", "cash_session", s.id, null, { expectedPt: e.expectedPt, countedPt: p.countedPt, differencePt: diff, note: p.note });
    return { id: s.id, ...e, countedPt: p.countedPt, differencePt: diff };
  });

  app.get("/cash/sessions", { preHandler: cash }, async () => db.select().from(cashSessions).orderBy(desc(cashSessions.openedAt)).limit(60));

  app.post("/cash/movements", { preHandler: cash }, async (req, reply) => {
    const m = z.object({ kind: z.enum(["deposit", "withdrawal"]), amountPt: int.positive(), note: z.string().trim().min(2).max(300) }).parse(req.body);
    const id = uuidv7();
    await db.insert(cashMovements).values({ id, amountPt: m.kind === "deposit" ? m.amountPt : -m.amountPt, kind: m.kind, note: m.note, movedAt: new Date(), createdBy: actorOf(req).id });
    await audit(db, actorOf(req), `cash.${m.kind}`, "cash_movement", id, null, m);
    reply.status(201);
    return { id };
  });

  app.get("/expense-categories", { preHandler: cash }, async () => db.select().from(expenseCategories).where(isNull(expenseCategories.archivedAt)).orderBy(expenseCategories.name));
  app.post("/expense-categories", { preHandler: cash }, async (req, reply) => {
    const { name } = z.object({ name: z.string().trim().min(2).max(60) }).parse(req.body);
    const id = uuidv7();
    await db.insert(expenseCategories).values({ id, name, createdBy: actorOf(req).id });
    reply.status(201);
    return { id };
  });
  app.get("/expenses", { preHandler: cash }, async (req) => {
    const q = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }).parse(req.query);
    return db.select({ e: expenses, category: expenseCategories.name }).from(expenses).innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .where(and(q.from ? gte(expenses.spentAt, new Date(q.from)) : undefined, q.to ? lte(expenses.spentAt, new Date(`${q.to}T23:59:59Z`)) : undefined)).orderBy(desc(expenses.spentAt)).limit(500);
  });
  app.post("/expenses", { preHandler: cash }, async (req, reply) => {
    const e = z.object({ id: z.uuid().optional(), categoryId: z.uuid(), amountPt: int.positive(), spentAt: z.iso.datetime().optional(), paidBy: z.string().trim().max(60).optional(), notes: z.string().max(500).optional(), fromCash: z.boolean().default(true), fileId: z.uuid().optional() }).parse(req.body);
    const actor = actorOf(req);
    const id = e.id ?? uuidv7();
    await db.transaction(async (tx) => {
      const [cat] = await tx.select().from(expenseCategories).where(eq(expenseCategories.id, e.categoryId));
      if (!cat) throw notFound("بند المصروف");
      const at = e.spentAt ? new Date(e.spentAt) : new Date();
      await tx.insert(expenses).values({ id, categoryId: e.categoryId, amountPt: e.amountPt, spentAt: at, paidBy: e.paidBy ?? null, notes: e.notes ?? null, fromCash: e.fromCash, fileId: e.fileId ?? null, createdBy: actor.id });
      if (e.fromCash) await tx.insert(cashMovements).values({ id: uuidv7(), amountPt: -e.amountPt, kind: "expense", refType: "expense", refId: id, note: cat.name, movedAt: at, createdBy: actor.id });
      await audit(tx, actor, "expense.create", "expense", id, null, e);
    });
    reply.status(201);
    return { id };
  });

  app.get("/bonuses", { preHandler: [auth, requirePerm("bonus.manage")] }, async (req) => {
    const q = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }).parse(req.query);
    const where = and(q.from ? gte(bonuses.givenAt, new Date(q.from)) : undefined, q.to ? lte(bonuses.givenAt, new Date(`${q.to}T23:59:59Z`)) : undefined);
    const rows = await db.select({ b: bonuses, user: users.displayName, tech: technicians.name }).from(bonuses).leftJoin(users, eq(users.id, bonuses.userId)).leftJoin(technicians, eq(technicians.id, bonuses.technicianId)).where(where).orderBy(desc(bonuses.givenAt));
    const totals = new Map<string, number>();
    for (const r of rows) { const name = r.user ?? r.tech ?? "—"; totals.set(name, (totals.get(name) ?? 0) + r.b.amountPt); }
    return { rows: rows.map((r) => ({ ...r.b, person: r.user ?? r.tech })), totals: [...totals].map(([person, amountPt]) => ({ person, amountPt })) };
  });
  app.post("/bonuses", { preHandler: [auth, requirePerm("bonus.manage")] }, async (req, reply) => {
    const b = z.object({ userId: z.uuid().optional(), technicianId: z.uuid().optional(), amountPt: int.positive(), givenAt: z.iso.date().optional(), reason: z.string().trim().min(2).max(200), statementId: z.uuid().optional() })
      .refine((x) => !!x.userId !== !!x.technicianId, "اختر مهندسًا أو فنيًا واحدًا.").parse(req.body);
    const id = uuidv7();
    await db.insert(bonuses).values({ id, userId: b.userId ?? null, technicianId: b.technicianId ?? null, amountPt: b.amountPt, givenAt: b.givenAt ? new Date(b.givenAt) : new Date(), reason: b.reason, statementId: b.statementId ?? null, createdBy: actorOf(req).id });
    await audit(db, actorOf(req), "bonus.create", "bonus", id, null, b);
    reply.status(201);
    return { id };
  });

  /* Home dashboard: Admin and engineer see different numbers (D-20). */
  app.get("/dashboard", { preHandler: auth }, async (req) => {
    const actor = actorOf(req);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
    const inShop = await db.select({ status: workOrders.status, n: sql<number>`count(*)::int`, mine: sql<number>`count(*) filter (where ${workOrders.receptionUserId} = ${actor.id})::int` }).from(workOrders).where(inArray(workOrders.status, ["open", "ready"])).groupBy(workOrders.status);
    const low = await db.select({ n: sql<number>`count(*)::int` }).from(itemVariants).innerJoin(items, eq(items.id, itemVariants.itemId)).leftJoin(stockLevels, eq(stockLevels.variantId, itemVariants.id))
      .where(and(isNull(itemVariants.archivedAt), eq(items.trackStock, true), sql`${itemVariants.minQtyMilli} > 0 and coalesce(${stockLevels.qtyMilli}, 0) <= ${itemVariants.minQtyMilli}`));
    const base = {
      carsInShop: inShop.reduce((a, r) => a + r.n, 0), readyForPickup: inShop.find((r) => r.status === "ready")?.n ?? 0,
      myOpen: inShop.reduce((a, r) => a + r.mine, 0), lowStock: low[0]?.n ?? 0,
    };
    if (!can(actor.role, "report.view")) return base;
    const [sales] = await db.select({ pt: sql<string>`coalesce(sum(${statements.amountDuePt}), 0)`, n: sql<number>`count(*)::int` }).from(statements).where(and(eq(statements.statementDate, today), eq(statements.status, "final")));
    const s = await openSession(db);
    const [debt] = await db.select({ pt: sql<string>`coalesce(sum(${customerLedger.amountPt}), 0)` }).from(customerLedger);
    return { ...base, salesTodayPt: Number(sales.pt), statementsToday: sales.n, cashInDrawerPt: s ? (await expected(db, s)).expectedPt : null, customerDebtPt: Number(debt.pt) };
  });
}
