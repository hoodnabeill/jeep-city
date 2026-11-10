/**
 * Activity log (سجل العمليات): who changed, opened or searched what.
 * - Every successful write is logged. Handlers that write their own detailed audit row (with before/after) mark the
 *   request, and the generic row is skipped so nothing is logged twice.
 * - Opening a work order, customer, car, statement or item is logged once per user per 10 minutes (screens refetch often).
 * - A search is logged once the user stops typing (the last text), not for every keystroke.
 */
import type { FastifyInstance } from "fastify";
import { audit, type Actor } from "./audit";
import type { Db } from "./db/client";

const VIEWS: Record<string, string> = {
  "/work-orders/:id": "work_order", "/customers/:id": "customer", "/statements/:id": "statement",
  "/items/:id": "item", "/vehicles/:id/history": "vehicle",
};
/**
 * Routes not worth a row: replays are logged one by one; number blocks are housekeeping; uploads are part of the
 * change that uses them; status links are made automatically every time a job card is printed.
 */
const SKIP = new Set(["/sync/push", "/numbers/blocks", "/files", "/share"]);
const ENTITY: Record<string, string> = {
  "work-orders": "work_order", customers: "customer", vehicles: "vehicle", statements: "statement", "direct-sales": "statement", items: "item",
  suppliers: "supplier", technicians: "technician", reminders: "reminder", "stock-counts": "stock_count", packages: "package",
  "item-categories": "item_category", "expense-categories": "expense_category", partners: "partners", users: "user", share: "share",
};
const VIEW_EVERY_MS = 10 * 60_000;
const SEARCH_IDLE_MS = 3_000;

const seen = new Map<string, number>();
function firstInWindow(key: string) {
  const now = Date.now();
  if ((seen.get(key) ?? 0) > now - VIEW_EVERY_MS) return false;
  if (seen.size > 5000) seen.clear();
  seen.set(key, now);
  return true;
}

const typing = new Map<string, { q: string; timer: NodeJS.Timeout }>();
function searchTyped(db: Db, actor: Actor, q: string) {
  const prev = typing.get(actor.id);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    typing.delete(actor.id);
    audit(db, actor, "search", "lookup", undefined, null, { q }).catch(() => {});
  }, SEARCH_IDLE_MS);
  timer.unref?.();
  typing.set(actor.id, { q, timer });
}

/** Small request bodies only, and never passwords or images. */
function summary(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const json = JSON.stringify(body, (k, v) => (/password|dataUrl|signature|png|base64/i.test(k) ? undefined : v));
  return json.length <= 2000 ? JSON.parse(json) : { note: "(بيانات كبيرة)" };
}

export function activityLog(app: FastifyInstance, db: Db) {
  app.addHook("onResponse", async (req, reply) => {
    const actor = req.actor;
    const route = req.routeOptions.url;
    if (!actor || !route || reply.statusCode >= 400) return;
    const id = (req.params as Record<string, string> | undefined)?.id;
    try {
      if (req.method === "GET") {
        if (VIEWS[route] && id && firstInWindow(`${actor.id}|${route}|${id}`)) await audit(db, actor, "view", VIEWS[route], id);
        const q = route === "/lookup" ? String((req.query as { q?: string }).q ?? "").trim() : "";
        if (q.length >= 2) searchTyped(db, actor, q);
        return;
      }
      if (actor.audited || SKIP.has(route) || route.startsWith("/auth")) return;
      await audit(db, actor, `${req.method} ${route}`, ENTITY[route.split("/")[1]] ?? route.split("/")[1], id, null, summary(req.body));
    } catch (e) {
      req.log.error(e, "activity log write failed");
    }
  });
}
