/** Byte migration: pure mapping from the exported Byte rows to our records (DECISIONS D-71..D-76). */
import { CATEGORIES, computeTotals, egyptMobile, normalizePlate, plateKey, searchKey, westernDigits, type Category, type Discount, type TotalsLine } from "@jc/core";

/** Byte uses "*", "-", "\\", "0" and spaces for "nothing": any value of only punctuation, symbols, zeros and spaces. */
export function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" || /^[\p{P}\p{S}0\s]+$/u.test(s) ? null : s;
}

export const pt = (egp: unknown) => Math.round((Number(egp) || 0) * 100);
export const milli = (q: unknown) => Math.round((Number(q) || 0) * 1000);

// shortcut: Byte stores Cairo wall-clock time without a zone; +02:00 is used all year (summer time is off by an hour). Fine for history.
/** Byte keeps the date and the time of day in separate columns; the time column carries the 1899-12-30 dummy date. */
export function cairoTime(date: string | null, time?: string | null): Date | null {
  if (!date) return null;
  const t = time?.match(/(\d\d:\d\d:\d\d)$/)?.[1] ?? "00:00:00";
  const d = new Date(`${date.slice(0, 10)}T${t}+02:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type PlateResult = { plateLetters: string | null; plateDigits: string | null; plateKey: string | null; review: boolean };

/**
 * D-72: Byte has no plate type. A standard plate (2–3 Arabic letters and 3–4 digits, any order or spacing) is ملاكي.
 * Anything else is kept if it is still a valid plate, and flagged for review.
 */
export function mapPlate(raw: unknown): PlateResult {
  const s = clean(raw);
  if (!s) return { plateLetters: null, plateDigits: null, plateKey: null, review: true };
  const letters = (s.match(/[\u0621-\u064A]/g) ?? []).join("");
  const digits = (westernDigits(s).match(/\d/g) ?? []).join("");
  const standard = letters.length >= 2 && letters.length <= 3 && digits.length >= 3 && digits.length <= 4;
  try {
    const p = normalizePlate({ letters, digits });
    return { plateLetters: p.letters || null, plateDigits: p.digits, plateKey: plateKey(p), review: !standard };
  } catch {
    return { plateLetters: null, plateDigits: null, plateKey: null, review: true };
  }
}

/** First valid Egyptian mobile among the phone columns (Byte often keeps the mobile in the home-phone column). */
export function pickMobile(...phones: unknown[]): string | null {
  for (const p of phones) { const s = clean(p); const m = s && egyptMobile(s); if (m) return m; }
  return null;
}

/** Customers are merged by mobile, otherwise by name (D-74). */
export function customerKey(name: string | null, mobile: string | null) {
  if (mobile) return `m:${mobile}`;
  return name ? `n:${searchKey(name)}` : null;
}

/** "JEEP WK2" → make Jeep, model WK2. Arabic or one-word values go to model only. */
export function splitKind(raw: unknown): { make: string | null; model: string | null } {
  const s = clean(raw);
  if (!s) return { make: null, model: null };
  const [first, ...rest] = s.split(" ");
  if (!/^[A-Za-z]+$/.test(first) || !rest.length) return { make: null, model: s };
  return { make: first[0].toUpperCase() + first.slice(1).toLowerCase(), model: rest.join(" ") };
}

export const year = (v: unknown) => { const n = Number(westernDigits(String(v ?? "")).trim()); return Number.isInteger(n) && n >= 1950 && n <= 2100 ? n : null; };

/**
 * Byte statement totals with our formula (D-80). Byte's own net is kept by turning the difference into an amount
 * discount, applied to labor first, then parts, oils, materials. A Byte net above the lines' total is not invented:
 * the totals stay as the lines give them and `above` reports the gap.
 */
export function byteTotals(lines: TotalsLine[], byteNetPt: number) {
  const plain = computeTotals({ lines });
  let left = Math.max(0, plain.statementGrossPt - byteNetPt);
  const discounts: Partial<Record<Category, Discount>> = {};
  for (const c of CATEGORIES) {
    const d = Math.min(left, plain.gross[c]);
    if (d > 0) { discounts[c] = { mode: "amount", valuePt: d }; left -= d; }
  }
  const totals = computeTotals({ lines, discounts });
  return { discounts, totals, above: Math.max(0, byteNetPt - plain.statementGrossPt) };
}

/** 11-digit Egyptian mobile as people type it, from the wa.me form. */
export const localMobile = (wa: string | null) => (wa ? `0${wa.slice(2)}` : null);
