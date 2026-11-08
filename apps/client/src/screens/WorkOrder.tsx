import { useState } from "react";
import {
  BellRing, CircleCheck, ClipboardCheck, FileSignature, Fuel, Hammer, MessageCircle, PackageOpen, Printer, ReceiptText, Wrench, PackagePlus,
} from "lucide-react";
import { Badge, Button, DL, Dialog, Field, Input, Money, Panel, Select, Tabs, Textarea, useFmt, When } from "@jc/ui";
import { PageHead, PageState } from "../shell/Shell";
import { go, Link, useHotkey } from "../lib";
import { api } from "../data/api";
import { useAction, useApi } from "../data/hooks";
import type { CatalogHit, Line, Package, Technician, WorkOrder, WOStatus } from "../data/types";
import { LinesTable, totalsOf } from "./lines";
import { CarDiagram, MARK_KIND, toDiagramMarks } from "./CarDiagram";
import { carName, CarPlate, SignaturePad, useWaTemplates, WhatsAppButton, WO_TYPE } from "./common";
import { fillTemplate, firstName, toPt, whatsappLink } from "@jc/core";


export function WorkOrderScreen({ id }: { id: string }) {
  const f = useFmt();
  const run = useAction();
  const q = useApi<WorkOrder>(`/work-orders/${id}`);
  const techs = useApi<Technician[]>("/technicians");
  const pkgs = useApi<Package[]>("/packages");
  // shortcut: quick labor = first labor items by code; make it a Settings list when the shop picks its favourites.
  const quick = useApi<CatalogHit[]>("/catalog?q=L-&kind=labor");
  const [tab, setTab] = useState<"work" | "intake" | "approvals" | "notes">("work");
  const [approveOpen, setApproveOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const templates = useWaTemplates().filter((t) => t.id !== "reminder");
  const [remOpen, setRemOpen] = useState(false);
  const [sigOpen, setSigOpen] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [rem, setRem] = useState({ dueDate: "", dueKm: "", note: "" });
  const [approval, setApproval] = useState({ newPt: "", by: "", method: "phone" as "phone" | "whatsapp" | "in_person" });
  const wo = q.data;
  useHotkey("p", () => wo && go(`/print/job-card/${wo.id}`), [wo?.id]);
  if (!wo) return <PageState loading={q.loading} error={q.error} onRetry={q.reload} />;

  const v = wo.vehicle, c = wo.customer;
  const t = totalsOf(wo.lines);
  const editable = wo.editable;
  const over = wo.estimatePt ? t.statementGrossPt > wo.estimatePt : false;
  const car = carName(v);
  const technicians = (techs.data ?? []).filter((x) => x.active);

  const addLine = (hit: CatalogHit, qtyMilli: number) => run(async () => {
    const r = await api<{ lowStock: boolean }>(`/work-orders/${id}/lines`, { method: "POST", body: { variantId: hit.variantId, qtyMilli } });
    return r;
  }).then((r) => { if (r?.lowStock) run(async () => null, <>«{hit.name}» أصبح تحت الحد الأدنى. اطلب من المورد.</>); });
  const changeLine = (l: Line, patch: object) => run(() => api(`/work-orders/${id}/lines/${l.id}`, { method: "PATCH", body: patch }));
  const removeLine = (l: Line) => run(() => api(`/work-orders/${id}/lines/${l.id}`, { method: "DELETE" }), l.qtyMilli && l.variantId ? "حُذف البند ورجعت الكمية للمخزن." : "حُذف البند.");
  const setStatus = (s: WOStatus) => run(() => api(`/work-orders/${id}`, { method: "PATCH", body: { status: s } }), s === "ready" ? "السيارة جاهزة للتسليم. ابعت للعميل رسالة «جاهزة للاستلام»." : undefined);
  const patchNotes = (patch: object) => run(() => api(`/work-orders/${id}`, { method: "PATCH", body: patch }), "تم حفظ الملاحظات.");

  return (
    <div className="stack">
      <PageHead
        back={{ to: "/reception", label: "الاستقبال وأوامر الشغل" }}
        title={<>أمر شغل <span className="num">{f.s(wo.number)}</span><Badge tone="outline" size="lg">{WO_TYPE[wo.type]}</Badge>{wo.comeback && <Badge tone="bad" size="lg">صيانة مرتجعة</Badge>}</>}
        sub={<>فتحه {wo.engineer} · <When iso={wo.enteredAt} /></>}
        actions={<>
          <Button icon={<MessageCircle />} onClick={() => setWaOpen(true)}>رسالة واتساب</Button>
          {wo.vehicle && <Button icon={<BellRing />} onClick={() => setRemOpen(true)}>تذكير صيانة</Button>}
          <Button icon={<FileSignature />} onClick={() => { setSig(null); setSigOpen(true); }}>توقيع العميل</Button>
          <Button icon={<Printer />} kbd="Ctrl P" onClick={() => go(`/print/job-card/${wo.id}`)}>كارت الإصلاح</Button>
          {wo.statement
            ? <Button variant="primary" icon={<ReceiptText />} onClick={() => go(`/statements/${wo.statement!.id}`)}>فتح البيان {f.s(wo.statement.number)}</Button>
            : wo.type === "repair" && editable && <Button variant="primary" icon={<ReceiptText />} disabled={!wo.lines.length} onClick={() => go(`/statements/new?wo=${wo.id}`)}>تحويل إلى بيان عميل</Button>}
        </>}
      />

      <div className="doc-head">
        <div className="doc-head__car">
          <CarPlate v={v} size="lg" />
          {v && <Link to={`/cars/${v.id}`} className="model lat" style={{ textDecoration: "none" }}>{car}{v.year ? ` · ${v.year}` : ""}</Link>}
          <span className="vin">{v?.chassis}</span>
        </div>
        <DL cols={4} items={[
          { label: "العميل", value: <Link to={`/customers/${c.id}`} className="link">{c.name}</Link> },
          { label: "الموبايل", value: <span className="num">{f.s(c.mobile ?? "—")}</span> },
          { label: "مهندس الاستقبال", value: wo.engineer ?? "—" },
          { label: "الفنيين", value: wo.technicians.map((x) => x.name).join("، ") || <span className="subtle">لم يُحدد</span> },
          { label: "الدخول", value: <When iso={wo.enteredAt} /> },
          { label: "التسليم المتوقع", value: wo.expectedAt ? <When iso={wo.expectedAt} /> : <span className="subtle">—</span> },
          { label: "عداد الدخول", value: <span className="num">{wo.odometerIn != null ? `${f.n(wo.odometerIn)} كم` : "—"}</span> },
          { label: "منذ آخر زيارة", value: wo.previousOdometer && wo.odometerIn != null ? <span className="num" style={{ color: "var(--ok)" }}>+{f.n(wo.odometerIn - wo.previousOdometer.km)} كم</span> : "أول زيارة" },
        ]} />
      </div>

      <div className="status-steps" role="radiogroup" aria-label="حالة السيارة">
        {(["open", "ready", "delivered"] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={wo.status === s} disabled={!editable && s !== wo.status}
            onClick={() => { if (s === "delivered") { if (!wo.statement) run(async () => null, "التسليم يتم بتحويل الأمر إلى بيان عميل وتسجيل وقت الخروج."); return; } if (editable && s !== wo.status) setStatus(s); }}>
            {wo.status === s && <CircleCheck />}{{ open: "جاري الشغل", ready: "جاهز للتسليم", delivered: "تم التسليم" }[s]}
          </button>
        ))}
      </div>

      <div className="grid-main-side">
        <div className="stack">
          <Tabs label="أقسام أمر الشغل" value={tab} onChange={setTab} items={[
            { value: "work", label: "المصنعيات وقطع الغيار", icon: <Wrench size={17} />, count: wo.lines.length },
            { value: "intake", label: "الاستلام", icon: <ClipboardCheck size={17} /> },
            { value: "approvals", label: "موافقات التكلفة", icon: <FileSignature size={17} />, count: wo.approvals.length },
            { value: "notes", label: "الملاحظات", icon: <Hammer size={17} /> },
          ]} />

          {tab === "work" && (
            <>
              <Panel title="المصنعيات" flush actions={editable && (
                <div className="quick">
                  <span className="quick__label">سريعة:</span>
                  {(quick.data ?? []).slice(0, 5).map((it) => <Button key={it.variantId} size="sm" onClick={() => addLine(it, 1000)}>{it.name}</Button>)}
                </div>)}>
                <LinesTable kind="labor" lines={wo.lines} editable={editable} technicians={technicians} onAdd={addLine} onChange={changeLine} onRemove={removeLine} />
              </Panel>
              <Panel title="قطع الغيار (إذن صرف)" icon={<PackageOpen />} sub="الصرف يخصم من المخزن فورًا. حذف البند يرجع الكمية للمخزن." flush actions={editable && !!pkgs.data?.length && (
                <div className="quick">
                  <span className="quick__label">أدراج جاهزة:</span>
                  {pkgs.data.map((pk) => <Button key={pk.id} size="sm" icon={<PackagePlus />} onClick={() => run(() => api(`/work-orders/${id}/packages/${pk.id}`, { method: "POST" }), <>أُضيف «{pk.name}».</>)}>{pk.name}</Button>)}
                </div>)}>
                <LinesTable kind="parts" lines={wo.lines} editable={editable} technicians={technicians} onAdd={addLine} onChange={changeLine} onRemove={removeLine} issueMode />
              </Panel>
              {!editable && (wo.status === "delivered" && !wo.statement
                ? <div className="lock-note" style={{ background: "var(--warn-bg)", color: "var(--warn)", borderColor: "transparent" }}><b>البيان محفوظ على هذا الجهاز وبانتظار الرفع ليأخذ رقمه.</b></div>
                : <p className="hint-line">أمر الشغل مقفول. أي تعديل بعد التسليم يكون على البيان من الإدارة.</p>)}
            </>
          )}

          {tab === "intake" && (
            <div className="stack">
              <Panel title="حالة الجسم عند الاستلام" sub={`${f.n(wo.marks.length)} علامات`}>
                <div className="stack" style={{ gap: 16 }}>
                  <CarDiagram marks={toDiagramMarks(wo.marks)} readOnly />
                  {wo.marks.length > 0 ? (
                    <ul className="marks">
                      {wo.marks.map((m, i) => <li key={m.id}><span className={`pin ${MARK_KIND[m.kind].cls}`}>{i + 1}</span><span><b>{MARK_KIND[m.kind].label}</b> · {m.note}</span><span /></li>)}
                    </ul>
                  ) : <p className="hint-line">لا توجد خدوش أو دقات مسجلة عند الاستلام.</p>}
                </div>
              </Panel>
              <div className="grid-2">
                <Panel title="البنزين والمتعلقات" icon={<Fuel />}>
                  <DL cols={1} items={[
                    { label: "مستوى البنزين", value: wo.fuelLevel ? ["¼", "½", "¾", "ممتلئ"][wo.fuelLevel - 1] : "—" },
                    { label: "المتعلقات بالسيارة", value: wo.belongings?.join("، ") || "لا شيء" },
                  ]} />
                </Panel>
                <Panel title="الشكوى"><p>{wo.complaint ?? "—"}</p></Panel>
              </div>
            </div>
          )}

          {tab === "approvals" && (
            <Panel title="سجل موافقات التكلفة" flush actions={editable && <Button size="sm" onClick={() => setApproveOpen(true)}>تسجيل موافقة</Button>}>
              <table className="table">
                <thead><tr><th>الوقت</th><th className="num">التقدير السابق</th><th className="num">التقدير الجديد</th><th>وافق</th><th>الطريقة</th></tr></thead>
                <tbody>
                  {wo.approvals.map((a) => (
                    <tr key={a.id}><td><When iso={a.approvedAt} /></td><td className="num">{a.oldPt != null ? <Money pt={a.oldPt} cur={false} /> : "—"}</td><td className="num"><Money pt={a.newPt} cur={false} /></td><td>{a.approvedByName}</td><td>{{ phone: "تليفون", whatsapp: "واتساب", in_person: "حضوريًا" }[a.method] ?? a.method}</td></tr>
                  ))}
                  {!wo.approvals.length && <tr><td colSpan={5} className="hint-line" style={{ textAlign: "center" }}>لا توجد تكلفة تقديرية مسجلة.</td></tr>}
                </tbody>
              </table>
            </Panel>
          )}

          {tab === "notes" && <NotesPanel wo={wo} editable={editable} onSave={patchNotes} />}
        </div>

        <aside className="sticky-side stack">
          <div className="totals">
            <div className="totals__title"><span>حتى الآن</span><span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>قبل الخصم</span></div>
            <div className="totals__rows">
              <div className="totals__row"><span>المصنعيات</span><Money pt={t.gross.labor} cur={false} /></div>
              <div className="totals__row"><span>قطع الغيار</span><Money pt={t.gross.part} cur={false} /></div>
              <div className="totals__row"><span>الزيوت</span><Money pt={t.gross.oil} cur={false} /></div>
              <div className="totals__row"><span>الخامات</span><Money pt={t.gross.material} cur={false} /></div>
              <div className="totals__row strong rule"><span>الإجمالي</span><Money pt={t.statementGrossPt} /></div>
            </div>
            {wo.estimatePt != null && (
              <div className={`pay__sum ${over ? "debt" : "done"}`} style={{ fontWeight: 600 }}>
                <span>{over ? "تجاوز التقدير" : "داخل التقدير"} (<Money pt={wo.estimatePt} cur={false} />)</span>
                {over && editable && <Button size="sm" onClick={() => setApproveOpen(true)}>تسجيل موافقة</Button>}
              </div>
            )}
          </div>
          <Panel title="العميل" raised>
            <div className="stack" style={{ gap: 10 }}>
              <p><b>{c.name}</b><br /><span className="num muted">{f.s(c.mobile ?? "")}</span></p>
              <WhatsAppButton phone={c.whatsapp ?? c.mobile} label="محادثة واتساب" />
              {c.internalNotes && <p className="hint-line">ملاحظة داخلية: {c.internalNotes}</p>}
            </div>
          </Panel>
        </aside>
      </div>

      <Dialog open={approveOpen} onClose={() => setApproveOpen(false)} title="تسجيل موافقة على تكلفة جديدة"
        footer={<><Button onClick={() => setApproveOpen(false)}>رجوع</Button><Button variant="primary" disabled={!approval.newPt || !approval.by.trim()} onClick={async () => {
          const r = await run(() => api(`/work-orders/${id}/approvals`, { method: "POST", body: { newPt: toPt(approval.newPt), approvedByName: approval.by, method: approval.method } }), "سُجلت الموافقة.");
          if (r) setApproveOpen(false);
        }}>حفظ الموافقة</Button></>}>
        <div className="form-grid" style={{ ["--cols" as string]: 2 }}>
          <Field label="التقدير السابق"><Input num readOnly value={wo.estimatePt != null ? f.pt(wo.estimatePt) : "—"} /></Field>
          <Field label="التكلفة الجديدة" required><Input num type="number" min={0} value={approval.newPt} placeholder={String(Math.ceil(t.statementGrossPt / 100 / 500) * 500)} onChange={(e) => setApproval({ ...approval, newPt: e.target.value })} /></Field>
          <Field label="وافق" required><Input value={approval.by} placeholder={c.name} onChange={(e) => setApproval({ ...approval, by: e.target.value })} /></Field>
          <Field label="طريقة الموافقة" required>
            <Select value={approval.method} onChange={(e) => setApproval({ ...approval, method: e.target.value as typeof approval.method })}><option value="phone">تليفون</option><option value="whatsapp">واتساب</option><option value="in_person">حضوريًا</option></Select>
          </Field>
        </div>
      </Dialog>

      <Dialog open={sigOpen} onClose={() => setSigOpen(false)} title={`توقيع ${c.name}`}
        footer={<><Button onClick={() => setSigOpen(false)}>رجوع</Button><Button variant="primary" disabled={!sig} onClick={async () => {
          const r = await run(() => api(`/work-orders/${wo.id}/signature`, { method: "POST", body: { dataUrl: sig } }), "تم حفظ التوقيع. يظهر على كارت الإصلاح.");
          if (r) setSigOpen(false);
        }}>حفظ التوقيع</Button></>}>
        {sigOpen && <SignaturePad onSigned={setSig} />}
      </Dialog>

      <Dialog open={remOpen} onClose={() => setRemOpen(false)} title="تذكير بالصيانة القادمة"
        footer={<><Button onClick={() => setRemOpen(false)}>رجوع</Button><Button variant="primary" disabled={!rem.dueDate && !rem.dueKm} onClick={async () => {
          const r = await run(() => api("/reminders", { method: "POST", body: { kind: "service", vehicleId: wo.vehicle!.id, customerId: c.id, dueDate: rem.dueDate || null, dueKm: rem.dueKm ? Number(rem.dueKm) : null, note: rem.note || null } }), "تم حفظ التذكير. يظهر في المذكرات والتنبيهات عند موعده.");
          if (r) { setRemOpen(false); setRem({ dueDate: "", dueKm: "", note: "" }); }
        }}>حفظ التذكير</Button></>}>
        <div className="form-grid" style={{ ["--cols" as string]: 2 }}>
          <Field label="بتاريخ"><Input type="date" value={rem.dueDate} onChange={(e) => setRem({ ...rem, dueDate: e.target.value })} /></Field>
          <Field label="أو عند قراءة العداد (كم)" hint={wo.odometerIn ? `القراءة الآن ${f.n(wo.odometerIn)} كم` : undefined}><Input num value={rem.dueKm} onChange={(e) => setRem({ ...rem, dueKm: e.target.value.replace(/\D/g, "") })} placeholder={wo.odometerIn ? String(wo.odometerIn + 10000) : ""} /></Field>
          <Field label="الصيانة المطلوبة" className="span-all"><Input value={rem.note} onChange={(e) => setRem({ ...rem, note: e.target.value })} placeholder="مثال: تغيير زيت وفلتر" /></Field>
        </div>
      </Dialog>

      <Dialog open={waOpen} onClose={() => setWaOpen(false)} title={`رسالة واتساب إلى ${c.name}`}>
        <div className="stack" style={{ gap: 10 }}>
          <p className="hint-line">تفتح واتساب برسالة جاهزة. النصوص تتعدل من الإعدادات.</p>
          {templates.map((tp) => {
            const text = fillTemplate(tp.text, { "الاسم": firstName(c.name), "السيارة": car, "رقم_الأمر": f.s(wo.number) });
            const href = whatsappLink(c.whatsapp ?? c.mobile ?? "", text);
            return (
              <a key={tp.id} href={href ?? undefined} target="_blank" rel="noreferrer" className="pop__item" style={{ height: "auto", padding: "12px 14px", border: "1px solid var(--line)", textDecoration: "none", display: "grid", gap: 4 }}>
                <b>{tp.label}</b><span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{href ? text : "رقم الواتساب غير صحيح أو غير مسجل."}</span>
              </a>
            );
          })}
        </div>
      </Dialog>
    </div>
  );
}

function NotesPanel({ wo, editable, onSave }: { wo: WorkOrder; editable: boolean; onSave: (p: object) => void }) {
  const [n, setN] = useState({ engineerNotes: wo.engineerNotes ?? "", customerNotes: wo.customerNotes ?? "", internalNotes: wo.internalNotes ?? "" });
  return (
    <Panel title="الملاحظات" footer={editable && <Button variant="secondary" onClick={() => onSave(n)}>حفظ الملاحظات</Button>}>
      <div className="form-grid" style={{ ["--cols" as string]: 1 }}>
        <Field label="ملاحظات المهندس"><Textarea readOnly={!editable} value={n.engineerNotes} onChange={(e) => setN({ ...n, engineerNotes: e.target.value })} /></Field>
        <Field label="ملاحظات العميل" hint="تُطبع على كارت الإصلاح."><Textarea readOnly={!editable} value={n.customerNotes} onChange={(e) => setN({ ...n, customerNotes: e.target.value })} /></Field>
        <Field label="ملاحظات داخلية" hint="لا تُطبع أبدًا ولا تظهر للعميل."><Textarea readOnly={!editable} value={n.internalNotes} onChange={(e) => setN({ ...n, internalNotes: e.target.value })} /></Field>
      </div>
    </Panel>
  );
}
