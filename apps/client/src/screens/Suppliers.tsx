import { useEffect, useState } from "react";
import { Banknote, FilePlus2, Plus, RotateCcw, Search, Trash2, UserPlus, X } from "lucide-react";
import { Button, Dialog, Field, GradeBadge, IconButton, Input, Money, Panel, Segmented, Select, useFmt, When } from "@jc/ui";
import { uuidv7 } from "@jc/core";
import { PageHead, PageState } from "../shell/Shell";
import { queryParam } from "../lib";
import { api } from "../data/api";
import { qs, useAction, useApi } from "../data/hooks";
import type { CatalogHit, LedgerRow, PaymentMethod, Supplier } from "../data/types";
import { WhatsAppButton } from "./common";

const LEDGER_LABEL: Record<string, string> = { opening: "رصيد افتتاحي", purchase: "فاتورة مشتريات", payment: "دفعة", purchase_return: "مرتجع مشتريات", refund_received: "رد نقدي من المورد" };

export function Suppliers() {
  const f = useFmt();
  const run = useAction();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(queryParam("id"));
  const [doc, setDoc] = useState<"purchase" | "return" | null>(null);
  const [pay, setPay] = useState<{ methodId: string; amount: string; reference: string } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [ns, setNs] = useState({ name: "", contact: "", phone: "", whatsapp: "", address: "" });
  const list = useApi<Supplier[]>(`/suppliers?${qs({ q: q.trim() || undefined })}`);
  const methods = useApi<PaymentMethod[]>("/payment-methods");
  const rows = list.data ?? [];
  const s = rows.find((x) => x.id === sel) ?? null;
  const ledger = useApi<LedgerRow[]>(s ? `/suppliers/${s.id}/ledger` : null);
  const owed = rows.reduce((a, x) => a + x.balancePt, 0);
  return (
    <div>
      <PageHead title="الموردين والمشتريات" sub={<>علينا للموردين <Money pt={owed} /></>}
        actions={<>
          <Button icon={<UserPlus />} onClick={() => setNewOpen(true)}>مورد جديد</Button>
          <Button icon={<RotateCcw />} disabled={!rows.length} onClick={() => setDoc("return")}>مرتجع مشتريات</Button>
          <Button variant="primary" icon={<FilePlus2 />} disabled={!rows.length} onClick={() => setDoc("purchase")}>فاتورة مشتريات</Button>
        </>} />
      <PageState loading={list.loading && !list.data} error={list.error} onRetry={list.reload} />
      <div className={s ? "grid-main-side" : ""} style={s ? { gridTemplateColumns: "minmax(0, 1fr) 460px" } : undefined}>
        <div>
          <div className="toolbar">
            <div className="input-group grow"><Search /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم المورد أو التليفون" aria-label="بحث في الموردين" /></div>
          </div>
          <div className="panel">
            <table className="table">
              <thead><tr><th>المورد</th><th>التليفون</th><th>آخر شراء</th><th className="num">الرصيد المستحق</th><th>واتساب</th></tr></thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id} className={`is-clickable${x.id === sel ? " is-selected" : ""}`} tabIndex={0} onClick={() => setSel(x.id)} onKeyDown={(e) => e.key === "Enter" && setSel(x.id)}>
                    <td><span className="cell-main">{x.name}</span>{x.contact && <span className="cell-sub">{x.contact}</span>}</td>
                    <td className="num" style={{ textAlign: "right" }}>{f.s(x.phone ?? "—")}</td>
                    <td className="num" style={{ textAlign: "right" }}>{x.lastPurchase ? f.date(x.lastPurchase) : "—"}</td>
                    <td className="num">{x.balancePt !== 0 ? <b><Money pt={x.balancePt} cur={false} /></b> : <span className="subtle">—</span>}</td>
                    <td onClick={(e) => e.stopPropagation()}><WhatsAppButton phone={x.whatsapp} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {s && (
          <aside className="sticky-side">
            <Panel title={s.name} sub={[s.contact, s.address].filter(Boolean).join(" · ")} actions={<IconButton label="إغلاق" onClick={() => setSel(null)}><X /></IconButton>} flush
              footer={<><Button size="sm" icon={<Banknote />} onClick={() => setPay({ methodId: "cash", amount: "", reference: "" })}>تسجيل دفعة</Button><Button size="sm" icon={<FilePlus2 />} onClick={() => setDoc("purchase")}>فاتورة مشتريات</Button></>}>
              <div className="row" style={{ padding: "16px 20px", justifyContent: "space-between", borderBottom: "1px solid var(--line)" }}>
                <div><span className="hint-line">الرصيد المستحق للمورد</span><p style={{ font: "700 1.6rem var(--font-lat)" }}><Money pt={s.balancePt} /></p></div>
                <WhatsAppButton phone={s.whatsapp} size="md" label="واتساب" text="السلام عليكم، عايزين نطلب قطع لـ Jeep City الرحاب." />
              </div>
              <h3 style={{ padding: "14px 20px 4px", fontSize: 15, fontWeight: 700 }}>كشف حساب المورد</h3>
              <table className="table table--compact">
                <thead><tr><th>التاريخ</th><th>البيان</th><th className="num">المبلغ</th><th className="num">الرصيد</th></tr></thead>
                <tbody>
                  {(ledger.data ?? []).map((r, i) => (
                    <tr key={i}><td><When iso={r.at} time={false} /></td><td>{LEDGER_LABEL[r.kind] ?? r.kind}</td><td className="num"><Money pt={r.amountPt} cur={false} /></td><td className="num" style={{ fontWeight: 700 }}><Money pt={r.balancePt} cur={false} /></td></tr>
                  ))}
                  {ledger.data?.length === 0 && <tr><td colSpan={4} className="hint-line" style={{ textAlign: "center" }}>لا توجد حركات.</td></tr>}
                </tbody>
              </table>
              <p className="hint-line" style={{ padding: "12px 20px" }}>موجب = علينا للمورد · سالب = له علينا.</p>
            </Panel>
          </aside>
        )}
      </div>

      {doc && <PurchaseDialog kind={doc} suppliers={rows} supplierId={s?.id ?? rows[0]?.id} methods={methods.data ?? []} onClose={() => setDoc(null)} />}
      <Dialog open={!!pay} onClose={() => setPay(null)} title={`دفعة للمورد · ${s?.name ?? ""}`}
        footer={<><Button onClick={() => setPay(null)}>رجوع</Button><Button variant="primary" disabled={!pay?.amount || !s} onClick={async () => {
          const r = await run(() => api(`/suppliers/${s!.id}/payments`, { method: "POST", body: { methodId: pay!.methodId, amountPt: Math.round(Number(pay!.amount) * 100), reference: pay!.reference || undefined } }), "سُجلت الدفعة.");
          if (r) setPay(null);
        }}>حفظ الدفعة</Button></>}>
        {pay && <div className="form-grid" style={{ ["--cols" as string]: 2 }}>
          <Field label="المبلغ" required><Input num type="number" min={0} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
          <Field label="طريقة الدفع" hint="الكاش يُخصم من الصندوق"><Select value={pay.methodId} onChange={(e) => setPay({ ...pay, methodId: e.target.value })}>{(methods.data ?? []).filter((m) => m.active && !m.isCredit).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
          <Field label="رقم المرجع" className="span-all"><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
        </div>}
      </Dialog>
      <Dialog open={newOpen} onClose={() => setNewOpen(false)} title="مورد جديد"
        footer={<><Button onClick={() => setNewOpen(false)}>رجوع</Button><Button variant="primary" disabled={ns.name.trim().length < 2} onClick={async () => {
          const r = await run(() => api<{ id: string }>("/suppliers", { method: "POST", body: { name: ns.name, contact: ns.contact || null, phone: ns.phone || null, whatsapp: ns.whatsapp || null, address: ns.address || null } }), "تمت إضافة المورد.");
          if (r) { setNewOpen(false); setSel(r.id); }
        }}>حفظ</Button></>}>
        <div className="form-grid" style={{ ["--cols" as string]: 2 }}>
          <Field label="اسم المورد" required><Input value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} /></Field>
          <Field label="المسؤول"><Input value={ns.contact} onChange={(e) => setNs({ ...ns, contact: e.target.value })} /></Field>
          <Field label="التليفون"><Input num value={ns.phone} onChange={(e) => setNs({ ...ns, phone: e.target.value })} /></Field>
          <Field label="واتساب" hint="موبايل مصري"><Input num value={ns.whatsapp} onChange={(e) => setNs({ ...ns, whatsapp: e.target.value })} /></Field>
          <Field label="العنوان" className="span-all"><Input value={ns.address} onChange={(e) => setNs({ ...ns, address: e.target.value })} /></Field>
        </div>
      </Dialog>
    </div>
  );
}

type PLine = { key: string; hit: CatalogHit; qty: string; cost: string };
function PurchaseDialog({ kind, suppliers, supplierId, methods, onClose }: { kind: "purchase" | "return"; suppliers: Supplier[]; supplierId?: string; methods: PaymentMethod[]; onClose: () => void }) {
  const f = useFmt();
  const run = useAction();
  const [sup, setSup] = useState(supplierId ?? "");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [ref, setRef] = useState("");
  const [payment, setPayment] = useState<"credit" | "paid" | "cash">(kind === "purchase" ? "credit" : "credit");
  const [methodId, setMethodId] = useState("cash");
  const [lines, setLines] = useState<PLine[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CatalogHit[]>([]);
  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(() => api<CatalogHit[]>(`/catalog?${qs({ q: q.trim(), kind: "parts" })}`).then((r) => setHits(r.filter((h) => h.trackStock))).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [q]);
  const value = (l: PLine) => Math.round((Number(l.qty) || 0) * (Number(l.cost) || 0) * 100);
  const total = lines.reduce((a, l) => a + value(l), 0);
  const save = async () => {
    const body = kind === "purchase"
      ? { id: uuidv7(), supplierId: sup, purchaseDate: date, supplierRef: ref || undefined, payment: payment === "credit" ? "credit" : "paid", paidMethodId: methodId, lines: lines.map((l) => ({ variantId: l.hit.variantId, qtyMilli: Math.round(Number(l.qty) * 1000), unitCostPt: Math.round(Number(l.cost) * 100) })) }
      : { id: uuidv7(), supplierId: sup, purchaseDate: date, refund: payment === "cash" ? "cash" : "credit", reason: ref, lines: lines.map((l) => ({ variantId: l.hit.variantId, qtyMilli: Math.round(Number(l.qty) * 1000), unitCostPt: Math.round(Number(l.cost) * 100) })) };
    const r = await run(() => api<{ number: number }>(kind === "purchase" ? "/purchases" : "/purchase-returns", { method: "POST", body }), kind === "purchase" ? "تم حفظ فاتورة المشتريات ودخلت الكميات المخزن." : "تم حفظ المرتجع وخرجت الكميات من المخزن.");
    if (r) onClose();
  };
  const valid = sup && lines.length && lines.every((l) => Number(l.qty) > 0 && Number(l.cost) >= 0) && (kind === "purchase" || ref.trim().length >= 3);
  return (
    <Dialog open wide onClose={onClose} title={kind === "purchase" ? "فاتورة مشتريات" : "مرتجع مشتريات"}
      footer={<><span className="hint-line" style={{ marginInlineEnd: "auto" }}>الإجمالي <b><Money pt={total} /></b></span><Button onClick={onClose}>رجوع</Button><Button variant="primary" disabled={!valid} onClick={save}>حفظ</Button></>}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="form-grid" style={{ ["--cols" as string]: 3 }}>
          <Field label="المورد" required><Select value={sup} onChange={(e) => setSup(e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="التاريخ" hint="سنة-شهر-يوم"><Input num value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={kind === "purchase" ? "رقم فاتورة المورد" : "سبب المرتجع"} required={kind === "return"}><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          <Field label={kind === "purchase" ? "الدفع" : "طريقة الرد"}>
            <Segmented label="الدفع" value={payment} onChange={setPayment} options={kind === "purchase" ? [{ value: "credit", label: "آجل على الحساب" }, { value: "paid", label: "مدفوعة" }] : [{ value: "credit", label: "خصم من الحساب" }, { value: "cash", label: "استلام كاش" }]} />
          </Field>
          {kind === "purchase" && payment === "paid" && <Field label="طريقة الدفع"><Select value={methodId} onChange={(e) => setMethodId(e.target.value)}>{methods.filter((m) => m.active && !m.isCredit).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>}
        </div>
        <table className="table table--compact">
          <thead><tr><th>الصنف</th><th className="num" style={{ width: 110 }}>الكمية</th><th className="num" style={{ width: 130 }}>تكلفة الوحدة</th><th className="num" style={{ width: 120 }}>القيمة</th><th style={{ width: 44 }} /></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <td><span className="cell-main">{l.hit.name}</span> {l.hit.grade && <GradeBadge grade={l.hit.grade} />}<span className="cell-sub lat">{l.hit.code} · الرصيد {f.n(l.hit.qtyMilli / 1000)}</span></td>
                <td><Input size="sm" num type="number" min={0} value={l.qty} onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, qty: e.target.value } : x)))} /></td>
                <td><Input size="sm" num type="number" min={0} value={l.cost} onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, cost: e.target.value } : x)))} /></td>
                <td className="num"><Money pt={value(l)} cur={false} /></td>
                <td><IconButton size="sm" label="حذف" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}><Trash2 /></IconButton></td>
              </tr>
            ))}
            {!lines.length && <tr><td colSpan={5} className="hint-line" style={{ textAlign: "center", height: 56 }}>ابحث عن الصنف بالأسفل وأضفه.</td></tr>}
          </tbody>
        </table>
        <div style={{ position: "relative" }}>
          <div className="input-group"><Plus /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="أضف صنفًا: اسم، كود أو باركود" aria-label="إضافة صنف" /></div>
          {hits.length > 0 && (
            <div className="picker" role="listbox">
              {hits.map((h) => (
                <button key={h.variantId} type="button" className="picker__row" onClick={() => { setLines([...lines, { key: uuidv7(), hit: h, qty: "1", cost: "" }]); setQ(""); setHits([]); }}>
                  <span><span className="picker__name">{h.name}</span> <span className="picker__meta lat">{h.code}</span></span>
                  <span>{h.grade && <GradeBadge grade={h.grade} />}</span>
                  <span className="picker__stock">{f.n(h.qtyMilli / 1000)} {h.unit}</span>
                  <span />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
