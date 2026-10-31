import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().default(8787),
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default("./.data/pglite"),
  FILES_DIR: z.string().optional(),
  BACKUP_DIR: z.string().optional(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").optional(),
  ACCESS_TTL_SEC: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  LOGIN_ATTEMPTS_PER_MIN: z.coerce.number().int().positive().default(5),
});

export type Config = { port: number; databaseUrl?: string; pgliteDir: string; filesDir: string; backupDir?: string; jwtSecret: Uint8Array; accessTtlSec: number; refreshTtlDays: number; loginPerMin: number };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = Env.parse(env);
  if (!e.JWT_SECRET && e.NODE_ENV === "production") throw new Error("JWT_SECRET is required in production");
  // Dev only: a random secret per process (tokens stop working after a restart, which is fine locally).
  const secret = e.JWT_SECRET ?? randomBytes(48).toString("base64url");
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    pgliteDir: e.PGLITE_DIR,
    // Signatures and photos. Tests write to the temp folder, never into the project.
    backupDir: e.BACKUP_DIR,
    filesDir: e.FILES_DIR ?? (e.NODE_ENV === "test" ? join(tmpdir(), "jc-test-files") : "./.data/files"),
    jwtSecret: new TextEncoder().encode(secret),
    accessTtlSec: e.ACCESS_TTL_SEC,
    refreshTtlDays: e.REFRESH_TTL_DAYS,
    loginPerMin: e.LOGIN_ATTEMPTS_PER_MIN,
  };
}
