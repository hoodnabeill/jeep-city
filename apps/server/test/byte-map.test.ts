import { describe, expect, it } from "vitest";
import { byteTotals, cairoTime, clean, customerKey, mapPlate, pickMobile, splitKind, year } from "../src/import/byte-map";

describe("Byte import mapping", () => {
  it("keeps standard plates and flags the rest (D-72)", () => {
    expect(mapPlate("ل ف و 281")).toMatchObject({ plateLetters: "ل ف و", plateDigits: "281", review: false });
    expect(mapPlate("4127 س ط ج")).toMatchObject({ plateLetters: "س ط ج", plateDigits: "4127", review: false });
    expect(mapPlate("س ط ج ٤١٢٧")).toMatchObject({ plateDigits: "4127", review: false });
    expect(mapPlate("12345")).toMatchObject({ plateLetters: null, plateDigits: "12345", review: true });
    expect(mapPlate("*")).toMatchObject({ plateKey: null, review: true });
    expect(mapPlate(null).review).toBe(true);
    expect(mapPlate("ABC 12")).toMatchObject({ plateDigits: "12", review: true });
  });
  it("finds the mobile in any phone column and merges customers by it", () => {
    expect(pickMobile(null, "0100 234 5678")).toBe("201002345678");
    expect(pickMobile("0222614778", "*")).toBeNull();
    expect(customerKey("خالد", "201002345678")).toBe("m:201002345678");
    expect(customerKey("أحمد  علي", null)).toBe(customerKey("احمد علي", null));
    expect(customerKey(null, null)).toBeNull();
  });
  it("reads Byte values", () => {
    expect(clean(" * ")).toBeNull();
    expect(clean("0")).toBeNull();
    expect(clean("\\\\")).toBeNull();
    expect(clean("WK2")).toBe("WK2");
    expect(splitKind("JEEP WK2")).toEqual({ make: "Jeep", model: "WK2" });
    expect(splitKind("رانجلر")).toEqual({ make: null, model: "رانجلر" });
    expect(year("2015")).toBe(2015);
    expect(year("WK2")).toBeNull();
    expect(cairoTime("2026-10-31", "1899-12-30T13:21:57")?.toISOString()).toBe("2026-10-31T11:21:57.000Z");
  });
});

describe("Byte statement totals (D-80)", () => {
  const lines = [{ category: "labor" as const, qtyMilli: 1000, unitPricePt: 100000 }, { category: "part" as const, qtyMilli: 2000, unitPricePt: 50000 }];
  it("matches Byte's net with a discount, labor first", () => {
    const r = byteTotals(lines, 150000);
    expect(r.totals.amountDuePt).toBe(150000);
    expect(r.discounts).toEqual({ labor: { mode: "amount", valuePt: 50000 } });
    const big = byteTotals(lines, 20000);
    expect(big.totals.amountDuePt).toBe(20000);
    expect(big.discounts.part).toEqual({ mode: "amount", valuePt: 80000 });
  });
  it("never invents value above the lines", () => {
    const r = byteTotals(lines, 250000);
    expect(r.totals.amountDuePt).toBe(200000);
    expect(r.above).toBe(50000);
  });
});
