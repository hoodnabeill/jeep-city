import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { ArrowRight, Printer } from "lucide-react";
import { Button, GRADE_LABEL, Plate, Segmented, useFmt } from "@jc/ui";
import { CarPlate } from "../screens/common";
import { useApi } from "../data/hooks";
import { api } from "../data/api";
import { STATEMENT_KIND, type Customer, type Line, type PaymentMethod, type Statement, type Technician, type WorkOrder } from "../data/types";
import { PageState } from "../shell/Shell";
import { queryParam } from "../lib";
import { CarDiagram, MARK_KIND } from "../screens/CarDiagram";
import { CHECK_LABEL, type Condition } from "../screens/ConditionReport";
import { ReportTable, type ReportData } from "../screens/Reports";
import { QrLabel, savedLabels, useLabelSize } from "../screens/Labels";

/** Shop name, address, phones and printed texts come from Settings. */
type Shop = { nameAr: string; address: string; phones: string; ack: string; terms: string };
function useShop(): Shop | null {
  const s = useApi<Record<string, unknown>>("/settings").data;
  if (!s) return null;
  const phones = Array.isArray(s["shop.phones"]) ? (s["shop.phones"] as string[]).join(" · ") : String(s["shop.phones"] ?? "");
  return { nameAr: String(s["shop.nameAr"] ?? ""), address: String(s["shop.address"] ?? ""), phones: phones || "يُضاف من الإعدادات", ack: String(s["print.ack"] ?? ""), terms: String(s["print.jobCardTerms"] ?? "") };
}

function Stage({ page, back, children, receipt, mode, setMode }: {
  page: string; back: string; children: ReactNode; receipt?: boolean; mode?: "original" | "preview"; setMode?: (m: "original" | "preview") => void;
}) {
  return (
    <div className={`print-stage${receipt ? " print-stage--receipt" : ""}`}>
      <style>{page}</style>
      <div className="print-toolbar">
        <Button icon={<ArrowRight />} onClick={() => history.back()}>{back}</Button>
        {setMode && <Segmented label="نوع النسخة" value={mode!} onChange={setMode} options={[{ value: "original", label: "أصل" }, { value: "preview", label: "معاينة" }]} />}
        <Button variant="primary" icon={<Printer />} onClick={() => print()}>طباعة</Button>
      </div>
      {children}
    </div>
  );
}

function DocHeader({ shop, title, no, noLabel, en }: { shop: Shop; title: string; no: ReactNode; noLabel: string; en?: string }) {
  return (
    <header className="p-head">
      <div className="p-head__shop">
        <b>{shop.nameAr}</b>
        <span>{shop.address}</span>
        <span>تليفون: {shop.phones}</span>
      </div>
      <div className="p-head__title">
        <h1>{title}{en && <span className="lat">{en}</span>}</h1>
        <div className="p-head__no"><span>{noLabel}</span><b className="lat">{no}</b></div>
      </div>
      <img src="/brand/horizontal-black.svg" alt="Jeep City El Tantawy USA" className="p-head__logo" />
    </header>
  );
}

const Cell = ({ l, v, en, span }: { l: string; v: ReactNode; en?: string; span?: number }) => (
  <div className="p-cell" style={span ? { gridColumn: `span ${span}` } : undefined}>
    <span className="p-cell__l"><span className="p-ar">{l}</span>{en && <span className="p-en">{en}</span>}</span>
    <span className="p-cell__v">{v}</span>
  </div>
);
const PlateText = ({ v }: { v?: { plateType?: string | null; plateLetters: string | null; plateDigits: string | null } | null }) =>
  v?.plateLetters || v?.plateDigits ? <CarPlate v={v} /> : <>—</>;

/** Statement + its work order (or customer for a direct sale) + payment method names + technician names. */
function useStatementPrint(id: string) {
  const st = useApi<Statement>(`/statements/${id}`);
  const wo = useApi<WorkOrder>(st.data?.workOrderId ? `/work-orders/${st.data.workOrderId}` : null);
  const cust = useApi<Customer>(st.data && !st.data.workOrderId ? `/customers/${st.data.customerId}` : null);
  const methods = useApi<PaymentMethod[]>("/payment-methods");
  const techs = useApi<Technician[]>("/technicians");
  const shop = useShop();
  const ready = st.data && methods.data && shop && (st.data.workOrderId ? wo.data : cust.data);
  const error = st.error ?? wo.error ?? cust.error;
  return { ready: !!ready, error, s: st.data!, wo: wo.data, customerName: wo.data?.customer.name ?? cust.data?.name ?? "", mobile: wo.data?.customer.mobile ?? cust.data?.mobile ?? "", methods: methods.data ?? [], techs: techs.data ?? [], shop: shop! };
}

function netPayments(s: Statement) {
  const m = new Map<string, { amountPt: number; reference: string | null }>();
  for (const p of s.payments) { const x = m.get(p.methodId) ?? { amountPt: 0, reference: null }; m.set(p.methodId, { amountPt: x.amountPt + p.amountPt, reference: p.reference ?? x.reference }); }
  return [...m].filter(([, x]) => x.amountPt > 0).map(([methodId, x]) => ({ methodId, ...x }));
}

/* ---------- A4 customer statement (بيان عميل) ---------- */
export function PrintStatement({ id }: { id: string }) {
  const d = useStatementPrint(id);
  const f = useFmt();
  const [mode, setMode] = useState<"original" | "preview">("original");
  if (!d.ready) return <div className="print-stage"><PageState loading={!d.error} error={d.error} /></div>;
  const { s, wo, shop } = d;
  const v = wo?.vehicle;
  const t = s.totals;
  const T = ({ l, pt, b }: { l: string; pt: number; b?: boolean }) => <tr className={b ? "b" : ""}><th>{l}</th><td className="lat">{f.pt(pt)}</td></tr>;
  const label = (mid: string) => d.methods.find((m) => m.id === mid)?.label ?? mid;
  return (
    <Stage page="@page { size: A4; margin: 10mm; }" back="رجوع للبيان" mode={mode} setMode={setMode}>
      <article className="sheet">
        {(mode === "preview" || s.status === "cancelled") && <div className="p-watermark" aria-hidden>{s.status === "cancelled" ? "ملغي" : "معاينة"}</div>}
        <DocHeader shop={shop} title={STATEMENT_KIND[s.kind]} no={f.s(s.number)} noLabel="رقم البيان" />
        <section className="p-grid p-grid--4">
          <Cell l="رقم أمر الشغل" v={<span className="lat">{wo ? f.s(wo.number) : "—"}</span>} />
          <Cell l="تاريخ البيان" v={<span className="lat">{f.date(s.statementDate)}</span>} />
          <Cell l="تاريخ الدخول" v={<span className="lat">{wo ? f.date(wo.enteredAt) : "—"}</span>} />
          <Cell l="وقت الدخول" v={wo ? f.time(wo.enteredAt) : "—"} />
          <Cell l="اسم العميل" v={d.customerName} span={2} />
          <Cell l="تاريخ الخروج" v={<span className="lat">{s.exitAt ? f.date(s.exitAt) : "—"}</span>} />
          <Cell l="وقت الخروج" v={s.exitAt ? f.time(s.exitAt) : "—"} />
          <Cell l="رقم اللوحة" v={<PlateText v={v} />} />
          <Cell l="رقم الشاسيه" v={<span className="lat">{v?.chassis ?? "—"}</span>} span={2} />
          <Cell l="طراز السيارة" v={<span className="lat">{v ? [v.make?.toUpperCase(), v.variant ?? v.model?.toUpperCase()].filter(Boolean).join(" ") : "—"}</span>} />
          <Cell l="عداد كم" v={<span className="lat">{wo?.odometerIn != null ? f.n(wo.odometerIn) : "—"}</span>} />
          <Cell l="مهندس الاستقبال" v={wo?.engineer ?? "—"} />
          <Cell l="الموبايل" v={<span className="lat">{f.s(d.mobile ?? "—")}</span>} span={2} />
        </section>

        <h2 className="p-h2">المصنعيات</h2>
        <PTable rows={s.lines.filter((l) => l.category === "labor")} kind="labor" techs={d.techs} />
        <h2 className="p-h2">قطع الغيار</h2>
        <PTable rows={s.lines.filter((l) => l.category !== "labor")} kind="parts" techs={d.techs} />

        <section className="p-bottom">
          <div className="p-notes">
            <div className="p-box"><span className="p-cell__l">أعمال هامة لم تتم بالسيارة</span><p>{s.notDone || "—"}</p></div>
            <div className="p-box"><span className="p-cell__l">طرق الدفع</span>
              <p>{netPayments(s).map((p) => `${label(p.methodId)} ${f.pt(p.amountPt)}${p.reference ? ` (مرجع ${p.reference})` : ""}`).join(" · ") || "—"}</p>
            </div>
            <p className="p-ack">{shop.ack}</p>
            <div className="p-signs"><div>توقيع العميل</div><div>إدارة الحسابات</div></div>
          </div>
          <div className="p-totals">
            <table>
              <tbody>
                <T l="إجمالي المصنعيات" pt={t.laborGrossPt} />
                <T l="إجمالي قطع الغيار" pt={t.partsGrossPt} />
                <T l="إجمالي خصم" pt={t.discountPt} />
                <T l="صافي المصنعيات" pt={t.laborNetPt} />
                <T l="صافي قطع الغيار" pt={t.partsNetPt} />
                <T l="صافي الزيوت" pt={t.oilsNetPt} />
                <T l="إجمالي خامات" pt={t.materialsPt} />
                <T l="إجمالي بيان" pt={t.statementGrossPt} b />
              </tbody>
            </table>
            <div className="p-due"><span>أجمالي المطلوب</span><b className="lat">{f.pt(t.amountDuePt)} <small>ج.م</small></b></div>
            <p className="p-words">{s.amountInWords}</p>
          </div>
        </section>
        <footer className="p-foot">
          <span className="lat">EL REHAB · NEW CAIRO</span>
          {wo && s.status === "final" && <StatusQr workOrderId={wo.id} />}
          <span className="p-foot__mode">{mode === "original" ? "أصل" : "معاينة"} · طُبع {f.date(new Date().toISOString())}</span>
        </footer>
      </article>
    </Stage>
  );
}

function PTable({ rows, kind, techs }: { rows: Line[]; kind: "labor" | "parts"; techs: Technician[] }) {
  const f = useFmt();
  const value = (l: Line) => Math.round((l.qtyMilli * l.unitPricePt) / 1000);
  const sum = rows.reduce((a, l) => a + value(l), 0);
  return (
    <table className="p-table">
      <thead>
        <tr>
          <th style={{ width: "13%" }}>كود الصنف</th><th>اسم الصنف</th>
          {kind === "parts" && <th style={{ width: "9%" }}>الجودة</th>}
          <th style={{ width: "10%" }}>{kind === "labor" ? "الوقت / الكمية" : "الكمية"}</th>
          <th style={{ width: "11%" }}>السعر</th><th style={{ width: "12%" }}>القيمة</th><th style={{ width: "15%" }}>اسم الفني</th>
          {kind === "labor" && <th style={{ width: "11%" }}>انتهاء العمل</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => (
          <tr key={l.id}>
            <td className="lat">{l.code}</td><td>{l.name}</td>
            {kind === "parts" && <td>{l.grade ? <span className={`p-grade p-grade--${l.grade}`}>{GRADE_LABEL[l.grade]}</span> : "—"}</td>}
            <td className="lat c">{f.n(l.qtyMilli / 1000)}</td><td className="lat c">{f.pt(l.unitPricePt)}</td><td className="lat c">{f.pt(value(l))}</td>
            <td>{l.technician ?? techs.find((t) => t.id === l.technicianId)?.name ?? ""}</td>
            {kind === "labor" && <td>{l.finishedAt ? f.time(l.finishedAt) : ""}</td>}
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={8} className="c">—</td></tr>}
      </tbody>
      <tfoot><tr><td colSpan={kind === "parts" ? 5 : 4}>الإجمالي</td><td className="lat c">{f.pt(sum)}</td><td colSpan={2} /></tr></tfoot>
    </table>
  );
}

/* ---------- A4 Job Card (كارت إصلاح) ---------- */
export function PrintJobCard({ id }: { id: string }) {
  const q = useApi<WorkOrder>(`/work-orders/${id}`);
  const cust = useApi<Customer>(q.data ? `/customers/${q.data.customer.id}` : null);
  const sig = useApi<{ dataUrl: string | null }>(`/work-orders/${id}/signature`);
  const shop = useShop();
  const f = useFmt();
  if (!q.data || !shop) return <div className="print-stage"><PageState loading={!q.error} error={q.error} /></div>;
  const wo = q.data, v = wo.vehicle, c = cust.data;
  const box = (on: boolean) => <span className={`p-check${on ? " on" : ""}`} aria-hidden />;
  const lastApproval = wo.approvals.length > 1 ? wo.approvals[wo.approvals.length - 1] : null;
  return (
    <Stage page="@page { size: A4; margin: 9mm; }" back="رجوع لأمر الشغل">
      <article className="sheet sheet--dense">
        <DocHeader shop={shop} title="كارت إصلاح" en="JOB CARD" no={f.s(wo.number)} noLabel="رقم الكارت" />
        <section className="p-grid p-grid--4">
          <Cell l="التاريخ" en="Date" v={<span className="lat">{f.date(wo.enteredAt)}</span>} />
          <Cell l="وقت الدخول" en="Entry time" v={f.time(wo.enteredAt)} />
          <Cell l="الفرع" en="Branch" v="الرحاب" />
          <Cell l="ميعاد التسليم" en="Delivery" v={wo.expectedAt ? <><span className="lat">{f.date(wo.expectedAt)}</span> {f.time(wo.expectedAt)}</> : "—"} />
          <Cell l="اسم العميل" en="Customer" v={wo.customer.name} span={2} />
          <Cell l="الموبايل" en="Mobile" v={<span className="lat">{f.s(wo.customer.mobile ?? "—")}</span>} />
          <Cell l="تليفون" en="Phone" v={<span className="lat">{c?.officePhone ? f.s(c.officePhone) : "—"}</span>} />
          <Cell l="العنوان" en="Address" v={c?.address ?? "—"} span={2} />
          <Cell l="مهندس الاستقبال" en="Service advisor" v={wo.engineer ?? "—"} />
          <Cell l="الفني" en="Technician" v={wo.technicians.map((t) => t.name).join("، ") || "—"} />
          <Cell l="الماركة / الموديل / السنة" en="Make / Model / Year" v={<span className="lat">{v ? `${[v.make, v.model, v.variant].filter(Boolean).join(" ")}${v.year ? ` · ${v.year}` : ""}` : "—"}</span>} span={2} />
          <Cell l="رقم اللوحة" en="Plate" v={<PlateText v={v} />} />
          <Cell l="عداد الدخول" en="Odometer in" v={<span className="lat">{wo.odometerIn != null ? `${f.n(wo.odometerIn)} km` : "—"}</span>} />
          <Cell l="رقم الشاسيه" en="VIN" v={<span className="lat">{v?.chassis ?? "—"}</span>} span={2} />
          <Cell l="ساعات العمل" en="Work hours" v="" />
          <Cell l="نوع الأمر" en="Order type" v={wo.type === "repair" ? "إصلاح" : wo.type === "inquiry" ? "استعلام" : "تقرير حالة"} />
        </section>
        <div className="p-box p-box--tall"><span className="p-cell__l">الشكوى<span className="p-en">Complaint</span></span><p>{wo.complaint}</p></div>
        <section className="p-two">
          <div>
            <span className="p-cell__l">حالة السيارة عند الاستلام<span className="p-en">Vehicle condition</span></span>
            <div className="p-diagram"><CarDiagram marks={wo.marks.map((m, i) => ({ id: i + 1, x: m.x / 10, y: m.y / 10, kind: m.kind, note: m.note ?? "" }))} readOnly /></div>
            <ol className="p-marks">{wo.marks.map((m, i) => <li key={m.id}><b>{i + 1}</b> {MARK_KIND[m.kind].label}: {m.note}</li>)}{wo.marks.length === 0 && <li>لا توجد علامات</li>}</ol>
          </div>
          <div className="p-side">
            <span className="p-cell__l">المتعلقات<span className="p-en">Belongings</span></span>
            <ul className="p-checks">
              {[["موبايل", "Mobile"], ["عدة", "Tool kit"], ["إريال راديو", "Radio aerial"], ["استبن", "Spare wheel"], ["ولاعة سجاير", "Cigarette lighter"]].map(([a, e]) => (
                <li key={a}>{box(!!wo.belongings?.includes(a))}<span><span className="p-ar">{a}</span><span className="p-en">{e}</span></span></li>
              ))}
            </ul>
            <span className="p-cell__l">مستوى البنزين<span className="p-en">Fuel</span></span>
            <div className="p-fuel">{["¼", "½", "¾", "Full"].map((l, i) => <span key={l} className={i + 1 === wo.fuelLevel ? "on" : ""}>{l}</span>)}</div>
          </div>
        </section>
        <section className="p-grid p-grid--4">
          <Cell l="التكلفة التقديرية" en="Estimate" v={<span className="lat">{wo.approvals[0] ? f.pt(wo.approvals[0].newPt) : wo.estimatePt ? f.pt(wo.estimatePt) : ""}</span>} />
          <Cell l="تقدير جديد" en="New estimate" v={<span className="lat">{lastApproval ? f.pt(lastApproval.newPt) : ""}</span>} />
          <Cell l="وافق عليه" en="Approved by" v={lastApproval?.approvedByName ?? ""} />
          <Cell l="التاريخ" en="Date" v={<span className="lat">{lastApproval ? f.date(lastApproval.approvedAt) : ""}</span>} />
        </section>
        <p className="p-terms">{box(true)} أوافق على استكمال الإصلاح إذا زادت التكلفة عن التقدير، بحد أقصى ________<span className="p-en">Authority to continue if the estimate is exceeded</span></p>
        {shop.terms ? <p className="p-terms">{shop.terms}</p> : <p className="p-terms p-placeholder">[شروط كارت الإصلاح: يُكتب هنا النص المعتمد من الورشة في الإعدادات ← النصوص]</p>}
        <div className="p-signs">
          <div><span><span className="p-ar">أعده</span><span className="p-en">Prepared by</span></span><b>{wo.engineer}</b></div>
          <div><span><span className="p-ar">توقيع العميل</span><span className="p-en">Customer signature</span></span>{sig.data?.dataUrl && <img src={sig.data.dataUrl} alt="توقيع العميل" className="p-sig" />}</div>
        </div>
        <footer className="p-foot"><span className="lat">EL REHAB · NEW CAIRO</span><StatusQr workOrderId={wo.id} /><span className="p-foot__mode">نسخة العميل</span></footer>
      </article>
    </Stage>
  );
}

/* ---------- A4 condition report (design reference; data arrives with the condition-report module) ---------- */
export function PrintCondition({ id }: { id: string }) {
  const woq = useApi<WorkOrder>(`/work-orders/${id}`);
  const cq = useApi<Condition>(`/work-orders/${id}/condition`);
  const f = useFmt();
  const shop = useShop();
  const wo = woq.data;
  if (!wo || !cq.data || !shop) return <div className="print-stage"><PageState loading={!woq.error && !cq.error} error={woq.error ?? cq.error} /></div>;
  if (!cq.data.saved) return <div className="print-stage"><PageState loading={false} error={{ message: "احفظ تقرير الحالة أولًا ثم اطبعه." }} /></div>;
  const v = wo.vehicle, c = wo.customer;
  const report = cq.data.items;
  const systems = [...new Set(report.map((x) => x.system))];
  const recs = report.filter((x) => x.status !== "good" && x.recommendedText);
  const n = (s: string) => report.filter((x) => x.status === s).length;
  return (
    <Stage page="@page { size: A4; margin: 10mm; }" back="رجوع لتقرير الحالة">
      <article className="sheet">
        <DocHeader shop={shop} title="تقرير حالة السيارة" no={f.s(wo.number)} noLabel="أمر شغل" />
        <section className="p-grid p-grid--4">
          <Cell l="العميل" v={c.name} span={2} />
          <Cell l="السيارة" v={<span className="lat">{v?.make} {v?.model} {v?.year ?? ""}</span>} />
          <Cell l="رقم اللوحة" v={<PlateText v={v} />} />
          <Cell l="الشاسيه" v={<span className="lat">{v?.chassis ?? "—"}</span>} span={2} />
          <Cell l="العداد" v={<span className="lat">{wo.odometerIn != null ? `${f.n(wo.odometerIn)} km` : "—"}</span>} />
          <Cell l="تاريخ الفحص" v={<span className="lat">{f.date(cq.data.updatedAt ?? wo.enteredAt)}</span>} />
        </section>
        <div className="p-summary">
          <span className="p-st p-st--good">{f.n(n("good"))} ممتاز</span>
          <span className="p-st p-st--watch">{f.n(n("watch"))} يحتاج متابعة</span>
          <span className="p-st p-st--urgent">{f.n(n("urgent"))} عاجل</span>
        </div>
        <table className="p-table">
          <thead><tr><th style={{ width: "14%" }}>النظام</th><th style={{ width: "22%" }}>البند</th><th style={{ width: "17%" }}>الحالة</th><th>ملاحظات الفني</th></tr></thead>
          <tbody>
            {systems.flatMap((s) => {
              const rows = report.filter((x) => x.system === s);
              return rows.map((x, i) => (
                <tr key={s + x.item}>
                  {i === 0 && <td rowSpan={rows.length} className="p-sys">{s}</td>}
                  <td>{x.item}</td><td><span className={`p-st p-st--${x.status}`}>{CHECK_LABEL[x.status]}</span></td><td>{x.note ?? ""}</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
        <h2 className="p-h2">الأعمال المقترحة والتكلفة التقديرية</h2>
        <table className="p-table">
          <thead><tr><th>العمل</th><th style={{ width: "18%" }}>الأولوية</th><th style={{ width: "16%" }}>التكلفة</th></tr></thead>
          <tbody>{recs.map((r) => <tr key={r.id ?? r.item}><td>{r.recommendedText}</td><td><span className={`p-st p-st--${r.status}`}>{CHECK_LABEL[r.status]}</span></td><td className="lat c">{r.recommendedPricePt != null ? f.pt(r.recommendedPricePt) : "—"}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={2}>الإجمالي التقديري</td><td className="lat c">{f.pt(recs.reduce((a, r) => a + (r.recommendedPricePt ?? 0), 0))}</td></tr></tfoot>
        </table>
        <footer className="p-foot"><span>هذا التقرير يعبر عن حالة السيارة وقت الفحص. الأسعار تقديرية.<br /><span className="lat">EL REHAB · NEW CAIRO</span></span><StatusQr workOrderId={wo.id} /><span className="p-foot__mode">الفاحص: {wo.engineer ?? ""}</span></footer>
      </article>
    </Stage>
  );
}

/* ---------- 80 mm thermal receipt ---------- */
export function PrintReceipt({ id }: { id: string }) {
  const d = useStatementPrint(id);
  const f = useFmt();
  if (!d.ready) return <div className="print-stage"><PageState loading={!d.error} error={d.error} /></div>;
  const { s, wo, shop } = d;
  const v = wo?.vehicle;
  const t = s.totals;
  return (
    <Stage page="@page { size: 80mm auto; margin: 3mm; }" back="رجوع للبيان" receipt>
      <article className="receipt">
        <img src="/brand/horizontal-black.svg" alt="Jeep City El Tantawy USA" />
        <p className="r-c">{shop.address}<br />{shop.phones}</p>
        <hr />
        <p className="r-row"><span>{s.kind === "direct_sale" ? "بيع مباشر" : s.kind === "byte" ? "بيان بايت" : "بيان"} رقم</span><b className="lat">{f.s(s.number)}</b></p>
        <p className="r-row"><span>التاريخ</span><span className="lat">{f.date(s.statementDate)} {s.exitAt ? f.time(s.exitAt) : ""}</span></p>
        <p className="r-row"><span>العميل</span><span>{d.customerName}</span></p>
        {v && <p className="r-row"><span>اللوحة</span><PlateText v={v} /></p>}
        <hr />
        {s.lines.map((l) => (
          <div key={l.id} className="r-line">
            <span>{l.name}{l.grade ? ` (${GRADE_LABEL[l.grade]})` : ""}</span>
            <span className="r-row"><span className="lat">{f.n(l.qtyMilli / 1000)} × {f.pt(l.unitPricePt)}</span><b className="lat">{f.pt(Math.round((l.qtyMilli * l.unitPricePt) / 1000))}</b></span>
          </div>
        ))}
        <hr />
        <p className="r-row"><span>إجمالي بيان</span><span className="lat">{f.pt(t.statementGrossPt)}</span></p>
        <p className="r-row"><span>إجمالي خصم</span><span className="lat">{f.pt(t.discountPt)}</span></p>
        <p className="r-row r-due"><span>المطلوب</span><b className="lat">{f.pt(t.amountDuePt)}</b></p>
        <p className="r-c r-words">{s.amountInWords}</p>
        <hr />
        {netPayments(s).map((p) => <p key={p.methodId} className="r-row"><span>{d.methods.find((m) => m.id === p.methodId)?.label ?? p.methodId}{p.reference ? ` · ${p.reference}` : ""}</span><span className="lat">{f.pt(p.amountPt)}</span></p>)}
        <hr />
        <p className="r-c">شكرًا لزيارتك Jeep City<br /><span className="lat">EL REHAB · NEW CAIRO</span></p>
      </article>
    </Stage>
  );
}


/** Any report of the general report, A4 landscape with the shop header (print or save as PDF). */
export function PrintReport({ id }: { id: string }) {
  const f = useFmt();
  const from = queryParam("from") ?? "", to = queryParam("to") ?? "";
  const q = useApi<ReportData>(`/reports/${id}?from=${from}&to=${to}`);
  const shop = useShop();
  if (!q.data || !shop) return <div className="print-stage"><PageState loading={!q.error} error={q.error} /></div>;
  const r = q.data;
  return (
    <Stage page="@page { size: A4 landscape; margin: 10mm; }" back="رجوع للتقرير">
      <article className="sheet sheet--landscape">
        <DocHeader shop={shop} title={r.title} no={from === to ? f.date(from) : `${f.date(from)} – ${f.date(to)}`} noLabel="الفترة" />
        {r.summary?.profitPt !== undefined && (
          <p className="p-note">صافي الربح {f.pt(r.summary.profitPt)} = مبيعات النظام الجديد {f.pt(r.summary.newSalesPt)} − تكلفة القطع {f.pt(r.summary.cogsPt)} − المصروفات {f.pt(r.summary.expensesPt)}</p>
        )}
        <div className="p-report"><ReportTable r={r} /></div>
        {r.note && <p className="p-note">{r.note}</p>}
        <p className="p-note">طُبع في {f.date(new Date().toISOString())}</p>
      </article>
    </Stage>
  );
}

/** Small QR to the customer's status page. A new link per print; nothing shows when offline. */
function StatusQr({ workOrderId }: { workOrderId: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    api<{ token: string; baseUrl: string | null }>("/share", { method: "POST", body: { workOrderId } })
      .then(async (r) => {
        const base = (r.baseUrl || `${location.origin}${location.pathname}`).replace(/\/$/, "");
        const s = await QRCode.toString(`${base}#/s/${r.token}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
        if (alive) setSvg(s);
      })
      .catch(() => { /* offline: the print goes out without the QR */ });
    return () => { alive = false; };
  }, [workOrderId]);
  if (!svg) return null;
  return <span className="p-qr"><span className="p-qr__code" dangerouslySetInnerHTML={{ __html: svg }} /><span>امسح لمتابعة حالة سيارتك</span></span>;
}

/** QR labels chosen in the label maker: one label per page at the label size (thermal label printer). */
export function PrintLabels() {
  const size = useLabelSize();
  const { rows, price } = savedLabels();
  const all = rows.flatMap((r) => Array.from({ length: r.copies }, (_, i) => ({ r, key: `${r.variantId}-${i}` })));
  return (
    <Stage page={`@page { size: ${size.w}mm ${size.h}mm; margin: 0; }`} back="رجوع لصانع الملصقات" receipt>
      <div className="label-run">
        {all.map(({ r, key }) => <div key={key} className="label-run__page"><QrLabel r={r} size={size} price={price} /></div>)}
        {!all.length && <p className="hint-line">لم تختر ملصقات. ارجع لصانع الملصقات.</p>}
      </div>
    </Stage>
  );
}
