/**
 * الموظفين: everything about the engineers and technicians in one section, apart from the general reports.
 * - Performance: the people report (cars, comebacks, labor, parts, bonuses) for any period.
 * - Money: advances, debts, repayments, expenses spent on them, bonuses, and what each one owes the shop.
 * - Attendance: waits for the network fingerprint clock.
 * - Team: the technicians list (engineers are user accounts, managed under المستخدمين).
 */
import { useState } from "react";
import { Fingerprint, HandCoins, UserPlus } from "lucide-react";
import { Badge, Button, Dialog, EmptyState, Field, Input, Money, Panel, Select, Switch, useFmt } from "@jc/ui";
import { toPt } from "@jc/core";
import { PageHead, PageState } from "../shell/Shell";
import { api } from "../data/api";
import { useAction, useApi } from "../data/hooks";
import type { Technician } from "../data/types";
import { Link, useCan } from "../lib";
import { Reports } from "./Reports";

type Kind = "advance" | "debt" | "repayment" | "expense" | "bonus";
const KIND: Record<Kind, string> = { advance: "سلفة / مسحوبات", debt: "مديونية", repayment: "سداد", expense: "مصروف", bonus: "حافز" };
const KIND_HINT: Record<Kind, string> = {
  advance: "فلوس أخدها الموظف وهيرجّعها أو تتخصم منه. بتزوّد اللي عليه.",
  debt: "حاجة على الموظف من غير فلوس من الخزنة (قطعة أخدها مثلًا). بتزوّد اللي عليه.",
  repayment: "الموظف رجّع فلوس أو اتخصمت منه. بتقلّل اللي عليه.",
  expense: "فلوس اتصرفت على الموظف ومش هترجع (مواصلات، أكل). بتتخصم من الربح.",
  bonus: "مكافأة للموظف. بتتخصم من الربح وتظهر في تقرير الأداء.",
};
type Person = { userId: string | null; technicianId: string | null; name: string; role: string; active: boolean; owedPt: number; advancePt: number; debtPt: number; repaymentPt: number; expensePt: number; bonusPt: number };
type Entry = { id: string; kind: Kind; person: string; amountPt: number; at: string; fromCash: boolean; note: string | null };
type StaffData = { month: string; people: Person[]; entries: Entry[] };

const thisMonth = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }).slice(0, 7);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const keyOf = (p: Person) => (p.userId ? `u:${p.userId}` : `t:${p.technicianId}`);

export function StaffPerformance() {
  return <Reports fixed="people" />;
}

export function StaffMoney() {
  const f = useFmt();
  const canBonus = useCan("bonus.manage");
  const [month, setMonth] = useState(thisMonth());
  const s = useApi<StaffData>(`/staff?month=${month}`);
  const [d, setD] = useState<{ who: string; kind: Kind; amount: string; date: string; fromCash: boolean; note: string } | null>(null);
  const run = useAction();
  const people = s.data?.people ?? [];
  const open = (who = people.find((p) => p.active) ?? people[0], kind: Kind = "advance") => who && setD({ who: keyOf(who), kind, amount: "", date: today(), fromCash: kind !== "debt", note: "" });
  const cashOk = d && d.kind !== "debt" && d.kind !== "bonus";

  async function save() {
    const [t, id] = d!.who.split(":");
    const who = t === "u" ? { userId: id } : { technicianId: id };
    const amountPt = toPt(d!.amount);
    const r = d!.kind === "bonus"
      ? await run(() => api("/bonuses", { method: "POST", body: { ...who, amountPt, givenAt: d!.date, reason: d!.note.trim() || "حافز" } }), "تم تسجيل الحافز.")
      : await run(() => api("/staff/entries", { method: "POST", body: { ...who, kind: d!.kind, amountPt, at: d!.date, fromCash: !!cashOk && d!.fromCash, note: d!.note.trim() || undefined } }), `تم تسجيل ${KIND[d!.kind]}.`);
    if (r) { setD(null); s.reload(); }
  }

  return (
    <div>
      <PageHead title="السلف والمصروفات والمديونيات" sub="اللي على كل موظف للمحل، وحركات الشهر: سلف ومديونيات وسداد ومصروفات وحوافز."
        actions={<>
          <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="الشهر" style={{ width: 170 }} />
          <Button variant="primary" icon={<HandCoins />} disabled={!people.length} onClick={() => open()}>تسجيل حركة</Button>
        </>} />
      {!s.data ? <PageState loading={s.loading} error={s.error} onRetry={s.reload} /> : <div className="stack">
        <Panel title="الموظفين" sub="«عليه» = السلف والمديونيات من الأول ناقص اللي سدّده." flush>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>الاسم</th><th>الصفة</th><th className="num">سلف الشهر</th><th className="num">مديونيات الشهر</th><th className="num">سداد الشهر</th><th className="num">مصروفات الشهر</th><th className="num">حوافز الشهر</th><th className="num">عليه</th><th /></tr></thead>
            <tbody>{people.map((p) => (
              <tr key={keyOf(p)}>
                <td className="cell-main">{p.name}{!p.active && <> <Badge tone="outline">موقوف</Badge></>}</td>
                <td>{p.role}</td>
                <td className="num"><Money pt={p.advancePt} /></td>
                <td className="num"><Money pt={p.debtPt} /></td>
                <td className="num"><Money pt={p.repaymentPt} /></td>
                <td className="num"><Money pt={p.expensePt} /></td>
                <td className="num"><Money pt={p.bonusPt} /></td>
                <td className="num"><Money pt={p.owedPt} strong /></td>
                <td><Button size="sm" variant="ghost" aria-label={`تسجيل حركة لـ ${p.name}`} onClick={() => open(p)}>حركة</Button></td>
              </tr>
            ))}</tbody>
          </table></div>
        </Panel>
        <Panel title={`حركات ${month}`} flush>
          {!s.data.entries.length ? <p className="subtle" style={{ padding: 16 }}>مفيش حركات في الشهر ده.</p> : (
            <div className="table-wrap"><table className="table table--compact">
              <thead><tr><th>التاريخ</th><th>الموظف</th><th>النوع</th><th>من الخزنة</th><th>ملاحظة</th><th className="num">المبلغ</th></tr></thead>
              <tbody>{s.data.entries.map((e) => (
                <tr key={e.id}><td>{f.date(e.at)}</td><td className="cell-main">{e.person}</td><td>{KIND[e.kind]}</td><td>{e.fromCash ? "نعم" : "لا"}</td><td className="muted">{e.note}</td><td className="num"><Money pt={e.amountPt} /></td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Panel>
      </div>}

      <Dialog open={!!d} onClose={() => setD(null)} title="تسجيل حركة موظف"
        footer={<><Button onClick={() => setD(null)}>رجوع</Button><Button variant="primary" disabled={!d || !(toPt(d.amount) > 0)} onClick={save}>حفظ</Button></>}>
        {d && <div className="form-grid" style={{ ["--cols" as string]: 2 }}>
          <Field label="الموظف"><Select value={d.who} onChange={(e) => setD({ ...d, who: e.target.value })}>{people.map((p) => <option key={keyOf(p)} value={keyOf(p)}>{p.name} · {p.role}</option>)}</Select></Field>
          <Field label="النوع" hint={KIND_HINT[d.kind]}>
            <Select value={d.kind} onChange={(e) => { const kind = e.target.value as Kind; setD({ ...d, kind, fromCash: kind !== "debt" && kind !== "bonus" }); }}>
              {(Object.keys(KIND) as Kind[]).filter((k) => k !== "bonus" || canBonus).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
            </Select>
          </Field>
          <Field label="المبلغ"><Input num value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} /></Field>
          <Field label="التاريخ"><Input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
          <div style={{ gridColumn: "1 / -1" }}><Field label={d.kind === "bonus" ? "السبب" : "ملاحظة"}><Input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></Field></div>
          {cashOk && <div style={{ gridColumn: "1 / -1" }}><Switch checked={d.fromCash} onChange={(v) => setD({ ...d, fromCash: v })}>{d.kind === "repayment" ? "دخل خزنة المحل (يظهر في صندوق الكاش)" : "خرج من خزنة المحل (يظهر في صندوق الكاش)"}</Switch></div>}
          <p className="hint-line" style={{ gridColumn: "1 / -1" }}>الحركة مش بتتعدل ولا تتمسح بعد الحفظ. لو سجّلت سلفة غلط، سجّل سداد بنفس المبلغ.</p>
        </div>}
      </Dialog>
    </div>
  );
}

export function StaffAttendance() {
  return (
    <div>
      <PageHead title="الحضور والانصراف" sub="حضور وانصراف المهندسين والفنيين من جهاز البصمة." />
      <EmptyState icon={<Fingerprint />} title="مستني جهاز البصمة"
        body="أول ما جهاز البصمة يتركّب على شبكة المحل، الحضور والانصراف هيتسجلوا هنا لوحدهم: مين جه، مين اتأخر، مين غاب، والساعات الإضافية لكل موظف." />
    </div>
  );
}

export function StaffTeam() {
  const run = useAction();
  const techs = useApi<Technician[]>("/technicians");
  const staff = useApi<StaffData>(`/staff?month=${thisMonth()}`);
  const [name, setName] = useState("");
  const engineers = (staff.data?.people ?? []).filter((p) => p.userId);
  return (
    <div>
      <PageHead title="الفريق" sub="المهندسين والفنيين اللي بيظهروا على أوامر الشغل وفي الأداء والحسابات." />
      <div className="stack">
        <Panel title="الفنيين" sub="الفني مش محتاج حساب دخول. بيتحدد على أمر الشغل." flush
          footer={<div className="row"><Input size="sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الفني" aria-label="اسم الفني" style={{ width: 220 }} /><Button size="sm" icon={<UserPlus />} disabled={name.trim().length < 2} onClick={async () => { const r = await run(() => api("/technicians", { method: "POST", body: { name: name.trim() } }), "تمت إضافة الفني."); if (r) { setName(""); techs.reload(); } }}>إضافة فني</Button></div>}>
          <PageState loading={techs.loading && !techs.data} error={techs.error} onRetry={techs.reload} />
          <table className="table table--compact"><tbody>{(techs.data ?? []).map((t) => (
            <tr key={t.id}><td className="cell-main">{t.name}</td><td><Switch checked={t.active} onChange={async (v) => { if (await run(() => api(`/technicians/${t.id}`, { method: "PATCH", body: { active: v } }))) techs.reload(); }}>{t.active ? "نشط" : "موقوف"}</Switch></td></tr>
          ))}</tbody></table>
        </Panel>
        <Panel title="المهندسين والإدارة" sub={<>دول حسابات دخول. الإضافة والصلاحيات من <Link to="/users">المستخدمين والصلاحيات</Link>.</>} flush>
          <table className="table table--compact"><tbody>{engineers.map((p) => (
            <tr key={keyOf(p)}><td className="cell-main">{p.name}</td><td>{p.role}</td><td>{p.active ? "نشط" : "موقوف"}</td></tr>
          ))}</tbody></table>
        </Panel>
      </div>
    </div>
  );
}
