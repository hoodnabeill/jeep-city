import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { can, deniedMessage, uuidv7, type Action, type Role } from "@jc/core";
import { audit, type Actor } from "../audit";
import type { Config } from "../config";
import type { Db } from "../db/client";
import { sessions, users } from "../db/schema";
import { AppError } from "../errors";

/** Only the sync push handler knows this, so only its internal replays can claim to be offline writes. */
export const REPLAY_SECRET = randomBytes(24).toString("hex");

export const hashPassword = (pw: string) => hash(pw); // @node-rs/argon2 defaults to argon2id
export const verifyPassword = (stored: string, pw: string) => verify(stored, pw).catch(() => false);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function issueTokens(db: Db, cfg: Config, user: { id: string; role: Role }, deviceId: string | null, familyId = uuidv7()) {
  const refreshToken = randomBytes(32).toString("base64url");
  const sid = uuidv7();
  await db.insert(sessions).values({
    id: sid, userId: user.id, deviceId, familyId, tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + cfg.refreshTtlDays * 864e5),
  });
  const accessToken = await new SignJWT({ role: user.role, sid })
    .setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt().setExpirationTime(`${cfg.accessTtlSec}s`)
    .sign(cfg.jwtSecret);
  return { accessToken, refreshToken, expiresIn: cfg.accessTtlSec };
}

const SESSION_ENDED = () => new AppError(401, "session_ended", "انتهت الجلسة. سجّل الدخول مرة أخرى.");

declare module "fastify" {
  interface FastifyRequest { actor?: Actor }
}

export function actorOf(req: FastifyRequest): Actor {
  if (!req.actor) throw SESSION_ENDED();
  return req.actor;
}

export function authenticate(db: Db, cfg: Config) {
  return async (req: FastifyRequest) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) throw new AppError(401, "not_logged_in", "سجّل الدخول أولًا.");
    let sub: string, role: Role;
    try {
      const { payload } = await jwtVerify(h.slice(7), cfg.jwtSecret, { algorithms: ["HS256"] });
      sub = payload.sub!; role = payload.role as Role;
    } catch {
      throw SESSION_ENDED();
    }
    // Role, permissions and active flag come from the database, never only from the token.
    const [u] = await db.select({ id: users.id, role: users.role, permissions: users.permissions, active: users.active }).from(users).where(eq(users.id, sub));
    if (!u || !u.active) throw SESSION_ENDED();
    req.actor = { id: u.id, role: u.role ?? role, permissions: u.permissions, deviceId: (req.headers["x-device-id"] as string) ?? null, ip: req.ip, offline: req.headers["x-sync-replay"] === REPLAY_SECRET };
  };
}

/** preHandler: the server-side permission check (never trust the client). */
export function requirePerm(action: Action) {
  return async (req: FastifyRequest) => {
    if (!can(actorOf(req), action)) throw new AppError(403, "forbidden", deniedMessage(action));
  };
}

const Login = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(256), deviceId: z.string().max(64).optional() });
const Refresh = z.object({ refreshToken: z.string().min(20).max(200) });

export function authRoutes(app: FastifyInstance, db: Db, cfg: Config) {
  const auth = authenticate(db, cfg);

  app.post("/auth/login", {
    config: {
      rateLimit: {
        max: cfg.loginPerMin, timeWindow: "1 minute",
        keyGenerator: (req: FastifyRequest) => `${req.ip}|${String((req.body as { username?: unknown } | undefined)?.username ?? "").toLowerCase()}`,
      },
    },
  }, async (req) => {
    const body = Login.parse(req.body);
    const username = body.username.toLowerCase();
    const [u] = await db.select().from(users).where(and(eq(users.username, username), isNull(users.archivedAt)));
    const ok = !!u && u.active && (await verifyPassword(u.passwordHash, body.password));
    if (!ok) {
      await audit(db, { id: u?.id, ip: req.ip, deviceId: body.deviceId }, "auth.login_failed", "user", username);
      throw new AppError(401, "bad_credentials", "اسم المستخدم أو كلمة المرور غير صحيحة.");
    }
    const tokens = await issueTokens(db, cfg, u, body.deviceId ?? null);
    await audit(db, { id: u.id, ip: req.ip, deviceId: body.deviceId }, "auth.login", "user", u.id);
    return { ...tokens, user: { id: u.id, name: u.displayName, username: u.username, role: u.role, permissions: u.permissions } };
  });

  app.post("/auth/refresh", async (req) => {
    const { refreshToken } = Refresh.parse(req.body);
    const [s] = await db.select().from(sessions).where(eq(sessions.tokenHash, sha256(refreshToken)));
    if (!s) throw SESSION_ENDED();
    if (s.revokedAt) {
      // A rotated token was used again: treat as stolen and end the whole login family.
      await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.familyId, s.familyId), isNull(sessions.revokedAt)));
      await audit(db, { id: s.userId, ip: req.ip }, "auth.refresh_reuse", "session", s.familyId);
      throw SESSION_ENDED();
    }
    if (s.expiresAt.getTime() < Date.now()) throw SESSION_ENDED();
    const [u] = await db.select().from(users).where(eq(users.id, s.userId));
    if (!u || !u.active) throw SESSION_ENDED();
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, s.id));
    return issueTokens(db, cfg, u, s.deviceId, s.familyId);
  });

  app.post("/auth/logout", async (req) => {
    const { refreshToken } = Refresh.parse(req.body);
    const [s] = await db.select().from(sessions).where(eq(sessions.tokenHash, sha256(refreshToken)));
    if (s) await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.familyId, s.familyId), isNull(sessions.revokedAt)));
    return { ok: true };
  });

  app.get("/auth/me", { preHandler: auth }, async (req) => {
    const a = actorOf(req);
    const [u] = await db.select({ id: users.id, name: users.displayName, username: users.username, role: users.role, permissions: users.permissions }).from(users).where(eq(users.id, a.id));
    return u;
  });
}
