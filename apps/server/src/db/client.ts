import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema";

/** Works for both drivers and for transactions (PgTransaction extends PgDatabase). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

/**
 * DATABASE_URL → real PostgreSQL (production, VPS). Otherwise PGlite: Postgres in WASM, in a folder
 * (`dataDir`) for local development or in memory for tests. Same SQL, same migrations.
 */
export async function openDb(opts: { databaseUrl?: string; dataDir?: string }): Promise<{ db: Db; close: () => Promise<void> }> {
  if (opts.databaseUrl) {
    const pool = new pg.Pool({ connectionString: opts.databaseUrl });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder });
    return { db: db as unknown as Db, close: () => pool.end() };
  }
  const client = new PGlite(opts.dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.close() };
}

export { schema };
