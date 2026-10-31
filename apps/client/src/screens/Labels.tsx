/**
 * QR label maker (صانع ملصقات QR): pick items by search or by scanning, choose copies, print to the label printer
 * through the Windows print dialog. One label per page at the size set in Settings (default 40×30 mm).
 * The QR holds the variant's barcode, or the item code when there is none; scanning it finds the item everywhere.
 */
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Printer, ScanLine, Search, Trash2 } from "lucide-react";
import { Button, GRADE_LABEL, IconButton, Input, Panel, Switch, useFmt } from "@jc/ui";
import { PageHead } from "../shell/Shell";
import { api } from "../data/api";
import { qs, useApi } from "../data/hooks";
import { go } from "../lib";
import type { Item, Variant } from "../data/types";

export type LabelSize = { w: number; h: number };
export type LabelRow = { variantId: string; code: string; qr: string; name: string; sub: string; pricePt: number; copies: number };
const KEY = "jc.labels";
export const useLabelSize = (): LabelSize => (useApi<Record<string, unknown>>("/settings").data?.["labels.size"] as LabelSize | undefined) ?? { w: 40, h: 30 };
export const savedLabels = (): { rows: LabelRow[]; price: boolean } => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? "") ?? { rows: [], price: true }; } catch { return { rows: [], price: true }; } };

const rowOf = (it: Item, v: Variant): LabelRow => ({
  variantId: v.id, code: it.code, qr: v.barcode ?? it.code, name: it.nameAr, sub: `${it.code}${v.grade ? ` · ${GRADE_LABEL[v.grade]}` : ""}`, pricePt: v.sellPricePt, copies: 1,
});

/** One label, drawn in millimetres so the preview and the print match. */
export function QrLabel({ r, size, price }: { r: Pick<LabelRow, "qr" | "name" | "sub" | "pricePt">; size: LabelSize; price: boolean }) {
  const f = useFmt();
  const [svg, setSvg] = useState("");
  useEffect(() => { QRCode.toString(r.qr || "JC", { type: "svg", margin: 0, errorCorrectionLevel: "M" }).then(setSvg); }, [r.qr]);
  return (
    <div className="qr-label" style={{ ["--lw" as string]: `${size.w}mm`, ["--lh" as string]: `${size.h}mm` }}>
      <div className="qr-label__qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="qr-label__text">
        <b>{r.name}</b>
        <span className="lat">{r.sub}</span>
        {price && <span className="lat qr-label__price">{f.pt(r.pricePt)} EGP</span>}
      </div>
    </div>
  );
}

/** Scan mode: keeps the focus so a keyboard-wedge scanner always lands here, unless the user is typing elsewhere. */
export function ScanInput({ onScan, placeholder }: { onScan: (code: string) => void; placeholder: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState("");
  useEffect(() => {
    const t = setInterval(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a !== ref.current && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT")) return;
      if (!document.querySelector("dialog[open]")) ref.current?.focus();
    }, 700);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="input-group scan-input"><ScanLine />
      <Input ref={ref} value={v} placeholder={placeholder} aria-label="وضع الماسح" onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) { onScan(v.trim()); setV(""); } }} />
    </div>
  );
}

export function LabelMaker() {
  const f = useFmt();
  const size = useLabelSize();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<LabelRow[]>(() => savedLabels().rows);
  const [price, setPrice] = useState(() => savedLabels().price);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const found = useApi<Item[]>(q.trim().length >= 2 ? `/items?${qs({ q: q.trim() })}` : null);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify({ rows: sel, price })); } catch { /* private mode */ } }, [sel, price]);
  const add = (r: LabelRow) => setSel((s) => (s.some((x) => x.variantId === r.variantId) ? s.map((x) => (x.variantId === r.variantId ? { ...x, copies: x.copies + 1 } : x)) : [...s, r]));
  const onScan = async (code: string) => {
    const items = await api<Item[]>(`/items?${qs({ q: code })}`).catch(() => []);
    const exact = items.flatMap((it) => it.variants.map((v) => ({ it, v }))).find(({ it, v }) => v.barcode === code || it.code.toUpperCase() === code.toUpperCase());
    const hit = exact ?? (items.length === 1 && items[0].variants.length === 1 ? { it: items[0], v: items[0].variants[0] } : null);
    if (hit) { add(rowOf(hit.it, hit.v)); setMsg(`أُضيف: ${hit.it.nameAr}`); } else setMsg(`لا يوجد صنف بالكود ${code}`);
  };
  const total = sel.reduce((a, r) => a + r.copies, 0);
  return (
    <div className="stack">
      <PageHead back={{ to: "/items", label: "المخزن والأصناف" }} title="صانع ملصقات QR" sub={`مقاس الملصق ${f.n(size.w)}×${f.n(size.h)} مم · يتغير من الإعدادات ← الأجهزة والطباعة`}
        actions={<Button variant="primary" icon={<Printer />} disabled={!total || busy} onClick={async () => {
          // Items without a barcode get one now, so every QR is plain ASCII that any scanner types back.
          setBusy(true);
          const codes = await api<{ id: string; barcode: string }[]>("/items/barcodes", { method: "POST", body: { variantIds: sel.map((r) => r.variantId) } }).catch(() => null);
          setBusy(false);
          if (!codes) { setMsg("تعذر تجهيز الباركود. تأكد من الاتصال ثم حاول مرة أخرى."); return; }
          const next = sel.map((r) => ({ ...r, qr: codes.find((c) => c.id === r.variantId)?.barcode ?? r.qr }));
          try { sessionStorage.setItem(KEY, JSON.stringify({ rows: next, price })); } catch { /* private mode */ }
          setSel(next);
          go("/print/labels");
        }}>طباعة {f.n(total)} ملصق</Button>} />
      <div className="grid-main-side">
        <div className="stack">
          <Panel title="اختيار الأصناف" sub="ابحث أو امسح ملصقًا موجودًا بالماسح لإضافته.">
            <div className="stack" style={{ gap: 10 }}>
              <ScanInput onScan={onScan} placeholder="وضع الماسح: امسح الباركود هنا" />
              {msg && <p className="hint-line">{msg}</p>}
              <div className="input-group"><Search /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="أو اكتب اسم الصنف أو كوده" aria-label="بحث عن صنف" /></div>
              {(found.data ?? []).slice(0, 12).flatMap((it) => it.variants.map((v) => (
                <button key={v.id} type="button" className="pop__item" style={{ border: "1px solid var(--line)" }} onClick={() => add(rowOf(it, v))}>
                  <span style={{ flex: 1, textAlign: "start" }}><b>{it.nameAr}</b> <span className="lat muted">{it.code}{v.grade ? ` · ${GRADE_LABEL[v.grade]}` : ""}</span></span>
                  <span className="num">{f.pt(v.sellPricePt)}</span>
                </button>
              )))}
            </div>
          </Panel>
          <Panel title={`الملصقات المختارة (${f.n(total)})`} flush>
            <table className="table table--compact">
              <thead><tr><th>الصنف</th><th>محتوى QR</th><th className="num">عدد النسخ</th><th><span className="sr-only">حذف</span></th></tr></thead>
              <tbody>
                {sel.map((r) => (
                  <tr key={r.variantId}>
                    <td><span className="cell-main">{r.name}</span><span className="cell-sub lat">{r.sub}</span></td>
                    <td className="lat">{r.qr}</td>
                    <td className="num"><Input num size="sm" style={{ width: 72 }} value={String(r.copies)} aria-label="عدد النسخ"
                      onChange={(e) => setSel(sel.map((x) => (x.variantId === r.variantId ? { ...x, copies: Math.min(500, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)) } : x)))} /></td>
                    <td><IconButton size="sm" label="حذف" onClick={() => setSel(sel.filter((x) => x.variantId !== r.variantId))}><Trash2 /></IconButton></td>
                  </tr>
                ))}
                {!sel.length && <tr><td colSpan={4} className="subtle">لم تختر أصنافًا بعد.</td></tr>}
              </tbody>
            </table>
          </Panel>
        </div>
        <Panel title="معاينة" sub="بالمقاس الحقيقي تقريبًا">
          <div className="stack" style={{ gap: 12, alignItems: "center" }}>
            <QrLabel r={sel[0] ?? { qr: "JC000201", name: "فلتر زيت · مثال", sub: "JC000201 · أصلي", pricePt: 85000 }} size={size} price={price} />
            <Switch checked={price} onChange={setPrice}>طباعة السعر على الملصق</Switch>
            {sel.length > 0 && <Button onClick={() => setSel([])}>مسح الاختيار</Button>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
