import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Lock, Minus, Plus, Unlock } from "lucide-react";
import { Badge, Button, Dialog, EmptyState, Field, Input, Money, Panel, Segmented, Select, Textarea, useFmt, When } from "@jc/ui";
import { PageHead, PageState } from "../shell/Shell";
import { api } from "../data/api";
import { useAction, useApi } from "../data/hooks";
import type { CashCurrent } from "../data/types";
import { toPt } from "@jc/core";

const KIND: Record<string, string> = {
  statement_payment: "دفعة بيان", debt_payment: "تحصيل مديونية", refund: "رد مبلغ لعميل", expense: "مصروف", supplier_payment: "دفعة لمورد",
  supplier_refund: "رد من مورد", deposit: "إيداع", withdrawal: "سحب",
};
type Session = { id: string; openedAt: string; closedAt: string | null; openingPt: number; expectedPt: number | null; countedPt: number | null; differencePt: number | null; note: string | null };

export function CashDrawer() {
  const f = useFmt();
  const run = useAction();
  const cur = useApi<CashCurrent>("/cash/current");
  const sessions = useApi<Session[]>("/cash/sessions");
  const cats = useApi<{ id: string; name: string }[]>("/expense-categories");
  const [openAmt, setOpenAmt] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [exp, setExp] = useState<{ categoryId: string; amount: string; paidBy: string; notes: string } | null>(null);
  const [mov, setMov] = useState<{ kind: "deposit" | "withdrawal"; amount: string; note: string } | null>(null);
  const c = cur.data;
  if (!c) return <PageState loading={cur.loading} error={cur.error} onRetry={cur.reload} />;
  const countedPt = toPt(counted) || 0;
  const diff = c.open && counted ? countedPt - c.expectedPt : 0;
  return (
    <div className="stack">
      <PageHead title="صندوق الكاش" sub={c.open ? <>يومية مفتوحة منذ <When iso={c.session.openedAt} /></> : "لا توجد يومية مفتوحة"}
        actions={c.open && <>
          <Button icon={<Minus />} onClick={() => setExp({ categoryId: cats.data?.[0]?.id ?? "", amount: "", paidBy: "", notes: "" })}>مصروف</Button>
          <Button icon={<Plus />} onClick={() => setMov({ kind: "deposit", amount: "", note: "" })}>إيداع / سحب</Button>
          <Button variant="primary" icon={<Lock />} onClick={() => { setCounted(""); setNote(""); setCloseOpen(true); }}>إقفال اليومية</Button>
        </>} />

      {!c.open ? (
        <Panel title="فتح يومية جديدة">
          <div className="row" style={{ alignItems: "flex-end" }}>
            <Field label="رصيد الافتتاح (الموجود في الدرج الآن)"><Input num type="number" min={0} value={openAmt} onChange={(e) => setOpenAmt(e.target.value)} style={{ width: 220 }} /></Field>
            <Button variant="primary" icon={<Unlock />} disabled={openAmt === ""} onClick={() => run(() => api("/cash/open", { method: "POST", body: { openingPt: toPt(openAmt) } }), "تم فتح اليومية.")}>فتح اليومية</Button>
          </div>
        </Panel>
      ) : (
        <>
          <div className="strip">
            <div className="strip__cell"><span className="strip__label">رصيد الافتتاح</span><span className="strip__value"><Money pt={c.session.openingPt} /></span></div>
            <div className="strip__cell"><span className="strip__label">داخل</span><span className="strip__value" style={{ color: "var(--ok)" }}><Money pt={c.inPt} /></span></div>
            <div className="strip__cell"><span className="strip__label">خارج</span><span className="strip__value" style={{ color: "var(--bad)" }}><Money pt={c.outPt} /></span></div>
            <div className="strip__cell" style={{ background: "var(--surface-raised)" }}><span className="strip__label">المفروض في الدرج الآن</span><span className="strip__value"><Money pt={c.expectedPt} /></span><span className="strip__note">الكاش فقط · الفيزا والتحويلات خارج الصندوق</span></div>
          </div>
          <Panel title="حركات اليومية" flush>
            {c.movements.length ? (
              <table className="table">
                <thead><tr><th>الوقت</th><th>الحركة</th><th>ملاحظة</th><th>بواسطة</th><th className="num">المبلغ</th></tr></thead>
                <tbody>
                  {c.movements.map((m) => (
                    <tr key={m.id}>
                      <td><When iso={m.movedAt} /></td>
                      <td><span className="row" style={{ gap: 8 }}>{m.amountPt > 0 ? <ArrowDownLeft size={16} color="var(--ok)" /> : <ArrowUpRight size={16} color="var(--bad)" />}{KIND[m.kind] ?? m.kind}</span></td>
                      <td className="muted">{m.note ?? ""}</td>
                      <td>{m.by}</td>
                      <td className="num" style={{ fontWeight: 700, color: m.amountPt > 0 ? "var(--ok)" : "var(--bad)" }}>{m.amountPt > 0 ? "+" : "−"}<Money pt={Math.abs(m.amountPt)} cur={false} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState icon={<ArrowDownLeft />} title="لا توجد حركات بعد" body="دفعات الكاش من البيانات والمصروفات تظهر هنا تلقائيًا." />}
          </Panel>
        </>
      )}

      <Panel title="آخر اليوميات" flush>
        <table className="table table--compact">
          <thead><tr><th>الفتح</th><th>الإقفال</th><th className="num">المفروض</th><th className="num">الفعلي</th><th className="num">الفرق</th><th>ملاحظة</th></tr></thead>
          <tbody>
            {(sessions.data ?? []).filter((s) => s.closedAt).map((s) => (
              <tr key={s.id}>
                <td><When iso={s.openedAt} /></td><td><When iso={s.closedAt!} /></td>
                <td className="num"><Money pt={s.expectedPt ?? 0} cur={false} /></td>
                <td className="num"><Money pt={s.countedPt ?? 0} cur={false} /></td>
                <td className="num">{s.differencePt === 0 ? <Badge tone="ok">مطابق</Badge> : <Badge tone={(s.differencePt ?? 0) < 0 ? "bad" : "warn"}>{(s.differencePt ?? 0) > 0 ? "+" : "−"}<Money pt={Math.abs(s.differencePt ?? 0)} cur={false} /></Badge>}</td>
                <td className="muted">{s.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Dialog open={closeOpen} onClose={() => setCloseOpen(false)} title="إقفال يومية الصندوق"
        footer={<><Button onClick={() => setCloseOpen(false)}>رجوع</Button><Button variant="primary" disabled={!counted || (diff !== 0 && !note.trim())} onClick={async () => {
          const r = await run(() => api("/cash/close", { method: "POST", body: { countedPt, note: note || undefined } }), "تم إقفال اليومية وحفظ الفرق في السجل.");
          if (r) setCloseOpen(false);
        }}>إقفال اليومية</Button></>}>
        {c.open && <div className="stack" style={{ gap: 16 }}>
          <div className="odo" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <div><span className="odo__label">المفروض</span><span className="odo__val"><Money pt={c.expectedPt} cur={false} /></span></div>
            <div><label className="odo__label" htmlFor="counted">العدّ الفعلي</label><input id="counted" className="input num" inputMode="decimal" value={counted} autoFocus placeholder="0" onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ""))} /></div>
            <div><span className="odo__label">الفرق</span><span className="odo__val" style={{ color: diff === 0 ? "var(--ok)" : diff < 0 ? "var(--bad)" : "var(--warn)" }}>{counted ? `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${f.pt(Math.abs(diff))}` : "—"}</span></div>
          </div>
          {counted && diff !== 0 && <Field label="سبب الفرق" required hint="يُسجل في سجل المراجعة باسمك."><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={diff < 0 ? "مثال: فكة ناقصة 100 جنيه" : "مثال: دفعة عميل لم تُسجل"} /></Field>}
          {counted && diff === 0 && <p style={{ color: "var(--ok)", fontWeight: 700 }}>الصندوق مطابق.</p>}
        </div>}
      </Dialog>

      <Dialog open={!!exp} onClose={() => setExp(null)} title="تسجيل مصروف من الصندوق"
        footer={<><Button onClick={() => setExp(null)}>رجوع</Button><Button variant="primary" disabled={!exp?.amount || !exp.categoryId} onClick={async () => {
          const r = await run(() => api("/expenses", { method: "POST", body: { categoryId: exp!.categoryId, amountPt: toPt(exp!.amount), paidBy: exp!.paidBy || undefined, notes: exp!.notes || undefined, fromCash: true } }), "سُجل المصروف وخُصم من الصندوق.");
          if (r) setExp(null);
        }}>حفظ المصروف</Button></>}>
        {exp && <div className="form-grid" style={{ ["--cols" as string]: 2 }}>
          <Field label="البند" required hint="البنود تتعدل من الإعدادات"><Select value={exp.categoryId} onChange={(e) => setExp({ ...exp, categoryId: e.target.value })}>{(cats.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
          <Field label="المبلغ" required><Input num type="number" min={0} value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} /></Field>
          <Field label="دفعه"><Input value={exp.paidBy} onChange={(e) => setExp({ ...exp, paidBy: e.target.value })} /></Field>
          <Field label="ملاحظات"><Input value={exp.notes} onChange={(e) => setExp({ ...exp, notes: e.target.value })} /></Field>
        </div>}
      </Dialog>

      <Dialog open={!!mov} onClose={() => setMov(null)} title="إيداع أو سحب من الصندوق"
        footer={<><Button onClick={() => setMov(null)}>رجوع</Button><Button variant="primary" disabled={!mov?.amount || (mov?.note.trim().length ?? 0) < 2} onClick={async () => {
          const r = await run(() => api("/cash/movements", { method: "POST", body: { kind: mov!.kind, amountPt: toPt(mov!.amount), note: mov!.note } }), "سُجلت الحركة.");
          if (r) setMov(null);
        }}>حفظ</Button></>}>
        {mov && <div className="form-grid" style={{ ["--cols" as string]: 2 }}>
          <Field label="النوع" className="span-all"><Segmented label="النوع" value={mov.kind} onChange={(k) => setMov({ ...mov, kind: k })} options={[{ value: "deposit", label: "إيداع في الدرج" }, { value: "withdrawal", label: "سحب من الدرج" }]} /></Field>
          <Field label="المبلغ" required><Input num type="number" min={0} value={mov.amount} onChange={(e) => setMov({ ...mov, amount: e.target.value })} /></Field>
          <Field label="السبب" required><Input value={mov.note} onChange={(e) => setMov({ ...mov, note: e.target.value })} placeholder="مثال: توريد للبنك" /></Field>
        </div>}
      </Dialog>
    </div>
  );
}
