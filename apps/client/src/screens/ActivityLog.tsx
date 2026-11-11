import { useState } from "react";
import { History } from "lucide-react";
import { Badge, Button, EmptyState, Input, Segmented, Select, useFmt, When } from "@jc/ui";
import { PageHead, PageState } from "../shell/Shell";
import { Link } from "../lib";
import { qs, useApi } from "../data/hooks";
import type { User } from "../data/types";

type Row = { id: string; at: string; action: string; entity: string | null; entityId: string | null; before: unknown; after: unknown; user: string | null };
type Kind = "all" | "change" | "view" | "search" | "login";

/** Arabic names for what happened. Generic rows are "METHOD /route" (activity.ts); the rest come from the handlers. */
const ACTION: Record<string, string> = {
  view: "فتح", search: "بحث",
  "auth.login": "دخول", "auth.login_failed": "محاولة دخول غلط", "auth.refresh_reuse": "استخدام جلسة قديمة (اتقفلت)",
  "workOrder.create": "استقبال سيارة وفتح أمر شغل", "workOrder.status": "تغيير حالة أمر شغل", "workOrder.staff": "تغيير المهندس أو الفنيين",
  "work_order.signature": "توقيع العميل", "estimate.approve": "موافقة على تكلفة", "odometer.lower": "عداد أقل من السابق",
  "statement.create": "حفظ بيان", "statement.edit": "تعديل بيان محفوظ", "statement.cancel": "إلغاء بيان", "directSale.create": "بيع مباشر",
  "salesReturn.create": "مرتجع مبيعات", "payment.debt": "تحصيل مديونية", "customer.update": "تعديل بيانات عميل", "vehicle.update": "تعديل بيانات سيارة",
  "condition.convert": "تحويل تقرير حالة لأمر شغل", "reminder.update": "تعديل مذكرة",
  "item.create": "إضافة صنف", "item.update": "تعديل صنف", "item.price_change": "تغيير سعر صنف", "items.barcodes": "إنشاء باركود للأصناف",
  "line.price_change": "تغيير سعر بند", "stock.adjust": "تسوية رصيد", "stock.over_issue": "صرف بأكتر من الرصيد", "stock.offline_over_issue": "صرف بأكتر من الرصيد (بدون نت)",
  "stock_count.open": "بدء جرد", "stock_count.approve": "اعتماد جرد", "stock_count.cancel": "إلغاء جرد",
  "purchase.create": "فاتورة مشتريات", "purchaseReturn.create": "مرتجع مشتريات", "supplier.payment": "دفعة لمورد",
  "cash.open": "فتح يومية الصندوق", "cash.close": "إقفال يومية الصندوق", "cash.deposit": "إيداع في الصندوق", "cash.withdrawal": "سحب من الصندوق",
  "expense.create": "تسجيل مصروف", "bonus.create": "مكافأة", "partners.update": "تعديل الشركاء والنسب", "partner.withdrawal": "مسحوبات شريك", "workOrder.delete": "مسح أمر شغل",
  "staff.advance": "سلفة موظف", "staff.debt": "مديونية على موظف", "staff.repayment": "سداد من موظف", "staff.expense": "مصروف على موظف",
  "user.create": "إضافة مستخدم", "user.update": "تعديل مستخدم أو صلاحياته", "settings.update": "تعديل الإعدادات", "settings.numbering": "تعديل الترقيم",
  "settings.payment_methods": "تعديل طرق الدفع", "settings.plate_types": "تعديل أنواع اللوحات",
  "POST /customers": "إضافة عميل", "POST /vehicles": "إضافة سيارة", "PATCH /work-orders/:id": "تعديل أمر شغل",
  "POST /work-orders/:id/issue": "صرف قطعة لأمر شغل", "POST /work-orders/:id/lines": "إضافة بند لأمر شغل", "PATCH /work-orders/:id/lines/:lineId": "تعديل بند في أمر شغل",
  "DELETE /work-orders/:id/lines/:lineId": "حذف بند من أمر شغل", "POST /work-orders/:id/packages/:packageId": "إضافة باكدج لأمر شغل",
  "POST /work-orders/:id/marks": "علامة على رسمة العربية", "POST /work-orders/:id/approvals": "موافقة على تكلفة",
  "POST /technicians": "إضافة فني", "PATCH /technicians/:id": "تعديل فني", "POST /reminders": "مذكرة جديدة", "PATCH /reminders/:id": "تعديل مذكرة",
  "PUT /stock-counts/:id/lines": "إدخال عدد في الجرد", "POST /stock-counts/:id/scan": "مسح صنف في الجرد", "DELETE /stock-counts/:id/lines/:variantId": "شيل صنف من الجرد",
  "POST /item-categories": "إضافة مجموعة أصناف", "POST /packages": "إضافة باكدج", "POST /expense-categories": "إضافة بند مصروفات",
  "POST /suppliers": "إضافة مورد", "PATCH /suppliers/:id": "تعديل مورد", "POST /share": "رابط متابعة للعميل",
  "PUT /work-orders/:id/condition": "حفظ تقرير حالة", "POST /stock/adjust": "تسوية رصيد",
};
const ENTITY: Record<string, { label: string; to?: (id: string) => string }> = {
  work_order: { label: "أمر شغل", to: (id) => `/work-orders/${id}` }, customer: { label: "عميل", to: (id) => `/customers/${id}` },
  vehicle: { label: "سيارة", to: (id) => `/cars/${id}` }, statement: { label: "بيان", to: (id) => `/statements/${id}` },
  item: { label: "صنف", to: (id) => `/items/${id}` }, stock_count: { label: "جرد", to: (id) => `/stock-counts/${id}` },
  supplier: { label: "مورد" }, user: { label: "مستخدم" }, technician: { label: "فني" }, lookup: { label: "البحث السريع" },
};
const tone = (a: string) => (a === "view" ? "neutral" : a === "search" ? "outline" : a.startsWith("auth.") ? "neutral" : /cancel|DELETE|failed|reuse|over_issue/.test(a) ? "bad" : "work");

/**
 * A short readable line from the saved details: the search text, or the plain values (before → after when both exist).
 * Lists and ids are left out; the full details are in the row's tooltip.
 */
function details(r: Row) {
  const after = (r.after ?? {}) as Record<string, unknown>, before = (r.before ?? {}) as Record<string, unknown>;
  if (r.action === "search") return `«${String(after.q ?? "")}»`;
  const plain = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);
  const show = (v: unknown) => (v === null ? "—" : v === true ? "نعم" : v === false ? "لا" : String(v).slice(0, 50));
  const keys = Object.keys(after).filter((k) => plain(after[k]) && !/id$/i.test(k));
  const parts = keys.slice(0, 4).map((k) => (k in before && before[k] !== after[k] ? `${show(before[k])} ← ${show(after[k])}` : show(after[k])));
  return parts.join(" · ") + (Object.keys(after).length > parts.length ? " …" : "");
}

export function ActivityLog() {
  const f = useFmt();
  const users = useApi<User[]>("/users");
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [day, setDay] = useState("");
  const [limit, setLimit] = useState(100);
  const q = useApi<Row[]>(`/audit?${qs({ userId: userId || undefined, kind: kind === "all" ? undefined : kind, from: day || undefined, to: day || undefined, limit })}`);
  const rows = q.data ?? [];
  return (
    <div>
      <PageHead title="سجل العمليات" sub="مين عمل إيه وإمتى: كل تعديل في السيستم، وفتح أوامر الشغل والعملاء، والبحث، والدخول." />
      <div className="toolbar">
        <Select value={userId} onChange={(e) => { setUserId(e.target.value); setLimit(100); }} aria-label="المستخدم" style={{ width: 200 }}>
          <option value="">كل المستخدمين</option>
          {(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
        </Select>
        <Segmented label="نوع العملية" value={kind} onChange={(k) => { setKind(k); setLimit(100); }} options={[
          { value: "all", label: "الكل" }, { value: "change", label: "تعديلات" }, { value: "view", label: "فتح" }, { value: "search", label: "بحث" }, { value: "login", label: "دخول" },
        ]} />
        <Input type="date" value={day} onChange={(e) => { setDay(e.target.value); setLimit(100); }} aria-label="اليوم" style={{ width: 170 }} />
        {day && <Button variant="ghost" onClick={() => setDay("")}>كل الأيام</Button>}
      </div>
      <PageState loading={q.loading && !q.data} error={q.error} onRetry={q.reload} />
      {q.data && !rows.length && <EmptyState icon={<History />} title="مفيش عمليات بالفلتر ده" body="غيّر المستخدم أو النوع أو اليوم." />}
      {!!rows.length && (
        <div className="panel"><div className="table-wrap"><table className="table table--compact">
          <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>على</th><th>التفاصيل</th></tr></thead>
          <tbody>{rows.map((r) => {
            const e = r.entity ? ENTITY[r.entity] : undefined;
            return (
              <tr key={r.id}>
                <td style={{ whiteSpace: "nowrap" }}><When iso={r.at} /></td>
                <td className="cell-main">{r.user ?? "—"}</td>
                <td><Badge tone={tone(r.action)}>{ACTION[r.action] ?? r.action}</Badge></td>
                <td>{e?.to && r.entityId ? <Link className="link" to={e.to(r.entityId)}>{e.label}</Link> : e?.label ?? r.entity ?? ""}</td>
                <td className="muted" title={r.after ? JSON.stringify(r.after) : undefined} style={{ maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{details(r)}</td>
              </tr>
            );
          })}</tbody>
        </table></div></div>
      )}
      {rows.length >= limit && limit < 500 && <div className="row" style={{ justifyContent: "center", marginTop: 12 }}><Button onClick={() => setLimit(Math.min(500, limit + 100))}>عرض أقدم ({f.n(limit)} ظاهرة)</Button></div>}
    </div>
  );
}
