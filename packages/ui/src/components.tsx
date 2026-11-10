import {
  cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
  type TextareaHTMLAttributes, type CSSProperties, type Ref,
} from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------- Digits setting (Western by default, D-02) ---------- */
export type Digits = "latn" | "arab";
const DigitsCtx = createContext<{ digits: Digits; setDigits: (d: Digits) => void }>({ digits: "latn", setDigits: () => {} });
export function DigitsProvider({ children }: { children: ReactNode }) {
  const [digits, setDigits] = useState<Digits>("latn");
  return <DigitsCtx.Provider value={{ digits, setDigits }}>{children}</DigitsCtx.Provider>;
}
export const useDigits = () => useContext(DigitsCtx);

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
export function localDigits(s: string, digits: Digits) {
  return digits === "arab" ? s.replace(/[0-9]/g, (d) => ARABIC_INDIC[+d]) : s;
}
export function useFmt() {
  const { digits } = useDigits();
  return {
    n: (v: number, frac = 0) =>
      new Intl.NumberFormat("en-US", { numberingSystem: digits, minimumFractionDigits: frac, maximumFractionDigits: Math.max(frac, 3) }).format(v),
    /** piasters → "13,000" or "1,250.50" */
    pt: (pt: number) => {
      const hasFrac = pt % 100 !== 0;
      return new Intl.NumberFormat("en-US", { numberingSystem: digits, minimumFractionDigits: hasFrac ? 2 : 0, maximumFractionDigits: 2 }).format(pt / 100);
    },
    /** ISO → 2026/10/28 */
    date: (iso: string) => localDigits(iso.slice(0, 10).replaceAll("-", "/"), digits),
    /** ISO → 10:30 ص */
    time: (iso: string) => {
      const [h, m] = iso.slice(11, 16).split(":").map(Number);
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return localDigits(`${h12}:${String(m).padStart(2, "0")}`, digits) + (h < 12 ? " ص" : " م");
    },
    s: (v: string | number) => localDigits(String(v), digits),
  };
}

/* ---------- Buttons ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "dark" | "danger" | "whatsapp";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  kbd?: string;
  block?: boolean;
};
export function Button({ variant = "secondary", size = "md", icon, kbd, block, className, children, type = "button", ...rest }: BtnProps) {
  return (
    <button type={type} className={cx("btn", `btn--${variant}`, size !== "md" && `btn--${size}`, block && "btn--block", className)} {...rest}>
      {icon}
      {children}
      {kbd && <span className="kbd" style={{ marginInlineStart: 4, background: "transparent", borderColor: "rgb(11 11 11 / .2)" }}>{kbd}</span>}
    </button>
  );
}

export function IconButton({ label, size, count, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm"; count?: number }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx("icon-btn", size && "icon-btn--sm", className)} {...rest}>
      {children}
      {!!count && <span className="dot-count">{count}</span>}
    </button>
  );
}

/* ---------- Fields ---------- */
export function Field({ label, hint, error, required, children, className, htmlFor }: {
  label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; children: ReactNode; className?: string; htmlFor?: string;
}) {
  // Link the label to a single control so screen readers announce it (and clicking the label focuses it).
  const auto = useId();
  const only = isValidElement<{ id?: string }>(children) ? children : null;
  const id = htmlFor ?? only?.props.id ?? (only ? auto : undefined);
  return (
    <div className={cx("field", !!error && "is-invalid", className)}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required && <span className="field__req" aria-hidden>*</span>}
      </label>
      {only && !htmlFor && !only.props.id ? cloneElement(only, { id }) : children}
      {error ? (
        <span className="field__error" role="alert"><AlertCircle />{error}</span>
      ) : hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

export function Input({ size, num, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: "sm" | "lg"; num?: boolean; ref?: Ref<HTMLInputElement> }) {
  return <input className={cx("input", size && `input--${size}`, num && "num", className)} {...rest} />;
}
export function Select({ size, className, children, ...rest }: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: "sm" }) {
  return <select className={cx("select", size && `select--${size}`, className)} {...rest}>{children}</select>;
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("textarea", className)} {...rest} />;
}

export function Segmented<T extends string>({ options, value, onChange, size, label }: {
  options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; size?: "sm"; label: string;
}) {
  return (
    <div className={cx("seg", size && "seg--sm")} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ pressed, onToggle, icon, children, add }: { pressed?: boolean; onToggle?: () => void; icon?: ReactNode; children: ReactNode; add?: boolean }) {
  return (
    <button type="button" className={cx("chip", add && "chip--add")} aria-pressed={add ? undefined : !!pressed} onClick={onToggle}>
      {icon}{children}
    </button>
  );
}

export function Switch({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/* ---------- Tabs ---------- */
export function Tabs<T extends string>({ items, value, onChange, label }: {
  items: { value: T; label: ReactNode; count?: number; icon?: ReactNode }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={t.value === value} onClick={() => onChange(t.value)}>
          {t.icon}{t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Badges ---------- */
export type Tone = "neutral" | "ok" | "warn" | "bad" | "work" | "ink" | "outline";
export function Badge({ tone = "neutral", dot, size, children }: { tone?: Tone; dot?: boolean; size?: "lg"; children: ReactNode }) {
  return (
    <span className={cx("badge", tone !== "neutral" && `badge--${tone}`, size && "badge--lg")}>
      {dot && <span className="dot" aria-hidden />}
      {children}
    </span>
  );
}
export type Grade = "original" | "copy" | "used";
export const GRADE_LABEL: Record<Grade, string> = { original: "أصلي", copy: "كوبي", used: "مستعمل" };
export function GradeBadge({ grade, size }: { grade: Grade; size?: "lg" }) {
  return <span className={cx("badge", "grade", `grade--${grade}`, size && "badge--lg")}>{GRADE_LABEL[grade]}</span>;
}

/* ---------- Panel ---------- */
export function Panel({ title, sub, icon, actions, children, footer, raised, flush, className, id }: {
  title?: ReactNode; sub?: ReactNode; icon?: ReactNode; actions?: ReactNode; children: ReactNode; footer?: ReactNode;
  raised?: boolean; flush?: boolean; className?: string; id?: string;
}) {
  return (
    <section className={cx("panel", raised && "panel--raised", className)} id={id}>
      {(title || actions) && (
        <header className="panel__head">
          <div>
            {title && <h2 className="panel__title">{icon}{title}</h2>}
            {sub && <p className="panel__sub">{sub}</p>}
          </div>
          {actions && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}</div>}
        </header>
      )}
      <div className={cx("panel__body", flush && "panel__body--flush")}>{children}</div>
      {footer && <footer className="panel__foot">{footer}</footer>}
    </section>
  );
}

/* ---------- Money, plate, avatar, kbd ---------- */
export function Money({ pt, cur = true, className, strong }: { pt: number; cur?: boolean; className?: string; strong?: boolean }) {
  const f = useFmt();
  return (
    <span className={cx("money", className)} style={strong ? { fontWeight: 700 } : undefined}>
      {f.pt(pt)}{cur && <span className="money__cur">ج.م</span>}
    </span>
  );
}

/** Egyptian private-car plate: letters on the right, digits on the left, blue مصر band. */
/** Egyptian plate. `bar`: top-bar color of the plate type (null = style not confirmed yet). `small`: motorcycle, two lines. */
export function Plate({ letters, digits, size, bar, ink, small, kind }: {
  letters: string; digits: string; size?: "lg"; bar?: string | null; ink?: string; small?: boolean; kind?: string;
}) {
  const f = useFmt();
  const style = { ...(bar ? { "--plate-band": bar } : {}), ...(ink ? { "--plate-band-ink": ink } : {}) } as CSSProperties;
  return (
    <span className={cx("plate", size && "plate--lg", small && "plate--small", !letters && "plate--digits", bar === null && "plate--unconfirmed")} style={style}
      role="img" aria-label={`لوحة ${kind ? kind + " " : ""}${letters} ${digits}`} title={kind}>
      <span className="plate__band" aria-hidden><span>مصر</span>{!small && <span className="lat">EGYPT</span>}</span>
      <span className="plate__body" aria-hidden>
        {letters && <span className="plate__letters">{letters}</span>}
        <span className="plate__digits" dir="ltr">{f.s(digits)}</span>
      </span>
    </span>
  );
}

export function Avatar({ name, size, dark }: { name: string; size?: "lg"; dark?: boolean }) {
  const initials = name.trim()[0];
  return <span className={cx("avatar", size && "avatar--lg", dark && "avatar--dark")} aria-hidden>{initials}</span>;
}

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="kbd">{children}</kbd>;

/* ---------- Dialog (native) ---------- */
export function Dialog({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={cx("dialog", wide && "dialog--wide")} aria-labelledby={titleId} onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <header className="dialog__head">
        <h2 className="dialog__title" id={titleId}>{title}</h2>
        <IconButton label="إغلاق" onClick={onClose}><X /></IconButton>
      </header>
      <div className="dialog__body">{children}</div>
      {footer && <footer className="dialog__foot">{footer}</footer>}
    </dialog>
  );
}

/* ---------- Toasts ---------- */
type ToastTone = "ok" | "bad" | "warn" | "info";
type ToastItem = { id: number; text: ReactNode; tone: ToastTone };
const ToastCtx = createContext<(text: ReactNode, tone?: ToastTone) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: ReactNode, tone: ToastTone = "ok") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3600);
  }, []);
  const icon = { ok: <CheckCircle2 />, bad: <AlertCircle />, warn: <TriangleAlert />, info: <Info /> };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={cx("toast", `toast--${t.tone}`)}>{icon[t.tone]}{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- Empty state ---------- */
export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <p className="empty__title">{title}</p>
      {body && <p className="empty__body">{body}</p>}
      {action}
    </div>
  );
}

/* ---------- Label / value grid ---------- */
export function DL({ items, cols = 3 }: { items: { label: ReactNode; value: ReactNode }[]; cols?: number }) {
  return (
    <dl className="dl" style={{ ["--dl-cols" as string]: cols }}>
      {items.map((it, i) => <div key={i}><dt>{it.label}</dt><dd>{it.value}</dd></div>)}
    </dl>
  );
}

/* ---------- Date + time (date as Latin run, time with ص / م kept Arabic) ---------- */
export function When({ iso, date = true, time = true }: { iso: string; date?: boolean; time?: boolean }) {
  const f = useFmt();
  return (
    <span className="when">
      {date && <span className="num">{f.date(iso)}</span>}
      {date && time && <span className="when__sep" aria-hidden> · </span>}
      {time && <span>{f.time(iso)}</span>}
    </span>
  );
}

/* ---------- Overflow menu ---------- */
export function Menu({ label, icon, items }: {
  label: string; icon: ReactNode; items: { label: ReactNode; icon?: ReactNode; onSelect: () => void; danger?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("mousedown", close); addEventListener("keydown", esc);
    return () => { removeEventListener("mousedown", close); removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button type="button" className="btn btn--secondary menu__btn" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{icon}</button>
      {open && (
        <div className="menu__list" role="menu">
          {items.map((it, i) => (
            <button key={i} type="button" role="menuitem" className={cx("menu__item", it.danger && "menu__item--danger")} onClick={() => { setOpen(false); it.onSelect(); }}>
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
