/** Activity log and staff performance: every change logged once, views throttled, searches logged when typing stops. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditLog, technicians } from "../src/db/schema";
import { uuidv7 } from "@jc/core";
import { makeWorkOrder, setup } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); });
afterAll(async () => { await t.close(); });
const call = (method: "GET" | "POST" | "PATCH", url: string, token: string, payload?: unknown) => t.app.inject({ method, url, headers: t.as(token), payload: payload as object });
const rowsFor = (action: string, entityId?: string) => t.db.select().from(auditLog).where(and(eq(auditLog.action, action), entityId ? eq(auditLog.entityId, entityId) : undefined));

describe("activity log", () => {
  it("logs a change that has no audit of its own, with who did it", async () => {
    expect((await call("POST", "/customers", t.engineerToken, { name: "عميل السجل", mobile: "01001234567" })).statusCode).toBe(201);
    const [row] = await rowsFor("POST /customers");
    expect(row).toMatchObject({ userId: t.engineerId, entity: "customer" });
    expect(row.after).toMatchObject({ name: "عميل السجل" });
  });

  it("does not log a change twice when the handler wrote its own detailed row", async () => {
    const wo = await makeWorkOrder(t.db, t.engineerId);
    await call("PATCH", `/work-orders/${wo.id}`, t.engineerToken, { status: "ready" });
    expect(await rowsFor("workOrder.status", wo.id)).toHaveLength(1);
    expect(await rowsFor("PATCH /work-orders/:id", wo.id)).toHaveLength(0);
  });

  it("logs opening a work order once per user in a short window", async () => {
    const wo = await makeWorkOrder(t.db, t.engineerId);
    await call("GET", `/work-orders/${wo.id}`, t.engineerToken);
    await call("GET", `/work-orders/${wo.id}`, t.engineerToken);
    await call("GET", `/work-orders/${wo.id}`, t.adminToken);
    const views = await rowsFor("view", wo.id);
    expect(views.map((v) => v.userId).sort()).toEqual([t.adminId, t.engineerId].sort());
  });

  it("logs the final search text after the user stops typing", async () => {
    for (const q of ["لف", "لفو", "لفو 2"]) await call("GET", `/lookup?q=${encodeURIComponent(q)}`, t.engineerToken);
    await new Promise((r) => setTimeout(r, 3300));
    const searches = (await rowsFor("search")).filter((r) => r.userId === t.engineerId);
    expect(searches.map((s) => (s.after as { q: string }).q)).toEqual(["لفو 2"]);
  });

  it("changing the engineer or technicians of a work order is logged with before and after", async () => {
    const wo = await makeWorkOrder(t.db, t.engineerId);
    const tech = uuidv7();
    await t.db.insert(technicians).values({ id: tech, name: "فني السجل" });
    expect((await call("PATCH", `/work-orders/${wo.id}`, t.adminToken, { receptionUserId: t.adminId, technicianIds: [tech] })).statusCode).toBe(200);
    const [row] = await rowsFor("workOrder.staff", wo.id);
    expect(row.before).toEqual({ receptionUserId: t.engineerId });
    expect(row.after).toMatchObject({ receptionUserId: t.adminId, technicianIds: [tech] });
  });

  it("the log screen filters by kind and is for audit.view only", async () => {
    const views = (await call("GET", "/audit?kind=view", t.adminToken)).json();
    expect(views.length).toBeGreaterThan(0);
    expect(views.every((r: { action: string }) => r.action === "view")).toBe(true);
    expect((await call("GET", "/audit", t.engineerToken)).statusCode).toBe(403);
  });
});

describe("staff performance report", () => {
  it("counts cars per engineer and per assigned technician", async () => {
    const tech = uuidv7();
    await t.db.insert(technicians).values({ id: tech, name: "فني الأداء" });
    const wo = await makeWorkOrder(t.db, t.engineerId);
    await call("PATCH", `/work-orders/${wo.id}`, t.adminToken, { technicianIds: [tech] });
    const r = (await call("GET", "/reports/people?from=2026-10-01&to=2026-10-31", t.adminToken)).json();
    const eng = r.rows.find((x: { name: string }) => x.name === "محمود سمير");
    const fanni = r.rows.find((x: { name: string }) => x.name === "فني الأداء");
    expect(eng.cars).toBeGreaterThan(0);
    expect(fanni).toMatchObject({ role: "فني", cars: 1, delivered: 0 });
  });
});
