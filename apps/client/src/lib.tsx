import { createContext, useContext, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import { api, ApiError, hasStoredSession, login, logout, onConn, onSessionEnded, refreshSession, rememberUser, setApiUser, type Conn } from "./data/api";
import { startSync, stopSync } from "./data/sync";

/* ---------- Hash router (the app runs from a file in Tauri, so hash URLs) ---------- */
export function useHashPath() {
  const [path, setPath] = useState(() => location.hash.slice(1) || "/");
  useEffect(() => {
    const f = () => { setPath(location.hash.slice(1) || "/"); window.scrollTo(0, 0); };
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return path;
}
export const go = (to: string) => { location.hash = to; };
export const queryParam = (name: string) => new URLSearchParams(location.hash.split("?")[1] ?? "").get(name);
export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split("/"), b = path.split("?")[0].split("/");
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}
export function Link({ to, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return <a href={`#${to}`} {...rest} />;
}

export type SessionUser = { id: string; name: string; username: string; role: "admin" | "engineer" };
type Session = { user: SessionUser | null; ready: boolean; sync: Conn; signIn: (u: string, p: string) => Promise<void>; signOut: () => Promise<void> };
const SessionCtx = createContext<Session>(null!);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(!hasStoredSession());
  const [sync, setSync] = useState<Conn>("online");
  useEffect(() => onConn(setSync), []);
  useEffect(() => onSessionEnded(() => setUser(null)), []);
  useEffect(() => {
    if (!hasStoredSession()) return;
    refreshSession()
      .then((ok) => (ok ? api<SessionUser>("/auth/me").then(setUser) : undefined))
      // Started without a connection: keep working as the last user of this PC; writes queue (D-21).
      .catch((e) => { if (e instanceof ApiError && e.status === 0) setUser(lastUser()); })
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    setApiUser(user?.id ?? "");
    if (user) { saveLastUser(user); void startSync(user.id); } else stopSync();
  }, [user?.id]);
  const signIn = async (u: string, p: string) => {
    const r = await login(u, p);
    rememberUser({ username: r.user.username, name: r.user.name, role: r.user.role });
    setUser(r.user);
  };
  const signOut = async () => { await logout(); localStorage.removeItem(LAST_USER); setUser(null); };
  return <SessionCtx.Provider value={{ user, ready, sync, signIn, signOut }}>{children}</SessionCtx.Provider>;
}
const LAST_USER = "jc.lastUser";
const saveLastUser = (u: SessionUser) => { try { localStorage.setItem(LAST_USER, JSON.stringify(u)); } catch { /* private mode */ } };
const lastUser = (): SessionUser | null => { try { return JSON.parse(localStorage.getItem(LAST_USER) ?? "null"); } catch { return null; } };
export const useSession = () => useContext(SessionCtx);
export const useIsAdmin = () => useSession().user?.role === "admin";


export function useHotkey(key: string, fn: (e: KeyboardEvent) => void, deps: unknown[] = []) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === key) { e.preventDefault(); fn(e); }
    };
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function since(iso: string, now = Date.now()) {
  const h = Math.round((now - Date.parse(iso)) / 36e5);
  if (h < 1) return "منذ قليل";
  if (h < 24) return h === 1 ? "منذ ساعة" : h === 2 ? "منذ ساعتين" : h <= 10 ? `منذ ${h} ساعات` : `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  return d === 1 ? "منذ يوم" : d === 2 ? "منذ يومين" : d <= 10 ? `منذ ${d} أيام` : `منذ ${d} يومًا`;
}
export const daysIn = (iso: string, now = Date.now()) => Math.floor((now - Date.parse(iso)) / 864e5);
