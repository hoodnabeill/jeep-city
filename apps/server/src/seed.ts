/**
 * Creates the first admin. The password comes from ADMIN_PASSWORD; never stored in the repo.
 * Usage: ADMIN_USERNAME=ahmed ADMIN_NAME="أحمد الطنطاوي" ADMIN_PASSWORD=... npm run seed -w @jc/server
 */
import { mkdirSync } from "node:fs";
import { bootstrap, createUser } from "./bootstrap";
import { loadConfig } from "./config";
import { openDb } from "./db/client";

const cfg = loadConfig();
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 10) {
  console.error("Set ADMIN_PASSWORD (at least 10 characters) to create the first admin.");
  process.exit(1);
}
if (!cfg.databaseUrl) mkdirSync(cfg.pgliteDir, { recursive: true });
const { db, close } = await openDb({ databaseUrl: cfg.databaseUrl, dataDir: cfg.databaseUrl ? undefined : cfg.pgliteDir });
await bootstrap(db);
const id = await createUser(db, { username: process.env.ADMIN_USERNAME ?? "admin", displayName: process.env.ADMIN_NAME ?? "الإدارة", role: "admin", password });
console.log(`Admin ready: ${process.env.ADMIN_USERNAME ?? "admin"} (${id})`);
await close();
