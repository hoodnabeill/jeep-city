/**
 * Sync engine of this PC: pull changes into the local copy, send the outbox, listen for live changes,
 * keep a reserve of work-order numbers. Started after login, stopped at logout.
 */
import { useEffect, useState } from "react";
import { api, apiBase, authHeaders, isOnline, onConn, refreshSession } from "./api";
import { invalidateAll } from "./hooks";
import { adoptDb, blockLeft, failures, getCursor, loadLocal, mergePull, onLocalChange, pending, setBlock, settle, type Failed } from "./local";

let running = false, userId = "";
let flushTimer: ReturnType<typeof setInterval> | null = null;
let stream: AbortController | null = null;
let offConn: (() => void) | null = null, offLocal: (() => void) | null = null;
let pulling: Promise<void> | null = null, flushing = false;

export function pullNow() {
  pulling ??= (async () => {
    try {
      for (let i = 0; i < 50; i++) {
        const r = await api<{ dbId?: string; cursor: number; more: boolean; rows: Record<string, Record<string, unknown>[]> }>(`/sync/pull?since=${getCursor()}`);
        if (await adoptDb(r.dbId)) { invalidateAll(); continue; }
        await mergePull(r.rows, r.cursor);
        if (!r.more) break;
      }
    } catch { /* offline: try again on the next event or timer */ } finally { pulling = null; }
  })();
  return pulling;
}

/** Send this user's queued writes, oldest first. Rejections move to the failures list with the server's Arabic message. */
export async function flush() {
  if (flushing || !running) return;
  const batch = pending().filter((m) => m.userId === userId).slice(0, 50);
  if (!batch.length) return;
  flushing = true;
  try {
    const r = await api<{ results: { id: string; status: "ok" | "rejected" | "retry"; body: { error?: { message?: string } } | null }[] }>("/sync/push", {
      method: "POST", body: { mutations: batch.map(({ id, method, path, body, createdAt }) => ({ id, method, path, body, createdAt })) },
    });
    const done = r.results.filter((x) => x.status === "ok").map((x) => x.id);
    const rejected = r.results.filter((x) => x.status === "rejected").map((x) => ({ id: x.id, message: x.body?.error?.message ?? "رفض الخادم هذا التغيير." }));
    await settle(done, rejected);
    if (done.length || rejected.length) { await pullNow(); invalidateAll(); }
  } catch { /* still offline */ } finally { flushing = false; }
  if (pending().some((m) => m.userId === userId) && isOnline()) setTimeout(flush, 1500);
}

let reserving: Promise<void> | null = null;
/** One reservation at a time: parallel calls would each take 20 numbers and leave gaps. */
function ensureNumbers() {
  if (blockLeft() >= 5) return Promise.resolve();
  reserving ??= (async () => {
    try {
      const b = await api<{ from: number; to: number }>("/numbers/blocks", { method: "POST", body: { series: "work_order", size: 20 } });
      await setBlock(b.from, b.to);
    } catch { /* offline or not allowed */ } finally { reserving = null; }
  })();
  return reserving;
}

/** Live changes: the server says "changed up to N"; pull and refresh what is on screen. */
async function listen() {
  while (running) {
    stream = new AbortController();
    try {
      const res = await fetch(`${apiBase()}/sync/events`, { headers: authHeaders(), signal: stream.signal });
      if (res.status === 401) { await refreshSession().catch(() => false); throw new Error("auth"); }
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const reader = res.body.getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += new TextDecoder().decode(value);
        let m: RegExpExecArray | null;
        while ((m = /event: seq\ndata: (\d+)\n\n/.exec(buf))) {
          buf = buf.slice(m.index + m[0].length);
          if (Number(m[1]) > getCursor()) { await pullNow(); invalidateAll(); }
        }
      }
    } catch (e) {
      if (!running || (e as Error).name === "AbortError") return;
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
}

export async function startSync(id: string) {
  if (running && userId === id) return;
  stopSync();
  running = true; userId = id;
  await loadLocal();
  offConn = onConn((c) => { if (c === "online") { void flush(); void ensureNumbers(); } });
  offLocal = onLocalChange(() => { if (isOnline()) void flush(); });
  flushTimer = setInterval(() => { void flush(); if (!isOnline()) void pullNow(); }, 15_000);
  await pullNow();
  void ensureNumbers();
  void flush();
  void listen();
}

export function stopSync() {
  running = false;
  stream?.abort(); stream = null;
  if (flushTimer) clearInterval(flushTimer);
  offConn?.(); offLocal?.();
  offConn = offLocal = null;
}

/** Queue and failure counts for the top bar. */
export function useSyncState() {
  const [s, setS] = useState({ pending: 0, failed: [] as Failed[] });
  useEffect(() => {
    const f = () => setS({ pending: pending().length, failed: [...failures()] });
    void loadLocal().then(f);
    return onLocalChange(f);
  }, []);
  return s;
}

