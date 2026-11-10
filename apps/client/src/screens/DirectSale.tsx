import { useEffect, useState } from "react";
import { Plus, Save, Search, Trash2 } from "lucide-react";
import { Button, Field, GradeBadge, IconButton, Input, Money, Panel, Select, useFmt } from "@jc/ui";
import { amountInWords, uuidv7, toMilli } from "@jc/core";
import { PageHead } from "../shell/Shell";
import { go } from "../lib";
import { api } from "../data/api";
import { qs, useAction, useApi, useSetting } from "../data/hooks";
import type { CatalogHit, Customer, PaymentMethod } from "../data/types";
import { NO_VAT, totalsOf, type Vat } from "./lines";
import { SearchTools } from "./SearchTools";

/** بيع مباشر: parts or oil sold over the counter, no car or work order. */
export function DirectSale() {
  const f = useFmt();
  const run = useAction();
  const methods = useApi<PaymentMethod[]>("/payment-methods");
  const vat = useSetting<Vat>("vat", NO_VAT);
  const [cq, setCq] = useState("");
  const customers = useApi<Customer[]>(cq.trim().length >= 2 ? `/customers?${qs({ q: cq.trim() })}` : null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lines, setLines] = useState<{ hit: CatalogHit; qty: string }[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const [methodId, setMethodId] = useState("cash");
  const [reference, setReference] = useState("");
  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(() => api<CatalogHit[]>(`/catalog?${qs({ q: q.trim(), kind: "parts" })}`).then(setHits).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [q]);
  const t = totalsOf(lines.map((l) => ({ category: l.hit.type, qtyMilli: toMilli(l.qty) || 0, unitPricePt: l.hit.sellPricePt })), {}, vat);
  const m = methods.data?.find((x) => x.id === methodId);
  const save = async () => {
    const r = await run(() => api<{ id: string; number: number }>("/direct-sales", { method: "POST", body: {
      id: uuidv7(), customerId: customer!.id, lines: lines.map((l) => ({ variantId: l.hit.variantId, qtyMilli: toMilli(l.qty) })),
      payments: t.amountDuePt ? [{ methodId, amountPt: t.amountDuePt, reference: reference || undefined }] : [],
    } }), "تم حفظ البيع المباشر.");
    if (r) go(`/statements/${r.id}`);
  };
  const valid = customer && lines.length && lines.every((l) => Number(l.qty) > 0) && (!m?.needsReference || reference.trim());
  return (
    <div className="stack">
      <PageHead back={{ to: "/", label: "الرئيسية" }} title="بيع مباشر" sub="بيع قطع أو زيت على الكاونتر بدون سيارة. له ترقيم مستقل."
        actions={<Button variant="primary" icon={<Save />} disabled={!valid} onClick={save}>حفظ البيع</Button>} />
      <div className="grid-main-side">
        <div className="stack">
          <Panel title="العميل">
            {customer ? (
              <div className="row" style={{ justifyContent: "space-between" }}><b>{customer.name}</b><Button size="sm" variant="ghost" onClick={() => setCustomer(null)}>تغيير</Button></div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                <div className="input-group"><Search /><Input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="اسم العميل أو الموبايل" aria-label="بحث عن العميل" autoFocus /></div>
                {(customers.data ?? []).slice(0, 6).map((c) => <button key={c.id} type="button" className="pop__item" style={{ border: "1px solid var(--line)" }} onClick={() => setCustomer(c)}>{c.name} <span className="num muted">{c.mobile}</span></button>)}
                {cq.trim().length >= 2 && customers.data?.length === 0 && <p className="hint-line">لا يوجد عميل بهذا الاسم. أضفه من «العملاء والسيارات» أولًا.</p>}
              </div>
            )}
          </Panel>
          <Panel title="الأصناف" flush>
            <table className="table table--compact">
              <thead><tr><th>الصنف</th><th className="num" style={{ width: 110 }}>الكمية</th><th className="num">السعر</th><th className="num">القيمة</th><th style={{ width: 44 }} /></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.hit.variantId}>
                    <td><span className="cell-main">{l.hit.name}</span> {l.hit.grade && <GradeBadge grade={l.hit.grade} />}<span className="cell-sub lat">{l.hit.code}</span></td>
                    <td><Input size="sm" num type="number" min={0} step={l.hit.type === "oil" ? 0.5 : 1} value={l.qty} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x)))} /></td>
                    <td className="num"><Money pt={l.hit.sellPricePt} cur={false} /></td>
                    <td className="num"><Money pt={Math.round((Number(l.qty) || 0) * l.hit.sellPricePt)} cur={false} /></td>
                    <td><IconButton size="sm" label="حذف" onClick={() => setLines(lines.filter((_, k) => k !== i))}><Trash2 /></IconButton></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="add-line">
              <div className="grow">
                <div className="input-group"><Plus /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم الصنف، الكود أو امسح الباركود" aria-label="إضافة صنف"
                  onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { setLines([...lines, { hit: hits[0], qty: "1" }]); setQ(""); } }} /><span className="input-group__end"><SearchTools onText={setQ} voice={false} /></span></div>
                {hits.length > 0 && (
                  <div className="picker" role="listbox">
                    {hits.map((h) => (
                      <button key={h.variantId} type="button" className="picker__row" onClick={() => { setLines([...lines, { hit: h, qty: "1" }]); setQ(""); setHits([]); }}>
                        <span><span className="picker__name">{h.name}</span> <span className="picker__meta lat">{h.code}</span></span>
                        <span>{h.grade && <GradeBadge grade={h.grade} />}</span>
                        <span className="picker__stock">{h.trackStock ? `${f.n(h.qtyMilli / 1000)} ${h.unit}` : ""}</span>
                        <span className="num" style={{ fontWeight: 700 }}><Money pt={h.sellPricePt} cur={false} /></span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </div>
        <aside className="sticky-side">
          <div className="totals">
            <div className="totals__due">
              <span className="totals__due-label"><span>المطلوب</span></span>
              <span className="totals__due-value"><Money pt={t.amountDuePt} /></span>
              <span className="totals__words">{amountInWords(t.amountDuePt)}</span>
            </div>
            <div className="pay">
              <Field label="طريقة الدفع"><Select value={methodId} onChange={(e) => setMethodId(e.target.value)}>{(methods.data ?? []).filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></Field>
              {m?.needsReference && <Field label="رقم المرجع" required><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
