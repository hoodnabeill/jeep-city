import { useRef, useState } from "react";
import { CheckCheck, ClipboardCheck, Plus, ScanLine, Search, Trash2, XCircle } from "lucide-react";
import { Badge, Button, Dialog, EmptyState, Field, GRADE_LABEL, IconButton, Input, Money, Panel, useFmt, When } from "@jc/ui";
import { toMilli } from "@jc/core";
import { PageHead, PageState } from "../shell/Shell";
import { go, Link, useCan } from "../lib";
import { api } from "../data/api";
import { qs, useAction, useApi } from "../data/hooks";
import type { Grade, Item } from "../data/types";
import { SearchTools } from "./SearchTools";

type CountRow = { id: string; status: "open" | "approved" | "cancelled"; note: string | null; createdAt: string; approvedAt: string | null; by: string | null; lines: number };
type Line = { variantId: string; itemId: string; code: string; name: string; unit: string; location: string | null; grade: Grade | null; systemQtyMilli: number; countedQtyMilli: number; diffMilli: number; diffValuePt?: number };
type Count = Omit<CountRow, "by" | "lines"> & { lines: Line[] };

const STATUS: Record<CountRow["status"], { label: string; tone: "work" | "ok" | "neutral" }> = {
  open: { label: "مفتوح", tone: "work" }, approved: { label: "اتعتمد", tone: "ok" }, cancelled: { label: "اتلغى", tone: "neutral" },
};

export function StockCounts() {
  const f = useFmt();
  const run = useAction();
  const list = useApi<CountRow[]>("/stock-counts");
  const [note, setNote] = useState<string | null>(null);
  return (
    <div>
      <PageHead title="الجرد" sub="اعمل جرد لرف أو مجموعة أصناف: امسح الملصقات أو اكتب العدد، والإدارة تعتمد الفروق."
        actions={<Button variant="primary" icon={<Plus />} onClick={() => setNote("")}>جرد جديد</Button>} />
      <PageState loading={list.loading && !list.data} error={list.error} onRetry={list.reload} />
      {list.data && !list.data.length && <EmptyState icon={<ClipboardCheck />} title="مفيش جرد لسه" body="ابدأ بجرد رف واحد: «جرد جديد» واكتب اسم الرف." />}
      {!!list.data?.length && (
        <div className="panel"><div className="table-wrap"><table className="table">
          <thead><tr><th>الجرد</th><th>الحالة</th><th className="num">أصناف معدودة</th><th>بدأه</th><th>التاريخ</th></tr></thead>
          <tbody>{list.data.map((c) => (
            <tr key={c.id} className="is-clickable" tabIndex={0} onClick={() => go(`/stock-counts/${c.id}`)} onKeyDown={(e) => e.key === "Enter" && go(`/stock-counts/${c.id}`)}>
              <td className="cell-main">{c.note}</td>
              <td><Badge tone={STATUS[c.status].tone} dot>{STATUS[c.status].label}</Badge></td>
              <td className="num">{f.n(c.lines)}</td>
              <td>{c.by ?? "—"}</td>
              <td><When iso={c.createdAt} /></td>
            </tr>
          ))}</tbody>
        </table></div></div>
      )}
      <Dialog open={note !== null} onClose={() => setNote(null)} title="جرد جديد"
        footer={<><Button onClick={() => setNote(null)}>رجوع</Button><Button variant="primary" disabled={!note?.trim()} onClick={async () => {
          const r = await run(() => api<{ id: string }>("/stock-counts", { method: "POST", body: { note } }));
          if (r) { setNote(null); go(`/stock-counts/${r.id}`); }
        }}>ابدأ الجرد</Button></>}>
        <Field label="اسم الجرد" hint="مثال: رف A، أو زيوت، أو جرد آخر الشهر"><Input value={note ?? ""} onChange={(e) => setNote(e.target.value)} autoFocus /></Field>
      </Dialog>
    </div>
  );
}

export function StockCountDetail({ id }: { id: string }) {
  const f = useFmt();
  const run = useAction();
  const canApprove = useCan("stockCount.approve");
  const seeCost = useCan("cost.view");
  const c = useApi<Count>(`/stock-counts/${id}`);
  const [scan, setScan] = useState("");
  const [last, setLast] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<"approve" | "cancel" | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const found = useApi<Item[]>(q.trim().length >= 2 ? `/items?${qs({ q: q.trim() })}` : null);
  const d = c.data;
  if (!d) return <PageState loading={c.loading} error={c.error} onRetry={c.reload} />;
  const open = d.status === "open";
  const setQty = (variantId: string, v: string) => {
    const counted = toMilli(v);
    if (!Number.isFinite(counted) || counted < 0) return;
    void run(() => api(`/stock-counts/${id}/lines`, { method: "PUT", body: { variantId, countedQtyMilli: counted } }));
  };
  const diffs = d.lines.filter((l) => l.diffMilli !== 0);
  const diffValue = d.lines.reduce((a, l) => a + (l.diffValuePt ?? 0), 0);

  return (
    <div className="stack">
      <PageHead back={{ to: "/stock-counts", label: "الجرد" }} title={<>جرد: {d.note}</>}
        sub={<><Badge tone={STATUS[d.status].tone} dot>{STATUS[d.status].label}</Badge> · بدأ <When iso={d.createdAt} /></>}
        actions={open && canApprove ? <>
          <Button icon={<XCircle />} onClick={() => setConfirm("cancel")}>إلغاء الجرد</Button>
          <Button variant="primary" icon={<CheckCheck />} disabled={!d.lines.length} onClick={() => setConfirm("approve")}>اعتماد الفروق</Button>
        </> : undefined} />

      {open && (
        <div className="grid-2">
          <Panel title="امسح الملصقات" icon={<ScanLine />} sub="كل مسحة بتزوّد قطعة واحدة. خلي المؤشر هنا وامسح.">
            <form className="stack" style={{ gap: 8 }} onSubmit={async (e) => {
              e.preventDefault();
              const code = scan.trim();
              setScan("");
              if (!code) return;
              const r = await run(() => api<{ variantId: string; countedQtyMilli: number }>(`/stock-counts/${id}/scan`, { method: "POST", body: { code } }));
              if (r) setLast(r.variantId);
              scanRef.current?.focus();
            }}>
              <div className="input-group">
                <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder="امسح الباركود أو اكتب كود الصنف واضغط Enter" aria-label="مسح الباركود" className="lat" autoFocus />
                <span className="input-group__end"><SearchTools voice={false} onText={async (code) => {
                  const r = await run(() => api<{ variantId: string }>(`/stock-counts/${id}/scan`, { method: "POST", body: { code } }));
                  if (r) setLast(r.variantId);
                }} /></span>
              </div>
            </form>
          </Panel>
          <Panel title="أو دوّر واكتب العدد" icon={<Search />}>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم الصنف أو الكود" aria-label="بحث عن صنف للجرد" />
            {!!found.data?.length && (
              <table className="table table--compact" style={{ marginTop: 8 }}><tbody>
                {found.data.filter((i) => i.trackStock).slice(0, 8).flatMap((i) => i.variants.map((v) => (
                  <tr key={v.id}>
                    <td className="cell-main">{i.nameAr} {v.grade && <span className="muted">· {GRADE_LABEL[v.grade]}</span>}</td>
                    <td className="lat muted">{i.location ?? ""}</td>
                    <td style={{ width: 110 }}><Input size="sm" num placeholder="العدد" aria-label={`عدد ${i.nameAr}`} onKeyDown={(e) => { if (e.key === "Enter") { setQty(v.id, e.currentTarget.value); e.currentTarget.value = ""; } }} /></td>
                  </tr>
                )))}
              </tbody></table>
            )}
          </Panel>
        </div>
      )}

      <Panel title={`الأصناف المعدودة (${f.n(d.lines.length)})`} sub={<>فيها فرق: {f.n(diffs.length)}{seeCost && <> · قيمة الفرق: <Money pt={diffValue} /></>}</>} flush>
        {!d.lines.length ? <p className="hint-line" style={{ padding: 16 }}>لسه مفيش أصناف معدودة. امسح أول ملصق.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>المكان</th><th>الصنف</th><th className="num">في السيستم</th><th className="num">المعدود</th><th className="num">الفرق</th>{seeCost && <th className="num">قيمة الفرق</th>}{open && <th />}</tr></thead>
            <tbody>{d.lines.map((l) => (
              <tr key={l.variantId} className={l.variantId === last ? "is-selected" : undefined}>
                <td className="lat muted">{l.location ?? "—"}</td>
                <td><Link to={`/items/${l.itemId}`} className="cell-main">{l.name}</Link><span className="cell-sub"><span className="lat">{l.code}</span>{l.grade && <> · {GRADE_LABEL[l.grade]}</>}</span></td>
                <td className="num">{f.n(l.systemQtyMilli / 1000)}</td>
                <td className="num">{open
                  ? <Input key={l.countedQtyMilli} size="sm" num defaultValue={String(l.countedQtyMilli / 1000)} aria-label={`المعدود من ${l.name}`} style={{ width: 90 }} onBlur={(e) => { if (toMilli(e.target.value) !== l.countedQtyMilli) setQty(l.variantId, e.target.value); }} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
                  : f.n(l.countedQtyMilli / 1000)}</td>
                <td className="num" style={{ fontWeight: 700, color: l.diffMilli < 0 ? "var(--bad)" : l.diffMilli > 0 ? "var(--ok)" : undefined }}>{l.diffMilli > 0 ? "+" : l.diffMilli < 0 ? "−" : ""}{f.n(Math.abs(l.diffMilli) / 1000)}</td>
                {seeCost && <td className="num"><Money pt={l.diffValuePt ?? 0} /></td>}
                {open && <td><IconButton label={`شيل ${l.name} من الجرد`} onClick={() => run(() => api(`/stock-counts/${id}/lines/${l.variantId}`, { method: "DELETE" }))}><Trash2 /></IconButton></td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm === "approve" ? "اعتماد فروق الجرد" : "إلغاء الجرد"}
        footer={<><Button onClick={() => setConfirm(null)}>رجوع</Button><Button variant={confirm === "approve" ? "primary" : "danger"} onClick={async () => {
          const r = await run(() => api(`/stock-counts/${id}/${confirm}`, { method: "POST" }), confirm === "approve" ? "تم اعتماد الجرد وتعديل الأرصدة." : "تم إلغاء الجرد.");
          if (r) setConfirm(null);
        }}>{confirm === "approve" ? "اعتماد" : "إلغاء الجرد"}</Button></>}>
        {confirm === "approve"
          ? <p>هيتعدل رصيد {f.n(diffs.length)} صنف علشان يبقى زي المعدود{seeCost && <>، وقيمة الفرق <Money pt={diffValue} /></>}. الاعتماد مايترجعش، وكل تعديل بيتسجل كحركة «جرد» في كارت الصنف.</p>
          : <p>الجرد هيتقفل من غير ما يغيّر أي رصيد.</p>}
      </Dialog>
    </div>
  );
}
