import { useState } from "react";
import { HandCoins, Plus, Trash2, UsersRound } from "lucide-react";
import { Button, Dialog, EmptyState, Field, Input, Money, Panel, Select, Switch, useFmt } from "@jc/ui";
import { BP, toPt } from "@jc/core";
import { PageHead, PageState } from "../shell/Shell";
import { api } from "../data/api";
import { useAction, useApi } from "../data/hooks";

type Partner = { id: string; name: string; shareBp: number };
type Row = Partner & { sharePt: number; monthTakenPt: number; earnedPt: number; allTakenPt: number; balancePt: number };
type Summary = {
  month: string;
  profit: Record<"newSalesPt" | "taxPt" | "cogsPt" | "expensesPt" | "bonusesPt" | "returnsPt" | "returnedCostPt" | "byteSalesPt" | "profitPt", number>;
  partners: Row[];
  withdrawals: { id: string; partner: string; amountPt: number; takenAt: string; fromCash: boolean; note: string | null }[];
};

const thisMonth = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }).slice(0, 7);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

export function PartnersScreen() {
  const f = useFmt();
  const [month, setMonth] = useState(thisMonth());
  const s = useApi<Summary>(`/partners/summary?month=${month}`);
  const [shares, setShares] = useState<{ id?: string; name: string; pct: string }[] | null>(null);
  const [take, setTake] = useState<{ partnerId: string; amount: string; date: string; fromCash: boolean; note: string } | null>(null);
  const run = useAction();
  const p = s.data?.profit;
  const rows = s.data?.partners ?? [];
  const pctTotal = (shares ?? []).reduce((a, x) => a + (Number(x.pct) || 0), 0);

  return (
    <div>
      <PageHead title="الشركاء" sub="صافي الربح الشهري ونصيب كل شريك، والمسحوبات والرصيد المستحق لكل شريك."
        actions={<>
          <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="الشهر" style={{ width: 170 }} />
          <Button icon={<UsersRound />} onClick={() => setShares(rows.length ? rows.map((r) => ({ id: r.id, name: r.name, pct: String(r.shareBp / 100) })) : [{ name: "", pct: "50" }, { name: "", pct: "50" }])}>الشركاء والنسب</Button>
          <Button variant="primary" icon={<HandCoins />} disabled={!rows.length} onClick={() => setTake({ partnerId: rows[0].id, amount: "", date: today(), fromCash: true, note: "" })}>تسجيل مسحوبات</Button>
        </>} />

      {!s.data ? <PageState loading={s.loading} error={s.error} onRetry={s.reload} /> : <div className="stack">
        <Panel title={`صافي ربح ${month}`} sub="من بيانات النظام الجديد فقط. بيانات بايت القديمة بلا تكلفة فلا تدخل في الربح.">
          <div className="strip">
            <Cell label="المبيعات بدون ضريبة" pt={p!.newSalesPt - p!.taxPt} />
            <Cell label="تكلفة القطع المباعة" pt={-p!.cogsPt} />
            <Cell label="المصروفات" pt={-p!.expensesPt} />
            <Cell label="حوافز الفنيين" pt={-p!.bonusesPt} />
            <Cell label="المرتجعات (بعد رجوع القطع)" pt={-(p!.returnsPt - p!.returnedCostPt)} />
            <Cell label="صافي الربح" pt={p!.profitPt} strong />
          </div>
        </Panel>

        {!rows.length ? (
          <EmptyState icon={<UsersRound />} title="لم تُسجل أسماء الشركاء بعد" body="أضف الشركاء ونسبة كل واحد من الربح. مجموع النسب لازم يكون 100%." action={<Button variant="primary" onClick={() => setShares([{ name: "", pct: "50" }, { name: "", pct: "50" }])}>إضافة الشركاء</Button>} />
        ) : (
          <Panel title="نصيب الشركاء" flush>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>الشريك</th><th className="num">النسبة</th><th className="num">نصيب الشهر</th><th className="num">مسحوبات الشهر</th><th className="num">إجمالي النصيب حتى آخر الشهر</th><th className="num">إجمالي المسحوبات</th><th className="num">الرصيد المستحق</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td className="cell-main">{r.name}</td>
                  <td className="num">{f.n(r.shareBp / 100)}%</td>
                  <td className="num"><Money pt={r.sharePt} /></td>
                  <td className="num"><Money pt={r.monthTakenPt} /></td>
                  <td className="num"><Money pt={r.earnedPt} /></td>
                  <td className="num"><Money pt={r.allTakenPt} /></td>
                  <td className="num"><Money pt={r.balancePt} strong /></td>
                </tr>
              ))}</tbody>
            </table></div>
          </Panel>
        )}

        {!!s.data.withdrawals.length && (
          <Panel title={`مسحوبات ${month}`} flush>
            <div className="table-wrap"><table className="table table--compact">
              <thead><tr><th>التاريخ</th><th>الشريك</th><th>من الخزنة</th><th>ملاحظة</th><th className="num">المبلغ</th></tr></thead>
              <tbody>{s.data.withdrawals.map((w) => (
                <tr key={w.id}><td>{f.date(w.takenAt)}</td><td className="cell-main">{w.partner}</td><td>{w.fromCash ? "نعم" : "لا"}</td><td className="muted">{w.note}</td><td className="num"><Money pt={w.amountPt} /></td></tr>
              ))}</tbody>
            </table></div>
          </Panel>
        )}
      </div>}

      <Dialog open={!!shares} onClose={() => setShares(null)} title="الشركاء والنسب"
        footer={<><span className="muted" style={{ marginInlineEnd: "auto" }}>المجموع: {f.n(pctTotal)}%</span><Button onClick={() => setShares(null)}>رجوع</Button>
          <Button variant="primary" disabled={Math.round(pctTotal * 100) !== BP || shares?.some((x) => x.name.trim().length < 2)} onClick={async () => {
            const r = await run(() => api("/partners", { method: "PUT", body: shares!.map((x) => ({ id: x.id, name: x.name.trim(), shareBp: Math.round(Number(x.pct) * 100) })) }), "تم حفظ الشركاء والنسب.");
            if (r) { setShares(null); s.reload(); }
          }}>حفظ</Button></>}>
        {shares && <div className="stack" style={{ gap: 10 }}>
          {shares.map((x, i) => (
            <div key={i} className="row" style={{ gap: 8, alignItems: "end" }}>
              <Field label="اسم الشريك"><Input value={x.name} onChange={(e) => setShares(shares.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} /></Field>
              <Field label="النسبة %"><Input num value={x.pct} onChange={(e) => setShares(shares.map((y, j) => (j === i ? { ...y, pct: e.target.value } : y)))} style={{ width: 100 }} /></Field>
              <Button variant="ghost" aria-label="حذف الشريك" icon={<Trash2 />} disabled={shares.length < 2} onClick={() => setShares(shares.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setShares([...shares, { name: "", pct: "0" }])}>إضافة شريك</Button>
          <p className="hint-line">تغيير النسب يُحسب على كل الأرباح السابقة في الرصيد المستحق. كل تغيير يُسجل في سجل العمليات.</p>
        </div>}
      </Dialog>

      <Dialog open={!!take} onClose={() => setTake(null)} title="تسجيل مسحوبات شريك"
        footer={<><Button onClick={() => setTake(null)}>رجوع</Button><Button variant="primary" disabled={!take || !toPt(take.amount)} onClick={async () => {
          const r = await run(() => api("/partners/withdrawals", { method: "POST", body: { partnerId: take!.partnerId, amountPt: toPt(take!.amount), takenAt: take!.date, fromCash: take!.fromCash, note: take!.note || undefined } }), "تم تسجيل المسحوبات.");
          if (r) { setTake(null); s.reload(); }
        }}>حفظ</Button></>}>
        {take && <div className="form-grid" style={{ ["--cols" as string]: 2 }}>
          <Field label="الشريك"><Select value={take.partnerId} onChange={(e) => setTake({ ...take, partnerId: e.target.value })}>{rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          <Field label="المبلغ" hint="بالسالب لو الشريك رجّع مبلغ"><Input num value={take.amount} onChange={(e) => setTake({ ...take, amount: e.target.value })} /></Field>
          <Field label="التاريخ"><Input type="date" value={take.date} onChange={(e) => setTake({ ...take, date: e.target.value })} /></Field>
          <Field label="ملاحظة"><Input value={take.note} onChange={(e) => setTake({ ...take, note: e.target.value })} /></Field>
          <div style={{ gridColumn: "1 / -1" }}><Switch checked={take.fromCash} onChange={(v) => setTake({ ...take, fromCash: v })}>خرج من خزنة المحل (يظهر في صندوق الكاش)</Switch></div>
          <p className="hint-line" style={{ gridColumn: "1 / -1" }}>المسحوبات لا تُعدل ولا تُحذف بعد الحفظ. للتصحيح سجّل نفس المبلغ بالسالب.</p>
        </div>}
      </Dialog>
    </div>
  );
}

function Cell({ label, pt, strong }: { label: string; pt: number; strong?: boolean }) {
  return <div className="strip__cell"><span className="strip__label">{label}</span><span className="strip__value"><Money pt={pt || 0} strong={strong} /></span></div>; // || 0 turns -0 into 0
}
