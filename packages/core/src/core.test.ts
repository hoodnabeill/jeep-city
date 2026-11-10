import { describe, expect, it } from "vitest";
import {
  amountInWords, can, lookupRank, roleDefaults, spokenToSearch, computeTotals, divRound, egp, egyptMobile, lineValuePt, numberToArabicWords,
  fillTemplate, firstName, toMilli, toPt, normalizePlate, parsePlate, PERMISSIONS, plateKey, plateMatches, unusualPlateLetters, qty, searchKey, uuidv7, whatsappLink, type TotalsLine,
} from "./index";

describe("money", () => {
  it("rounds half away from zero", () => {
    expect(divRound(5, 10)).toBe(1);
    expect(divRound(4, 10)).toBe(0);
    expect(divRound(-5, 10)).toBe(-1);
    expect(divRound(15, 10)).toBe(2);
  });
  it("prices decimal quantities to the piaster", () => {
    expect(lineValuePt(qty(7.5), egp(750))).toBe(egp(5625));
    expect(lineValuePt(qty(0.333), egp(10))).toBe(333); // 3.33 EGP
    expect(lineValuePt(qty(1), 1)).toBe(1);
  });
});

describe("totals: the real statement 9309 (fixture)", () => {
  const part = (units: number, price: number): TotalsLine => ({ category: "part", qtyMilli: qty(units), unitPricePt: egp(price) });
  const lines: TotalsLine[] = [
    { category: "labor", qtyMilli: qty(1), unitPricePt: egp(2500) },
    part(7, 750), // engine oil 5W-30 MOPAR, entered as a parts line on the paper (D-08)
    part(1, 850), part(1, 1850), part(1, 300), part(1, 2000), part(1, 300), part(1, 650), part(1, 150),
  ];
  const t = computeTotals({ lines, discounts: { labor: { mode: "amount", valuePt: egp(450) }, part: { mode: "amount", valuePt: egp(400) } } });

  it("matches every number on the paper", () => {
    expect(t.laborGrossPt).toBe(egp(2500));      // إجمالي المصنعيات
    expect(t.partsGrossPt).toBe(egp(11350));     // إجمالي قطع الغيار
    expect(t.discountPt).toBe(egp(850));         // إجمالي خصم
    expect(t.laborNetPt).toBe(egp(2050));        // صافي المصنعيات
    expect(t.partsNetPt).toBe(egp(10950));       // صافي قطع الغيار
    expect(t.oilsNetPt).toBe(0);                 // صافي الزيوت
    expect(t.materialsPt).toBe(0);               // إجمالي خامات
    expect(t.statementGrossPt).toBe(egp(13850)); // إجمالي بيان
    expect(t.amountDuePt).toBe(egp(13000));      // أجمالي المطلوب
    expect(t.taxPt).toBe(0);
  });
  it("writes the amount due in words", () => {
    expect(amountInWords(t.amountDuePt)).toBe("فقط ثلاثة عشر ألف جنيه مصري");
  });
});

describe("totals: discount and tax rules", () => {
  const base: TotalsLine[] = [
    { category: "labor", qtyMilli: qty(1), unitPricePt: egp(1000) },
    { category: "part", qtyMilli: qty(2), unitPricePt: egp(333.33) },
    { category: "oil", qtyMilli: qty(6.5), unitPricePt: egp(980) },
    { category: "material", qtyMilli: qty(1), unitPricePt: egp(150) },
  ];
  it("percent discount rounds half-up to the piaster", () => {
    const t = computeTotals({ lines: base, discounts: { part: { mode: "percent", valueBp: 1250 } } }); // 12.5 % of 666.66
    expect(t.partsGrossPt).toBe(66_666);
    expect(t.discount.part).toBe(8_333); // 83.3325 → 83.33
    expect(t.partsNetPt).toBe(58_333);
  });
  it("a discount never exceeds its category", () => {
    const t = computeTotals({ lines: base, discounts: { labor: { mode: "amount", valuePt: egp(5000) } } });
    expect(t.discount.labor).toBe(egp(1000));
    expect(t.laborNetPt).toBe(0);
  });
  it("oils and materials have their own buckets", () => {
    const t = computeTotals({ lines: base });
    expect(t.oilsNetPt).toBe(egp(6370));
    expect(t.materialsPt).toBe(egp(150));
    expect(t.amountDuePt).toBe(818_666);
  });
  it("VAT is off by default, on the net when enabled, and skipped for exempt customers", () => {
    const vat = { labor: 1400, part: 1400 };
    const on = computeTotals({ lines: base, vatBp: vat, discounts: { labor: { mode: "amount", valuePt: egp(100) } } });
    expect(on.tax.labor).toBe(egp(126)); // 14 % of 900
    expect(on.tax.part).toBe(9_333);     // 14 % of 666.66 = 93.3324
    expect(on.amountDuePt).toBe(830_599); // 8186.66 gross − 100 discount + 219.33 tax
    expect(computeTotals({ lines: base, vatBp: vat, taxExempt: true }).taxPt).toBe(0);
  });
  it("rejects negative input", () => {
    expect(() => computeTotals({ lines: [{ category: "part", qtyMilli: -1000, unitPricePt: 100 }] })).toThrow();
    expect(() => computeTotals({ lines: base, discounts: { labor: { mode: "amount", valuePt: -1 } } })).toThrow();
  });
  it("empty statement is zero", () => {
    expect(computeTotals({ lines: [] }).amountDuePt).toBe(0);
  });
});

describe("Arabic number to words", () => {
  const cases: [number, string][] = [
    [0, "صفر"], [1, "واحد"], [2, "اثنان"], [3, "ثلاثة"], [10, "عشرة"], [11, "أحد عشر"], [12, "اثنا عشر"],
    [13, "ثلاثة عشر"], [20, "عشرون"], [21, "واحد وعشرون"], [99, "تسعة وتسعون"], [100, "مائة"], [101, "مائة وواحد"],
    [200, "مائتان"], [250, "مائتان وخمسون"], [999, "تسعمائة وتسعة وتسعون"], [1000, "ألف"], [1001, "ألف وواحد"],
    [2000, "ألفان"], [3000, "ثلاثة آلاف"], [10000, "عشرة آلاف"], [11000, "أحد عشر ألف"], [13000, "ثلاثة عشر ألف"],
    [13850, "ثلاثة عشر ألف وثمانمائة وخمسون"], [100000, "مائة ألف"], [103000, "مائة وثلاثة آلاف"],
    [200000, "مائتا ألف"], [250000, "مائتان وخمسون ألف"], [1000000, "مليون"], [2000000, "مليونان"],
    [3000000, "ثلاثة ملايين"], [12500000, "اثنا عشر مليون وخمسمائة ألف"], [1250750, "مليون ومائتان وخمسون ألف وسبعمائة وخمسون"],
  ];
  it.each(cases)("%i → %s", (n, w) => expect(numberToArabicWords(n)).toBe(w));
  it("adds piasters and the currency", () => {
    expect(amountInWords(egp(1250.5))).toBe("فقط ألف ومائتان وخمسون جنيه مصري وخمسون قرش");
    expect(amountInWords(egp(0.25))).toBe("فقط صفر جنيه مصري وخمسة وعشرون قرش");
    expect(amountInWords(egp(4850))).toBe("فقط أربعة آلاف وثمانمائة وخمسون جنيه مصري");
  });
  it("rejects negatives and fractions", () => {
    expect(() => numberToArabicWords(-1)).toThrow();
    expect(() => numberToArabicWords(1.5)).toThrow();
  });
});

describe("normalizers", () => {
  it("search key ignores hamza forms, taa marbuta, alef maqsura, tashkeel and spaces", () => {
    expect(searchKey("أحمد")).toBe(searchKey("احمد"));
    expect(searchKey("إبراهيم")).toBe(searchKey("ابراهيم"));
    expect(searchKey("شركة")).toBe(searchKey("شركه"));
    expect(searchKey("مصطفى")).toBe(searchKey("مصطفي"));
    expect(searchKey("مُحَمَّد")).toBe(searchKey("محمد"));
    expect(searchKey("٠١٠٠ ٢٣٤")).toBe("0100234");
  });
  it("parses Egyptian plates in any order and spacing", () => {
    expect(parsePlate("ل ف و 281")).toEqual({ letters: "ل ف و", digits: "281" });
    expect(parsePlate("281لفو")).toEqual({ letters: "ل ف و", digits: "281" });
    expect(parsePlate("٢٨١ ل ف و")).toEqual({ letters: "ل ف و", digits: "281" });
    expect(parsePlate("abcd")).toBeNull();
    const p = { letters: "ل ف و", digits: "281" };
    expect(plateKey(p)).toBe("لفو281");
    expect(plateMatches("281", p)).toBe(true);
    expect(plateMatches("لفو", p)).toBe(true);
    expect(plateMatches("ف و 28", p)).toBe(true);
    expect(plateMatches("ل ف و 282", p)).toBe(false);
  });
  it("cleans structured plates and warns softly on unusual letters", () => {
    expect(normalizePlate({ letters: "لفو", digits: "٢٨١" })).toEqual({ letters: "ل ف و", digits: "281" });
    expect(normalizePlate({ letters: "ه ـ ط ل", digits: "3048" })).toEqual({ letters: "هـ ط ل", digits: "3048" });
    expect(normalizePlate({ letters: "", digits: "123 45" }, { digitsOnly: true })).toEqual({ letters: "", digits: "12345" });
    expect(() => normalizePlate({ letters: "ab", digits: "1" })).toThrow();
    expect(() => normalizePlate({ letters: "س", digits: "1" }, { digitsOnly: true })).toThrow();
    expect(() => normalizePlate({ letters: "س ص ط ع", digits: "1" })).toThrow();
    expect(unusualPlateLetters("ل ف و")).toEqual([]);
    expect(unusualPlateLetters("ا ي ه")).toEqual([]); // variants of أ ى هـ
    expect(unusualPlateLetters("ز ش")).toEqual(["ز", "ش"]);
    expect(plateMatches("12345", { letters: "", digits: "12345" })).toBe(true);
  });
  it("greets by first name, skipping titles", () => {
    expect(firstName("م/ محمد عاطف اسماعيل")).toBe("محمد");
    expect(firstName("د. أحمد علي")).toBe("أحمد");
    expect(firstName("السيد السيد اسماعيل")).toBe("السيد");
    expect(firstName("السيدة منى")).toBe("منى");
    expect(firstName("خالد إبراهيم")).toBe("خالد");
  });
  it("reads typed amounts and quantities", () => {
    expect(toPt("1,250.5")).toBe(125050);
    expect(toPt("١٢٣")).toBe(12300);
    expect(toPt(7)).toBe(700);
    expect(toMilli("0.125")).toBe(125);
    expect(toMilli("٢")).toBe(2000);
    expect(Number.isNaN(toPt("abc"))).toBe(true);
  });
  it("fills WhatsApp templates", () => {
    expect(fillTemplate("أهلًا {الاسم}، {السيارة} جاهزة", { "الاسم": "خالد", "السيارة": "Jeep WK2" })).toBe("أهلًا خالد، Jeep WK2 جاهزة");
    expect(fillTemplate("رقم {رقم_الأمر} {مجهول}", { "رقم_الأمر": 13558, "مجهول": "" })).toBe("رقم 13558 {مجهول}");
  });
  it("normalizes Egyptian mobiles for wa.me", () => {
    for (const raw of ["01002345678", "0100 234 5678", "0100-234-5678", "+20 100 234 5678", "00201002345678", "٠١٠٠٢٣٤٥٦٧٨", "1002345678"])
      expect(egyptMobile(raw)).toBe("201002345678");
    expect(egyptMobile("02 2614 7788")).toBeNull(); // landline
    expect(egyptMobile("0130 234 5678")).toBeNull(); // not a mobile prefix
    expect(whatsappLink("0122-345-6789", "أهلًا")).toBe("https://wa.me/201223456789?text=%D8%A3%D9%87%D9%84%D9%8B%D8%A7");
  });
  it("uuidv7 is version 7 and time-ordered", () => {
    const a = uuidv7(1_000), b = uuidv7(2_000);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });
});

describe("permissions", () => {
  it("engineers cannot edit or cancel a saved statement, see costs, or touch money and settings", () => {
    for (const a of ["statement.editSaved", "statement.cancel", "cost.view", "cash.manage", "report.view", "settings.manage", "item.manage", "stock.issueOverAvailable", "audit.view"] as const)
      expect(can({ role: "engineer" }, a)).toBe(false);
  });
  it("engineers can do the counter work", () => {
    for (const a of ["workOrder.create", "statement.create", "stock.issue", "customer.manage", "item.view", "stockCount.enter"] as const)
      expect(can({ role: "engineer" }, a)).toBe(true);
  });
  it("a missing role can do nothing", () => {
    for (const a of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) expect(can(undefined, a)).toBe(false);
  });
  it("a user's own list replaces the role defaults both ways", () => {
    const trusted = { role: "engineer" as const, permissions: [...roleDefaults("engineer"), "cost.view"] };
    expect(can(trusted, "cost.view")).toBe(true);
    expect(can({ role: "admin", permissions: ["item.view"] }, "cash.manage")).toBe(false);
    expect(can({ role: "admin", permissions: [] }, "session.use")).toBe(true);
    expect(can({ role: "admin", permissions: null }, "cash.manage")).toBe(true);
  });
});

describe("quick search ranking", () => {
  it("puts the exact plate number before plates that only contain it", () => {
    const exact = lookupRank("123", { plateLetters: "ص ط ب", plateDigits: "123" });
    const longer = lookupRank("123", { plateLetters: "م ر", plateDigits: "1234" });
    const inside = lookupRank("123", { plateLetters: "م ر", plateDigits: "51230" });
    expect(exact).toBeLessThan(longer);
    expect(longer).toBeLessThan(inside);
    expect(lookupRank("123 صطب", { plateLetters: "ص ط ب", plateDigits: "123" })).toBe(0);
    expect(lookupRank("123 صطب", { plateLetters: "ن ج", plateDigits: "123" })).toBeGreaterThan(0);
  });
});

describe("voice search", () => {
  it("turns a plate said out loud into letters and digits", () => {
    expect(spokenToSearch("صاد طاء باء 123")).toBe("ص ط ب 123");
    expect(spokenToSearch("123 صاد وطاء وباء")).toBe("ص ط ب 123");
    expect(spokenToSearch("نون جيم واحد اتنين تلاتة")).toBe("ن ج 123");
    expect(spokenToSearch("ص ط ب ١٢٣")).toBe("ص ط ب 123");
  });
  it("leaves names and phone numbers as heard", () => {
    expect(spokenToSearch("محمد عاطف اسماعيل")).toBe("محمد عاطف اسماعيل");
    expect(spokenToSearch("01001234567")).toBe("01001234567");
    expect(spokenToSearch("يا محمد")).toBe("يا محمد");
  });
});
