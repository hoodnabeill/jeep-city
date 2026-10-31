/** Plate types (D-69): loaded once for every plate on screen, reloaded after Settings saves them. */
import { useEffect, useState } from "react";
import { api } from "./api";
import type { PlateType } from "./types";

let types: PlateType[] = [];
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();

export function loadPlateTypes() {
  loading ??= api<PlateType[]>("/plate-types")
    .then((t) => { types = t ?? []; subs.forEach((f) => f()); })
    .catch(() => { /* offline with no copy yet: plates show the default style */ })
    .finally(() => { loading = null; });
  return loading;
}

export function usePlateTypes() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((x) => x + 1);
    subs.add(f);
    if (!types.length) void loadPlateTypes();
    return () => { subs.delete(f); };
  }, []);
  return types;
}
