import { useState } from "react";
import { Plus, Search, SearchX } from "lucide-react";
import { Badge, Button, EmptyState, Input, Segmented, Select, useFmt, When } from "@jc/ui";
import { PageHead, PageState } from "../shell/Shell";
import { daysIn, go } from "../lib";
import { qs, useApi } from "../data/hooks";
import type { User, WOStatus, WorkOrderRow } from "../data/types";
import { carName, CarPlate, StatusBadge, WO_TYPE } from "./common";

export function Reception() {
  const f = useFmt();
  const [status, setStatus] = useState<"in_shop" | "all" | WOStatus>("in_shop");
  const [eng, setEng] = useState("");
  const [q, setQ] = useState("");
  const users = useApi<User[]>("/users");
  const list = useApi<WorkOrderRow[]>(`/work-orders?${qs({ status: status === "all" ? undefined : status, engineerId: eng, q: q.trim().length >= 2 ? q.trim() : undefined })}`);
  const rows = list.data ?? [];
  return (
    <div>
      <PageHead title="الاستقبال وأوامر الشغل"
        sub={<>{f.n(rows.length)} أمر في هذه القائمة</>}
        actions={<Button variant="primary" icon={<Plus />} onClick={() => go("/intake")}>استقبال سيارة</Button>} />
      <div className="toolbar">
        <div className="input-group grow">
          <Search />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="رقم الأمر، اللوحة، الشاسيه أو العميل" aria-label="بحث في أوامر الشغل" />
        </div>
        <Segmented label="الحالة" value={status} onChange={setStatus} options={[
          { value: "in_shop", label: "في الورشة" }, { value: "open", label: "جاري الشغل" }, { value: "ready", label: "جاهز للتسليم" }, { value: "delivered", label: "تم التسليم" }, { value: "all", label: "الكل" },
        ]} />
        <Select value={eng} onChange={(e) => setEng(e.target.value)} aria-label="المهندس" style={{ width: 200 }}>
          <option value="">كل المهندسين</option>
          {(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
        </Select>
      </div>
      <PageState loading={list.loading && !list.data} error={list.error} onRetry={list.reload} />
      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>رقم الأمر</th><th>الدخول</th><th>اللوحة</th><th>السيارة والشاسيه</th><th>العميل</th><th>مهندس الاستقبال</th><th>النوع</th><th>الحالة</th><th>ملاحظات</th></tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const days = daysIn(w.enteredAt);
                return (
                  <tr key={w.id} className="is-clickable" onClick={() => go(`/work-orders/${w.id}`)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && go(`/work-orders/${w.id}`)}>
                    <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{f.s(w.number)}</td>
                    <td><When iso={w.enteredAt} /></td>
                    <td><CarPlate v={w.vehicle} /></td>
                    <td><span className="cell-main lat">{carName(w.vehicle)}</span><span className="cell-sub lat">{w.vehicle?.chassis}</span></td>
                    <td>{w.customer.name}</td>
                    <td>{w.engineer}</td>
                    <td>{WO_TYPE[w.type]}</td>
                    <td><StatusBadge status={w.status} />{(w.status === "open" || w.status === "ready") && days >= 3 && <> <Badge tone="warn">{f.n(days)} أيام</Badge></>}</td>
                    <td style={{ maxWidth: 260 }}><span className="cell-sub" style={{ fontSize: 13, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{w.engineerNotes ?? w.complaint}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.data && rows.length === 0 && <EmptyState icon={<SearchX />} title="لا توجد أوامر بهذا البحث" body="غيّر الفلتر أو امسح كلمة البحث." action={<Button onClick={() => { setQ(""); setStatus("all"); setEng(""); }}>مسح الفلاتر</Button>} />}
      </div>
    </div>
  );
}
