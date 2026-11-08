/**
 * Sync (PLAN §5). The server is the source of truth.
 *  - pull:   rows changed after a cursor (`server_seq`), filtered for what a PC may keep (never cost, cash or ledgers, D-20).
 *  - push:   writes queued on a PC while offline, replayed IN ORDER through the normal API (same validation,
 *            permissions and audit), each exactly once thanks to its mutation id.
 *  - events: Server-Sent Events: "something changed up to seq N"; the PC then pulls and refreshes its screens.
 */
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { ServerResponse } from "node:http";
import { z } from "zod";
import { actorOf, REPLAY_SECRET } from "../auth/auth";
import type { Db } from "../db/client";
import {
  customers, docLines, estimateApprovals, intakeMarks, items, itemVariants, odometerReadings, packageLines, paymentMethods, payments, plateTypes,
  servicePackages, settings, statements, stockLevels, syncMutations, technicians, users, vehicles, workOrders, workOrderTechnicians,
} from "../db/schema";

type Row = Record<string, unknown>;
type PullTable = { name: string; table: any; map?: (r: Row) => Row };
const omit = (r: Row, ...keys: string[]) => Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k)));

const PULL: PullTable[] = [
  { name: "users", table: users, map: (r) => omit(r, "passwordHash") },
  { name: "technicians", table: technicians },
  { name: "settings", table: settings },
  { name: "customers", table: customers, map: (r) => omit(r, "openingBalancePt") },
  { name: "vehicles", table: vehicles },
  { name: "odometerReadings", table: odometerReadings },
  { name: "items", table: items },
  { name: "itemVariants", table: itemVariants },
  { name: "stockLevels", table: stockLevels, map: (r) => omit(r, "avgCostPt") },
  { name: "servicePackages", table: servicePackages },
  { name: "packageLines", table: packageLines },
  { name: "workOrders", table: workOrders },
  { name: "docLines", table: docLines },
  { name: "intakeMarks", table: intakeMarks },
  { name: "estimateApprovals", table: estimateApprovals },
  { name: "statements", table: statements },
  { name: "payments", table: payments },
];

export async function currentSeq(db: Db): Promise<number> {
  const r = (await db.execute(sql`select last_value, is_called from change_seq`)) as unknown as { rows: { last_value: string; is_called: boolean }[] };
  return r.rows[0].is_called ? Number(r.rows[0].last_value) : 0;
}

/** Rows changed after `since`, at most `limit` per table; the cursor never skips a row of a table that hit its limit. */
export async function pull(db: Db, since: number, limit = 2000) {
  const raw: Record<string, Row[]> = {};
  let cursor = Infinity, more = false;
  for (const t of PULL) {
    const rows: Row[] = await db.select().from(t.table).where(gt(t.table.serverSeq, since)).orderBy(t.table.serverSeq).limit(limit + 1);
    if (rows.length > limit) { more = true; rows.length = limit; cursor = Math.min(cursor, Number(rows[limit - 1].serverSeq)); }
    raw[t.name] = rows;
  }
  if (!more) cursor = Math.max(since, await currentSeq(db));
  const out: Record<string, Row[]> = {};
  for (const t of PULL) out[t.name] = raw[t.name].filter((r) => Number(r.serverSeq) <= cursor).map((r) => (t.map ? t.map(r) : r));
  // Technicians of a work order live in a link table; send them on the work order row.
  const woIds = out.workOrders.map((w) => w.id as string);
  const links = woIds.length ? await db.select().from(workOrderTechnicians).where(inArray(workOrderTechnicians.workOrderId, woIds)) : [];
  out.workOrders = out.workOrders.map((w) => ({ ...w, technicianIds: links.filter((l) => l.workOrderId === w.id).map((l) => l.technicianId) }));
  out.paymentMethods = await db.select().from(paymentMethods).orderBy(paymentMethods.sort); // tiny, always whole
  out.plateTypes = await db.select().from(plateTypes).orderBy(plateTypes.sort);
  const [id] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "system.dbId"));
  return { dbId: id?.value as string | undefined, cursor, more, rows: out };
}

const REPLAYABLE = [/^\/work-orders(\/|$)/, /^\/statements(\/|$)/, /^\/customers(\/|$)/, /^\/vehicles(\/|$)/, /^\/direct-sales$/];
const Mutation = z.object({
  id: z.uuid(),
  method: z.enum(["POST", "PATCH", "PUT", "DELETE"]),
  path: z.string().max(300).regex(/^\/[A-Za-z0-9\-/]*$/),
  body: z.unknown().optional(),
  createdAt: z.iso.datetime().optional(),
});
const Push = z.object({ mutations: z.array(Mutation).min(1).max(200) });
export type PushResult = { id: string; status: "ok" | "rejected" | "retry"; httpStatus: number; body: unknown };
// Not stored, so the PC tries again: the server or the session had a temporary problem.
const RETRYABLE = (code: number) => code === 401 || code === 429 || code >= 500;

const streams = new Set<ServerResponse>();
let pending: NodeJS.Timeout | null = null;
function announce(db: Db) {
  if (!streams.size || pending) return;
  pending = setTimeout(async () => {
    pending = null;
    const seq = await currentSeq(db).catch(() => null);
    if (seq !== null) for (const s of streams) s.write(`event: seq\ndata: ${seq}\n\n`);
  }, 250);
}

export function syncRoutes(app: FastifyInstance, db: Db, auth: preHandlerHookHandler) {
  app.get("/sync/pull", { preHandler: auth }, async (req) => {
    const q = z.object({ since: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(5000).default(2000) }).parse(req.query);
    return pull(db, q.since, q.limit);
  });

  app.post("/sync/push", { preHandler: auth }, async (req) => {
    const { mutations } = Push.parse(req.body);
    const actor = actorOf(req);
    const results: PushResult[] = [];
    for (const m of mutations) {
      // Claim the mutation id first so two pushes of the same queue can never run it twice.
      const claimed = await db.insert(syncMutations).values({ mutationId: m.id, deviceId: actor.deviceId ?? null, userId: actor.id, result: null }).onConflictDoNothing().returning();
      if (!claimed.length) {
        const [prev] = await db.select().from(syncMutations).where(eq(syncMutations.mutationId, m.id));
        if (prev?.userId !== actor.id) results.push({ id: m.id, status: "rejected", httpStatus: 409, body: { error: { code: "foreign_mutation", message: "هذا التغيير يخص مستخدمًا آخر." } } });
        else results.push(prev.result ? (prev.result as PushResult) : { id: m.id, status: "retry", httpStatus: 409, body: null });
        continue;
      }
      let result: PushResult;
      if (!REPLAYABLE.some((r) => r.test(m.path))) {
        result = { id: m.id, status: "rejected", httpStatus: 403, body: { error: { code: "not_replayable", message: "هذا التغيير يحتاج اتصالًا بالخادم ولا يُحفظ أثناء الانقطاع." } } };
      } else {
        const res = await app.inject({
          method: m.method, url: m.path, payload: m.body as object | undefined,
          headers: { authorization: req.headers.authorization ?? "", "x-device-id": actor.deviceId ?? "", "x-sync-replay": REPLAY_SECRET },
        });
        const body = res.body ? (() => { try { return res.json(); } catch { return null; } })() : null;
        result = { id: m.id, status: res.statusCode < 400 ? "ok" : RETRYABLE(res.statusCode) ? "retry" : "rejected", httpStatus: res.statusCode, body };
      }
      if (result.status === "retry") await db.delete(syncMutations).where(and(eq(syncMutations.mutationId, m.id), eq(syncMutations.userId, actor.id)));
      else await db.update(syncMutations).set({ result }).where(eq(syncMutations.mutationId, m.id));
      results.push(result);
    }
    return { results, cursor: await currentSeq(db) };
  });

  app.get("/sync/events", { preHandler: auth }, async (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
    res.write(`event: seq\ndata: ${await currentSeq(db)}\n\n`);
    streams.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    req.raw.on("close", () => { clearInterval(ping); streams.delete(res); });
  });

  // Every successful write tells the connected PCs (debounced: one message for a burst of writes).
  app.addHook("onResponse", async (req, reply) => {
    if (req.method !== "GET" && reply.statusCode < 400 && !req.url.startsWith("/auth")) announce(db);
  });
}
