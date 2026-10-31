import { useState } from "react";
import {
  Building2, Cpu, DatabaseBackup, Hash, IdCard, MessageCircle, Percent, Printer, Receipt, ScanLine, Settings2, Users, Wallet, ArrowUp, ArrowDown,
} from "lucide-react";
import { Badge, Button, Dialog, Field, Input, Panel, Segmented, Select, Switch, Textarea, useDigits, useFmt } from "@jc/ui";
import type { Category } from "@jc/core";
import { PageHead, PageState } from "../shell/Shell";
import { api } from "../data/api";
import { useAction, useApi } from "../data/hooks";
import type { PaymentMethod, PlateType, Technician, User } from "../data/types";
import { loadPlateTypes } from "../data/plates";
import { CarPlate } from "./common";

const SECTIONS = [
  { id: "shop", label: "بيانات المحل", icon: Building2 },
  { id: "numbers", label: "الترقيم", icon: Hash },
  { id: "pay", label: "طرق الدفع", icon: Wallet },
  { id: "plates", label: "أنواع اللوحات", icon: IdCard },
  { id: "texts", label: "النصوص ورسائل واتساب", icon: MessageCircle },
  { id: "tax", label: "الخصومات والضرائب", icon: Percent },
  { id: "devices", label: "الأجهزة والطباعة", icon: Cpu },
  { id: "users", label: "المستخدمون والفنيين", icon: Users },
  { id: "backup", label: "النسخ الاحتياطي", icon: DatabaseBackup },
  { id: "general", label: "عام", icon: Settings2 },
] as const;
type Sec = (typeof SECTIONS)[number]["id"];
type Settings = Record<string, unknown>;

export function SettingsScreen() {
  const [sec, setSec] = useState<Sec>("shop");
  const s = useApi<Settings>("/settings");
  return (
    <div>
      <PageHead title="الإعدادات" sub="كل ما يتغير في الورشة يتعدل من هنا، بدون تعديل في البرنامج. كل قسم يُحفظ بزره." />
      <div className="settings">
        <nav className="settings__nav" aria-label="أقسام الإعدادات">
          {SECTIONS.map((x) => <button key={x.id} type="button" aria-current={sec === x.id} onClick={() => setSec(x.id)}><x.icon />{x.label}</button>)}
        </nav>
        <div className="stack">
          {!s.data ? <PageState loading={s.loading} error={s.error} onRetry={s.reload} /> : <>
            {sec === "shop" && <ShopSec s={s.data} />}
            {sec === "numbers" && <NumbersSec />}
            {sec === "pay" && <PaySec />}
            {sec === "plates" && <PlatesSec />}
            {sec === "texts" && <TextsSec s={s.data} />}
            {sec === "tax" && <TaxSec s={s.data} />}
            {sec === "devices" && <DevicesSec s={s.data} />}
            {sec === "users" && <UsersSec />}
            {sec === "backup" && <BackupSec />}
            {sec === "general" && <GeneralSec s={s.data} />}
          </>}
        </div>
      </div>
    </div>
  );
}

function useSaveSettings() {
  const run = useAction();
  return (values: Record<string, unknown>) => run(async () => {
    for (const [key, value] of Object.entries(values)) await api(`/settings/${key}`, { method: "PUT", body: { value } });
  }, "تم حفظ الإعدادات.");
}

function ShopSec({ s }: { s: Settings }) {
  const save = useSaveSettings();
  const phones = (s["shop.phones"] as string[] | undefined) ?? [];
  const [d, setD] = useState({ nameAr: String(s["shop.nameAr"] ?? ""), nameEn: String(s["shop.nameEn"] ?? ""), address: String(s["shop.address"] ?? ""), p1: phones[0] ?? "", p2: phones[1] ?? "" });
  return (
    <Panel title="بيانات المحل" sub="تظهر في رأس البيان وكارت الإصلاح والإيصال." footer={<Button variant="primary" onClick={() => save({ "shop.nameAr": d.nameAr, "shop.nameEn": d.nameEn, "shop.address": d.address, "shop.phones": [d.p1, d.p2].filter(Boolean) })}>حفظ</Button>}>
      <div className="form-grid" style={{ ["--cols" as string]: 2 }}>
        <Field label="اسم المحل (عربي)"><Input value={d.nameAr} onChange={(e) => setD({ ...d, nameAr: e.target.value })} /></Field>
        <Field label="اسم المحل (إنجليزي)"><Input className="lat" dir="ltr" value={d.nameEn} onChange={(e) => setD({ ...d, nameEn: e.target.value })} /></Field>
        <Field label="العنوان" className="span-all"><Input value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} /></Field>
        <Field label="تليفون 1" hint="يُكتب كما تريده مطبوعًا"><Input num value={d.p1} onChange={(e) => setD({ ...d, p1: e.target.value })} placeholder="02 xxxx xxxx" /></Field>
        <Field label="تليفون 2 / واتساب"><Input num value={d.p2} onChange={(e) => setD({ ...d, p2: e.target.value })} placeholder="01x xxxx xxxx" /></Field>
      </div>
    </Panel>
  );
}

function NumbersSec() {
  const run = useAction();
  const q = useApi<{ series: string; nextValue: number }[]>("/numbers");
  const [vals, setVals] = useState<Record<string, string>>({});
  const LABEL: Record<string, string> = { work_order: "أوامر الشغل", statement: "بيانات العملاء", direct_sale: "البيع المباشر", purchase: "فواتير المشتريات" };
  return (
    <Panel title="الترقيم" sub="الرقم القادم لكل نوع. لا يمكن الرجوع لرقم مستخدم من قبل.">
      {!q.data ? <PageState loading={q.loading} error={q.error} /> : (
        <div className="stack" style={{ gap: 12 }}>
          {q.data.filter((x) => LABEL[x.series]).map((x) => (
            <div key={x.series} className="row" style={{ alignItems: "flex-end" }}>
              <Field label={`الرقم القادم: ${LABEL[x.series]}`}><Input num value={vals[x.series] ?? String(x.nextValue)} onChange={(e) => setVals({ ...vals, [x.series]: e.target.value })} style={{ width: 200 }} /></Field>
              <Button disabled={!vals[x.series] || Number(vals[x.series]) === x.nextValue} onClick={() => run(() => api(`/numbers/${x.series}`, { method: "PUT", body: { next: Number(vals[x.series]) } }), "تم تغيير الترقيم.")}>تطبيق</Button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function PaySec() {
  const run = useAction();
  const q = useApi<PaymentMethod[]>("/payment-methods");
  const [list, setList] = useState<PaymentMethod[] | null>(null);
  const rows = list ?? q.data ?? [];
  const move = (i: number, d: -1 | 1) => { const r = [...rows]; [r[i], r[i + d]] = [r[i + d], r[i]]; setList(r); };
  const set = (i: number, p: Partial<PaymentMethod>) => setList(rows.map((m, k) => (k === i ? { ...m, ...p } : m)));
  return (
    <Panel title="طرق الدفع" sub="الترتيب هنا هو ترتيبها في شاشة البيان. الترتيب النهائي يُراجع مع المحاسب."
      footer={<Button variant="primary" disabled={!list} onClick={async () => { const r = await run(() => api("/payment-methods", { method: "PUT", body: rows.map(({ id, label, needsReference, isCredit, isCash, active }) => ({ id, label, needsReference, isCredit, isCash, active })) }), "تم حفظ طرق الدفع."); if (r) setList(null); }}>حفظ</Button>}>
      <ul className="order-list">
        {rows.map((m, i) => (
          <li key={m.id}>
            <span className="row" style={{ gap: 0, flexDirection: "column" }}>
              <button type="button" className="icon-btn icon-btn--sm" aria-label="لأعلى" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></button>
              <button type="button" className="icon-btn icon-btn--sm" aria-label="لأسفل" disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown /></button>
            </span>
            <Input size="sm" value={m.label} onChange={(e) => set(i, { label: e.target.value })} aria-label="اسم طريقة الدفع" />
            <span className="row" style={{ gap: 6 }}>{m.isCash && <Badge>كاش للصندوق</Badge>}{m.isCredit && <Badge tone="warn">مديونية</Badge>}{m.needsReference && <Badge>يطلب رقم مرجع</Badge>}</span>
            <Switch checked={m.active} onChange={(v) => set(i, { active: v })}>مفعّلة</Switch>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** D-69: plate types and their colors. Types marked "to confirm" have no color until the shop confirms it. */
function PlatesSec() {
  const run = useAction();
  const q = useApi<PlateType[]>("/plate-types");
  const [list, setList] = useState<PlateType[] | null>(null);
  const rows = list ?? q.data ?? [];
  const move = (i: number, d: -1 | 1) => { const r = [...rows]; [r[i], r[i + d]] = [r[i + d], r[i]]; setList(r); };
  const set = (i: number, p: Partial<PlateType>) => setList(rows.map((m, k) => (k === i ? { ...m, ...p } : m)));
  const save = async () => {
    const body = rows.map(({ id, label, barColor, textColor, digitsOnly, small, toConfirm, active }) => ({ id, label, barColor, textColor, digitsOnly, small, toConfirm, active }));
    const r = await run(() => api("/plate-types", { method: "PUT", body }), "تم حفظ أنواع اللوحات.");
    if (r) { setList(null); void loadPlateTypes(); }
  };
  return (
    <Panel title="أنواع اللوحات" sub="لون الشريط العلوي ولون الكتابة لكل نوع. الأنواع المكتوب عليها «للتأكيد» تحتاج تأكيد اللون من الورشة قبل تفعيلها."
      footer={<Button variant="primary" disabled={!list} onClick={save}>حفظ</Button>}>
      <ul className="order-list">
        {rows.map((t, i) => (
          <li key={t.id}>
            <span className="row" style={{ gap: 0, flexDirection: "column" }}>
              <button type="button" className="icon-btn icon-btn--sm" aria-label="لأعلى" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></button>
              <button type="button" className="icon-btn icon-btn--sm" aria-label="لأسفل" disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown /></button>
            </span>
            <CarPlate v={{ plateType: t.id, plateLetters: t.digitsOnly ? "" : "ل ف و", plateDigits: t.digitsOnly ? "12345" : "281" }} />
            <Input size="sm" value={t.label} onChange={(e) => set(i, { label: e.target.value })} aria-label="اسم النوع" />
            <span className="row" style={{ gap: 6 }}>
              <label className="row" style={{ gap: 4 }}><span className="subtle">الشريط</span>
                <input type="color" value={t.barColor ?? "#ffffff"} onChange={(e) => set(i, { barColor: e.target.value.toUpperCase(), toConfirm: false })} aria-label={`لون شريط ${t.label}`} /></label>
              <label className="row" style={{ gap: 4 }}><span className="subtle">الكتابة</span>
                <input type="color" value={t.textColor} onChange={(e) => set(i, { textColor: e.target.value.toUpperCase() })} aria-label={`لون كتابة ${t.label}`} /></label>
              {t.toConfirm && <Badge tone="warn">للتأكيد</Badge>}
              {t.digitsOnly && <Badge>أرقام فقط</Badge>}
              {t.small && <Badge>لوحة صغيرة</Badge>}
            </span>
            <Switch checked={t.active} onChange={(v) => set(i, { active: v })}>مفعّل</Switch>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function TextsSec({ s }: { s: Settings }) {
  const save = useSaveSettings();
  const [ack, setAck] = useState(String(s["print.ack"] ?? ""));
  const [terms, setTerms] = useState(String(s["print.jobCardTerms"] ?? ""));
  const [tpls, setTpls] = useState((s["whatsapp.templates"] as { id: string; label: string; text: string }[] | undefined) ?? []);
  return (
    <>
      <Panel title="نصوص الطباعة" footer={<Button variant="primary" onClick={() => save({ "print.ack": ack, "print.jobCardTerms": terms })}>حفظ</Button>}>
        <div className="form-grid" style={{ ["--cols" as string]: 1 }}>
          <Field label="نص الإقرار أسفل البيان"><Input value={ack} onChange={(e) => setAck(e.target.value)} /></Field>
          <Field label="شروط كارت الإصلاح" hint="بانتظار النص المعتمد من الورشة. يُطبع كما هو أسفل كارت الإصلاح."><Textarea value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="اكتب شروط الورشة هنا: المسؤولية عن المتعلقات، مدة ترك السيارة بعد الإبلاغ، أي رسوم." /></Field>
        </div>
      </Panel>
      <Panel title="رسائل واتساب الجاهزة" sub="تُفتح بضغطة من أمر الشغل والتذكيرات. الكلمات بين القوسين تتبدل تلقائيًا: {الاسم} {السيارة} {رقم_الأمر} {الموعد}"
        footer={<Button variant="primary" onClick={() => save({ "whatsapp.templates": tpls })}>حفظ</Button>}>
        <div className="form-grid" style={{ ["--cols" as string]: 1 }}>
          {tpls.map((t, i) => <Field key={t.id} label={t.label}><Textarea value={t.text} onChange={(e) => setTpls(tpls.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} /></Field>)}
        </div>
      </Panel>
    </>
  );
}

function TaxSec({ s }: { s: Settings }) {
  const save = useSaveSettings();
  const ALL: [Category, string][] = [["labor", "المصنعيات"], ["part", "قطع الغيار"], ["oil", "الزيوت"], ["material", "الخامات"], ["paint", "البويات"]];
  const [cats, setCats] = useState<Category[]>((s["discounts.categories"] as Category[]) ?? ["labor", "part"]);
  const vat0 = (s["vat"] as { enabled: boolean; rateBp: Partial<Record<Category, number>> }) ?? { enabled: false, rateBp: {} };
  const [vat, setVat] = useState(vat0);
  return (
    <>
      <Panel title="الخصومات" sub="الخصم على إجمالي كل نوع، بمبلغ أو نسبة." footer={<Button variant="primary" onClick={() => save({ "discounts.categories": cats })}>حفظ</Button>}>
        <div className="stack" style={{ gap: 14 }}>
          {ALL.map(([c, l]) => <Switch key={c} checked={cats.includes(c)} onChange={(v) => setCats(v ? [...cats, c] : cats.filter((x) => x !== c))}>خصم على {l}</Switch>)}
        </div>
      </Panel>
      <Panel title="ضريبة القيمة المضافة" sub="متوقفة حتى تؤكد الورشة إصدار فواتير ضريبية." footer={<Button variant="primary" onClick={() => save({ vat })}>حفظ</Button>}>
        <div className="stack" style={{ gap: 16 }}>
          <Switch checked={vat.enabled} onChange={(v) => setVat({ ...vat, enabled: v })}>تفعيل الضريبة على البيانات</Switch>
          {vat.enabled && (
            <div className="form-grid" style={{ ["--cols" as string]: 4 }}>
              {ALL.slice(0, 4).map(([c, l]) => <Field key={c} label={`نسبة ${l} %`}><Input num value={String((vat.rateBp[c] ?? 0) / 100)} onChange={(e) => setVat({ ...vat, rateBp: { ...vat.rateBp, [c]: Math.round(Number(e.target.value) * 100) } })} /></Field>)}
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}

function DevicesSec({ s }: { s: Settings }) {
  const save = useSaveSettings();
  const ls = (s["labels.size"] as { w: number; h: number } | undefined) ?? { w: 40, h: 30 };
  const [lsz, setLsz] = useState({ w: String(ls.w), h: String(ls.h) });
  const [scan, setScan] = useState("");
  const [result, setResult] = useState("");
  return (
    <>
      <Panel title="الماسح الضوئي (باركود / QR)" icon={<ScanLine />} sub="الماسح يعمل كلوحة مفاتيح: يكتب الكود ثم Enter. الموديل يُضاف لاحقًا.">
        <div className="scan-test">
          <b>جرّب الماسح</b>
          <Input value={scan} placeholder="اضغط هنا ثم امسح أي ملصق" onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setResult(scan ? `تم قراءة: ${scan}` : ""); setScan(""); } }} />
          {result && <Badge tone="ok">{result}</Badge>}
        </div>
      </Panel>
      <Panel title="مقاس ملصقات QR" icon={<ScanLine />} sub="يطابق مقاس ورق طابعة الملصقات الحرارية. الافتراضي 40×30 مم."
        footer={<Button variant="primary" disabled={!(Number(lsz.w) >= 20 && Number(lsz.w) <= 120 && Number(lsz.h) >= 15 && Number(lsz.h) <= 100)} onClick={() => save({ "labels.size": { w: Number(lsz.w), h: Number(lsz.h) } })}>حفظ</Button>}>
        <div className="form-grid" style={{ ["--cols" as string]: 2 }}>
          <Field label="العرض (مم)" hint="من 20 إلى 120"><Input num value={lsz.w} onChange={(e) => setLsz({ ...lsz, w: e.target.value.replace(/\D/g, "") })} /></Field>
          <Field label="الارتفاع (مم)" hint="من 15 إلى 100"><Input num value={lsz.h} onChange={(e) => setLsz({ ...lsz, h: e.target.value.replace(/\D/g, "") })} /></Field>
        </div>
      </Panel>
      <Panel title="الطابعات" icon={<Printer />} sub="الطباعة الآن عبر نافذة طباعة Windows. اختيار الطابعة لكل نوع يأتي مع مرحلة الطباعة.">
        {[
          { icon: <Receipt />, name: "طابعة البيانات A4", sub: "البيان، كارت الإصلاح، التقارير" },
          { icon: <Receipt />, name: "طابعة الإيصالات الحرارية", sub: "إيصال 80 مم · ستُشترى" },
          { icon: <ScanLine />, name: "طابعة الملصقات", sub: "ملصقات QR للأصناف · ستُشترى" },
        ].map((d) => (
          <div className="device" key={d.name}><span className="device__icon">{d.icon}</span><span><b>{d.name}</b><br /><span className="hint-line">{d.sub}</span></span><Badge>نافذة Windows</Badge></div>
        ))}
      </Panel>
    </>
  );
}

function UsersSec() {
  const run = useAction();
  const users = useApi<User[]>("/users");
  const techs = useApi<Technician[]>("/technicians");
  const [nu, setNu] = useState<{ username: string; displayName: string; role: "admin" | "engineer"; password: string } | null>(null);
  const [pw, setPw] = useState<{ id: string; name: string; password: string } | null>(null);
  const [tech, setTech] = useState("");
  return (
    <>
      <Panel title="المستخدمون" flush actions={<Button size="sm" onClick={() => setNu({ username: "", displayName: "", role: "engineer", password: "" })}>مستخدم جديد</Button>}>
        <table className="table">
          <thead><tr><th>الاسم</th><th>اسم الدخول</th><th>الصلاحية</th><th>الحالة</th><th /></tr></thead>
          <tbody>
            {(users.data ?? []).map((u) => (
              <tr key={u.id}>
                <td className="cell-main">{u.displayName}</td><td className="lat">{u.username}</td>
                <td>{u.role === "admin" ? <Badge tone="ink">إدارة</Badge> : <Badge>مهندس</Badge>}</td>
                <td><Switch checked={!!u.active} onChange={(v) => run(() => api(`/users/${u.id}`, { method: "PATCH", body: { active: v } }), v ? "تم تفعيل الحساب." : "تم إيقاف الحساب.")}>{u.active ? "نشط" : "موقوف"}</Switch></td>
                <td><Button size="sm" variant="ghost" onClick={() => setPw({ id: u.id, name: u.displayName, password: "" })}>تغيير كلمة المرور</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="الفنيين" sub="قائمة منفصلة عن المستخدمين. يظهر كل فني على بنود الشغل وفي التقارير." flush
        footer={<div className="row"><Input size="sm" value={tech} onChange={(e) => setTech(e.target.value)} placeholder="اسم الفني" style={{ width: 220 }} /><Button size="sm" disabled={tech.trim().length < 2} onClick={async () => { const r = await run(() => api("/technicians", { method: "POST", body: { name: tech } }), "تمت إضافة الفني."); if (r) setTech(""); }}>إضافة فني</Button></div>}>
        <table className="table table--compact"><tbody>{(techs.data ?? []).map((t) => (
          <tr key={t.id}><td className="cell-main">{t.name}</td><td><Switch checked={t.active} onChange={(v) => run(() => api(`/technicians/${t.id}`, { method: "PATCH", body: { active: v } }))}>{t.active ? "نشط" : "موقوف"}</Switch></td></tr>
        ))}</tbody></table>
      </Panel>
      <Dialog open={!!nu} onClose={() => setNu(null)} title="مستخدم جديد"
        footer={<><Button onClick={() => setNu(null)}>رجوع</Button><Button variant="primary" disabled={!nu || nu.username.length < 3 || nu.displayName.length < 2 || nu.password.length < 8} onClick={async () => { const r = await run(() => api("/users", { method: "POST", body: nu }), "تمت إضافة المستخدم."); if (r) setNu(null); }}>حفظ</Button></>}>
        {nu && <div className="form-grid" style={{ ["--cols" as string]: 2 }}>
          <Field label="الاسم" required><Input value={nu.displayName} onChange={(e) => setNu({ ...nu, displayName: e.target.value })} /></Field>
          <Field label="اسم الدخول" required hint="حروف إنجليزية وأرقام"><Input className="lat" dir="ltr" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} /></Field>
          <Field label="الصلاحية"><Select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as "admin" | "engineer" })}><option value="engineer">مهندس</option><option value="admin">إدارة</option></Select></Field>
          <Field label="كلمة المرور" required hint="8 حروف على الأقل"><Input type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></Field>
        </div>}
      </Dialog>
      <Dialog open={!!pw} onClose={() => setPw(null)} title={`كلمة مرور جديدة · ${pw?.name ?? ""}`}
        footer={<><Button onClick={() => setPw(null)}>رجوع</Button><Button variant="primary" disabled={(pw?.password.length ?? 0) < 8} onClick={async () => { const r = await run(() => api(`/users/${pw!.id}`, { method: "PATCH", body: { password: pw!.password } }), "تم تغيير كلمة المرور."); if (r) setPw(null); }}>حفظ</Button></>}>
        <Field label="كلمة المرور الجديدة" hint="8 حروف على الأقل"><Input type="password" value={pw?.password ?? ""} onChange={(e) => setPw({ ...pw!, password: e.target.value })} /></Field>
      </Dialog>
    </>
  );
}

function BackupSec() {
  return (
    <Panel title="النسخ الاحتياطي" sub="نسخة يومية تلقائية على الخادم تُنسخ خارجه وتُحفظ 14 يومًا. التشغيل والاسترجاع من هنا مع مرحلة التشغيل على الخادم.">
      <p className="hint-line">الحالة تظهر هنا بعد تركيب الخادم.</p>
    </Panel>
  );
}

function GeneralSec({ s }: { s: Settings }) {
  const { digits, setDigits } = useDigits();
  const f = useFmt();
  const save = useSaveSettings();
  const [d, setD] = useState({ idle: String(s["session.idleMinutes"] ?? 15), longStay: String(s["workshop.longStayDays"] ?? 3), debtDays: String(s["alerts.debtDays"] ?? 30) });
  return (
    <Panel title="عام" footer={<Button variant="primary" onClick={() => save({ "display.digits": digits, "session.idleMinutes": Number(d.idle), "workshop.longStayDays": Number(d.longStay), "alerts.debtDays": Number(d.debtDays) })}>حفظ</Button>}>
      <div className="form-grid" style={{ ["--cols" as string]: 2 }}>
        <Field label="شكل الأرقام" hint={<>مثال: {f.s("13,000")} · {f.date("2026-10-28")}</>}>
          <Segmented label="شكل الأرقام" value={digits} onChange={setDigits} options={[{ value: "latn", label: "0123" }, { value: "arab", label: "٠١٢٣" }]} />
        </Field>
        <Field label="قفل الشاشة بعد عدم الاستخدام (دقائق)"><Select value={d.idle} onChange={(e) => setD({ ...d, idle: e.target.value })}><option value="5">5</option><option value="15">15</option><option value="30">30</option><option value="60">60</option></Select></Field>
        <Field label="تنبيه السيارة المتأخرة بالورشة بعد (أيام)"><Select value={d.longStay} onChange={(e) => setD({ ...d, longStay: e.target.value })}><option value="2">2</option><option value="3">3</option><option value="7">7</option></Select></Field>
        <Field label="تنبيه المديونية المتأخرة بعد (أيام)"><Input num value={d.debtDays} onChange={(e) => setD({ ...d, debtDays: e.target.value.replace(/\D/g, "") })} /></Field>
      </div>
    </Panel>
  );
}
