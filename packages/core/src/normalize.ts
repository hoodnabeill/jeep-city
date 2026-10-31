/** Text normalizers shared by search, import and WhatsApp links (D-35, D-36, D-37). */

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Arabic-Indic / Persian digits → 0-9. */
export function westernDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
}

/** Search key: no tashkeel or tatweel, ا/أ/إ/آ → ا, ة → ه, ى → ي, Western digits, no spaces or dashes, lower case. */
export function searchKey(s: string): string {
  return westernDigits(s)
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[\s\-_.\/]/g, "")
    .toLowerCase();
}

export type Plate = { letters: string; digits: string };

/** Split an Egyptian plate typed in any order or spacing ("ل ف و 281", "281لفو") into letters and digits. */
export function parsePlate(input: string): Plate | null {
  const s = westernDigits(input).replace(/[ً-ٟـ|\-_.]/g, " ");
  const digits = (s.match(/\d/g) ?? []).join("");
  const letters = (s.match(/[ء-ي]/g) ?? []).map((c) => c.replace(/[أإآ]/, "ا").replace("ى", "ي"));
  if (!letters.length && !digits) return null;
  if (letters.length > 3 || digits.length > 7) return null; // diplomatic plates are digits only (### - ##)
  return { letters: letters.join(" "), digits };
}

/** Letters used on current Egyptian plates. Others are allowed with a soft warning (old plates, typos to check). */
export const PLATE_LETTERS = ["أ", "ب", "ج", "د", "ر", "س", "ص", "ط", "ع", "ف", "ق", "ل", "م", "ن", "هـ", "و", "ى"];
const PLATE_KEYS = new Set(PLATE_LETTERS.map((l) => searchKey(l)));

/** Clean a structured plate: letters spaced one by one (as typed), digits Western. Throws on non-Arabic letters or bad digits. */
export function normalizePlate(input: { letters?: string | null; digits?: string | null }, opts: { digitsOnly?: boolean } = {}): Plate {
  const letters = (input.letters ?? "").replace(/ـ/g, "").replace(/\s+/g, "");
  const digits = westernDigits(input.digits ?? "").replace(/[\s\-]/g, "");
  if (letters && !/^[ء-ي]+$/.test(letters)) throw new RangeError("plate letters must be Arabic");
  if ([...letters].length > 3) throw new RangeError("at most 3 letters");
  if (opts.digitsOnly && letters) throw new RangeError("this plate type has digits only");
  if (!/^\d{1,7}$/.test(digits)) throw new RangeError("plate digits must be 1 to 7 digits");
  return { letters: [...letters].map((c) => (c === "ه" ? "هـ" : c)).join(" "), digits };
}

/** Letters outside the usual plate set, for a soft warning in the form. */
export const unusualPlateLetters = (letters: string) => [...letters.replace(/[\sـ]/g, "")].filter((c) => !PLATE_KEYS.has(searchKey(c)));

/** Stored search key for a plate: letters then digits, no spaces. Matches any typed order. */
export const plateKey = (p: Plate) => searchKey(p.letters + p.digits);

/** Does a typed query match a plate? Accepts letters, digits, both, any order or spacing. */
export function plateMatches(query: string, p: Plate): boolean {
  const q = parsePlate(query);
  if (!q) return false;
  const letters = searchKey(p.letters), qLetters = searchKey(q.letters);
  return letters.includes(qLetters) && p.digits.includes(q.digits);
}

/**
 * Egyptian phone → international digits for wa.me ("201001234567"), or null when it is not an Egyptian mobile.
 * Accepts spaces, dashes, brackets, "+20", "0020", Arabic-Indic digits.
 */
export function egyptMobile(raw: string): string | null {
  let d = westernDigits(raw).replace(/\D/g, "");
  if (d.startsWith("0020")) d = d.slice(2);
  else if (d.startsWith("01") && d.length === 11) d = "2" + d;
  else if (d.startsWith("1") && d.length === 10) d = "20" + d;
  return /^201[0125]\d{8}$/.test(d) ? d : null;
}

export function whatsappLink(raw: string, text?: string): string | null {
  const n = egyptMobile(raw);
  return n ? `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null;
}

/** First name for a greeting, skipping titles typed before it ("م/ محمد", "د. أحمد", "السيد علي"). */
export function firstName(full: string): string {
  const parts = full.trim().split(/\s+/);
  // "السيد" is left out: in Egypt it is often the first name itself.
  const title = /^(م|أ|ا|د|ك|ح|لواء|عميد|مهندس|دكتور|الأستاذ|الاستاذ|السيدة|الحاج|الحاجة)[./]?$|\/$/;
  return parts.find((p) => !title.test(p)) ?? parts[0] ?? "";
}

/** Fill a message template: "{الاسم}" → value. Unknown or empty placeholders stay visible so the gap is noticed. */
export function fillTemplate(text: string, vars: Record<string, string | number | null | undefined>): string {
  return text.replace(/{([^{}]+)}/g, (m, k: string) => { const v = vars[k.trim()]; return v === null || v === undefined || v === "" ? m : String(v); });
}

/** RFC 9562 UUIDv7: time-ordered ids generated on any device (sync, D-29). */
export function uuidv7(now = Date.now()): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  const ms = BigInt(now);
  for (let i = 0; i < 6; i++) b[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
