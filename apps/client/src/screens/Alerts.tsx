import { useState } from "react";
import { BellRing, Check, MessageCircle, Plus } from "lucide-react";
import { fillTemplate, firstName, whatsappLink } from "@jc/core";
import { Button, Dialog, Field, Input, Money, Panel, Textarea, useFmt } from "@jc/ui";
import { PageHead, PageState } from "../shell/Shell";
import { api } from "../data/api";
import { useAction, useApi, useLongStayDays } from "../data/hooks";
import { daysIn, Link, useIsAdmin } from "../lib";
import type { WorkOrderRow } from "../data/types";
import { carName, CarPlate, useWaTemplates } from "./common";

export type Reminder = {
  id: string; kind: "service" | "note"; dueDate: string | null; dueKm: number | null; note: string | null; doneAt: string | null; due: boolean;
  vehicleId: string | null; customerId: string | null; customerName: string | null; mobile: string | null; whatsapp: string | null;
  make: string | null; model: string | null; plateType: string | null; plateLetters: string | null; plateDigits: string | null; lastKm: number | null;
};
type AlertFeed = { reminders: Reminder[]; debts: { id: string; name: string; mobile: string | null; balance: number; since: string }[]; debtDays?: number };

/** "يوم 2026/12/01" or "عند 120,000 كم" for the WhatsApp text and the list. */
export function useWhen() {
  const f = useFmt();
  return (r: Pick<Reminder, "dueDate" | "dueKm">) => [r.dueDate && `يوم ${f.date(r.dueDate)}`, r.dueKm && `عند ${f.n(r.dueKm)} كم`].filter(Boolean).join(" أو ");
}

export function Alerts() {
  const f = useFmt();
  const run = useAction();
  const isAdmin = useIsAdmin();
  const when = useWhen();
  const tpl = useWaTemplates().find((t) => t.id === "reminder");
  const feed = useApi<AlertFeed>("/alerts");
  const open = useApi<Reminder[]>("/reminders?status=open");
  const inShop = useApi<WorkOrderRow[]>("/work-orders?status=in_shop");
  const longDays = useLongStayDays();
  const [newOpen, setNewOpen] = useState(false);
  const [n, setN] = useState({ dueDate: "", note: "" });
  const done = (r: Reminder) => run(() => api(`/reminders/${r.id}`, { method: "PATCH", body: { done: true } }), "تم.");
  const long = (inShop.data ?? []).filter((w) => daysIn(w.enteredAt) >= longDays);
  const waiting = (open.data ?? []).filter((r) => !r.due);

  const Row = ({ r }: { r: Reminder }) => {
    const car = r.make ? carName({ make: r.make, model: r.model, variant: null }) : "";
    const href = r.kind === "service" && tpl ? whatsappLink(r.whatsapp ?? r.mobile ?? "", fillTemplate(tpl.text, { "الاسم": firstName(r.customerName ?? ""), "السيارة": car || "سيارتك", "الموعد": when(r) })) : null;
    return (
      <tr>
        <td>{r.vehicleId ? <Link to={`/cars/${r.vehicleId}`}><CarPlate v={r} /></Link> : <span className="subtle">مذكرة</span>}</td>
        <td><span className="cell-main">{r.customerName ?? r.note ?? "—"}</span>{r.customerName && r.note && <span className="cell-sub">{r.note}</span>}</td>
        <td>{when(r)}{r.dueKm && r.lastKm != null && <span className="cell-sub">آخر قراءة {f.n(r.lastKm)} كم</span>}</td>
        <td><span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
          {href && <a className="btn btn--whatsapp btn--sm" href={href} target="_blank" rel="noreferrer"><MessageCircle />واتساب</a>}
          <Button size="sm" icon={<Check />} onClick={() => done(r)}>تم</Button>
        </span></td>
      </tr>
    );
  };
  const table = (rows: Reminder[], empty: string) => (
    <div className="table-wrap"><table className="table table--compact">
      <thead><tr><th>السيارة</th><th>العميل / المذكرة</th><th>الموعد</th><th><span className="sr-only">إجراءات</span></th></tr></thead>
      <tbody>{rows.map((r) => <Row key={r.id} r={r} />)}{!rows.length && <tr><td colSpan={4} className="subtle">{empty}</td></tr>}</tbody>
    </table></div>
  );

  return (
    <div className="stack">
      <PageHead title="المذكرات والتنبيهات" sub="تذكيرات الصيانة القادمة، المذكرات، والسيارات والمديونيات المتأخرة"
        actions={<Button variant="primary" icon={<Plus />} onClick={() => setNewOpen(true)}>مذكرة جديدة</Button>} />
      <PageState loading={feed.loading && !feed.data} error={feed.error} onRetry={feed.reload} />
      <Panel title="تذكيرات حان موعدها" icon={<BellRing />} flush>{table(feed.data?.reminders ?? [], "لا توجد تذكيرات مستحقة الآن.")}</Panel>
      <div className="grid-2">
        <Panel title={`سيارات في الورشة ${f.n(longDays)} أيام أو أكثر`} flush>
          <div className="table-wrap"><table className="table table--compact">
            <thead><tr><th>السيارة</th><th>أمر الشغل</th><th className="num">الأيام</th></tr></thead>
            <tbody>
              {long.map((w) => <tr key={w.id}><td><CarPlate v={w.vehicle} /></td><td><Link to={`/work-orders/${w.id}`} className="link">{f.s(w.number)}</Link> <span className="cell-sub">{w.customer.name}</span></td><td className="num">{f.n(daysIn(w.enteredAt))}</td></tr>)}
              {!long.length && <tr><td colSpan={3} className="subtle">لا توجد سيارات متأخرة.</td></tr>}
            </tbody>
          </table></div>
        </Panel>
        {isAdmin && (
          <Panel title={`مديونيات أقدم من ${f.n(feed.data?.debtDays ?? 30)} يومًا`} flush>
            <div className="table-wrap"><table className="table table--compact">
              <thead><tr><th>العميل</th><th>آخر حركة</th><th className="num">المديونية</th></tr></thead>
              <tbody>
                {(feed.data?.debts ?? []).map((d) => <tr key={d.id}><td><Link to={`/customers/${d.id}`} className="link">{d.name}</Link></td><td className="num">{f.date(d.since)}</td><td className="num"><Money pt={d.balance} cur={false} /></td></tr>)}
                {!feed.data?.debts.length && <tr><td colSpan={3} className="subtle">لا توجد مديونيات متأخرة.</td></tr>}
              </tbody>
            </table></div>
          </Panel>
        )}
      </div>
      <Panel title="تذكيرات ومذكرات قادمة" flush>{table(waiting, "لا توجد تذكيرات قادمة. أضف تذكير صيانة من صفحة أمر الشغل.")}</Panel>

      <Dialog open={newOpen} onClose={() => setNewOpen(false)} title="مذكرة جديدة"
        footer={<><Button onClick={() => setNewOpen(false)}>رجوع</Button><Button variant="primary" disabled={!n.dueDate || !n.note.trim()} onClick={async () => {
          const r = await run(() => api("/reminders", { method: "POST", body: { kind: "note", dueDate: n.dueDate, note: n.note } }), "تم حفظ المذكرة.");
          if (r) { setNewOpen(false); setN({ dueDate: "", note: "" }); }
        }}>حفظ</Button></>}>
        <div className="form-grid" style={{ ["--cols" as string]: 1 }}>
          <Field label="التاريخ" required><Input type="date" value={n.dueDate} onChange={(e) => setN({ ...n, dueDate: e.target.value })} /></Field>
          <Field label="المذكرة" required><Textarea value={n.note} onChange={(e) => setN({ ...n, note: e.target.value })} placeholder="مثال: الاتصال بالمورد بخصوص طلبية الفلاتر" /></Field>
        </div>
      </Dialog>
    </div>
  );
}
