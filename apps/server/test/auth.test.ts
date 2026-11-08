import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { auditLog, numberBlocks, users } from "../src/db/schema";
import { reserveBlock } from "../src/modules/numbering";
import { ADMIN, ENGINEER, setup } from "./helpers";

let t: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { t = await setup(); });
afterAll(async () => { await t.close(); });

describe("auth", () => {
  it("stores argon2id hashes, never the password", async () => {
    const [u] = await t.db.select().from(users).where(eq(users.username, ADMIN.username));
    expect(u.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(u.passwordHash).not.toContain(ADMIN.password);
  });

  it("logs in, returns the user and short-lived tokens, and audits", async () => {
    const r = await t.app.inject({ method: "POST", url: "/auth/login", payload: { username: "Ahmed", password: ADMIN.password }, remoteAddress: "10.1.0.1" });
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.user).toMatchObject({ username: "ahmed", role: "admin" });
    const me = await t.app.inject({ method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${b.accessToken}` } });
    expect(me.json().name).toBe("أحمد الطنطاوي");
    expect((await t.db.select().from(auditLog).where(eq(auditLog.action, "auth.login"))).length).toBeGreaterThan(0);
  });

  it("wrong password: one Arabic message, no hint which part was wrong", async () => {
    for (const payload of [{ username: "ahmed", password: "nope" }, { username: "nobody", password: "nope" }]) {
      const r = await t.app.inject({ method: "POST", url: "/auth/login", payload, remoteAddress: "10.2.0.1" });
      expect(r.statusCode).toBe(401);
      expect(r.json().error.message).toBe("اسم المستخدم أو كلمة المرور غير صحيحة.");
    }
  });

  it("rate-limits login per IP and username", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await t.app.inject({ method: "POST", url: "/auth/login", payload: { username: "karim", password: "x" }, remoteAddress: "10.3.0.1" })).statusCode);
    expect(codes.slice(0, 5).every((c) => c === 401)).toBe(true);
    expect(codes[5]).toBe(429);
    const other = await t.app.inject({ method: "POST", url: "/auth/login", payload: { username: ENGINEER.username, password: ENGINEER.password }, remoteAddress: "10.3.0.2" });
    expect(other.statusCode).toBe(200);
  });

  it("refresh rotates; reusing an old refresh token ends the whole login", async () => {
    const first = await t.login(ENGINEER, "10.4.0.1");
    const r1 = await t.app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: first.refreshToken } });
    expect(r1.statusCode).toBe(200);
    const second = r1.json();
    const reuse = await t.app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: first.refreshToken } });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json().error.message).toBe("انتهت الجلسة. سجّل الدخول مرة أخرى.");
    const afterReuse = await t.app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: second.refreshToken } });
    expect(afterReuse.statusCode).toBe(401);
  });

  it("rejects missing, forged and deactivated tokens", async () => {
    expect((await t.app.inject({ method: "GET", url: "/auth/me" })).statusCode).toBe(401);
    expect((await t.app.inject({ method: "GET", url: "/auth/me", headers: { authorization: "Bearer abc.def.ghi" } })).statusCode).toBe(401);
    const tok = (await t.login(ENGINEER, "10.5.0.1")).accessToken;
    await t.db.update(users).set({ active: false }).where(eq(users.username, ENGINEER.username));
    expect((await t.app.inject({ method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${tok}` } })).statusCode).toBe(401);
    await t.db.update(users).set({ active: true }).where(eq(users.username, ENGINEER.username));
  });
});

describe("numbering", () => {
  it("device blocks never overlap and do not touch statement numbers", async () => {
    const a = await t.db.transaction((tx) => reserveBlock(tx, "work_order", "pc-1", 20));
    const b = await t.db.transaction((tx) => reserveBlock(tx, "work_order", "pc-2", 20));
    expect(a).toEqual({ from: 13548, to: 13567 });
    expect(b).toEqual({ from: 13568, to: 13587 });
    const r = await t.app.inject({ method: "POST", url: "/numbers/blocks", headers: t.as(t.engineerToken), payload: { series: "work_order", size: 5 } });
    expect(r.json()).toEqual({ from: 13588, to: 13592 });
    expect((await t.db.select().from(numberBlocks)).length).toBe(3);
    const [st] = ((await t.db.execute(sql`select next_value from number_series where series = 'statement'`)) as unknown as { rows: { next_value: string }[] }).rows;
    expect(Number(st.next_value)).toBe(9309);
  });
});
