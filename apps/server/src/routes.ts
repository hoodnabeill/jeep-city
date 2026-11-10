import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { can } from "@jc/core";
import { actorOf, authenticate, requirePerm } from "./auth/auth";
import type { Config } from "./config";
import type { Db } from "./db/client";
import { reserveBlock } from "./modules/numbering";
import { AppError } from "./errors";
import { adjust, issueToWorkOrder, level } from "./modules/stock";
import { cancelStatement, editStatement, finalizeStatement, getStatement } from "./modules/statements";
import { adminRoutes } from "./modules/admin";
import { itemRoutes } from "./modules/items";
import { customerRoutes } from "./modules/customers";
import { workOrderRoutes } from "./modules/workorders";
import { salesRoutes } from "./modules/sales";
import { purchasingRoutes } from "./modules/purchasing";
import { moneyRoutes } from "./modules/money";
import { syncRoutes } from "./modules/sync";
import { reportRoutes } from "./modules/reports";
import { alertRoutes } from "./modules/alerts";
import { shareRoutes } from "./modules/share";
import { conditionRoutes } from "./modules/condition";
import { partnerRoutes } from "./modules/partners";
import { countRoutes } from "./modules/counts";
import { fileRoutes } from "./modules/files";
import { Id } from "./http";

const Issue = z.object({ variantId: z.uuid(), qtyMilli: z.number().int().positive(), reason: z.string().max(500).optional(), lineId: z.uuid().optional(), technicianId: z.uuid().optional() });
const Adjust = z.object({ variantId: z.uuid(), qtyMilli: z.number().int().refine((n) => n !== 0), reason: z.string().trim().min(3).max(500) });
const Block = z.object({ series: z.literal("work_order"), size: z.number().int().min(1).max(200).default(20) });

export function routes(app: FastifyInstance, db: Db, cfg: Config) {
  const auth = authenticate(db, cfg);
  adminRoutes(app, db, auth);
  itemRoutes(app, db, auth);
  customerRoutes(app, db, auth);
  workOrderRoutes(app, db, auth);
  salesRoutes(app, db, auth);
  purchasingRoutes(app, db, auth);
  moneyRoutes(app, db, auth);
  syncRoutes(app, db, auth);
  reportRoutes(app, db, auth);
  alertRoutes(app, db, auth);
  shareRoutes(app, db, auth);
  conditionRoutes(app, db, auth);
  partnerRoutes(app, db, auth);
  countRoutes(app, db, auth);
  fileRoutes(app, db, cfg, auth);

  app.post("/statements", { preHandler: [auth, requirePerm("statement.create")] }, async (req, reply) => {
    reply.status(201);
    return finalizeStatement(db, actorOf(req), req.body);
  });
  app.get("/statements/:id", { preHandler: [auth] }, async (req) => getStatement(db, actorOf(req), Id.parse(req.params).id));
  // Saved statements are locked for engineers: the permission check runs before the body is read.
  app.patch("/statements/:id", { preHandler: [auth, requirePerm("statement.editSaved")] }, async (req) => editStatement(db, actorOf(req), Id.parse(req.params).id, req.body));
  app.post("/statements/:id/cancel", { preHandler: [auth, requirePerm("statement.cancel")] }, async (req) => cancelStatement(db, actorOf(req), Id.parse(req.params).id, req.body));

  app.post("/work-orders/:id/issue", { preHandler: [auth, requirePerm("stock.issue")] }, async (req, reply) => {
    reply.status(201);
    return issueToWorkOrder(db, actorOf(req), { ...Issue.parse(req.body), workOrderId: Id.parse(req.params).id });
  });
  app.post("/stock/adjust", { preHandler: [auth, requirePerm("stock.adjust")] }, async (req) => adjust(db, actorOf(req), Adjust.parse(req.body)));
  app.get("/stock/:id", { preHandler: [auth, requirePerm("item.view")] }, async (req) => {
    const l = await level(db, Id.parse(req.params).id);
    // Cost only goes to users with cost.view (D-20).
    return can(actorOf(req), "cost.view") ? { qtyMilli: l.qtyMilli, avgCostPt: l.avgCostPt } : { qtyMilli: l.qtyMilli };
  });

  app.post("/numbers/blocks", { preHandler: [auth, requirePerm("workOrder.create")] }, async (req) => {
    const b = Block.parse(req.body ?? {});
    const deviceId = actorOf(req).deviceId;
    if (!deviceId) throw new AppError(400, "device_required", "رمز الجهاز مطلوب.");
    return db.transaction((tx) => reserveBlock(tx, b.series, deviceId, b.size));
  });
}
