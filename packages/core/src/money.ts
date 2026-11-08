/**
 * Money and quantities as integers (D-07). No floats anywhere in stored values.
 *
 *   money     piasters (1 EGP = 100 pt)          suffix `Pt`
 *   quantity  thousandths of a unit (7.5 L = 7500) suffix `Milli`
 *   percent   basis points (12.5 % = 1250 bp)    suffix `Bp`
 */
import { westernDigits } from "./normalize";

export const PT_PER_EGP = 100;
export const MILLI = 1000;
export const BP = 10_000;

function assertInt(n: number, what: string) {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${what} must be a safe integer, got ${n}`);
}

/** a / b rounded half away from zero (half-up for positive values). b > 0. */
export function divRound(a: number, b: number): number {
  assertInt(a, "numerator");
  assertInt(b, "denominator");
  if (b <= 0) throw new RangeError("denominator must be positive");
  const q = Math.trunc(a / b);
  const r = a - q * b;
  if (2 * Math.abs(r) >= b) return a < 0 ? q - 1 : q + 1;
  return q;
}

/** Line value: qty × unit price, rounded half-up to the piaster. */
export function lineValuePt(qtyMilli: number, unitPricePt: number): number {
  assertInt(qtyMilli, "qtyMilli");
  assertInt(unitPricePt, "unitPricePt");
  return divRound(qtyMilli * unitPricePt, MILLI);
}

/** part × bp / 10000, rounded half-up. */
export function percentOf(basePt: number, bp: number): number {
  return divRound(basePt * bp, BP);
}


export const egp = (pounds: number) => Math.round(pounds * PT_PER_EGP);
export const qty = (units: number) => Math.round(units * MILLI);

/** What a form field holds ("1,250.5", Arabic digits too) → piasters / thousandths. Not a number gives NaN, which the server rejects. */
const typed = (x: string | number) => Number(westernDigits(String(x)).replace(/[,\s٬]/g, "").replace("٫", "."));
export const toPt = (x: string | number) => Math.round(typed(x) * PT_PER_EGP);
export const toMilli = (x: string | number) => Math.round(typed(x) * MILLI);
