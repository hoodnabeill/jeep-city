import { useEffect, useState } from "react";
import { CircleCheck, History, LockKeyhole, MoreHorizontal, PenLine, Plus, Printer, ReceiptText, Save, Trash2, TriangleAlert, XCircle } from "lucide-react";
import { Badge, Button, DL, Dialog, Field, IconButton, Input, Menu, Money, Panel, Segmented, Select, Textarea, useFmt, useToast, When } from "@jc/ui";
import { amountInWords, uuidv7, toPt, type Category, type Discount } from "@jc/core";
import { PageHead, PageState } from "../shell/Shell";
import { go, Link, useHotkey, useIsAdmin } from "../lib";
import { api, ApiError } from "../data/api";
import { invalidateAll, useAction, useApi, useSetting } from "../data/hooks";
import { STATEMENT_KIND, type Customer, type Line, type PaymentMethod, type Statement, type Technician, type WorkOrder } from "../data/types";
import { LinesTable, NO_VAT, totalsOf, type Vat } from "./lines";
import { carName, CarPlate, WhatsAppButton } from "./common";

type Disc = { mode: "amount" | "pct"; value: string };
type PayRow = { key: string; methodId: string; amount: string; reference: string };
const toDiscount = (d: Disc): Discount | undefined => {
  const n = Number(d.value);
  if (!d.value || !Number.isFinite(n) || n <= 0) return undefined;
  return d.mode === "amount" ? { mode: "amount", valuePt: Math.round(n * 100) } : { mode: "percent", valueBp: Math.round(n * 100) };
};
const fromDiscount = (d?: Statement["discounts"][string]): Disc => !d ? { mode: "amount", value: "" } : d.mode === "amount" ? { mode: "amount", value: String(d.valuePt / 100) } : { mode: "pct", value: String(d.valueBp / 100) };

export function StatementScreen({ id }: { id?: string }) {
  const woId = !id ? new URLSearchParams(location.hash.split("?")[1]).get("wo") : null;
  const st = useApi<Statement>(id ? `/statements/${id}` : null);
  const woRef = woId ?? st.data?.workOrderId;
  const wo = useApi<WorkOrder>(woRef ? `/work-orders/${woRef}` : null);
  const cust = useApi<Customer>(st.data && !st.data.workOrderId ? `/customers/${st.data.customerId}` : null);
  const methods = useApi<PaymentMethod[]>("/payment-methods");
  if (id && !st.data) return <PageState loading={st.loading} error={st.error} onRetry={st.reload} />;
  if (!id && !wo.data) return <PageState loading={wo.loading} error={wo.error ?? (!woId ? { message: "افتح البيان من أمر شغل." } : undefined)} />;
  if (!methods.data) return <PageState loading={methods.loading} error={methods.error} />;
  return <StatementView key={`${id ?? woId}-${st.data?.version ?? 0}`} saved={st.data} wo={wo.data} customer={cust.data} methods={methods.data.filter((m) => m.active)} />;
}

function StatementView({ saved, wo, customer, methods }: { saved?: Statement; wo?: WorkOrder; customer?: Customer; methods: PaymentMethod[] }) {
  const isAdmin = useIsAdmin();
  const vat = useSetting<Vat>("vat", NO_VAT);
  const f = useFmt();
  const toast = useToast();
  const run = useAction();
  const techs = useApi<Technician[]>("/technicians").data ?? [];
  const [editing, setEditing] = useState(!saved);
  const [lines, setLines] = useState<Line[]>(saved?.lines ?? wo?.lines ?? []);
  const [dLabor, setDLabor] = useState<Disc>(fromDiscount(saved?.discounts.labor));
  const [dParts, setDParts] = useState<Disc>(fromDiscount(saved?.discounts.part));
  const [notDone, setNotDone] = useState(saved?.notDone ?? "");
  const netPaid = (() => {
    const m = new Map<string, { amount: number; reference: string }>();
    for (const p of saved?.payments ?? []) { const x = m.get(p.methodId) ?? { amount: 0, reference: "" }; m.set(p.methodId, { amount: x.amount + p.amountPt, reference: p.reference ?? x.reference }); }
    return [...m].filter(([, x]) => x.amount > 0).map(([methodId, x]) => ({ key: methodId, methodId, amount: String(x.amount / 100), reference: x.reference }));
  })();
  const [pays, setPays] = useState<PayRow[]>(netPaid.length ? netPaid : [{ key: "p1", methodId: methods[0]?.id ?? "cash", amount: "", reference: "" }]);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [histOpen, setHistOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (wo && !saved) setLines(wo.lines); }, [wo, saved]);

  const locked = !!saved && !editing;
  const cancelled = saved?.status === "cancelled";
  const discounts: Partial<Record<Category, Discount>> = {};
  const dl = toDiscount(dLabor), dp = toDiscount(dParts);
  if (dl) discounts.labor = dl;
  if (dp) discounts.part = dp;
  const t = locked ? saved!.totals : totalsOf(lines, discounts, vat);
  const payPt = (p: PayRow) => toPt(p.amount) || 0;
  const isCredit = (id: string) => methods.find((m) => m.id === id)?.isCredit;
  const paid = pays.filter((p) => !isCredit(p.methodId)).reduce((a, p) => a + payPt(p), 0);
  const credit = pays.filter((p) => isCredit(p.methodId)).reduce((a, p) => a + payPt(p), 0);
  const remaining = t.amountDuePt - paid - credit;
  const v = wo?.vehicle ?? null;
  const c = wo?.customer ?? (customer ? { id: customer.id, name: customer.name, mobile: customer.mobile, whatsapp: customer.whatsapp } : null);
  const payBody = () => pays.filter((p) => payPt(p) > 0).map((p) => ({ methodId: p.methodId, amountPt: payPt(p), reference: p.reference || undefined }));

  const validate = () => {
    const missingRef = pays.find((p) => payPt(p) > 0 && methods.find((m) => m.id === p.methodId)?.needsReference && !p.reference.trim());
    if (missingRef) { toast(`اكتب رقم المرجع لدفعة ${methods.find((m) => m.id === missingRef.methodId)!.label}.`, "bad"); return false; }
    if (remaining !== 0) { toast(remaining > 0 ? <>متبقي <Money pt={remaining} /> بدون طريقة دفع. سجّله دفعة أو آجل.</> : "المدفوع أكثر من المطلوب.", "bad"); return false; }
    return true;
  };

  const save = async () => {
    if (locked || busy || !validate()) return;
    if (saved) { setReasonOpen(true); return; }
    setBusy(true);
    try {
      const r = await api<{ id: string; number: number | null; queued?: boolean }>("/statements", { method: "POST", body: { id: uuidv7(), workOrderId: wo!.id, discounts, payments: payBody(), notDone: notDone || undefined } });
      invalidateAll();
      if (r.queued) {
        // Offline: statement numbers come only from the server (D-16).
        toast("حُفظ البيان على هذا الجهاز. يأخذ رقمه ويُطبع عند عودة الاتصال.", "warn");
        go(`/work-orders/${wo!.id}`);
        return;
      }
      toast(<>تم حفظ البيان رقم <b className="num">{f.s(r.number!)}</b>.</>);
      go(`/statements/${r.id}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "تعذر حفظ البيان.", "bad");
    } finally { setBusy(false); }
  };

  const saveEdit = async () => {
    const changed = lines.map((l) => {
      const o = saved!.lines.find((x) => x.id === l.id)!;
      return o.qtyMilli !== l.qtyMilli ? { id: l.id, qtyMilli: l.qtyMilli } : null;
    }).filter(Boolean);
    const removed = saved!.lines.filter((o) => !lines.some((l) => l.id === o.id)).map((o) => ({ id: o.id, remove: true }));
    const r = await run(() => api(`/statements/${saved!.id}`, { method: "PATCH", body: {
      expectedVersion: saved!.version, reason, discounts, notDone, lines: [...changed, ...removed], payments: payBody(),
    } }), "تم حفظ التعديل كمراجعة جديدة على البيان.");
    if (r) { setReasonOpen(false); setEditing(false); }
  };

  useHotkey("s", save, [locked, busy, pays, lines, dLabor, dParts, notDone]);
  useHotkey("p", () => saved && go(`/print/statement/${saved.id}`), [saved?.id]);

  return (
    <div className="stack">
      <PageHead
        back={saved ? { to: "/statements", label: "بيانات العملاء" } : { to: `/work-orders/${wo!.id}`, label: `أمر شغل ${f.s(wo!.number)}` }}
        title={<>{saved ? <>{STATEMENT_KIND[saved.kind]} <span className="num">{f.s(saved.number)}</span></> : "بيان عميل جديد"}
          {cancelled ? <Badge tone="bad" size="lg">ملغي</Badge> : saved ? (locked ? <Badge tone="ink" size="lg"><LockKeyhole size={13} />محفوظ ومقفول</Badge> : <Badge tone="work" size="lg">تعديل إداري</Badge>) : <Badge size="lg">مسودة · يأخذ رقمه عند الحفظ</Badge>}
        </>}
        sub={saved ? <>تاريخ البيان <span className="num">{f.date(saved.statementDate)}</span>{saved.exitAt && <> · الخروج <When iso={saved.exitAt} /></>}</> : <>من أمر الشغل {f.s(wo!.number)}. الخروج يُسجل عند الحفظ.</>}
        actions={<>
          {saved && c && <WhatsAppButton phone={c.whatsapp ?? c.mobile} size="md" label="إرسال للعميل" text={`مرحبًا ${c.name}، هذا بيان سيارتك رقم ${saved.number} من Jeep City. المطلوب ${f.pt(saved.amountDuePt)} جنيه. شكرًا لزيارتك.`} />}
          {saved && isAdmin && locked && !cancelled && saved.kind !== "byte" && <Button icon={<PenLine />} onClick={() => setEditing(true)}>تعديل</Button>}
          {saved && <Menu label="المزيد" icon={<MoreHorizontal />} items={[
            ...(isAdmin ? [{ label: "سجل التعديلات", icon: <History />, onSelect: () => setHistOpen(true) }] : []),
            { label: "إيصال حراري 80 مم", icon: <ReceiptText />, onSelect: () => go(`/print/receipt/${saved.id}`) },
            ...(isAdmin && !cancelled && saved?.kind !== "byte" ? [{ label: "إلغاء البيان", icon: <XCircle />, danger: true, onSelect: () => setCancelOpen(true) }] : []),
          ]} />}
          {locked
            ? <Button variant="primary" icon={<Printer />} kbd="Ctrl P" onClick={() => go(`/print/statement/${saved!.id}`)}>طباعة</Button>
            : <>
                {saved && <Button onClick={() => { setEditing(false); setLines(saved.lines); }}>إلغاء التعديل</Button>}
                <Button variant="primary" icon={<Save />} kbd="Ctrl S" disabled={busy} onClick={save}>{saved ? "حفظ التعديل" : busy ? "جاري الحفظ…" : "حفظ البيان"}</Button>
              </>}
        </>}
      />

      {locked && !isAdmin && (
        <div className="lock-note"><LockKeyhole /><div><b>هذا البيان محفوظ ولا يمكن تعديله إلا من الإدارة.</b><br /><span className="muted">لو فيه خطأ، اطلب من الإدارة فتحه للتعديل. كل تعديل يُسجل باسم من عدّله ووقته.</span></div></div>
      )}
      {cancelled && saved?.cancelReason && <div className="lock-note" style={{ background: "var(--bad-bg)", color: "var(--bad)", borderColor: "transparent" }}><XCircle /><div><b>بيان ملغي.</b> السبب: {saved.cancelReason}</div></div>}

      <div className="grid-main-side">
        <div className="stack">
          <div className="doc-head">
            <div className="doc-head__car">
              <CarPlate v={v} size="lg" />
              {v && <span className="model lat">{carName(v)}</span>}
              <span className="vin">{v?.chassis}</span>
            </div>
            <DL cols={3} items={[
              { label: "اسم العميل", value: c ? <Link to={`/customers/${c.id}`} className="link">{c.name}</Link> : "—" },
              { label: "رقم أمر الشغل", value: wo ? <Link to={`/work-orders/${wo.id}`} className="link num">{f.s(wo.number)}</Link> : "بيع مباشر" },
              { label: "مهندس الاستقبال", value: wo?.engineer ?? "—" },
              { label: "تاريخ ووقت الدخول", value: wo ? <When iso={wo.enteredAt} /> : "—" },
              { label: "تاريخ ووقت الخروج", value: saved?.exitAt ? <When iso={saved.exitAt} /> : <span className="subtle">{saved ? "غير مسجل" : "عند الحفظ"}</span> },
              { label: "تاريخ البيان", value: <span className="num">{f.date(saved?.statementDate ?? new Date().toISOString())}</span> },
              { label: "طراز السيارة", value: <span className="lat">{v ? [v.make?.toUpperCase(), v.variant ?? v.model?.toUpperCase()].filter(Boolean).join(" ") : "—"}</span> },
              { label: "عداد كم", value: <span className="num">{wo?.odometerIn != null ? f.n(wo.odometerIn) : "—"}</span> },
              { label: "الموبايل", value: <span className="num">{f.s(c?.mobile ?? "—")}</span> },
            ]} />
          </div>

          <Panel title="المصنعيات" flush>
            <LinesTable kind="labor" lines={lines} technicians={techs} editable={!locked && !!saved} onChange={(l, p) => p.qtyMilli && setLines(lines.map((x) => (x.id === l.id ? { ...x, qtyMilli: p.qtyMilli! } : x)))} onRemove={(l) => setLines(lines.filter((x) => x.id !== l.id))} />
          </Panel>
          <Panel title="قطع الغيار" sub="تشمل الزيوت والخامات المصروفة على السيارة" flush>
            <LinesTable kind="parts" lines={lines} technicians={techs} editable={!locked && !!saved} onChange={(l, p) => p.qtyMilli && setLines(lines.map((x) => (x.id === l.id ? { ...x, qtyMilli: p.qtyMilli! } : x)))} onRemove={(l) => setLines(lines.filter((x) => x.id !== l.id))} />
          </Panel>
          {!saved && <p className="hint-line">لتعديل البنود ارجع إلى <Link to={`/work-orders/${wo!.id}`} className="link">أمر الشغل</Link>. البيان يأخذ البنود كما هي عند الحفظ.</p>}

          <Panel title="أعمال هامة لم تتم بالسيارة">
            {locked ? <p>{notDone || <span className="subtle">لا يوجد</span>}</p> : <Textarea value={notDone} onChange={(e) => setNotDone(e.target.value)} placeholder="مثال: يحتاج تغيير مساعدين خلفي. العميل أجّل." aria-label="أعمال هامة لم تتم بالسيارة" />}
          </Panel>
        </div>

        <aside className="sticky-side stack" aria-label="الإجماليات والدفع">
          <div className="totals">
            <div className="totals__title"><span>الإجماليات</span></div>
            {!locked && (
              <div className="totals__disc">
                {([["خصم المصنعيات", dLabor, setDLabor], ["خصم قطع الغيار", dParts, setDParts]] as const).map(([label, d, set]) => (
                  <div className="totals__disc-row" key={label}>
                    <span>{label}</span>
                    <Segmented size="sm" label={`نوع ${label}`} value={d.mode} onChange={(m) => set({ ...d, mode: m })} options={[{ value: "amount", label: "مبلغ" }, { value: "pct", label: "%" }]} />
                    <Input size="sm" num type="number" min={0} value={d.value} placeholder="0" aria-label={label} onChange={(e) => set({ ...d, value: e.target.value })} />
                  </div>
                ))}
              </div>
            )}
            <div className="totals__rows">
              <Row label="إجمالي المصنعيات" pt={t.laborGrossPt} />
              <Row label="إجمالي قطع الغيار" pt={t.partsGrossPt} />
              <Row label="إجمالي خصم" pt={t.discountPt} sub />
              <Row label="صافي المصنعيات" pt={t.laborNetPt} rule />
              <Row label="صافي قطع الغيار" pt={t.partsNetPt} />
              <Row label="صافي الزيوت" pt={t.oilsNetPt} />
              <Row label="إجمالي خامات" pt={t.materialsPt} />
              <Row label="إجمالي بيان" pt={t.statementGrossPt} strong rule />
            </div>
            <div className="totals__due">
              <span className="totals__due-label"><span>أجمالي المطلوب</span></span>
              <span className="totals__due-value"><Money pt={t.amountDuePt} /></span>
              <span className="totals__words">{amountInWords(t.amountDuePt)}</span>
            </div>
          </div>

          <div className="totals">
            <div className="totals__title"><span>الدفع</span><span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>يمكن تقسيم المبلغ على أكثر من طريقة</span></div>
            <div className="pay">
              {pays.map((p, i) => {
                const m = methods.find((x) => x.id === p.methodId) ?? methods[0];
                const setP = (patch: Partial<PayRow>) => setPays(pays.map((x) => (x.key === p.key ? { ...x, ...patch } : x)));
                if (locked) return (
                  <div key={p.key} className="totals__row" style={{ padding: "4px 0" }}>
                    <span><b>{m?.label ?? p.methodId}</b>{p.reference && <span className="muted"> · مرجع <span className="lat">{p.reference}</span></span>}</span>
                    <Money pt={payPt(p)} cur={false} />
                  </div>
                );
                return (
                  <div key={p.key} className="pay__row">
                    <Select size="sm" value={p.methodId} aria-label={`طريقة الدفع ${i + 1}`} onChange={(e) => setP({ methodId: e.target.value })}>
                      {methods.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </Select>
                    <Input size="sm" num type="number" min={0} value={p.amount} placeholder="المبلغ" aria-label={`مبلغ ${m?.label}`} onChange={(e) => setP({ amount: e.target.value })} />
                    {pays.length > 1 ? <IconButton size="sm" label="حذف الدفعة" onClick={() => setPays(pays.filter((x) => x.key !== p.key))}><Trash2 /></IconButton> : <span />}
                    {m?.needsReference && (
                      <div className={`pay__ref${!p.reference && payPt(p) > 0 ? " is-invalid" : ""}`}>
                        <Input size="sm" value={p.reference} placeholder={`رقم المرجع من ${m.label === "فيزا" ? "ماكينة الفيزا" : m.label}`} aria-label="رقم المرجع" onChange={(e) => setP({ reference: e.target.value })} />
                      </div>
                    )}
                    {m?.isCredit && <span className="pay__ref hint-line">يُضاف على حساب العميل كمديونية.</span>}
                  </div>
                );
              })}
              {!locked && (
                <div className="row">
                  <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setPays([...pays, { key: `p${Date.now()}`, methodId: methods.find((m) => m.needsReference)?.id ?? methods[0].id, amount: "", reference: "" }])}>طريقة دفع أخرى</Button>
                  {remaining > 0 && <Button size="sm" variant="ghost" onClick={() => setPays(pays.map((x, i) => (i === pays.length - 1 ? { ...x, amount: String((payPt(x) + remaining) / 100) } : x)))}>إكمال المتبقي</Button>}
                </div>
              )}
            </div>
            <div className="pay__sum" style={{ fontWeight: 600 }}><span>المدفوع</span><Money pt={paid} /></div>
            {credit > 0 && <div className="pay__sum debt"><span>آجل على العميل</span><Money pt={credit} /></div>}
            {remaining > 0 ? (
              <div className="pay__sum debt"><span><TriangleAlert size={16} style={{ display: "inline", verticalAlign: -3 }} /> متبقي بدون طريقة دفع</span><Money pt={remaining} /></div>
            ) : remaining < 0 ? (
              <div className="pay__sum debt"><span>المدفوع أكثر من المطلوب</span><Money pt={-remaining} /></div>
            ) : (
              <div className="pay__sum done"><span><CircleCheck size={16} style={{ display: "inline", verticalAlign: -3 }} /> تم تسجيل المبلغ بالكامل</span><span /></div>
            )}
          </div>
        </aside>
      </div>

      <Dialog open={reasonOpen} onClose={() => setReasonOpen(false)} title="حفظ تعديل على بيان محفوظ"
        footer={<><Button onClick={() => setReasonOpen(false)}>رجوع</Button><Button variant="primary" disabled={reason.trim().length < 3} onClick={saveEdit}>حفظ التعديل</Button></>}>
        <div className="stack" style={{ gap: 16 }}>
          <p>كل تعديل يُحفظ كمراجعة جديدة: من عدّل، ومتى، وما قبل التعديل وما بعده. المخزن والصندوق يُضبطان تلقائيًا بالفرق.</p>
          <Field label="سبب التعديل" required hint="يظهر في سجل التعديلات والمراجعة."><Input value={reason} autoFocus onChange={(e) => setReason(e.target.value)} placeholder="مثال: العميل أرجع فلتر التكييف" /></Field>
        </div>
      </Dialog>
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="إلغاء البيان"
        footer={<><Button onClick={() => setCancelOpen(false)}>رجوع</Button><Button variant="danger" disabled={cancelReason.trim().length < 3} onClick={async () => {
          const r = await run(() => api(`/statements/${saved!.id}/cancel`, { method: "POST", body: { reason: cancelReason, expectedVersion: saved!.version } }), "تم إلغاء البيان. رجعت القطع للمخزن وسُجّل رد المدفوع.");
          if (r) setCancelOpen(false);
        }}>تأكيد الإلغاء</Button></>}>
        <div className="stack" style={{ gap: 16 }}>
          <p>البيان لا يُحذف. يبقى برقمه ويظهر «ملغي». عند الإلغاء ترجع القطع المصروفة للمخزن، ويُسجل رد المدفوع (الكاش يخرج من الصندوق)، وتُلغى أي مديونية من هذا البيان.</p>
          <Field label="سبب الإلغاء" required><Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="مثال: بيان مكرر بالخطأ" /></Field>
        </div>
      </Dialog>
      {saved && histOpen && <HistoryDialog id={saved.id} number={saved.number} onClose={() => setHistOpen(false)} />}
    </div>
  );
}

function HistoryDialog({ id, number, onClose }: { id: string; number: number; onClose: () => void }) {
  const f = useFmt();
  const q = useApi<{ id: string; at: string; action: string; user: string | null; after: { reason?: string; amountDuePt?: number } | null; before: { amountDuePt?: number } | null }[]>(`/audit?entity=statement&entityId=${id}`);
  const label: Record<string, string> = { "statement.create": "إنشاء البيان", "statement.edit": "تعديل", "statement.cancel": "إلغاء", "salesReturn.create": "مرتجع" };
  return (
    <Dialog open onClose={onClose} title={`سجل البيان ${f.s(number)}`} wide>
      <table className="table">
        <thead><tr><th>الوقت</th><th>بواسطة</th><th>الإجراء</th><th>التفاصيل</th></tr></thead>
        <tbody>
          {(q.data ?? []).map((r) => (
            <tr key={r.id}><td><When iso={r.at} /></td><td>{r.user}</td><td>{label[r.action] ?? r.action}</td>
              <td>{r.before?.amountDuePt !== undefined && r.after?.amountDuePt !== undefined && r.before.amountDuePt !== r.after.amountDuePt && <>المطلوب: <s className="muted">{f.pt(r.before.amountDuePt)}</s> ← <b>{f.pt(r.after.amountDuePt)}</b>. </>}{r.after?.reason && <>السبب: {r.after.reason}</>}</td></tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

function Row({ label, pt, sub, strong, rule }: { label: string; pt: number; sub?: boolean; strong?: boolean; rule?: boolean }) {
  return (
    <div className={`totals__row${sub ? " sub" : ""}${strong ? " strong" : ""}${rule ? " rule" : ""}`}>
      <span>{label}</span><Money pt={pt} cur={false} />
    </div>
  );
}
