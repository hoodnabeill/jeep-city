import { useState } from "react";
import { Plus, Search, SearchX } from "lucide-react";
import { Badge, Button, EmptyState, Input, Money, Segmented, useFmt } from "@jc/ui";
import { PageHead, PageState } from "../shell/Shell";
import { go } from "../lib";
import { qs, useApi } from "../data/hooks";
import type { PaymentMethod, StatementRow } from "../data/types";
import { CarPlate } from "./common";

export function Statements() {
  const f = useFmt();
  const [q, setQ] = useState("");
  const [st, setSt] = useState<"all" | "paid" | "credit" | "cancelled">("all");
  const list = useApi<StatementRow[]>(`/statements?${qs({ q: q.trim().length >= 2 ? q.trim() : undefined, status: st === "cancelled" ? "cancelled" : undefined })}`);
  const methods = useApi<PaymentMethod[]>("/payment-methods");
  const label = (id: string) => methods.data?.find((m) => m.id === id)?.label ?? id;
  const isCredit = (id: string) => !!methods.data?.find((m) => m.id === id)?.isCredit;
  const rows = (list.data ?? []).filter((s) => st === "all" || st === "cancelled" || (s.status === "final" && (st === "paid" ? s.paidPt >= s.amountDuePt : s.paidPt < s.amountDuePt)));
  const total = rows.filter((s) => s.status !== "cancelled").reduce((a, s) => a + s.amountDuePt, 0);
  return (
    <div>
      <PageHead title="بيانات العملاء" sub={(list.data?.length ?? 0) >= 200
        ? <>آخر {f.n(rows.length)} بيان · الإجمالي <Money pt={total} /> · ابحث برقم البيان أو العميل أو اللوحة لأي بيان أقدم</>
        : <>{f.n(rows.length)} بيانات · الإجمالي <Money pt={total} /></>}
        actions={<Button variant="primary" icon={<Plus />} onClick={() => go("/reception")}>بيان من أمر شغل</Button>} />
      <div className="toolbar">
        <div className="input-group grow"><Search /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="رقم البيان، العميل أو اللوحة" aria-label="بحث في البيانات" /></div>
        <Segmented label="حالة الدفع" value={st} onChange={setSt} options={[{ value: "all", label: "الكل" }, { value: "paid", label: "مدفوع" }, { value: "credit", label: "آجل / متبقي" }, { value: "cancelled", label: "ملغي" }]} />
      </div>
      <PageState loading={list.loading && !list.data} error={list.error} onRetry={list.reload} />
      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>رقم البيان</th><th>التاريخ</th><th>أمر الشغل</th><th>العميل</th><th>اللوحة</th><th>بواسطة</th><th>طرق الدفع</th><th className="num">المطلوب</th><th className="num">المدفوع</th><th>الحالة</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="is-clickable" tabIndex={0} onClick={() => go(`/statements/${s.id}`)} onKeyDown={(e) => e.key === "Enter" && go(`/statements/${s.id}`)}>
                  <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{s.kind !== "statement" && <span className="muted" style={{ fontFamily: "var(--font-ar)", fontWeight: 600, fontSize: 12 }}>{s.kind === "byte" ? "بايت" : "بيع مباشر"} </span>}{f.s(s.number)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{f.date(s.date)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{s.workOrderNumber ? f.s(s.workOrderNumber) : "—"}</td>
                  <td className="cell-main">{s.customer.name}</td>
                  <td>{s.vehicle && <CarPlate v={s.vehicle} />}</td>
                  <td>{s.by}</td>
                  <td><span className="row" style={{ gap: 4 }}>{s.methods.map((m) => <Badge key={m} tone={isCredit(m) ? "warn" : "neutral"}>{label(m)}</Badge>)}</span></td>
                  <td className="num"><Money pt={s.amountDuePt} cur={false} /></td>
                  <td className="num"><Money pt={s.paidPt} cur={false} /></td>
                  <td>{s.status === "cancelled" ? <Badge tone="bad">ملغي</Badge> : s.paidPt >= s.amountDuePt ? <Badge tone="ok">مدفوع</Badge> : <Badge tone="warn">متبقي <Money pt={s.amountDuePt - s.paidPt} cur={false} /></Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.data && rows.length === 0 && <EmptyState icon={<SearchX />} title="لا توجد بيانات بهذا البحث" body="جرّب رقم البيان كاملًا أو جزءًا من اسم العميل." />}
      </div>
    </div>
  );
}
