/**
 * Money and quantities as integers (D-07). No floats anywhere in stored values.
 *
 *   money     piasters (1 EGP = 100 pt)          suffix `Pt`
 *   quantity  thousandths of a unit (7.5 L = 7500) suffix `Milli`
 *   percent   basis points (12.5 % = 1250 bp)    suffix `Bp`
 */

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

/** "13000" | "1250.5" | "1,250.50" → piasters. Throws on anything else. */
export function parseEgp(text: string): number {
  const s = text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[,\s٬]/g, "").replace("٫", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new RangeError(`not an amount: ${text}`);
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const pt = Number(whole) * PT_PER_EGP + Number(frac.padEnd(2, "0"));
  return s.startsWith("-") ? -pt : pt;
}

/** "7" | "7.5" | "0.125" → thousandths. */
export function parseQty(text: string): number {
  const s = text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace("٫", ".").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(s)) throw new RangeError(`not a quantity: ${text}`);
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * MILLI + Number(frac.padEnd(3, "0"));
}

export const egp = (pounds: number) => Math.round(pounds * PT_PER_EGP);
export const qty = (units: number) => Math.round(units * MILLI);
