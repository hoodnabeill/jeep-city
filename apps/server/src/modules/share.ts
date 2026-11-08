/**
 * Customer status link (QR on printed documents): a long random token, stored only as a SHA-256 hash, that opens a
 * read-only page about one visit: car, status, dates, the statement total. No login, expires after `share.days`,
 * no phones, no other cars, no other visits. Public endpoint is rate-limited.
 */
import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { and, desc, eq, isNull } from "drizzle-orm";
import { firstName, uuidv7 } from "@jc/core";
import { z } from "zod";
import { actorOf } from "../auth/auth";
import type { Db } from "../db/client";
import { customers, docLines, payments, paymentMethods, shareTokens, statements, vehicles, workOrders } from "../db/schema";
import { getSetting } from "./settings";
import { AppError } from "../errors";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const GONE = () => new AppError(404, "link_expired", "الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من الورشة.");

export function shareRoutes(app: FastifyInstance, db: Db, auth: preHandlerHookHandler) {
  app.post("/share", { preHandler: auth }, async (req, reply) => {
    const { workOrderId } = z.object({ workOrderId: z.uuid() }).parse(req.body);
    const [wo] = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.id, workOrderId));
    if (!wo) throw new AppError(404, "not_found", "أمر الشغل غير موجود.");
    const days = Number(await getSetting(db, "share.days"));
    const token = randomBytes(24).toString("base64url");
    const actor = actorOf(req);
    await db.insert(shareTokens).values({ id: uuidv7(), tokenHash: hash(token), docType: "work_order", docId: wo.id, expiresAt: new Date(Date.now() + days * 864e5), createdBy: actor.id, deviceId: actor.deviceId ?? null });
    reply.status(201);
    return { token, days, baseUrl: (await getSetting<string>(db, "share.baseUrl")) || null };
  });

  app.get("/public/status/:token", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const { token } = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) }).safeParse(req.params).data ?? { token: "" };
    if (!token) throw GONE();
    const [t] = await db.select().from(shareTokens).where(and(eq(shareTokens.tokenHash, hash(token)), isNull(shareTokens.revokedAt)));
    if (!t || t.expiresAt < new Date() || t.docType !== "work_order") throw GONE();
    const [row] = await db.select({ wo: workOrders, v: vehicles, c: customers }).from(workOrders)
      .leftJoin(vehicles, eq(vehicles.id, workOrders.vehicleId)).innerJoin(customers, eq(customers.id, workOrders.customerId)).where(eq(workOrders.id, t.docId));
    if (!row) throw GONE();
    const [st] = await db.select().from(statements).where(and(eq(statements.workOrderId, t.docId), eq(statements.status, "final"))).orderBy(desc(statements.createdAt)).limit(1);
    const lines = await db.select({ name: docLines.name, category: docLines.category }).from(docLines).where(and(eq(docLines.workOrderId, t.docId), isNull(docLines.archivedAt)));
    const paid = st ? (await db.select({ amountPt: payments.amountPt, credit: paymentMethods.isCredit }).from(payments).innerJoin(paymentMethods, eq(paymentMethods.id, payments.methodId)).where(eq(payments.statementId, st.id)))
      .filter((p) => !p.credit).reduce((a, p) => a + p.amountPt, 0) : 0;
    const phones = await getSetting(db, "shop.phones");
    const { wo, v, c } = row;
    return {
      shop: { name: await getSetting(db, "shop.nameAr"), address: await getSetting(db, "shop.address"), phones: Array.isArray(phones) ? phones : [] },
      greeting: firstName(c.name),
      workOrder: { number: wo.number, status: wo.status, enteredAt: wo.enteredAt, expectedAt: wo.expectedAt, odometerIn: wo.odometerIn },
      vehicle: v ? { make: v.make, model: v.model, year: v.year, plateType: v.plateType, plateLetters: v.plateLetters, plateDigits: v.plateDigits } : null,
      work: lines.map((l) => ({ name: l.name, category: l.category })),
      statement: st ? { number: st.number, kind: st.kind, date: st.statementDate, amountDuePt: st.amountDuePt, paidPt: paid } : null,
      expiresAt: t.expiresAt,
    };
  });
}
