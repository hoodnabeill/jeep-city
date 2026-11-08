/**
 * The only door to the server. Screens call `api()` and the `useApi()` hook (hooks.ts), never fetch directly,
 * so the local copy and the outbox sit behind the same calls (local.ts, sync.ts).
 */
import { uuidv7 } from "@jc/core";
import { enqueue, loadLocal, localGet, localWrite, pending, queueLabel } from "./local";
import { kvGet, kvSet } from "./store";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

const REFRESH_KEY = "jc.refresh";
const DEVICE_KEY = "jc.device";

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/** Stable id of this PC, sent with every request (numbering blocks, audit). */
export const deviceId = (() => {
  let id = store.get(DEVICE_KEY);
  if (!id) { id = `pc-${uuidv7().slice(-12)}`; store.set(DEVICE_KEY, id); }
  return id;
})();

let accessToken: string | null = null;
// shortcut: refresh token in localStorage; move to the OS keychain via Tauri in Phase 6 (D-60).
export const hasStoredSession = () => !!store.get(REFRESH_KEY);

export type Conn = "online" | "syncing" | "offline";
let conn: Conn = "online", inFlight = 0;
const connListeners = new Set<(c: Conn) => void>();
function setConn(c: Conn) { if (c !== conn) { conn = c; connListeners.forEach((f) => f(c)); } }
export const onConn = (f: (c: Conn) => void) => { connListeners.add(f); f(conn); return () => { connListeners.delete(f); }; };

const sessionListeners = new Set<() => void>();
export const onSessionEnded = (f: () => void) => { sessionListeners.add(f); return () => { sessionListeners.delete(f); }; };

/* ---------- Server addresses (D-88) ---------- */
// The web app talks to its own origin (/api). The Windows and phone apps have no origin of their own: they try the
// shop's LAN address first and fall back to the Cloudflare Tunnel address. Set per device, defaults from the build.
const SERVERS_KEY = "jc.servers";
const DEFAULT_SERVERS = String(import.meta.env.VITE_SERVER_URLS ?? import.meta.env.VITE_API_URL ?? "/api").split(",").map((s) => s.trim()).filter(Boolean);
export const isAppShell = !!import.meta.env.VITE_APP_SHELL;
export function serverList(): string[] {
  try { const l = JSON.parse(store.get(SERVERS_KEY) ?? "null"); if (Array.isArray(l) && l.length) return l; } catch { /* default */ }
  return DEFAULT_SERVERS;
}
export const setServerList = (l: string[]) => { store.set(SERVERS_KEY, l.length ? JSON.stringify(l.map((s) => s.trim().replace(/\/+$/, ""))) : null); current = 0; };
let current = 0, lanRetryAt = 0;
export const apiBase = () => { const l = serverList(); return l[Math.min(current, l.length - 1)]; };

const OFFLINE = () => new ApiError(0, "offline", "لا يوجد اتصال بالخادم. هذا الإجراء يحتاج اتصالًا؛ حاول بعد عودة الإنترنت.");
async function rawFetch(path: string, init: RequestInit) {
  const list = serverList();
  // Back in the shop: try the LAN address again, at most once a minute.
  if (current > 0 && Date.now() >= lanRetryAt) current = 0;
  for (let i = current; i < list.length; i++) {
    const hasNext = i < list.length - 1;
    // An address with a fallback after it gets 3 s to answer (an unreachable LAN IP would otherwise hang for long).
    const ctl = new AbortController();
    const timer = hasNext ? setTimeout(() => ctl.abort(), 3000) : undefined;
    init.signal?.addEventListener("abort", () => ctl.abort());
    let res: Response;
    try {
      res = await fetch(list[i] + path, { ...init, signal: ctl.signal });
    } catch {
      if (i === 0 && hasNext) lanRetryAt = Date.now() + 60_000;
      continue;
    } finally {
      clearTimeout(timer);
    }
    // A gateway in front of the API answers 502–504 when the API itself is unreachable: try the next address.
    if (res.status >= 502 && res.status <= 504) continue;
    current = i;
    return res;
  }
  setConn("offline");
  throw OFFLINE();
}

/** Who is logged in: queued writes carry it, and only that user's queue is sent. */
let currentUserId = "";
export const setApiUser = (id: string) => { currentUserId = id; };
export const isOnline = () => conn !== "offline";
export const authHeaders = (): Record<string, string> => ({ ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}), "x-device-id": deviceId });

let refreshing: Promise<boolean> | null = null;
export function refreshSession(): Promise<boolean> {
  const token = store.get(REFRESH_KEY);
  if (!token) return Promise.resolve(false);
  refreshing ??= (async () => {
    const res = await rawFetch("/auth/refresh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken: token }) });
    if (!res.ok) { store.set(REFRESH_KEY, null); accessToken = null; return false; }
    const b = await res.json();
    accessToken = b.accessToken; store.set(REFRESH_KEY, b.refreshToken);
    return true;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
const cacheable = (path: string) => !path.startsWith("/sync") && !path.startsWith("/auth");

export async function api<T = unknown>(path: string, opts: { method?: Method; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? "GET";
  if (method === "GET") {
    // A work order with queued changes shows this PC's version until the queue is sent.
    if (/^\/work-orders\/[0-9a-f-]{36}$/.test(path)) { await loadLocal(); if (pending().length) { const local = localGet(path); if (local) return local as T; } }
    try {
      const r = await serverCall<T>(path, opts);
      if (cacheable(path)) void kvSet(`cache:${path}`, r);
      return r;
    } catch (e) {
      // Offline, or a record created on this PC that the server has not received yet: answer from this PC.
      if (e instanceof ApiError && (e.status === 0 || e.status === 404)) {
        await loadLocal();
        const local = localGet(path) ?? (e.status === 0 ? await kvGet(`cache:${path}`) : undefined);
        if (local !== undefined) return local as T;
      }
      throw e;
    }
  }
  const label = queueLabel(method, path);
  if (label) {
    await loadLocal();
    // Keep order: while older writes wait in the queue, newer ones queue behind them.
    if (!isOnline() || pending().length) return queue<T>(method, path, opts.body, label);
    try {
      return await serverCall<T>(path, opts);
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) return queue<T>(method, path, opts.body, label);
      throw e;
    }
  }
  return serverCall<T>(path, opts);
}

async function queue<T>(method: Method, path: string, body: unknown, label: string): Promise<T> {
  const r = await localWrite(method, path, body, currentUserId).catch((e: Error) => { throw new ApiError(0, "offline", e.message); });
  await enqueue({ id: uuidv7(), method: method as Exclude<Method, "GET">, path, body: r.body, createdAt: new Date().toISOString(), userId: currentUserId, label });
  return r.result as T;
}

async function serverCall<T>(path: string, opts: { method?: Method; body?: unknown }): Promise<T> {
  const init = (): RequestInit => ({
    method: opts.method ?? "GET",
    headers: { ...(opts.body !== undefined ? { "content-type": "application/json" } : {}), ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}), "x-device-id": deviceId },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  inFlight++; if (opts.method && opts.method !== "GET") setConn("syncing");
  try {
    let res = await rawFetch(path, init());
    if (res.status === 401 && path !== "/auth/login" && (await refreshSession())) res = await rawFetch(path, init());
    setConn("online");
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && path !== "/auth/login") sessionListeners.forEach((f) => f());
      const e = body?.error;
      throw new ApiError(res.status, e?.code ?? "error", e?.message ?? "حدث خطأ غير متوقع. حاول مرة أخرى.", e?.details);
    }
    return body as T;
  } finally {
    if (--inFlight === 0 && conn === "syncing") setConn("online");
  }
}

export type LoginResult = { user: { id: string; name: string; username: string; role: "admin" | "engineer" } };
export async function login(username: string, password: string): Promise<LoginResult> {
  const r = await api<LoginResult & { accessToken: string; refreshToken: string }>("/auth/login", { method: "POST", body: { username, password, deviceId } });
  accessToken = r.accessToken; store.set(REFRESH_KEY, r.refreshToken);
  return { user: r.user };
}
export async function logout() {
  const t = store.get(REFRESH_KEY);
  store.set(REFRESH_KEY, null); accessToken = null;
  if (t) await api("/auth/logout", { method: "POST", body: { refreshToken: t } }).catch(() => {});
}

const RECENT_KEY = "jc.recentUsers";
export type RecentUser = { username: string; name: string; role: "admin" | "engineer" };
export const recentUsers = (): RecentUser[] => { try { return JSON.parse(store.get(RECENT_KEY) ?? "[]"); } catch { return []; } };
export function rememberUser(u: RecentUser) {
  store.set(RECENT_KEY, JSON.stringify([u, ...recentUsers().filter((x) => x.username !== u.username)].slice(0, 6)));
}
