import { useEffect, useRef, useState } from "react";
import { Eraser, MessageCircle } from "lucide-react";
import { Avatar, Badge, Button, Field, Input, Plate, Select, useFmt } from "@jc/ui";
import { normalizePlate, PLATE_LETTERS, unusualPlateLetters, whatsappLink } from "@jc/core";
import { daysIn, Link, since } from "../lib";
import { usePlateTypes } from "../data/plates";
import { useApi, useLongStayDays } from "../data/hooks";
import type { PlateType, WOStatus, WOType, WorkOrderRow } from "../data/types";

export const WO_STATUS: Record<WOStatus, { label: string; tone: "work" | "ok" | "neutral" | "bad" }> = {
  open: { label: "جاري الشغل", tone: "work" },
  ready: { label: "جاهز للتسليم", tone: "ok" },
  delivered: { label: "تم التسليم", tone: "neutral" },
  closed: { label: "مقفول", tone: "neutral" },
  cancelled: { label: "ملغي", tone: "bad" },
};
export const WO_TYPE: Record<WOType, string> = { repair: "عميل", inquiry: "استعلام", condition: "تقرير حالة" };

export function StatusBadge({ status, size }: { status: WOStatus; size?: "lg" }) {
  const s = WO_STATUS[status];
  return <Badge tone={s.tone} dot size={size}>{s.label}</Badge>;
}

/** One-click WhatsApp texts from Settings (whatsapp.templates). */
export type WaTemplate = { id: string; label: string; text: string };
export function useWaTemplates(): WaTemplate[] {
  const s = useApi<Record<string, unknown>>("/settings");
  return (s.data?.["whatsapp.templates"] as WaTemplate[] | undefined) ?? [];
}

export const carName = (v?: { make: string | null; model: string | null; variant?: string | null } | null) =>
  v ? [v.make, v.model, v.variant].filter(Boolean).join(" ") : "";

type PlateLike = { plateType?: string | null; plateLetters: string | null; plateDigits: string | null };
export function CarPlate({ v, size }: { v?: PlateLike | null; size?: "lg" }) {
  const types = usePlateTypes();
  if (!v || (!v.plateLetters && !v.plateDigits)) return <span className="subtle">بدون لوحة</span>;
  const t = types.find((x) => x.id === (v.plateType ?? "private"));
  const d = v.plateDigits ?? "";
  // Diplomatic plates read ### - ##
  const digits = t?.digitsOnly && d.length > 3 ? `${d.slice(0, 3)} - ${d.slice(3)}` : d;
  return <Plate letters={v.plateLetters ?? ""} digits={digits} size={size} bar={t ? t.barColor : undefined} ink={t?.textColor} small={t?.small} kind={t?.label} />;
}

/* ---------- Plate input: type + letters + digits (D-69) ---------- */
export type PlateValue = { plateType: string; plateLetters: string; plateDigits: string };
export const EMPTY_PLATE: PlateValue = { plateType: "private", plateLetters: "", plateDigits: "" };

/** Arabic error for the form, or "" when the plate can be saved. */
export function plateError(v: PlateValue, types: PlateType[]) {
  const t = types.find((x) => x.id === v.plateType);
  if (!v.plateDigits.trim()) return "اكتب أرقام اللوحة.";
  try { normalizePlate({ letters: v.plateLetters, digits: v.plateDigits }, { digitsOnly: !!t?.digitsOnly }); return ""; } catch {
    return t?.digitsOnly ? "لوحة هذا النوع أرقام فقط، مثل: 123 - 45." : "اكتب حتى 3 حروف عربية، والأرقام من 1 إلى 7 أرقام.";
  }
}

export function PlateInput({ value, onChange, error }: { value: PlateValue; onChange: (v: PlateValue) => void; error?: string }) {
  const types = usePlateTypes();
  const t = types.find((x) => x.id === value.plateType);
  const letters = [...value.plateLetters.replace(/[\sـ]/g, "")];
  const odd = unusualPlateLetters(value.plateLetters);
  const set = (p: Partial<PlateValue>) => onChange({ ...value, ...p });
  const preview = plateError(value, types) ? null : normalizePlate({ letters: value.plateLetters, digits: value.plateDigits }, { digitsOnly: !!t?.digitsOnly });
  return (
    <div className="stack" style={{ gap: 8, gridColumn: "1 / -1" }}>
      <div className="form-grid" style={{ ["--cols" as string]: t?.digitsOnly ? 2 : 3 }}>
        <Field label="نوع اللوحة">
          <Select value={value.plateType} onChange={(e) => set({ plateType: e.target.value, ...(types.find((x) => x.id === e.target.value)?.digitsOnly ? { plateLetters: "" } : {}) })}>
            {types.filter((x) => x.active || x.id === value.plateType).map((x) => <option key={x.id} value={x.id}>{x.label}{x.toConfirm ? " (للتأكيد)" : ""}</option>)}
            {!types.length && <option value="private">ملاكي</option>}
          </Select>
        </Field>
        {!t?.digitsOnly && <Field label="حروف اللوحة" hint="حتى 3 حروف"><Input value={value.plateLetters} onChange={(e) => set({ plateLetters: e.target.value })} placeholder="ل ف و" /></Field>}
        <Field label="أرقام اللوحة" required error={error}><Input num value={value.plateDigits} onChange={(e) => set({ plateDigits: e.target.value })} placeholder={t?.digitsOnly ? "123 - 45" : "281"} /></Field>
      </div>
      {!t?.digitsOnly && (
        <div className="plate-keys" role="group" aria-label="حروف اللوحة">
          {PLATE_LETTERS.map((l) => <button type="button" key={l} className="plate-key" disabled={letters.length >= 3} onClick={() => set({ plateLetters: [...letters, l.replace("ـ", "")].join(" ") })}>{l}</button>)}
          <button type="button" className="plate-key" aria-label="مسح آخر حرف" disabled={!letters.length} onClick={() => set({ plateLetters: letters.slice(0, -1).join(" ") })}>⌫</button>
        </div>
      )}
      {odd.length > 0 && <p className="plate-warn" role="status">حرف غير معتاد على اللوحات المصرية: {odd.join(" ")}. تأكد منه قبل الحفظ.</p>}
      {preview && <div className="row" style={{ gap: 8 }}><span className="subtle">شكل اللوحة:</span><CarPlate v={{ plateType: value.plateType, plateLetters: preview.letters, plateDigits: preview.digits }} /></div>}
    </div>
  );
}

export function CarTile({ wo }: { wo: WorkOrderRow }) {
  const f = useFmt();
  const days = daysIn(wo.enteredAt);
  const longDays = useLongStayDays();
  return (
    <Link to={`/work-orders/${wo.id}`} className="car-tile">
      <div className="car-tile__top">
        <CarPlate v={wo.vehicle} />
        <span className="car-tile__wo">#{f.s(wo.number)}</span>
      </div>
      <div>
        <p className="car-tile__model"><span className="lat">{carName(wo.vehicle)}</span></p>
        <p className="car-tile__cust">{wo.customer.name}</p>
      </div>
      {wo.complaint && <p className="car-tile__complaint">{wo.complaint}</p>}
      <div className="car-tile__foot">
        <span className="car-tile__eng">{wo.engineer && <><Avatar name={wo.engineer} />{wo.engineer}</>}</span>
        {days >= longDays ? <Badge tone="warn">{since(wo.enteredAt)}</Badge> : <span>{since(wo.enteredAt)}</span>}
      </div>
      {wo.type !== "repair" && <div><Badge tone="outline">{WO_TYPE[wo.type]}</Badge></div>}
    </Link>
  );
}

export function WhatsAppButton({ phone, text, size = "sm", label = "واتساب" }: { phone?: string | null; text?: string; size?: "sm" | "md"; label?: string }) {
  const href = phone ? whatsappLink(phone, text) : null;
  if (!href) return <Button size={size} variant="whatsapp" disabled title="رقم الواتساب غير صحيح أو غير مسجل" icon={<MessageCircle />}>{label}</Button>;
  return (
    <a className={`btn btn--whatsapp${size === "sm" ? " btn--sm" : ""}`} href={href} target="_blank" rel="noreferrer" title={`فتح محادثة واتساب: +${href.split("/")[3].split("?")[0]}`}>
      <MessageCircle />{label}
    </a>
  );
}

/** Customer signature on the screen or a tablet; reports the PNG, or null when cleared. */
export function SignaturePad({ onSigned }: { onSigned: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [has, setHas] = useState(false);
  useEffect(() => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    c.width = r.width * devicePixelRatio; c.height = r.height * devicePixelRatio;
    const ctx = c.getContext("2d")!;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0B0B0B";
  }, []);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="sig">
        <canvas ref={ref} aria-label="مساحة توقيع العميل"
          onPointerDown={(e) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const ctx = ref.current!.getContext("2d")!; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); }}
          onPointerMove={(e) => { if (!drawing.current) return; const ctx = ref.current!.getContext("2d")!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); if (!has) setHas(true); }}
          onPointerUp={() => { if (drawing.current && has) onSigned(ref.current!.toDataURL("image/png")); drawing.current = false; }} />
        <span className="sig__line" />
        {!has && <span className="sig__hint">وقّع هنا بالماوس أو بالإصبع</span>}
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="hint-line">«أقر بأن بيانات السيارة والمتعلقات صحيحة، وأوافق على الشروط المطبوعة بكارت الإصلاح.»</span>
        <Button size="sm" variant="ghost" icon={<Eraser />} onClick={() => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setHas(false); onSigned(null); }}>مسح التوقيع</Button>
      </div>
    </div>
  );
}
