/**
 * Amount in Arabic words for the statement: "فقط ثلاثة عشر ألف جنيه مصري".
 * Simple invoice form (D-12): no tanween, the currency word stays singular ("جنيه", "قرش").
 * Counted nouns are masculine (جنيه، قرش، ألف، مليون), so 3–10 take the feminine number form.
 */
const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TEENS = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

/** 1..999 → words. `beforeNoun`: a scale word follows directly (مائتان → مائتا). */
function under1000(n: number, beforeNoun = false): string {
  const h = Math.floor(n / 100), rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(h === 2 && rest === 0 && beforeNoun ? "مائتا" : HUNDREDS[h]);
  if (rest) {
    if (rest < 10) parts.push(ONES[rest]);
    else if (rest < 20) parts.push(TEENS[rest - 10]);
    else parts.push(rest % 10 ? `${ONES[rest % 10]} و${TENS[Math.floor(rest / 10)]}` : TENS[Math.floor(rest / 10)]);
  }
  return parts.join(" و");
}

/** Group count + scale word: ألف / ألفان / ثلاثة آلاف / أحد عشر ألف / مائتا ألف … */
function scaled(n: number, one: string, two: string, plural: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  const rest = n % 100;
  if (rest >= 3 && rest <= 10) return `${under1000(n)} ${plural}`;
  return `${under1000(n, true)} ${one}`;
}

/** Non-negative integer → Arabic words. 0 → "صفر". */
export function numberToArabicWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`expected a non-negative integer, got ${n}`);
  if (n === 0) return "صفر";
  const billions = Math.floor(n / 1e9), millions = Math.floor((n % 1e9) / 1e6), thousands = Math.floor((n % 1e6) / 1e3), units = n % 1e3;
  const parts: string[] = [];
  if (billions) parts.push(scaled(billions, "مليار", "ملياران", "مليارات"));
  if (millions) parts.push(scaled(millions, "مليون", "مليونان", "ملايين"));
  if (thousands) parts.push(scaled(thousands, "ألف", "ألفان", "آلاف"));
  if (units) parts.push(under1000(units));
  return parts.join(" و");
}

/** Piasters → "فقط … جنيه مصري و… قرش". */
export function amountInWords(pt: number, opts: { prefix?: string; currency?: string; fraction?: string } = {}): string {
  if (!Number.isSafeInteger(pt) || pt < 0) throw new RangeError(`expected non-negative piasters, got ${pt}`);
  const { prefix = "فقط", currency = "جنيه مصري", fraction = "قرش" } = opts;
  const pounds = Math.floor(pt / 100), piasters = pt % 100;
  let s = `${prefix} ${numberToArabicWords(pounds)} ${currency}`;
  if (piasters) s += ` و${numberToArabicWords(piasters)} ${fraction}`;
  return s;
}
