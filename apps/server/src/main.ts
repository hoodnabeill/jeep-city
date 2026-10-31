import { mkdirSync } from "node:fs";
import { buildApp } from "./app";
import { bootstrap } from "./bootstrap";
import { loadConfig } from "./config";
import { openDb } from "./db/client";

const cfg = loadConfig();
if (!cfg.databaseUrl) mkdirSync(cfg.pgliteDir, { recursive: true });
const { db } = await openDb({ databaseUrl: cfg.databaseUrl, dataDir: cfg.databaseUrl ? undefined : cfg.pgliteDir });
await bootstrap(db);
const app = await buildApp(db, cfg, { logger: true });
await app.listen({ port: cfg.port, host: "0.0.0.0" });
