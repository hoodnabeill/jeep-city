/**
 * ★ Statement (بيان عميل) totals — the ONE place these formulas live (PLAN §3).
 * Review with the accountant (Aslam). Change a rule here and in totals.test.ts, nowhere else.
 *
 * Categories c: labor (مصنعيات), part (قطع غيار), oil (زيوت), material (خامات), paint (بويات)
 *
 *   line value      = round(qty × price)                      half-up to 1 piaster
 *   gross[c]        = Σ line values of category c             إجمالي المصنعيات / إجمالي قطع الغيار …
 *   discount[c]     = amount, or round(gross[c] × % ÷ 100); never more than gross[c], never negative
 *   net[c]          = gross[c] − discount[c]                  صافي المصنعيات / صافي قطع الغيار / صافي الزيوت
 *   tax[c]          = 0, unless VAT is on and the customer is not exempt: round(net[c] × rate[c])
 *   إجمالي بيان     = Σ gross[c]
 *   إجمالي خصم      = Σ discount[c]
 *   إجمالي خامات    = net[material]                           (D-09, open with Aslam)
 *   أجمالي المطلوب  = Σ net[c] + Σ tax[c]
 *
 * A line's category comes from its item type unless the line overrides it (D-08: the real statement
 * entered engine oil and materials as parts lines).
 */
import { lineValuePt, percentOf } from "./money";

export const CATEGORIES = ["labor", "part", "oil", "material", "paint"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Discount = { mode: "amount"; valuePt: number } | { mode: "percent"; valueBp: number };
export type TotalsLine = { category: Category; qtyMilli: number; unitPricePt: number };
export type TotalsInput = {
  lines: TotalsLine[];
  discounts?: Partial<Record<Category, Discount>>;
  /** VAT rate per category in basis points; omitted or 0 = no tax (the default, D-11). */
  vatBp?: Partial<Record<Category, number>>;
  taxExempt?: boolean;
};
type PerCat = Record<Category, number>;
export type Totals = {
  gross: PerCat;
  discount: PerCat;
  net: PerCat;
  tax: PerCat;
  laborGrossPt: number;      // إجمالي المصنعيات
  partsGrossPt: number;      // إجمالي قطع الغيار
  discountPt: number;        // إجمالي خصم
  laborNetPt: number;        // صافي المصنعيات
  partsNetPt: number;        // صافي قطع الغيار
  oilsNetPt: number;         // صافي الزيوت
  materialsPt: number;       // إجمالي خامات
  statementGrossPt: number;  // إجمالي بيان
  taxPt: number;
  amountDuePt: number;       // أجمالي المطلوب
};

const zero = (): PerCat => ({ labor: 0, part: 0, oil: 0, material: 0, paint: 0 });

export function discountPt(grossPt: number, d?: Discount): number {
  if (!d) return 0;
  const raw = d.mode === "amount" ? d.valuePt : percentOf(grossPt, d.valueBp);
  if (raw < 0) throw new RangeError("discount cannot be negative");
  return Math.min(raw, grossPt);
}

export function computeTotals(input: TotalsInput): Totals {
  const gross = zero(), discount = zero(), net = zero(), tax = zero();
  for (const l of input.lines) {
    if (l.qtyMilli < 0 || l.unitPricePt < 0) throw new RangeError("line quantity and price must not be negative");
    gross[l.category] += lineValuePt(l.qtyMilli, l.unitPricePt);
  }
  for (const c of CATEGORIES) {
    discount[c] = discountPt(gross[c], input.discounts?.[c]);
    net[c] = gross[c] - discount[c];
    const rate = input.vatBp?.[c] ?? 0;
    tax[c] = rate > 0 && !input.taxExempt ? percentOf(net[c], rate) : 0;
  }
  const sum = (r: PerCat) => CATEGORIES.reduce((a, c) => a + r[c], 0);
  return {
    gross, discount, net, tax,
    laborGrossPt: gross.labor,
    partsGrossPt: gross.part,
    discountPt: sum(discount),
    laborNetPt: net.labor,
    partsNetPt: net.part,
    oilsNetPt: net.oil,
    materialsPt: net.material,
    statementGrossPt: sum(gross),
    taxPt: sum(tax),
    amountDuePt: sum(net) + sum(tax),
  };
}
