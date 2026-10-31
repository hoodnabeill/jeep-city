/** Settings, payment methods, numbering starts, users, technicians, audit log (Admin). */
import { and, desc, eq, gte, isNull, lte, max, sql } from "drizzle-orm";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { uuidv7 } from "@jc/core";
import { audit } from "../audit";
import { actorOf, hashPassword, requirePerm } from "../auth/auth";
import type { Db } from "../db/client";
import { auditLog, numberSeries, paymentMethods, plateTypes, purchases, settings, statements, technicians, users, workOrders } from "../db/schema";
import { AppError, notFound } from "../errors";

const Id = z.object({ id: z.uuid() });

export function adminRoutes(app: FastifyInstance, db: Db, auth: preHandlerHookHandler) {
  const admin = [auth, requirePerm("settings.manage")];

  /* Settings: everyone reads (shop name, texts, digits); only Admin writes. */
  app.get("/settings", { preHandler: auth }, async () => {
    const rows = await db.select({ key: settings.key, value: settings.value }).from(settings);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });
  app.put("/settings/:key", { preHandler: admin }, async (req) => {
    const { key } = z.object({ key: z.string().regex(/^[a-z][a-zA-Z0-9.]{1,63}$/) }).parse(req.params);
    const { value } = z.object({ value: z.unknown() }).parse(req.body);
    const [old] = await db.select().from(settings).where(eq(settings.key, key));
    await db.insert(settings).values({ key, value: value ?? null, updatedBy: actorOf(req).id })
      .onConflictDoUpdate({ target: settings.key, set: { value: value ?? null, updatedAt: new Date(), updatedBy: actorOf(req).id } });
    await audit(db, actorOf(req), "settings.update", "setting", key, old?.value ?? null, value);
    return { key, value };
  });

  app.get("/payment-methods", { preHandler: auth }, async () => db.select().from(paymentMethods).orderBy(paymentMethods.sort));
  app.put("/payment-methods", { preHandler: admin }, async (req) => {
    const list = z.array(z.object({ id: z.string().regex(/^[a-z_]{2,32}$/), label: z.string().trim().min(1).max(40), needsReference: z.boolean(), isCredit: z.boolean(), isCash: z.boolean(), active: z.boolean() })).min(1).parse(req.body);
    await db.transaction(async (tx) => {
      for (const [i, m] of list.entries()) await tx.insert(paymentMethods).values({ ...m, sort: i + 1 }).onConflictDoUpdate({ target: paymentMethods.id, set: { ...m, sort: i + 1 } });
      await audit(tx, actorOf(req), "settings.payment_methods", "payment_methods", undefined, null, list);
    });
    return db.select().from(paymentMethods).orderBy(paymentMethods.sort);
  });

  const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
  app.get("/plate-types", { preHandler: auth }, async () => db.select().from(plateTypes).orderBy(plateTypes.sort));
  app.put("/plate-types", { preHandler: admin }, async (req) => {
    const list = z.array(z.object({
      id: z.string().regex(/^[a-z_]{2,32}$/), label: z.string().trim().min(1).max(40), barColor: color.nullable(), textColor: color,
      digitsOnly: z.boolean(), small: z.boolean(), toConfirm: z.boolean(), active: z.boolean(),
    })).min(1).parse(req.body);
    await db.transaction(async (tx) => {
      for (const [i, t] of list.entries()) await tx.insert(plateTypes).values({ ...t, sort: i + 1 }).onConflictDoUpdate({ target: plateTypes.id, set: { ...t, sort: i + 1 } });
      await audit(tx, actorOf(req), "settings.plate_types", "plate_types", undefined, null, list);
    });
    return db.select().from(plateTypes).orderBy(plateTypes.sort);
  });

  /* Numbering starts: the next number can only move past every number already used. */
  app.get("/numbers", { preHandler: admin }, async () => db.select().from(numberSeries));
  app.put("/numbers/:series", { preHandler: admin }, async (req) => {
    const { series } = z.object({ series: z.enum(["work_order", "statement", "direct_sale", "purchase"]) }).parse(req.params);
    const { next } = z.object({ next: z.number().int().positive().max(1e12) }).parse(req.body);
    const used = series === "work_order" ? await db.select({ m: max(workOrders.number) }).from(workOrders)
      : series === "purchase" ? await db.select({ m: max(purchases.number) }).from(purchases)
      : await db.select({ m: max(statements.number) }).from(statements).where(eq(statements.kind, series === "statement" ? "statement" : "direct_sale"));
    const maxUsed = Number(used[0]?.m ?? 0);
    if (next <= maxUsed) throw new AppError(422, "number_used", `الرقم ${next} مستخدم من قبل. أكبر رقم مستخدم ${maxUsed}.`);
    const [old] = await db.select().from(numberSeries).where(eq(numberSeries.series, series));
    await db.update(numberSeries).set({ nextValue: next }).where(eq(numberSeries.series, series));
    await audit(db, actorOf(req), "settings.numbering", "number_series", series, old ?? null, { next });
    return { series, next };
  });

  /* Users */
  const UserIn = z.object({
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, "اسم الدخول: حروف إنجليزية وأرقام فقط (3 إلى 32)."),
    displayName: z.string().trim().min(2).max(60),
    role: z.enum(["admin", "engineer"]),
    password: z.string().min(8, "كلمة المرور 8 حروف على الأقل.").max(128),
  });
  app.get("/users", { preHandler: auth }, async (req) => {
    const all = await db.select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role, active: users.active }).from(users).where(isNull(users.archivedAt)).orderBy(users.displayName);
    // Engineers need the list to pick a reception engineer, nothing more.
    return actorOf(req).role === "admin" ? all : all.filter((u) => u.active).map(({ id, displayName, role }) => ({ id, displayName, role }));
  });
  app.post("/users", { preHandler: admin }, async (req, reply) => {
    const u = UserIn.parse(req.body);
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.username, u.username));
    if (exists) throw new AppError(409, "username_taken", "اسم الدخول مستخدم من قبل.");
    const id = uuidv7();
    await db.insert(users).values({ id, username: u.username, displayName: u.displayName, role: u.role, passwordHash: await hashPassword(u.password), createdBy: actorOf(req).id });
    await audit(db, actorOf(req), "user.create", "user", id, null, { username: u.username, role: u.role });
    reply.status(201);
    return { id };
  });
  app.patch("/users/:id", { preHandler: admin }, async (req) => {
    const { id } = Id.parse(req.params);
    const p = UserIn.omit({ username: true }).partial().extend({ active: z.boolean().optional() }).parse(req.body);
    if (id === actorOf(req).id && (p.active === false || p.role === "engineer")) throw new AppError(422, "self_lockout", "لا يمكنك إيقاف حسابك أو تغيير صلاحيتك بنفسك.");
    const [u] = await db.select().from(users).where(eq(users.id, id));
    if (!u) throw notFound("المستخدم");
    await db.update(users).set({
      displayName: p.displayName ?? u.displayName, role: p.role ?? u.role, active: p.active ?? u.active,
      passwordHash: p.password ? await hashPassword(p.password) : u.passwordHash, updatedAt: new Date(),
    }).where(eq(users.id, id));
    await audit(db, actorOf(req), "user.update", "user", id, { displayName: u.displayName, role: u.role, active: u.active }, { ...p, password: p.password ? "(changed)" : undefined });
    return { id };
  });

  /* Technicians (separate from users) */
  const TechIn = z.object({ name: z.string().trim().min(2).max(60), phone: z.string().trim().max(30).optional(), active: z.boolean().optional() });
  app.get("/technicians", { preHandler: auth }, async () => db.select().from(technicians).where(isNull(technicians.archivedAt)).orderBy(technicians.name));
  app.post("/technicians", { preHandler: admin }, async (req, reply) => {
    const t = TechIn.parse(req.body);
    const id = uuidv7();
    await db.insert(technicians).values({ id, name: t.name, phone: t.phone ?? null, createdBy: actorOf(req).id });
    reply.status(201);
    return { id };
  });
  app.patch("/technicians/:id", { preHandler: admin }, async (req) => {
    const { id } = Id.parse(req.params);
    const t = TechIn.partial().parse(req.body);
    await db.update(technicians).set({ ...t, updatedAt: new Date() }).where(eq(technicians.id, id));
    return { id };
  });

  /* Audit log */
  app.get("/audit", { preHandler: [auth, requirePerm("audit.view")] }, async (req) => {
    const q = z.object({ entity: z.string().optional(), entityId: z.string().optional(), from: z.iso.date().optional(), to: z.iso.date().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    const where = and(
      q.entity ? eq(auditLog.entity, q.entity) : undefined, q.entityId ? eq(auditLog.entityId, q.entityId) : undefined,
      q.from ? gte(auditLog.at, new Date(q.from)) : undefined, q.to ? lte(auditLog.at, new Date(`${q.to}T23:59:59Z`)) : undefined,
    );
    return db.select({ id: auditLog.id, at: auditLog.at, action: auditLog.action, entity: auditLog.entity, entityId: auditLog.entityId, before: auditLog.before, after: auditLog.after, user: users.displayName })
      .from(auditLog).leftJoin(users, eq(users.id, auditLog.userId)).where(where).orderBy(desc(auditLog.at)).limit(q.limit);
  });

  app.get("/server-time", { preHandler: auth }, async () => ({ now: new Date().toISOString(), seq: Number((await db.execute(sql`select last_value from change_seq`) as unknown as { rows: { last_value: string }[] }).rows[0].last_value) }));
}
