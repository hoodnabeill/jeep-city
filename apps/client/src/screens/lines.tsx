import { useEffect, useRef, useState } from "react";
import { ScanLine, Search, Trash2 } from "lucide-react";
import { Badge, GradeBadge, IconButton, Kbd, Money, Select, useFmt } from "@jc/ui";
import { computeTotals, toMilli, type Category, type Discount } from "@jc/core";
import { api } from "../data/api";
import { qs } from "../data/hooks";
import type { CatalogHit, Line, Technician } from "../data/types";

/** Totals with the real formulas (packages/core/src/totals.ts). */
export type Vat = { enabled: boolean; rateBp: Partial<Record<Category, number>> };
export const NO_VAT: Vat = { enabled: false, rateBp: {} };
export const totalsOf = (lines: Pick<Line, "category" | "qtyMilli" | "unitPricePt">[], discounts: Partial<Record<Category, Discount>> = {}, vat: Vat = NO_VAT) =>
  computeTotals({ lines, discounts, vatBp: vat.enabled ? vat.rateBp : undefined });

export function LinesTable({ kind, lines, editable, technicians = [], onAdd, onChange, onRemove, issueMode }: {
  kind: "labor" | "parts"; lines: Line[]; editable: boolean; technicians?: Technician[]; issueMode?: boolean;
  onAdd?: (hit: CatalogHit, qtyMilli: number) => Promise<unknown>;
  onChange?: (line: Line, patch: { qtyMilli?: number; technicianId?: string | null; finishedAt?: string | null }) => void;
  onRemove?: (line: Line) => void;
}) {
  const f = useFmt();
  const rows = lines.filter((l) => (kind === "labor" ? l.category === "labor" : l.category !== "labor"));
  const sum = rows.reduce((a, l) => a + Math.round((l.qtyMilli * l.unitPricePt) / 1000), 0);
  return (
    <div className="table-wrap">
      <table className="table lines">
        <thead>
          <tr>
            <th>اسم الصنف <span className="subtle" style={{ fontWeight: 500 }}>· الكود</span></th>
            {kind === "parts" && <th>الجودة</th>}
            <th className="num" style={{ width: 96 }}>{kind === "labor" ? "الوقت / الكمية" : "الكمية"}</th>
            <th className="num" style={{ width: 104 }}>السعر</th>
            <th className="num" style={{ width: 104 }}>القيمة</th>
            <th style={{ width: 150 }}>اسم الفني</th>
            {kind === "labor" && <th style={{ width: 110 }}>انتهاء العمل</th>}
            {editable && <th style={{ width: 48 }}><span className="sr-only">حذف</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td><span className="cell-main">{l.name}</span><span className="cell-sub"><span className="lat">{l.code}</span>{l.category === "oil" ? " · زيت يباع باللتر" : ""}</span></td>
              {kind === "parts" && <td>{l.grade ? <GradeBadge grade={l.grade} /> : <span className="subtle">—</span>}</td>}
              <td className="num">
                {editable && onChange ? (
                  <QtyInput key={l.qtyMilli} line={l} onCommit={(q) => onChange(l, { qtyMilli: q })} />
                ) : <>{f.n(l.qtyMilli / 1000)} <span className="muted" style={{ fontFamily: "var(--font-ar)", fontSize: 12 }}>{l.unit}</span></>}
              </td>
              <td className="num"><Money pt={l.unitPricePt} cur={false} /></td>
              <td className="num" style={{ fontWeight: 700 }}><Money pt={Math.round((l.qtyMilli * l.unitPricePt) / 1000)} cur={false} /></td>
              <td>
                {editable && onChange ? (
                  <Select size="sm" className="tech-select" value={l.technicianId ?? ""} aria-label="الفني" onChange={(e) => onChange(l, { technicianId: e.target.value || null })}>
                    <option value="">—</option>
                    {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                ) : l.technician ?? technicians.find((t) => t.id === l.technicianId)?.name ?? <span className="subtle">—</span>}
              </td>
              {kind === "labor" && (
                <td className="num" style={{ fontSize: 14 }}>
                  {l.finishedAt ? f.time(l.finishedAt) : editable && onChange
                    ? <button type="button" className="badge badge--work" style={{ border: 0, cursor: "pointer" }} title="سجّل انتهاء العمل الآن" onClick={() => onChange(l, { finishedAt: new Date().toISOString() })}>جاري · انتهى؟</button>
                    : <Badge tone="work">جاري</Badge>}
                </td>
              )}
              {editable && <td>{onRemove && <IconButton size="sm" label={`حذف ${l.name}`} className="row-del" onClick={() => onRemove(l)}><Trash2 /></IconButton>}</td>}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={9} style={{ height: 72, textAlign: "center", color: "var(--text-muted)" }}>
              {kind === "labor" ? "لا توجد مصنعيات بعد. اختر من المصنعيات السريعة أو اكتب اسم العملية بالأسفل." : "لم تُصرف قطع بعد. امسح باركود القطعة أو اكتب اسمها بالأسفل."}
            </td></tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot><tr>
            <td colSpan={kind === "parts" ? 4 : 3}>{kind === "labor" ? "إجمالي المصنعيات" : "إجمالي قطع الغيار والزيوت والخامات"}</td>
            <td className="num"><Money pt={sum} cur={false} /></td>
            <td colSpan={editable ? 3 : 2} />
          </tr></tfoot>
        )}
      </table>
      {editable && onAdd && <ItemPicker kind={kind} issueMode={issueMode} onPick={onAdd} />}
    </div>
  );
}

function QtyInput({ line, onCommit }: { line: Line; onCommit: (qtyMilli: number) => void }) {
  const [v, setV] = useState(String(line.qtyMilli / 1000));
  const commit = () => {
    const q = toMilli(v);
    if (!Number.isFinite(q) || q <= 0) { setV(String(line.qtyMilli / 1000)); return; }
    if (q !== line.qtyMilli) onCommit(q);
  };
  return (
    <input className="input input--sm num qty-input" inputMode="decimal" value={v} aria-label={`كمية ${line.name}`}
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
  );
}

/** Catalog search from the server; Enter adds the highlighted item (scanner-friendly). */
function ItemPicker({ kind, onPick, issueMode }: { kind: "labor" | "parts"; onPick: (hit: CatalogHit, qtyMilli: number) => Promise<unknown>; issueMode?: boolean }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [opts, setOpts] = useState<CatalogHit[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const f = useFmt();
  useEffect(() => {
    if (!q.trim()) { setOpts([]); return; }
    let alive = true;
    const t = setTimeout(() => api<CatalogHit[]>(`/catalog?${qs({ q: q.trim(), kind })}`).then((r) => { if (alive) { setOpts(r); setSel(0); } }).catch(() => {}), 150);
    return () => { alive = false; clearTimeout(t); };
  }, [q, kind]);

  const add = async (o?: CatalogHit) => {
    if (!o || busy) return;
    setBusy(true);
    await onPick(o, 1000);
    setBusy(false);
    setQ(""); setOpts([]);
    ref.current?.focus();
  };

  return (
    <div className="add-line">
      <div className="grow">
        <div className="input-group">
          {kind === "parts" ? <ScanLine /> : <Search />}
          <input ref={ref} className="input" value={q} disabled={busy}
            placeholder={kind === "labor" ? "أضف مصنعية: اكتب اسم العملية أو كودها ثم Enter" : issueMode ? "إذن صرف: امسح باركود القطعة أو اكتب اسمها ثم Enter" : "أضف صنفًا: اسم، كود أو باركود ثم Enter"}
            aria-label={kind === "labor" ? "إضافة مصنعية" : "إضافة قطعة"}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, opts.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter") { e.preventDefault(); add(opts[sel]); }
              if (e.key === "Escape") setQ("");
            }} />
          <span className="input-group__end"><Kbd>Enter</Kbd></span>
        </div>
        {opts.length > 0 && (
          <div className="picker" role="listbox">
            {opts.map((o, i) => {
              const out = o.trackStock && o.qtyMilli <= 0;
              const low = !out && o.trackStock && o.minQtyMilli > 0 && o.qtyMilli <= o.minQtyMilli;
              return (
                <button key={o.variantId} type="button" role="option" aria-selected={i === sel} className="picker__row" onMouseEnter={() => setSel(i)} onClick={() => add(o)}>
                  <span>
                    <span className="picker__name">{o.name}</span>{" "}
                    <span className="picker__meta lat">{o.code}</span>
                    {o.location && <span className="picker__meta"> · مكان التخزين <span className="lat">{o.location}</span></span>}
                  </span>
                  <span>{o.grade && <GradeBadge grade={o.grade} />}</span>
                  {o.type === "labor" || !o.trackStock ? <span /> : (
                    <span className={`picker__stock${out ? " out" : low ? " low" : ""}`}>{out ? "نفد" : `${f.n(o.qtyMilli / 1000)} ${o.unit}`}</span>
                  )}
                  <span className="num" style={{ fontWeight: 700, minWidth: 80, textAlign: "left" }}><Money pt={o.sellPricePt} cur={false} /></span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
