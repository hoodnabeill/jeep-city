import { uuidv7 } from "@jc/core";
import type { Db } from "./db/client";
import { auditLog } from "./db/schema";

/** `offline`: the request is a replay of a write queued on a PC while it had no connection (sync push). */
export type Actor = { id: string; role: "admin" | "engineer"; permissions?: string[] | null; deviceId?: string | null; ip?: string; offline?: boolean };

/** Append one audit row (login, statement create/edit/cancel, stock adjustments, price changes, cash). */
export async function audit(db: Db, actor: Partial<Actor> | null, action: string, entity?: string, entityId?: string, before?: unknown, after?: unknown) {
  await db.insert(auditLog).values({
    id: uuidv7(),
    userId: actor?.id ?? null,
    deviceId: actor?.deviceId ?? null,
    ip: actor?.ip ?? null,
    action,
    entity: entity ?? null,
    entityId: entityId ?? null,
    before: before === undefined ? null : before,
    after: after === undefined ? null : after,
  });
}
