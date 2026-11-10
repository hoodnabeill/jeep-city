import { useCallback, useEffect, useState } from "react";
import { useToast } from "@jc/ui";
import { api, ApiError } from "./api";

/* Any successful write tells every mounted query to reload (small app, few queries on screen). */
const listeners = new Set<() => void>();
export const invalidateAll = () => listeners.forEach((f) => f());
/** Run something after every change (own writes and live updates from other PCs). Returns the unsubscribe. */
export const onInvalidate = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: ApiError; loading: boolean }>({ loading: !!path });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    api<T>(path).then(
      (data) => alive && setState({ data, loading: false }),
      (error: ApiError) => alive && setState((s) => ({ data: s.data, error, loading: false })),
    );
    return () => { alive = false; };
  }, [path, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

/** Run a write, show the Arabic error as a toast, refresh queries on success. Returns null on failure. */
export function useAction() {
  const toast = useToast();
  return useCallback(async <T,>(fn: () => Promise<T>, okMessage?: React.ReactNode): Promise<T | null> => {
    try {
      const r = await fn();
      invalidateAll();
      if (okMessage) toast(okMessage, "ok");
      return r;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "حدث خطأ غير متوقع. حاول مرة أخرى.", "bad");
      return null;
    }
  }, [toast]);
}

/** One setting from Settings (the server's defaults apply when it was never saved). */
export function useSetting<T>(key: string, fallback: T): T {
  const s = useApi<Record<string, unknown>>("/settings").data;
  return (s?.[key] as T | undefined) ?? fallback;
}

/** Days in the shop before a car counts as a long stay (Settings → عام). */
export function useLongStayDays() {
  const s = useApi<Record<string, unknown>>("/settings").data;
  return Number(s?.["workshop.longStayDays"] ?? 3);
}

export const qs = (o: Record<string, string | number | boolean | undefined | null>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
