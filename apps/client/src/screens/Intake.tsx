import { useEffect, useRef, useState } from "react";
import { Camera, CarFront, Gauge, Plus, Printer, Search, Trash2, TriangleAlert, UserPlus } from "lucide-react";
import {
  Badge, Button, Chip, Field, IconButton, Input, Panel, Segmented, Select, Switch, Textarea, useFmt, useToast,
} from "@jc/ui";
import { uuidv7, toPt } from "@jc/core";
import { PageHead } from "../shell/Shell";
import { go, useIsAdmin, useSession } from "../lib";
import { api, ApiError } from "../data/api";
import { qs, useApi } from "../data/hooks";
import type { History, LookupHit, Technician, User, Vehicle } from "../data/types";
import { CarDiagram, MARK_KIND, type Mark } from "./CarDiagram";
import { carName, CarPlate, EMPTY_PLATE, plateError, PlateInput, SignaturePad } from "./common";
import { usePlateTypes } from "../data/plates";

const BELONGINGS = ["موبايل", "عدة", "إريال راديو", "استبن", "ولاعة سجاير"];
type Picked = { vehicle: Vehicle; customer: LookupHit["customer"] };

export function Intake() {
  const f = useFmt();
  const toast = useToast();
  const isAdmin = useIsAdmin();
  const { user } = useSession();
  const users = useApi<User[]>("/users");
  const technicians = useApi<Technician[]>("/technicians");
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<LookupHit[]>([]);
  const [car, setCar] = useState<Picked | null>(null);
  const history = useApi<History>(car ? `/vehicles/${car.vehicle.id}/history` : null);
  const [newCar, setNewCar] = useState(false);
  const [nc, setNc] = useState({ ...EMPTY_PLATE, chassis: "", make: "Jeep", model: "", year: "", licenseNo: "", name: "", mobile: "" });
  const [ncErr, setNcErr] = useState<Record<string, string>>({});
  const plateTypes = usePlateTypes();
  const [odo, setOdo] = useState("");
  const [odoErr, setOdoErr] = useState("");
  const [odoReason, setOdoReason] = useState("");
  const [type, setType] = useState<"repair" | "inquiry" | "condition">("repair");
  const [engineerId, setEngineerId] = useState(user!.id);
  const [repairType, setRepairType] = useState("PM");
  const [booking, setBooking] = useState<"booked" | "walk_in">("walk_in");
  const [expDate, setExpDate] = useState(f.date(new Date().toISOString()));
  const [expHour, setExpHour] = useState("18");
  const [techs, setTechs] = useState<string[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [kind, setKind] = useState<Mark["kind"]>("scratch");
  const [fuel, setFuel] = useState(2);
  const [bel, setBel] = useState<string[]>([]);
  const [complaint, setComplaint] = useState("");
  const [complaintErr, setComplaintErr] = useState("");
  const [comeback, setComeback] = useState(false);
  const [signed, setSigned] = useState<string | null>(null);
  const [estimate, setEstimate] = useState("");
  const [busy, setBusy] = useState(false);
  const odoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setMatches([]); return; }
    let alive = true;
    const t = setTimeout(() => api<LookupHit[]>(`/lookup?${qs({ q: text })}`).then((r) => alive && setMatches(r)).catch(() => {}), 180);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const prev = history.data?.odometer[0]?.km;
  const prevAt = history.data?.odometer[0]?.at;
  const visits = history.data?.visits.length ?? 0;
  const odoNum = Number(odo.replace(/[^\d]/g, ""));
  const lower = prev !== undefined && !!odo && odoNum < prev;
  const set = (k: keyof typeof nc) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setNc({ ...nc, [k]: e.target.value }); setNcErr({ ...ncErr, [k]: "" }); };

  const submit = async (print: boolean) => {
    let ok = true;
    if (!car && !newCar) { toast("ابحث عن السيارة أو سجّل سيارة جديدة أولًا.", "bad"); return; }
    if (newCar) {
      const e: Record<string, string> = {};
      const pe = plateError(nc, plateTypes);
      if (pe) e.plate = pe;
      if (!nc.name.trim()) e.name = "اكتب اسم العميل.";
      if (!nc.mobile.trim()) e.mobile = "اكتب رقم الموبايل.";
      setNcErr(e);
      if (Object.keys(e).length) ok = false;
    }
    if (!odo) { setOdoErr("اكتب قراءة العداد الحالية. لا يمكن فتح أمر شغل بدونها."); ok = false; }
    else if (lower && !isAdmin) { setOdoErr(`القراءة أقل من آخر قراءة (${f.n(prev!)} كم). لو العداد اتغير، اطلب من الإدارة تكمل مع ذكر السبب.`); ok = false; }
    else if (lower && !odoReason.trim()) { setOdoErr("اكتب سبب القراءة الأقل (مثال: تغيير العداد)."); ok = false; }
    if (!complaint.trim()) { setComplaintErr("اكتب شكوى العميل أو المطلوب عمله."); ok = false; }
    if (!ok) { odoRef.current?.focus(); return; }
    setBusy(true);
    try {
      let vehicleId = car?.vehicle.id;
      if (newCar) {
        const c = await api<{ id: string }>("/customers", { method: "POST", body: { name: nc.name, mobile: nc.mobile, whatsapp: nc.mobile } });
        const v = await api<{ id: string }>("/vehicles", { method: "POST", body: {
          customerId: c.id, plateType: nc.plateType, plateLetters: nc.plateLetters, plateDigits: nc.plateDigits, chassis: nc.chassis || null, make: nc.make, model: nc.model || null, year: nc.year ? Number(nc.year) : null, licenseNo: nc.licenseNo || null,
        } });
        vehicleId = v.id;
      }
      const [y, m, d] = expDate.replace(/[٠-٩]/g, (x) => String("٠١٢٣٤٥٦٧٨٩".indexOf(x))).split(/[/-]/).map(Number);
      const expected = y && m && d ? new Date(y, m - 1, d, Number(expHour)).toISOString() : null;
      const wo = await api<{ id: string; number: number }>("/work-orders", { method: "POST", body: {
        id: uuidv7(), vehicleId, odometerIn: odoNum, odometerReason: lower ? odoReason : undefined, type, complaint, receptionUserId: engineerId,
        repairType, booking, expectedAt: expected, technicianIds: techs, comeback, fuelLevel: fuel, belongings: bel,
        estimatePt: estimate ? toPt(estimate) : null,
        marks: marks.map((mk) => ({ x: Math.round(mk.x * 10), y: Math.round(mk.y * 10), kind: mk.kind, note: mk.note })),
      } });
      // The signature needs the connection; without it the customer can sign later from the work order.
      if (signed) await api(`/work-orders/${wo.id}/signature`, { method: "POST", body: { dataUrl: signed } }).catch(() => toast("لم يُحفظ التوقيع (لا يوجد اتصال). وقّع من صفحة أمر الشغل لاحقًا.", "bad"));
      toast(<>تم فتح أمر الشغل <b className="num">{f.s(wo.number)}</b>.</>);
      go(print ? `/print/job-card/${wo.id}` : `/work-orders/${wo.id}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "تعذر فتح أمر الشغل.", "bad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <PageHead back={{ to: "/reception", label: "الاستقبال وأوامر الشغل" }} title="استقبال سيارة"
        sub="ابحث عن السيارة أولًا. لو زارتنا قبل كده، بياناتها وعدادها السابق يظهروا تلقائيًا." />

      <div className="intake">
        <div className="stack">
          <Panel title="السيارة والعميل" icon={<CarFront />}>
            <div className="stack" style={{ gap: 14 }}>
              <div className="input-group">
                <Search />
                <Input size="lg" value={q} onChange={(e) => setQ(e.target.value)} autoFocus
                  placeholder="رقم اللوحة، الشاسيه، اسم العميل أو الموبايل… أو امسح الكود" aria-label="بحث عن السيارة" />
              </div>
              {q.trim().length >= 2 && (
                <div className="stack" style={{ gap: 8 }}>
                  {matches.map((h) => (
                    <button key={h.vehicle.id} type="button" className="lookup-hit" style={{ borderColor: "var(--line)", background: "var(--surface)", textAlign: "start" }} onClick={() => { setCar(h); setQ(""); setNewCar(false); }}>
                      <CarPlate v={h.vehicle} />
                      <span><b className="lat">{carName(h.vehicle)}</b>{h.vehicle.year ? ` · ${h.vehicle.year}` : ""}<br /><span className="muted">{h.customer.name}</span></span>
                      <span className="lat muted" style={{ fontSize: 13 }}>{h.vehicle.chassis}</span>
                    </button>
                  ))}
                  {matches.length === 0 && <p className="hint-line">لا توجد سيارة بهذا البحث. <button type="button" className="link" style={{ border: 0, background: "none", padding: 0 }} onClick={() => { setNewCar(true); setCar(null); setQ(""); }}>سجّل سيارة جديدة</button></p>}
                </div>
              )}
              {car && !q && (
                <div className="lookup-hit">
                  <CarPlate v={car.vehicle} size="lg" />
                  <div style={{ display: "grid", gap: 2 }}>
                    <b className="lat" style={{ fontSize: 18 }}>{carName(car.vehicle)}{car.vehicle.year ? ` · ${car.vehicle.year}` : ""}</b>
                    <span>{car.customer.name}{car.customer.mobile && <> · <span className="num">{f.s(car.customer.mobile)}</span></>}</span>
                    <span className="muted lat" style={{ fontSize: 13 }}>{[car.vehicle.chassis, car.vehicle.engineSize, car.vehicle.color].filter(Boolean).join(" · ")}</span>
                  </div>
                  <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                    <Badge tone="ok">زيارة رقم {f.n(visits + 1)}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => setCar(null)}>تغيير</Button>
                  </div>
                </div>
              )}
              {!car && !q && !newCar && (
                <div className="row">
                  <Button icon={<UserPlus />} onClick={() => setNewCar(true)}>سيارة جديدة (أول زيارة)</Button>
                </div>
              )}
              {newCar && (
                <div className="form-grid" style={{ ["--cols" as string]: 3 }}>
                  <PlateInput value={nc} onChange={(p) => { setNc({ ...nc, ...p }); setNcErr({ ...ncErr, plate: "" }); }} error={ncErr.plate} />
                  <Field label="رقم الشاسيه (VIN)" hint="17 حرفًا ورقمًا"><Input className="lat" dir="ltr" value={nc.chassis} onChange={set("chassis")} placeholder="1C4RJFAG5FC625874" maxLength={17} /></Field>
                  <Field label="الماركة"><Select value={nc.make} onChange={set("make")}>{["Jeep", "Dodge", "Chrysler", "Ford", "Chevrolet", "GMC", "Cadillac"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
                  <Field label="الموديل والطراز"><Input className="lat" value={nc.model} onChange={set("model")} placeholder="Grand Cherokee WK2" /></Field>
                  <Field label="سنة الصنع"><Input num value={nc.year} onChange={set("year")} placeholder="2018" /></Field>
                  <Field label="رقم الرخصة"><Input num value={nc.licenseNo} onChange={set("licenseNo")} /></Field>
                  <Field label="اسم العميل" required error={ncErr.name}><Input value={nc.name} onChange={set("name")} /></Field>
                  <Field label="الموبايل" required hint="يُستخدم للواتساب" error={ncErr.mobile}><Input num value={nc.mobile} onChange={set("mobile")} placeholder="010xxxxxxxx" /></Field>
                  <div style={{ alignSelf: "end" }}><Button variant="ghost" onClick={() => setNewCar(false)}>إلغاء</Button></div>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="العداد" icon={<Gauge />} sub="قراءة العداد مطلوبة في كل زيارة.">
            <div className={odoErr ? "is-invalid" : ""}>
              <div className="odo">
                <div><span className="odo__label">آخر قراءة</span><span className="odo__val">{prev !== undefined ? f.n(prev) : "—"}</span>{prevAt && <span className="hint-line num">{f.date(prevAt)}</span>}</div>
                <div>
                  <label className="odo__label" htmlFor="odo">القراءة الحالية (كم)<span className="field__req"> *</span></label>
                  <input id="odo" ref={odoRef} className="input num" inputMode="numeric" value={odo} placeholder="مثال: 120500"
                    onChange={(e) => { setOdo(e.target.value.replace(/[^\d٠-٩]/g, "")); setOdoErr(""); }} />
                </div>
                <div><span className="odo__label">الفرق منذ آخر زيارة</span><span className={`odo__val ${lower ? "" : "diff"}`} style={lower ? { color: "var(--bad)" } : undefined}>{odo && prev !== undefined ? `${lower ? "−" : "+"}${f.n(Math.abs(odoNum - prev))}` : "—"}</span></div>
              </div>
              {odoErr && <p className="field__error" role="alert" style={{ marginTop: 8 }}>{odoErr}</p>}
              {lower && isAdmin && <div style={{ marginTop: 10 }}><p className="field__error" style={{ color: "var(--warn)" }}><TriangleAlert />القراءة أقل من السابقة. كإدارة تقدر تكمل مع ذكر السبب.</p><Input value={odoReason} onChange={(e) => { setOdoReason(e.target.value); setOdoErr(""); }} placeholder="السبب، مثل: تغيير العداد" aria-label="سبب القراءة الأقل" /></div>}
            </div>
          </Panel>

          <Panel title="بيانات الأمر">
            <div className="form-grid">
              <Field label="نوع الأمر" className="span-2">
                <Segmented label="نوع الأمر" value={type} onChange={setType} options={[{ value: "repair", label: "عميل (إصلاح)" }, { value: "inquiry", label: "استعلام / عرض سعر" }, { value: "condition", label: "تقرير حالة" }]} />
              </Field>
              <Field label="مهندس الاستقبال"><Select value={engineerId} onChange={(e) => setEngineerId(e.target.value)}>{(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}</Select></Field>
              <Field label="الشكوى (من كلام العميل)" required className="span-all" error={complaintErr}>
                <Textarea value={complaint} onChange={(e) => { setComplaint(e.target.value); setComplaintErr(""); }} placeholder="مثال: لمبة Check Engine منورة وصوت من العفشة الأمامية" />
              </Field>
              <Field label="نوع الصيانة"><Select value={repairType} onChange={(e) => setRepairType(e.target.value)}><option value="PM">صيانة دورية (PM)</option><option>إصلاح عطل</option><option>كهرباء</option><option>تكييف</option><option>سمكرة ودهان</option></Select></Field>
              <Field label="الحجز"><Select value={booking} onChange={(e) => setBooking(e.target.value as "booked" | "walk_in")}><option value="booked">بحجز مسبق</option><option value="walk_in">بدون حجز</option></Select></Field>
              <Field label="التسليم المتوقع" hint="سنة/شهر/يوم">
                <div className="date-time">
                  <Input num value={expDate} onChange={(e) => setExpDate(e.target.value)} aria-label="تاريخ التسليم المتوقع" />
                  <Select value={expHour} onChange={(e) => setExpHour(e.target.value)} aria-label="وقت التسليم المتوقع">
                    {Array.from({ length: 13 }, (_, i) => i + 9).map((h) => <option key={h} value={h}>{f.time(`2026-10-30T${String(h).padStart(2, "0")}:00:00`)}</option>)}
                  </Select>
                </div>
              </Field>
              <Field label="الفنيين" className="span-all">
                <div className="chips">{(technicians.data ?? []).filter((t) => t.active).map((t) => <Chip key={t.id} pressed={techs.includes(t.id)} onToggle={() => setTechs(techs.includes(t.id) ? techs.filter((x) => x !== t.id) : [...techs, t.id])}>{t.name}</Chip>)}</div>
              </Field>
              <div className="span-all"><Switch checked={comeback} onChange={setComeback}>صيانة مرتجعة (رجعت لنفس الشكوى)</Switch></div>
            </div>
          </Panel>

          <Panel title="حالة السيارة عند الاستلام" sub="اضغط على مكان الخدش أو الدقة على المخطط.">
            <div className="stack" style={{ gap: 16 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <Segmented label="نوع العلامة" value={kind} onChange={setKind} options={(Object.keys(MARK_KIND) as Mark["kind"][]).map((k) => ({ value: k, label: <><i style={{ width: 10, height: 10, background: MARK_KIND[k].color, display: "inline-block" }} />{MARK_KIND[k].label}</> }))} />
                {marks.length > 0 && <Button size="sm" variant="ghost" onClick={() => setMarks([])}>مسح كل العلامات</Button>}
              </div>
              <CarDiagram marks={marks} onAdd={(x, y) => setMarks([...marks, { id: marks.length + 1, x, y, kind, note: "" }])} />
              {marks.length > 0 ? (
                <ul className="marks">
                  {marks.map((m) => (
                    <li key={m.id}>
                      <span className={`pin ${MARK_KIND[m.kind].cls}`}>{m.id}</span>
                      <Input size="sm" autoFocus={m.id === marks.length} value={m.note} placeholder={`${MARK_KIND[m.kind].label}: مكانها ووصف قصير`} aria-label={`وصف العلامة ${m.id}`}
                        onChange={(e) => setMarks(marks.map((x) => (x.id === m.id ? { ...x, note: e.target.value } : x)))} />
                      <span className="row" style={{ gap: 2 }}>
                        <IconButton size="sm" label="إرفاق صورة" onClick={() => setMarks(marks.map((x) => (x.id === m.id ? { ...x, photo: !x.photo } : x)))} style={m.photo ? { color: "var(--ok)" } : undefined}><Camera /></IconButton>
                        <IconButton size="sm" label="حذف العلامة" onClick={() => setMarks(marks.filter((x) => x.id !== m.id).map((x, i) => ({ ...x, id: i + 1 })))}><Trash2 /></IconButton>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="hint-line">لا توجد علامات. لو السيارة سليمة اتركها فاضية.</p>}
              <div className="grid-2">
                <Field label="مستوى البنزين">
                  <div className="fuel" role="radiogroup" aria-label="مستوى البنزين">
                    {["¼", "½", "¾", "ممتلئ"].map((l, i) => (
                      <button key={l} type="button" role="radio" aria-checked={fuel === i + 1} onClick={() => setFuel(i + 1)}><i style={{ ["--f" as string]: `${(i + 1) * 25}%` }} />{l}</button>
                    ))}
                  </div>
                </Field>
                <Field label="صور الاستلام" hint="العداد والواجهة والجوانب. تُحفظ مع ملف السيارة.">
                  <div className="photos">
                    <div className="photo photo--shot"><span className="photo__cap">العداد</span></div>
                    <div className="photo photo--shot"><span className="photo__cap">الأمام</span></div>
                    <button type="button" className="photo photo--add"><span><Camera style={{ margin: "0 auto 4px" }} />صورة</span></button>
                    <span />
                  </div>
                </Field>
              </div>
              <Field label="المتعلقات الموجودة بالسيارة">
                <div className="chips">
                  {BELONGINGS.map((b) => <Chip key={b} pressed={bel.includes(b)} onToggle={() => setBel(bel.includes(b) ? bel.filter((x) => x !== b) : [...bel, b])}>{b}</Chip>)}
                  <Chip add icon={<Plus />}>أخرى</Chip>
                </div>
              </Field>
            </div>
          </Panel>

          <Panel title="توقيع العميل" sub="يوقّع العميل على الشاشة أو التابلت. يُطبع على كارت الإصلاح.">
            <SignaturePad onSigned={setSigned} />
          </Panel>
        </div>

        <aside className="sticky-side stack">
          <div className="totals">
            <div className="totals__title"><span>أمر شغل جديد</span><span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>الرقم عند الحفظ</span></div>
            <div className="totals__rows">
              <div className="totals__row"><span>السيارة</span>{car ? <CarPlate v={car.vehicle} /> : newCar ? <span>سيارة جديدة</span> : <span className="subtle">لم تُحدد</span>}</div>
              <div className="totals__row"><span>العداد</span><span className="num">{odo ? f.n(odoNum) : <span className="subtle" style={{ fontFamily: "var(--font-ar)" }}>مطلوب</span>}</span></div>
              <div className="totals__row"><span>علامات الجسم</span><span className="num">{f.n(marks.length)}</span></div>
              <div className="totals__row"><span>البنزين</span><span>{["¼", "½", "¾", "ممتلئ"][fuel - 1]}</span></div>
              <div className="totals__row"><span>توقيع العميل</span>{signed ? <Badge tone="ok">تم</Badge> : <Badge>لم يوقّع</Badge>}</div>
            </div>
            <div style={{ padding: "0 20px 16px" }}>
              <Field label="التكلفة التقديرية (اختياري)" hint="لو زادت التكلفة، النظام يطلب تسجيل موافقة العميل."><Input num type="number" min={0} value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="0" /></Field>
            </div>
            <div className="pay" style={{ borderTop: "1px solid var(--line)" }}>
              <Button variant="primary" size="lg" block disabled={busy} onClick={() => submit(false)}>{busy ? "جاري الحفظ…" : "فتح أمر الشغل"}</Button>
              <Button block icon={<Printer />} disabled={busy} onClick={() => submit(true)}>فتح وطباعة كارت الإصلاح</Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

