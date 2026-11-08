import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight, BarChart3, Bell, CarFront, ChevronDown, CloudOff, FileText, LayoutDashboard, LogOut, Package, RefreshCw,
  Search, Settings, Truck, Users, UserRoundCog, Wallet, Wifi, Plus, Wrench, Receipt,
} from "lucide-react";
import { Avatar, GRADE_LABEL, Kbd, useFmt } from "@jc/ui";
import { api } from "../data/api";
import { useApi, useLongStayDays, qs } from "../data/hooks";
import { dismissFailure } from "../data/local";
import { useSyncState } from "../data/sync";
import type { Customer, Item, LookupHit, StatementRow, Supplier, WorkOrderRow } from "../data/types";
import { CarPlate } from "../screens/common";
import { daysIn, go, Link, useHotkey, useIsAdmin, useSession } from "../lib";

const NAV = [
  { to: "/", label: "الرئيسية", icon: LayoutDashboard },
  { to: "/reception", label: "الاستقبال", icon: CarFront, count: true },
  { to: "/statements", label: "بيانات العملاء", icon: FileText },
  { to: "/customers", label: "العملاء والسيارات", icon: Users },
  { to: "/items", label: "المخزن والأصناف", icon: Package },
  { to: "/alerts", label: "المذكرات والتنبيهات", icon: Bell },
  { to: "/suppliers", label: "الموردين والمشتريات", icon: Truck, admin: true },
  { to: "/cash", label: "صندوق الكاش", icon: Wallet, admin: true },
  { to: "/reports", label: "التقارير", icon: BarChart3, admin: true },
  { to: "/settings", label: "الإعدادات", icon: Settings, admin: true },
];

function activeNav(path: string) {
  if (path === "/") return "/";
  if (path.startsWith("/work-orders") || path.startsWith("/intake") || path.startsWith("/condition")) return "/reception";
  if (path.startsWith("/cars")) return "/customers";
  return NAV.find((n) => n.to !== "/" && path.startsWith(n.to))?.to ?? "";
}

export function Shell({ path, children }: { path: string; children: ReactNode }) {
  const isAdmin = useIsAdmin();
  const [paletteOpen, setPaletteOpen] = useState(false);
  useHotkey("k", () => setPaletteOpen(true));
  const inShop = useApi<WorkOrderRow[]>("/work-orders?status=in_shop");
  const current = activeNav(path);
  return (
    <div className="app">
      <nav className="rail" aria-label="القائمة الرئيسية">
        <Link to="/" className="rail__logo" aria-label="Jeep City – الرئيسية">
          <img src="/brand/stacked-colour.svg" alt="Jeep City El Tantawy USA" width={168} height={104} />
        </Link>
        <ul className="rail__nav">
          {NAV.filter((n) => isAdmin || !n.admin).map((n) => (
            <li key={n.to}>
              <Link to={n.to} className="rail__item" aria-current={current === n.to ? "page" : undefined}>
                <n.icon aria-hidden />
                <span>{n.label}</span>
                {n.count && !!inShop.data?.length && <span className="rail__count num">{inShop.data.length}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="main">
        <TopBar onSearch={() => setPaletteOpen(true)} inShop={inShop.data ?? []} />
        <main className="page" id="main">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function TopBar({ onSearch, inShop }: { onSearch: () => void; inShop: WorkOrderRow[] }) {
  const { user, sync, signOut } = useSession();
  const f = useFmt();
  const [menu, setMenu] = useState<"" | "alerts" | "user" | "sync">("");
  const q = useSyncState();
  const ref = useRef<HTMLDivElement>(null);
  const low = useApi<{ item: { id: string; nameAr: string; unit: string }; variant: { id: string; grade: keyof typeof GRADE_LABEL | null; qtyMilli: number; minQtyMilli: number } }[]>("/items/low-stock");
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(""); };
    addEventListener("mousedown", close);
    return () => removeEventListener("mousedown", close);
  }, []);
  const syncView = {
    online: q.pending ? { icon: <RefreshCw className="spin" />, label: `يتم المزامنة · ${f.n(q.pending)}`, cls: "is-syncing" } : { icon: <Wifi />, label: "متصل", cls: "is-online" },
    syncing: { icon: <RefreshCw className="spin" />, label: "يتم الحفظ", cls: "is-syncing" },
    offline: { icon: <CloudOff />, label: q.pending ? `غير متصل · ${f.n(q.pending)} بانتظار الرفع` : "غير متصل", cls: "is-offline" },
  }[sync];
  const feed = useApi<{ reminders: { id: string; customerName: string | null; note: string | null; dueDate: string | null; dueKm: number | null }[]; debts: { id: string; name: string; balance: number }[] }>("/alerts");
  const longDays = useLongStayDays();
  const longStay = inShop.filter((w) => daysIn(w.enteredAt) >= longDays);
  const lowList = low.data ?? [];
  const dueList = feed.data?.reminders ?? [], debtList = feed.data?.debts ?? [];
  const alertCount = lowList.length + longStay.length + dueList.length + debtList.length;
  return (
    <header className="topbar" ref={ref}>
      <button type="button" className="search-trigger" onClick={onSearch}>
        <Search aria-hidden />
        <span>ابحث برقم اللوحة، الشاسيه، العميل، الصنف أو رقم البيان</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <div className="topbar__end">
        <div className="pop-anchor">
          <button type="button" className={`sync ${q.failed.length ? "is-offline" : syncView.cls}`} aria-expanded={menu === "sync"} onClick={() => setMenu(menu === "sync" ? "" : "sync")}>
            {syncView.icon}<span>{q.failed.length ? `${f.n(q.failed.length)} تغيير مرفوض` : syncView.label}</span>
          </button>
          {menu === "sync" && (
            <div className="pop pop--alerts" role="dialog" aria-label="المزامنة">
              <p className="pop__title">{sync === "offline" ? "يعمل الجهاز بدون اتصال" : "المزامنة"}</p>
              <p className="hint-line" style={{ padding: "0 16px 10px" }}>{sync === "offline" ? "استقبال السيارات وإضافة البنود وحفظ البيانات يُحفظ على هذا الجهاز ويُرفع تلقائيًا عند عودة الاتصال. البيان يأخذ رقمه عند الرفع." : q.pending ? "جاري رفع التغييرات المحفوظة على هذا الجهاز." : "كل التغييرات مرفوعة."}</p>
              {q.pending > 0 && <p className="hint-line" style={{ padding: "0 16px 10px" }}><b>{f.n(q.pending)}</b> تغيير بانتظار الرفع.</p>}
              {q.failed.length > 0 && (
                <ul className="alerts">
                  {q.failed.map((x) => (
                    <li key={x.id}><span className="alerts__tag bad">مرفوض</span>
                      <span style={{ flex: 1 }}><b>{x.label}</b><br /><span className="muted">{x.message}</span></span>
                      <button type="button" className="link" style={{ border: 0, background: "none", whiteSpace: "nowrap" }} onClick={() => dismissFailure(x.id)}>تم</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="pop-anchor">
          <button type="button" className="icon-btn" aria-label={`التنبيهات (${alertCount})`} aria-expanded={menu === "alerts"} onClick={() => setMenu(menu === "alerts" ? "" : "alerts")}>
            <Bell />
            {alertCount > 0 && <span className="dot-count">{alertCount}</span>}
          </button>
          {menu === "alerts" && (
            <div className="pop pop--alerts" role="dialog" aria-label="التنبيهات">
              <p className="pop__title">التنبيهات</p>
              {alertCount === 0 && <p className="hint-line" style={{ padding: "0 16px 14px" }}>لا توجد تنبيهات الآن.</p>}
              <ul className="alerts">
                {dueList.slice(0, 4).map((r) => (
                  <li key={r.id}><Link to="/alerts" onClick={() => setMenu("")}>
                    <span className="alerts__tag warn">تذكير</span>
                    <span><b>{r.customerName ?? r.note}</b><br /><span className="muted">{r.customerName && r.note ? `${r.note} · ` : ""}{r.dueDate ? f.date(r.dueDate) : `${f.n(r.dueKm ?? 0)} كم`}</span></span>
                  </Link></li>
                ))}
                {debtList.slice(0, 3).map((d) => (
                  <li key={d.id}><Link to={`/customers/${d.id}`} onClick={() => setMenu("")}>
                    <span className="alerts__tag bad">مديونية</span>
                    <span><b>{d.name}</b><br /><span className="muted">{f.pt(d.balance)} ج.م متأخرة</span></span>
                  </Link></li>
                ))}
                {lowList.slice(0, 5).map(({ item, variant }) => (
                  <li key={variant.id}><Link to={`/items/${item.id}`} onClick={() => setMenu("")}>
                    <span className={`alerts__tag ${variant.qtyMilli <= 0 ? "bad" : "warn"}`}>{variant.qtyMilli <= 0 ? "نفد" : "مخزون"}</span>
                    <span><b>{item.nameAr}</b>{variant.grade ? ` · ${GRADE_LABEL[variant.grade]}` : ""}<br /><span className="muted">متبقي {f.n(variant.qtyMilli / 1000)} {item.unit} · الحد الأدنى {f.n(variant.minQtyMilli / 1000)}</span></span>
                  </Link></li>
                ))}
                {longStay.map((w) => (
                  <li key={w.id}><Link to={`/work-orders/${w.id}`} onClick={() => setMenu("")}>
                    <span className="alerts__tag warn">ورشة</span>
                    <span><b className="lat">{w.vehicle?.make} {w.vehicle?.model}</b> في الورشة منذ {f.n(daysIn(w.enteredAt))} أيام<br /><span className="muted">أمر شغل {f.s(w.number)}</span></span>
                  </Link></li>
                ))}
              </ul>
              {lowList.length > 0 && <Link to="/items?low=1" className="pop__more" onClick={() => setMenu("")}>كل الأصناف تحت الحد الأدنى</Link>}
              <Link to="/alerts" className="pop__more" onClick={() => setMenu("")}>كل المذكرات والتنبيهات</Link>
            </div>
          )}
        </div>
        <div className="pop-anchor">
          <button type="button" className="user-btn" aria-expanded={menu === "user"} onClick={() => setMenu(menu === "user" ? "" : "user")}>
            <Avatar name={user!.name} dark={user!.role === "admin"} />
            <span className="user-btn__text"><b>{user!.name}</b><span>{user!.role === "admin" ? "إدارة" : "مهندس"}</span></span>
            <ChevronDown aria-hidden />
          </button>
          {menu === "user" && (
            <div className="pop pop--user">
              <button type="button" className="pop__item" onClick={() => { setMenu(""); go("/login?switch=1"); }}><UserRoundCog />تبديل المستخدم</button>
              <button type="button" className="pop__item" onClick={() => { setMenu(""); signOut().then(() => go("/")); }}><LogOut />تسجيل الخروج</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/* ---------- Ctrl+K global search (server-side, Arabic-variant tolerant) ---------- */
type Hit = { key: string; group: string; title: ReactNode; sub?: ReactNode; to: string; lead?: ReactNode };
function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [hits, setHits] = useState<Hit[]>([]);
  const f = useFmt();
  const isAdmin = useIsAdmin();
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) { d.showModal(); setQ(""); setSel(0); }
    if (!open && d.open) d.close();
  }, [open]);

  const actions: Hit[] = [
    { key: "a1", group: "إجراءات", title: "استقبال سيارة وفتح أمر شغل", to: "/intake", lead: <Plus /> },
    { key: "a2", group: "إجراءات", title: "أوامر الشغل في الورشة", to: "/reception", lead: <Wrench /> },
    { key: "a3", group: "إجراءات", title: "بيانات العملاء", to: "/statements", lead: <Receipt /> },
  ];
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setHits([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      const [cars, custs, items, sts, wos, sups] = await Promise.all([
        api<LookupHit[]>(`/lookup?${qs({ q: text })}`).catch(() => []),
        api<{ rows: Customer[] }>(`/customers?${qs({ q: text })}`).then((r) => r.rows).catch(() => [] as Customer[]),
        api<Item[]>(`/items?${qs({ q: text })}`).catch(() => []),
        api<StatementRow[]>(`/statements?${qs({ q: text, limit: 5 })}`).catch(() => []),
        api<WorkOrderRow[]>(`/work-orders?${qs({ q: text, limit: 5 })}`).catch(() => []),
        isAdmin ? api<Supplier[]>(`/suppliers?${qs({ q: text })}`).catch(() => []) : Promise.resolve([] as Supplier[]),
      ]);
      if (!alive) return;
      const out: Hit[] = [];
      cars.slice(0, 6).forEach(({ vehicle: v, customer: c }) => out.push({
        key: v.id, group: "السيارات", lead: <CarPlate v={v} />,
        title: <span className="lat">{v.make} {v.model} {v.variant ?? ""}{v.year ? ` · ${v.year}` : ""}</span>, sub: <>{c.name} · <span className="lat">{v.chassis}</span></>, to: `/cars/${v.id}`,
      }));
      // Customers not already shown through one of their cars (a customer with no car is found only here).
      const shownCustomers = new Set(cars.slice(0, 6).map((h) => h.customer.id));
      custs.filter((c) => !shownCustomers.has(c.id)).slice(0, 4).forEach((c) => out.push({ key: c.id, group: "العملاء", title: c.name, sub: <span className="num">{c.mobile ?? "بدون موبايل"}</span>, to: `/customers/${c.id}`, lead: <Users /> }));
      items.slice(0, 5).forEach((i) => out.push({ key: i.id, group: "الأصناف", title: i.nameAr, sub: <span className="lat">{i.code}</span>, to: `/items/${i.id}`, lead: <Package /> }));
      wos.forEach((w) => out.push({ key: w.id, group: "أوامر الشغل", title: `أمر شغل ${f.s(w.number)}`, sub: w.customer.name, to: `/work-orders/${w.id}`, lead: <Wrench /> }));
      sts.forEach((s) => out.push({ key: s.id, group: "البيانات", title: `${s.kind === "direct_sale" ? "بيع مباشر" : s.kind === "byte" ? "بيان بايت" : "بيان"} ${f.s(s.number)}`, sub: s.customer.name, to: `/statements/${s.id}`, lead: <FileText /> }));
      sups.slice(0, 4).forEach((s) => out.push({ key: s.id, group: "الموردين", title: s.name, sub: <span className="num">{s.phone}</span>, to: `/suppliers?id=${s.id}`, lead: <Truck /> }));
      setHits(out);
      setSel(0);
    }, 180);
    return () => { alive = false; clearTimeout(t); };
  }, [q, isAdmin]);

  const shown = q.trim().length < 2 ? actions : hits;
  const pick = (h?: Hit) => { if (!h) return; onClose(); go(h.to); };
  const groups = [...new Set(shown.map((h) => h.group))];
  let idx = -1;
  return (
    <dialog ref={ref} className="palette" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-label="بحث شامل">
      <div className="palette__input">
        <Search aria-hidden />
        <input autoFocus value={q} placeholder="لوحة، شاسيه، اسم عميل، موبايل، صنف، باركود، رقم بيان أو أمر شغل"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === "Enter") pick(shown[sel]);
          }} />
        <Kbd>Esc</Kbd>
      </div>
      <div className="palette__results">
        {q.trim().length >= 2 && shown.length === 0 && (
          <div className="palette__empty">
            <p><b>لا توجد نتائج لـ «{q}»</b></p>
            <p className="muted">جرّب جزءًا من رقم اللوحة أو آخر 6 أرقام من الشاسيه. البحث يتجاهل الهمزات والتشكيل.</p>
          </div>
        )}
        {groups.map((g) => (
          <section key={g}>
            <h3 className="palette__group">{g}</h3>
            {shown.filter((h) => h.group === g).map((h) => {
              idx++;
              const i = idx;
              return (
                <button key={h.key} type="button" className="palette__hit" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => pick(h)}>
                  <span className="palette__lead">{h.lead}</span>
                  <span className="palette__text"><b>{h.title}</b>{h.sub && <span>{h.sub}</span>}</span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
      <footer className="palette__foot">
        <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> للتنقل</span><span><Kbd>Enter</Kbd> للفتح</span><span>الماسح الضوئي يكتب هنا مباشرة</span>
      </footer>
    </dialog>
  );
}

export function PageHead({ title, sub, actions, back }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="page-head">
      <div>
        {back && <Link to={back.to} className="page-head__back"><ArrowRight aria-hidden />{back.label}</Link>}
        <h1>{title}</h1>
        {sub && <p className="page-head__sub">{sub}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </div>
  );
}

/** Loading / error placeholder for a page fed by useApi. */
export function PageState({ loading, error, onRetry }: { loading: boolean; error?: { message: string }; onRetry?: () => void }) {
  if (error) return <div className="lock-note" role="alert"><CloudOff /><div><b>{error.message}</b>{onRetry && <><br /><button type="button" className="link" style={{ border: 0, background: "none", padding: 0 }} onClick={onRetry}>حاول مرة أخرى</button></>}</div></div>;
  if (loading) return <p className="hint-line" aria-busy="true">جاري التحميل…</p>;
  return null;
}

