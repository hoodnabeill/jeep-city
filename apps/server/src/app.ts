import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { sql } from "drizzle-orm";
import { authRoutes } from "./auth/auth";
import type { Config } from "./config";
import type { Db } from "./db/client";
import { errorHandler } from "./errors";
import { routes } from "./routes";

// The Windows app (Tauri) and the phone apps (Capacitor) call the server from these origins (D-88).
// Auth is a Bearer token, not a cookie, so no other site can act as a logged-in user.
const APP_ORIGINS = ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost", "capacitor://localhost", "https://localhost", "http://localhost"];

export async function buildApp(db: Db, cfg: Config, opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true, bodyLimit: 2 * 1024 * 1024 });
  await app.register(rateLimit, { global: false });
  await app.register(cors, { origin: APP_ORIGINS, allowedHeaders: ["authorization", "content-type", "x-device-id"], maxAge: 86400 });
  app.setErrorHandler(errorHandler);
  /** Health check for Docker and the README: database reachable, age of the last good backup. */
  app.get("/health", async (_req, reply) => {
    const dbOk = await db.execute(sql`select 1`).then(() => true, () => false);
    const last = cfg.backupDir ? await readFile(join(cfg.backupDir, "last-ok"), "utf8").then((s) => s.trim(), () => null) : undefined;
    const backupAgeHours = last ? Math.round((Date.now() - Date.parse(last)) / 36e5) : null;
    if (!dbOk) reply.status(503);
    return { ok: dbOk, db: dbOk, ...(last !== undefined ? { lastBackup: last, backupAgeHours, backupLate: backupAgeHours === null || backupAgeHours > 26 } : {}) };
  });
  authRoutes(app, db, cfg);
  routes(app, db, cfg);
  return app;
}
