import { useState } from "react";
import { FileSpreadsheet, Printer, Table2, BarChart3 } from "lucide-react";
import { Button, Input, Money, Panel, Segmented, Select, useFmt } from "@jc/ui";
import { PageHead, PageState } from "../shell/Shell";
import { useApi } from "../data/hooks";
import { go, queryParam } from "../lib";

export type ReportCol = { key: string; label: string; type: "text" | "date" | "int" | "money" | "qty" };
export type ReportData = { title: string; columns: ReportCol[]; rows: Record<string, unknown>[]; totals?: Record<string, number>; summary?: Record<string, number>; note?: string };

// Categorical slots validated with the dataviz palette checker (light surface): labor, parts, oils.
const SERIES = [
  { key: "labor", label: "المصنعيات", color: "#2a78d6" },
  { key: "parts", label: "قطع الغيار والخامات", color: "#1baf7a" },
  { key: "oils", label: "الزيوت", color: "#eda100" },
] as const;
const DOW = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const cairoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const shift = (iso: string, days: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
/** The day after the same date n months ago, so "3 months" ends today and covers exactly 3 months. */
function monthsBack(t: string, n: number) {
  const d = new Date(`${t}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function presetRange(p: string): [string, string] {
  const t = cairoToday();
  if (p === "day") return [t, t];
  if (p === "week") return [shift(t, -6), t];
  if (p === "3m" || p === "6m" || p === "12m") return [monthsBack(t, Number(p.slice(0, -1))), t];
  if (p === "year") return [`${t.slice(0, 4)}-01-01`, t];
  return [`${t.slice(0, 7)}-01`, t];
}

/** One cell, formatted by its column type. */
export function useCell() {
  const f = useFmt();
  return (c: ReportCol, v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    if (c.type === "money") return f.pt(Number(v));
    if (c.type === "qty") return f.n(Number(v) / 1000);
    if (c.type === "int") return f.n(Number(v));
    if (c.type === "date") return f.date(String(v));
    return String(v);
  };
}

export function ReportTable({ r, sticky }: { r: ReportData; sticky?: boolean }) {
  const cell = useCell();
  const num = (c: ReportCol) => c.type !== "text" && c.type !== "date";
  return (
    <table className={`table table--compact${sticky ? " table--sticky" : ""}`}>
      <thead><tr>{r.columns.map((c) => <th key={c.key} className={num(c) ? "num" : undefined}>{c.label}</th>)}</tr></thead>
      <tbody>
        {r.rows.map((row, i) => <tr key={i}>{r.columns.map((c, k) => <td key={c.key} className={num(c) ? "num" : k === 0 ? "cell-main" : undefined}>{cell(c, row[c.key])}</td>)}</tr>)}
        {!r.rows.length && <tr><td colSpan={r.columns.length} className="subtle">لا توجد بيانات في هذه الفترة.</td></tr>}
      </tbody>
      {r.totals && r.rows.length > 0 && (
        <tfoot><tr>{r.columns.map((c, k) => <td key={c.key} className={num(c) ? "num" : undefined} style={{ fontWeight: 700 }}>{k === 0 ? "الإجمالي" : c.key in r.totals! ? cell(c, r.totals![c.key]) : ""}</td>)}</tr></tfoot>
      )}
    </table>
  );
}

/** Excel opens UTF-8 CSV with a BOM correctly, Arabic included. */
function downloadCsv(r: ReportData, from: string, to: string) {
  const val = (c: ReportCol, v: unknown) => v === null || v === undefined ? "" : c.type === "money" ? (Number(v) / 100).toFixed(2) : c.type === "qty" ? String(Number(v) / 1000) : String(v);
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
  const lines = [r.columns.map((c) => q(c.label)).join(","), ...r.rows.map((row) => r.columns.map((c) => q(val(c, row[c.key]))).join(","))];
  if (r.totals) lines.push(r.columns.map((c, k) => (k === 0 ? "الإجمالي" : c.key in r.totals! ? val(c, r.totals![c.key]) : "")).join(","));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  a.download = `${r.title} ${from} - ${to}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function Reports() {
  const f = useFmt();
  const list = useApi<{ id: string; title: string; ranged: boolean }[]>("/reports");
  const [id, setId] = useState(queryParam("r") ?? "sales");
  const [preset, setPreset] = useState("month");
  const [[from, to], setRange] = useState(presetRange("month"));
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hover, setHover] = useState<number | null>(null);
  const meta = list.data?.find((x) => x.id === id);
  const q = useApi<ReportData>(`/reports/${id}?from=${from}&to=${to}`);
  const r = q.data;
  const pick = (p: string) => { setPreset(p); if (p !== "custom") setRange(presetRange(p)); };
  return (
    <div className="stack">
      <PageHead title={`التقرير العام · ${r?.title ?? meta?.title ?? ""}`} sub={meta?.ranged === false ? "الوضع الحالي" : <>من <span className="num">{f.date(from)}</span> إلى <span className="num">{f.date(to)}</span></>}
        actions={<>
          <Button icon={<FileSpreadsheet />} disabled={!r} onClick={() => r && downloadCsv(r, from, to)}>Excel</Button>
          <Button variant="primary" icon={<Printer />} disabled={!r} onClick={() => go(`/print/report/${id}?from=${from}&to=${to}`)}>طباعة / PDF</Button>
        </>} />
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <Select aria-label="التقرير" style={{ width: 260 }} value={id} onChange={(e) => setId(e.target.value)}>
          {(list.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </Select>
        {meta?.ranged !== false && <>
          <Segmented label="الفترة" value={preset} onChange={pick} options={[{ value: "day", label: "اليوم" }, { value: "week", label: "7 أيام" }, { value: "month", label: "الشهر" }, { value: "3m", label: "3 شهور" }, { value: "6m", label: "6 شهور" }, { value: "12m", label: "12 شهر" }, { value: "year", label: "السنة" }, { value: "custom", label: "فترة مخصصة" }]} />
          {preset === "custom" && <>
            <Input type="date" aria-label="من" value={from} max={to} onChange={(e) => e.target.value && setRange([e.target.value, to])} style={{ width: 160 }} />
            <Input type="date" aria-label="إلى" value={to} min={from} onChange={(e) => e.target.value && setRange([from, e.target.value])} style={{ width: 160 }} />
          </>}
        </>}
      </div>
      <PageState loading={q.loading && !r} error={q.error} onRetry={q.reload} />
      {r && id === "sales" && <SalesView r={r} view={view} setView={setView} hover={hover} setHover={setHover} />}
      {r && id !== "sales" && <Panel title={r.title} flush><div className="table-wrap" style={{ maxHeight: 560, overflow: "auto" }}><ReportTable r={r} sticky /></div></Panel>}
      {r?.note && <p className="hint-line">{r.note}</p>}
    </div>
  );
}

function SalesView({ r, view, setView, hover, setHover }: { r: ReportData; view: "chart" | "table"; setView: (v: "chart" | "table") => void; hover: number | null; setHover: (i: number | null) => void }) {
  const f = useFmt();
  const days = r.rows.map((d) => ({ date: String(d.date), count: Number(d.count), labor: Number(d.labor), parts: Number(d.parts) + Number(d.materials), oils: Number(d.oils), total: Number(d.total) }));
  const t = r.totals ?? {}, s = r.summary ?? {};
  const gross = (t.labor ?? 0) + (t.parts ?? 0) + (t.materials ?? 0) + (t.oils ?? 0);
  const share = (v: number) => (gross ? Math.round((v / gross) * 100) : 0);
  const max = Math.max(1, ...days.map((d) => d.labor + d.parts + d.oils));
  const step = 10 ** Math.max(0, String(Math.round(max / 100)).length - 1) * 100;
  const top = Math.ceil(max / step) * step;
  const ticks = [0, top / 2, top];
  return (
    <>
      <div className="strip">
        <div className="strip__cell"><span className="strip__label">إجمالي المبيعات</span><span className="strip__value"><Money pt={t.total ?? 0} /></span><span className="strip__note">{f.n(t.count ?? 0)} بيان · خصم <Money pt={t.discount ?? 0} cur={false} /></span></div>
        {[{ ...SERIES[0], v: t.labor ?? 0 }, { ...SERIES[1], v: (t.parts ?? 0) + (t.materials ?? 0) }, { ...SERIES[2], v: t.oils ?? 0 }].map((x) => (
          <div className="strip__cell" key={x.key}>
            <span className="strip__label" style={{ display: "flex", alignItems: "center", gap: 8 }}><i style={{ width: 10, height: 10, background: x.color, display: "inline-block" }} />{x.label}</span>
            <span className="strip__value"><Money pt={x.v} /></span>
            <span className="strip__note">{f.n(share(x.v))}% من المبيعات</span>
          </div>
        ))}
        <div className="strip__cell"><span className="strip__label">صافي الربح</span><span className="strip__value"><Money pt={s.profitPt ?? 0} /></span>
          <span className="strip__note">تكلفة القطع <Money pt={s.cogsPt ?? 0} cur={false} /> · مصروفات <Money pt={s.expensesPt ?? 0} cur={false} /></span></div>
      </div>
      <Panel title="المبيعات اليومية" actions={
        <Segmented size="sm" label="طريقة العرض" value={view} onChange={setView} options={[{ value: "chart", label: <><BarChart3 size={15} />رسم</> }, { value: "table", label: <><Table2 size={15} />جدول</> }]} />}>
        {view === "chart" && days.length > 0 ? (
          <div className="stack" style={{ gap: 12 }}>
            <div className="key" aria-hidden>{SERIES.map((x) => <span key={x.key}><i style={{ background: x.color }} />{x.label}</span>)}</div>
            <div style={{ position: "relative", paddingInlineEnd: 56 }}>
              {ticks.map((tk) => (
                <div key={tk} aria-hidden style={{ position: "absolute", insetInline: 0, bottom: `${(tk / top) * 220}px`, borderTop: `1px ${tk ? "dashed" : "solid"} var(--line)`, pointerEvents: "none" }}>
                  <span className="num" style={{ position: "absolute", left: 0, top: -9, fontSize: 11, color: "var(--text-muted)", background: "var(--surface)", paddingInline: 4 }}>{f.n(tk / 100000)}k</span>
                </div>
              ))}
              <div className="bars" role="img" aria-label="المبيعات اليومية مقسمة إلى مصنعيات وقطع غيار وزيوت. التفاصيل في عرض الجدول." style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                {days.map((d, i) => {
                  const sum = d.labor + d.parts + d.oils || 1;
                  return (
                    <div key={d.date} className="bars__col" style={{ height: `${(sum / top) * 100}%`, alignSelf: "end", gap: 2 }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                      {SERIES.map((x) => <span key={x.key} style={{ height: `${(d[x.key] / sum) * 100}%`, background: x.color }} />)}
                      {hover === i && (
                        <div className="bar-tip">
                          <b>{DOW[new Date(`${d.date}T12:00:00Z`).getUTCDay()]} {f.date(d.date)}</b><br />
                          {SERIES.map((x) => <span key={x.key} style={{ display: "flex", gap: 12, justifyContent: "space-between" }}><span><i style={{ width: 8, height: 8, background: x.color, display: "inline-block", marginInlineEnd: 6 }} />{x.label}</span><span className="num">{f.pt(d[x.key])}</span></span>)}
                          <span style={{ display: "flex", gap: 12, justifyContent: "space-between", borderTop: "1px solid #444", marginTop: 4, paddingTop: 4 }}><span>الإجمالي ({f.n(d.count)} بيان)</span><b className="num">{f.pt(d.total)}</b></span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="bars__x" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                {days.map((d, i) => <span key={d.date}>{i % Math.max(1, Math.ceil(days.length / 8)) === 0 || i === days.length - 1 ? f.date(d.date).slice(5) : ""}</span>)}
              </div>
            </div>
            <p className="hint-line">مرّر الماوس على أي يوم لتفاصيله.</p>
          </div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 420, overflow: "auto" }}><ReportTable r={r} sticky /></div>
        )}
      </Panel>
    </>
  );
}
