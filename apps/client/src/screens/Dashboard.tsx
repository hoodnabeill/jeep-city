import { Bell, Plus, ShoppingCart } from "lucide-react";
import { Badge, Button, GRADE_LABEL, Money, Panel, useFmt, When } from "@jc/ui";
import { CarPlate, CarTile, StatusBadge } from "./common";
import { PageHead, PageState } from "../shell/Shell";
import { daysIn, go, Link, useIsAdmin } from "../lib";
import { useApi } from "../data/hooks";
import type { Dashboard as Dash, StatementRow, WorkOrderRow } from "../data/types";

export function Dashboard() {
  const isAdmin = useIsAdmin();
  const f = useFmt();
  const dash = useApi<Dash>("/dashboard");
  const shop = useApi<WorkOrderRow[]>("/work-orders?status=in_shop");
  const delivered = useApi<WorkOrderRow[]>("/work-orders?status=delivered&limit=4");
  const recent = useApi<StatementRow[]>("/statements?limit=6");
  const low = useApi<{ item: { id: string; nameAr: string; unit: string }; variant: { id: string; grade: keyof typeof GRADE_LABEL | null; qtyMilli: number; minQtyMilli: number } }[]>("/items/low-stock");
  const d = dash.data;
  const inShop = shop.data ?? [];
  const open = inShop.filter((w) => w.status === "open");
  const ready = inShop.filter((w) => w.status === "ready");
  const longStay = inShop.filter((w) => daysIn(w.enteredAt) >= 3);

  return (
    <div className="stack">
      <PageHead
        title="اليوم في الورشة"
        sub={<When iso={new Date().toISOString()} time={false} />}
        actions={<>
          <Button icon={<ShoppingCart />} onClick={() => go("/direct-sale")}>بيع مباشر</Button>
          <Button variant="primary" icon={<Plus />} onClick={() => go("/intake")}>استقبال سيارة</Button>
        </>}
      />
      <PageState loading={dash.loading && !d} error={dash.error} onRetry={dash.reload} />

      {d && (
        <div className="strip">
          {isAdmin ? (
            <>
              <div className="strip__cell"><span className="strip__label">مبيعات اليوم</span><span className="strip__value"><Money pt={d.salesTodayPt ?? 0} /></span><span className="strip__note">{f.n(d.statementsToday ?? 0)} بيانات</span></div>
              <Link to="/cash" className="strip__cell"><span className="strip__label">النقدية في الصندوق</span><span className="strip__value">{d.cashInDrawerPt == null ? "—" : <Money pt={d.cashInDrawerPt} />}</span><span className="strip__note">{d.cashInDrawerPt == null ? "اليومية مقفولة" : "اليومية مفتوحة"}</span></Link>
            </>
          ) : (
            <div className="strip__cell"><span className="strip__label">أوامري المفتوحة</span><span className="strip__value">{f.n(d.myOpen)}</span></div>
          )}
          <Link to="/reception" className="strip__cell"><span className="strip__label">سيارات في الورشة</span><span className="strip__value">{f.n(d.carsInShop)}</span><span className="strip__note">{f.n(d.readyForPickup)} جاهزة للتسليم</span></Link>
          <Link to="/items?low=1" className="strip__cell"><span className="strip__label">أصناف تحت الحد الأدنى</span><span className="strip__value">{f.n(d.lowStock)}</span>{d.lowStock > 0 && <span className="strip__note warn">اطلب من المورد</span>}</Link>
        </div>
      )}

      <section aria-labelledby="board-title">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 className="section-title" id="board-title" style={{ margin: 0 }}>السيارات في الورشة</h2>
          <Link to="/reception" className="link" style={{ fontSize: "var(--fs-sm)" }}>كل أوامر الشغل</Link>
        </div>
        <div className="board">
          {([["جاري الشغل", open], ["جاهز للتسليم", ready], ["آخر ما تم تسليمه", delivered.data ?? []]] as const).map(([title, list]) => (
            <div className="board__col" key={title}>
              <div className="board__head"><span>{title}</span><span className="num">{f.n(list.length)}</span></div>
              <div className="board__list">
                {list.map((w) => <CarTile key={w.id} wo={w} />)}
                {list.length === 0 && <p className="board__empty">{shop.loading ? "جاري التحميل…" : "لا توجد سيارات هنا الآن."}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid-2">
        <Panel title="أحدث البيانات" flush actions={<Link to="/statements" className="link" style={{ fontSize: "var(--fs-sm)" }}>كل البيانات</Link>}>
          <table className="table table--compact">
            <thead><tr><th>البيان</th><th>العميل</th><th className="hide-sm">السيارة</th><th className="num">المطلوب</th><th>الحالة</th></tr></thead>
            <tbody>
              {(recent.data ?? []).map((s) => (
                <tr key={s.id} className="is-clickable" onClick={() => go(`/statements/${s.id}`)}>
                  <td className="num" style={{ textAlign: "right" }}>{f.s(s.number)}</td>
                  <td className="cell-main">{s.customer.name}</td>
                  <td className="hide-sm">{s.vehicle && <CarPlate v={s.vehicle} />}</td>
                  <td className="num"><Money pt={s.amountDuePt} cur={false} /></td>
                  <td>{s.status === "cancelled" ? <Badge tone="bad">ملغي</Badge> : s.paidPt >= s.amountDuePt ? <Badge tone="ok">مدفوع</Badge> : <Badge tone="warn">آجل</Badge>}</td>
                </tr>
              ))}
              {recent.data?.length === 0 && <tr><td colSpan={5} className="hint-line" style={{ textAlign: "center" }}>لا توجد بيانات بعد.</td></tr>}
            </tbody>
          </table>
        </Panel>

        <Panel title="تنبيهات" icon={<Bell />} flush>
          <ul className="alerts" style={{ maxHeight: "none" }}>
            {longStay.map((w) => (
              <li key={w.id}><Link to={`/work-orders/${w.id}`}>
                <span className="alerts__tag warn">ورشة</span>
                <span><b className="lat">{w.vehicle?.make} {w.vehicle?.model}</b> في الورشة منذ {f.n(daysIn(w.enteredAt))} أيام. {w.engineerNotes}<br /><span className="muted">أمر شغل {f.s(w.number)} · <StatusBadge status={w.status} /></span></span>
              </Link></li>
            ))}
            {(low.data ?? []).map(({ item, variant }) => (
              <li key={variant.id}><Link to={`/items/${item.id}`}>
                <span className={`alerts__tag ${variant.qtyMilli <= 0 ? "bad" : "warn"}`}>{variant.qtyMilli <= 0 ? "نفد" : "مخزون"}</span>
                <span><b>{item.nameAr}</b>{variant.grade ? ` · ${GRADE_LABEL[variant.grade]}` : ""}<br /><span className="muted">متبقي {f.n(variant.qtyMilli / 1000)} {item.unit} · الحد الأدنى {f.n(variant.minQtyMilli / 1000)}</span></span>
              </Link></li>
            ))}
            {isAdmin && !!d?.customerDebtPt && (
              <li><Link to="/customers?debt=1">
                <span className="alerts__tag bad">مديونية</span>
                <span><b>مديونيات العملاء</b> <Money pt={d.customerDebtPt} /><br /><span className="muted">افتح قائمة العملاء المدينين</span></span>
              </Link></li>
            )}
            {!longStay.length && !low.data?.length && !d?.customerDebtPt && <li className="hint-line" style={{ padding: "14px 16px" }}>لا توجد تنبيهات الآن.</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
