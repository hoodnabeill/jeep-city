import { useState } from "react";
import { firstName, toPt } from "@jc/core";
import { Banknote, CarFront, Gauge, History as HistoryIcon, Plus, Search, UserPlus } from "lucide-react";
import { Button, Chip, DL, Dialog, Field, Input, Money, Panel, Select, useFmt, When } from "@jc/ui";
import { PageHead, PageState } from "../shell/Shell";
import { go, Link, queryParam, useIsAdmin } from "../lib";
import { api } from "../data/api";
import { qs, useAction, useApi } from "../data/hooks";
import type { Customer, History, LedgerRow, PaymentMethod } from "../data/types";
import { carName, CarPlate, EMPTY_PLATE, plateError, PlateInput, StatusBadge, WhatsAppButton } from "./common";
import { usePlateTypes } from "../data/plates";

export function Customers() {
  const f = useFmt();
  const isAdmin = useIsAdmin();
  const run = useAction();
  const [q, setQ] = useState("");
  const [debt, setDebt] = useState(queryParam("debt") === "1");
  const [newOpen, setNewOpen] = useState(false);
  const [nc, setNc] = useState({ name: "", mobile: "", address: "" });
  const list = useApi<{ rows: Customer[]; total: number }>(`/customers?${qs({ q: q.trim() || undefined, debt: debt ? "1" : undefined })}`);
  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  return (
    <div>
      <PageHead title="العملاء والسيارات" sub={total > rows.length ? <>آخر {f.n(rows.length)} عميل زاروا الورشة من {f.n(total)} · ابحث بالاسم أو الموبايل للوصول لأي عميل</> : <>{f.n(total)} عميل</>}
        actions={<Button variant="primary" icon={<UserPlus />} onClick={() => setNewOpen(true)}>عميل جديد</Button>} />
      <div className="toolbar">
        <div className="input-group grow"><Search /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="الاسم أو الموبايل" aria-label="بحث في العملاء" /></div>
        {isAdmin && <Chip pressed={debt} onToggle={() => setDebt(!debt)}>عليهم مديونية</Chip>}
      </div>
      <PageState loading={list.loading && !list.data} error={list.error} onRetry={list.reload} />
      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>العميل</th><th>الموبايل</th><th>السيارات</th><th>عميل منذ</th>{isAdmin && <th className="num">المديونية</th>}<th><span className="sr-only">واتساب</span></th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="is-clickable" tabIndex={0} onClick={() => go(`/customers/${c.id}`)} onKeyDown={(e) => e.key === "Enter" && go(`/customers/${c.id}`)}>
                  <td><span className="cell-main">{c.name}</span>{c.address && <span className="cell-sub">{c.address}</span>}</td>
                  <td className="num" style={{ textAlign: "right" }}>{f.s(c.mobile ?? "—")}</td>
                  <td><span className="row" style={{ gap: 6 }}>{c.vehicles.slice(0, 3).map((v) => <CarPlate key={v.id} v={v} />)}{c.vehicles.length > 3 && <span className="subtle">+{f.n(c.vehicles.length - 3)} سيارة</span>}</span></td>
                  <td><When iso={c.createdAt} time={false} /></td>
                  {isAdmin && <td className="num">{(c.balancePt ?? 0) > 0 ? <span style={{ color: "var(--warn)", fontWeight: 700 }}><Money pt={c.balancePt!} cur={false} /></span> : <span className="subtle">—</span>}</td>}
                  <td onClick={(e) => e.stopPropagation()}><WhatsAppButton phone={c.whatsapp ?? c.mobile} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Dialog open={newOpen} onClose={() => setNewOpen(false)} title="عميل جديد"
        footer={<><Button onClick={() => setNewOpen(false)}>رجوع</Button><Button variant="primary" disabled={nc.name.trim().length < 2} onClick={async () => {
          const r = await run(() => api<{ id: string }>("/customers", { method: "POST", body: { name: nc.name, mobile: nc.mobile || null, whatsapp: nc.mobile || null, address: nc.address || null } }), "تمت إضافة العميل.");
          if (r) { setNewOpen(false); go(`/customers/${r.id}`); }
        }}>حفظ</Button></>}>
        <div className="form-grid" style={{ ["--cols" as string]: 2 }}>
          <Field label="الاسم" required><Input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} /></Field>
          <Field label="الموبايل" hint="يُستخدم للواتساب"><Input num value={nc.mobile} onChange={(e) => setNc({ ...nc, mobile: e.target.value })} placeholder="010xxxxxxxx" /></Field>
          <Field label="العنوان" className="span-all"><Input value={nc.address} onChange={(e) => setNc({ ...nc, address: e.target.value })} /></Field>
        </div>
      </Dialog>
    </div>
  );
}

export function CustomerFile({ id, vehicleId }: { id?: string; vehicleId?: string }) {
  const f = useFmt();
  const isAdmin = useIsAdmin();
  const run = useAction();
  const hist0 = useApi<History>(vehicleId ? `/vehicles/${vehicleId}/history` : null);
  const customerId = id ?? hist0.data?.vehicle.customerId;
  const cq = useApi<Customer>(customerId ? `/customers/${customerId}` : null);
  const [carId, setCarId] = useState<string | undefined>(vehicleId);
  const c = cq.data;
  const activeCar = carId ?? c?.vehicles[0]?.id;
  const hist = useApi<History>(activeCar ? `/vehicles/${activeCar}/history` : null);
  const ledger = useApi<LedgerRow[]>(isAdmin && customerId ? `/customers/${customerId}/ledger` : null);
  const methods = useApi<PaymentMethod[]>("/payment-methods");
  const [collect, setCollect] = useState<{ methodId: string; amount: string; reference: string } | null>(null);
  const [carOpen, setCarOpen] = useState(false);
  const [nv, setNv] = useState({ ...EMPTY_PLATE, chassis: "", make: "Jeep", model: "", year: "" });
  const plateTypes = usePlateTypes();
  if (!c) return <PageState loading={cq.loading || hist0.loading} error={cq.error ?? hist0.error} onRetry={cq.reload} />;
  const h = hist.data;
  const car = h?.vehicle;
  const lastKm = h?.odometer[0]?.km;
  return (
    <div className="stack">
      <PageHead back={{ to: "/customers", label: "العملاء والسيارات" }} title={c.name}
        sub={<><span className="num">{f.s(c.mobile ?? "—")}</span>{c.officePhone && <> · مكتب <span className="num">{f.s(c.officePhone)}</span></>}{c.address && <> · {c.address}</>} · عميل منذ <span className="num">{f.date(c.createdAt)}</span></>}
        actions={<>
          <WhatsAppButton phone={c.whatsapp ?? c.mobile} size="md" label="واتساب" />
          {isAdmin && (c.balancePt ?? 0) > 0 && <Button icon={<Banknote />} onClick={() => setCollect({ methodId: "cash", amount: String((c.balancePt ?? 0) / 100), reference: "" })}>تحصيل مديونية</Button>}
          <Button variant="primary" icon={<Plus />} onClick={() => go("/intake")}>استقبال سيارة</Button>
        </>} />

      {isAdmin && (c.balancePt ?? 0) > 0 && (
        <div className="lock-note" style={{ background: "var(--warn-bg)", borderColor: "transparent", color: "var(--warn)" }}>
          <Banknote /><div><b>على العميل <Money pt={c.balancePt!} /></b><br /><span>من البيانات الآجلة. التفاصيل في كشف الحساب بالأسفل.</span></div>
        </div>
      )}
      {!isAdmin && c.hasDebt && <div className="lock-note"><Banknote /><div><b>عليه مديونية.</b> <span className="muted">التحصيل من الإدارة.</span></div></div>}

      <div className="car-switch" role="tablist" aria-label="سيارات العميل">
        {c.vehicles.map((v) => (
          <a key={v.id} href={`#/cars/${v.id}`} aria-current={v.id === activeCar} role="tab" onClick={(e) => { e.preventDefault(); setCarId(v.id); }}>
            <CarPlate v={v} />
            <span><b className="lat">{carName(v)}</b><span>{[v.year, v.color].filter(Boolean).join(" · ")}</span></span>
          </a>
        ))}
        <button type="button" className="chip chip--add" style={{ minHeight: 62 }} onClick={() => setCarOpen(true)}><CarFront size={16} />إضافة سيارة</button>
      </div>

      {car ? (
        <div className="grid-main-side">
          <Panel title="سجل الزيارات والصيانة" icon={<HistoryIcon />}>
            <ol className="timeline">
              {h!.visits.map(({ workOrder: w, lines, statement }) => (
                <li key={w.id} className="visit">
                  <div className="visit__date"><b>{f.date(w.enteredAt)}</b>{w.odometerIn != null && <span className="num" style={{ textAlign: "right" }}>{f.n(w.odometerIn)} كم</span>}</div>
                  <div className="visit__body">
                    <div className="visit__head">
                      <Link to={`/work-orders/${w.id}`} className="link">أمر شغل {f.s(w.number)}</Link>
                      {statement && <Link to={`/statements/${statement.id}`} className="link">بيان {f.s(statement.number)}</Link>}
                      <StatusBadge status={w.status} />
                      {w.engineer && <span className="hint-line">{w.engineer}</span>}
                    </div>
                    {w.complaint && <p>{w.complaint}</p>}
                    {lines.length > 0 && <p className="visit__lines">{lines.map((l) => l.name).join(" · ")}</p>}
                    {statement && <p><b>المطلوب <Money pt={statement.amountDuePt} /></b></p>}
                  </div>
                </li>
              ))}
              {!h!.visits.length && <li className="hint-line">لا توجد زيارات لهذه السيارة بعد.</li>}
            </ol>
          </Panel>
          <aside className="stack sticky-side">
            <Panel title="ملف السيارة" raised>
              <div className="stack" style={{ gap: 14 }}>
                <CarPlate v={car} size="lg" />
                <DL cols={2} items={[
                  { label: "الشاسيه", value: <span className="lat" style={{ fontSize: 13 }}>{car.chassis ?? "—"}</span> },
                  { label: "رقم الرخصة", value: <span className="num">{f.s(car.licenseNo ?? "—")}</span> },
                  { label: "المحرك", value: <span className="lat">{car.engineSize ?? "—"}</span> },
                  { label: "اللون", value: car.color ?? "—" },
                ]} />
              </div>
            </Panel>
            <Panel title="العداد" icon={<Gauge />} flush>
              <table className="table table--compact">
                <thead><tr><th>التاريخ</th><th className="num">كم</th><th className="num">الفرق</th></tr></thead>
                <tbody>
                  {h!.odometer.map((o, i) => (
                    <tr key={i}>
                      <td className="num" style={{ textAlign: "right" }}>{f.date(o.at)}</td>
                      <td className="num">{f.n(o.km)}</td>
                      <td className="num" style={{ color: "var(--ok)" }}>{h!.odometer[i + 1] ? `+${f.n(o.km - h!.odometer[i + 1].km)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            {lastKm !== undefined && (
              <Panel title="تذكير الصيانة القادمة">
                <div className="stack" style={{ gap: 12 }}>
                  <p>تغيير الزيت القادم تقريبًا عند <b className="num">{f.n(lastKm + 10000)}</b> كم.</p>
                  <WhatsAppButton phone={c.whatsapp ?? c.mobile} label="تذكير العميل على واتساب" text={`أهلًا ${firstName(c.name)}، ميعاد تغيير زيت ${carName(car)} قرب. تحب نحجز لك ميعاد في Jeep City؟`} />
                </div>
              </Panel>
            )}
            {c.internalNotes && <Panel title="ملاحظة داخلية" raised><p className="hint-line">{c.internalNotes}</p></Panel>}
          </aside>
        </div>
      ) : <PageState loading={hist.loading} error={hist.error} />}

      {isAdmin && !!ledger.data?.length && (
        <Panel title="كشف حساب العميل" flush>
          <table className="table table--compact">
            <thead><tr><th>التاريخ</th><th>الحركة</th><th className="num">المبلغ</th><th className="num">الرصيد</th></tr></thead>
            <tbody>
              {ledger.data.map((r, i) => (
                <tr key={i}><td><When iso={r.at} /></td><td>{{ statement: "بيان", payment: "دفعة", debt_payment: "تحصيل مديونية", refund: "رد مبلغ", statement_edit: "تعديل بيان", statement_cancel: "إلغاء بيان", sales_return: "مرتجع", opening: "رصيد افتتاحي" }[r.kind] ?? r.kind}</td>
                  <td className="num"><Money pt={r.amountPt} cur={false} /></td><td className="num" style={{ fontWeight: 700 }}><Money pt={r.balancePt} cur={false} /></td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Dialog open={!!collect} onClose={() => setCollect(null)} title={`تحصيل مديونية · ${c.name}`}
        footer={<><Button onClick={() => setCollect(null)}>رجوع</Button><Button variant="primary" disabled={!collect?.amount} onClick={async () => {
          const r = await run(() => api(`/customers/${c.id}/payments`, { method: "POST", body: { methodId: collect!.methodId, amountPt: toPt(collect!.amount), reference: collect!.reference || undefined } }), "سُجل التحصيل.");
          if (r) setCollect(null);
        }}>تسجيل التحصيل</Button></>}>
        {collect && <div className="form-grid" style={{ ["--cols" as string]: 2 }}>
          <Field label="المديونية الحالية"><Input num readOnly value={f.pt(c.balancePt ?? 0)} /></Field>
          <Field label="المبلغ المحصل" required><Input num type="number" min={0} value={collect.amount} onChange={(e) => setCollect({ ...collect, amount: e.target.value })} /></Field>
          <Field label="طريقة الدفع"><Select value={collect.methodId} onChange={(e) => setCollect({ ...collect, methodId: e.target.value })}>{(methods.data ?? []).filter((m) => m.active && !m.isCredit).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
          <Field label="رقم المرجع" hint="للدفع الإلكتروني فقط"><Input value={collect.reference} onChange={(e) => setCollect({ ...collect, reference: e.target.value })} /></Field>
        </div>}
      </Dialog>

      <Dialog open={carOpen} onClose={() => setCarOpen(false)} title={`سيارة جديدة لـ ${c.name}`}
        footer={<><Button onClick={() => setCarOpen(false)}>رجوع</Button><Button variant="primary" disabled={!!plateError(nv, plateTypes)} onClick={async () => {
          const r = await run(() => api<{ id: string }>("/vehicles", { method: "POST", body: { customerId: c.id, plateType: nv.plateType, plateLetters: nv.plateLetters, plateDigits: nv.plateDigits, chassis: nv.chassis || null, make: nv.make, model: nv.model || null, year: nv.year ? Number(nv.year) : null } }), "تمت إضافة السيارة.");
          if (r) { setCarOpen(false); setCarId(r.id); }
        }}>حفظ</Button></>}>
        <div className="form-grid" style={{ ["--cols" as string]: 2 }}>
          <PlateInput value={nv} onChange={(p) => setNv({ ...nv, ...p })} />
          <Field label="الشاسيه"><Input className="lat" dir="ltr" maxLength={17} value={nv.chassis} onChange={(e) => setNv({ ...nv, chassis: e.target.value })} /></Field>
          <Field label="الماركة"><Select value={nv.make} onChange={(e) => setNv({ ...nv, make: e.target.value })}>{["Jeep", "Dodge", "Chrysler", "Ford", "Chevrolet", "GMC", "Cadillac"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
          <Field label="الموديل"><Input className="lat" value={nv.model} onChange={(e) => setNv({ ...nv, model: e.target.value })} /></Field>
          <Field label="السنة"><Input num value={nv.year} onChange={(e) => setNv({ ...nv, year: e.target.value })} /></Field>
        </div>
      </Dialog>
    </div>
  );
}
