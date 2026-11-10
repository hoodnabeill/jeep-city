import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight, Bell, LayoutGrid, Mic, ChevronDown, CloudOff, FileText, LogOut, Package, RefreshCw,
  Search, Settings, Truck, Users, UserRoundCog, Wifi, Plus, Wrench, Receipt,
} from "lucide-react";
import { Avatar, GRADE_LABEL, Kbd, useDigits, useFmt } from "@jc/ui";
import { api } from "../data/api";
import { useApi, useLongStayDays, useSetting, qs } from "../data/hooks";
import { dismissFailure } from "../data/local";
import { useSyncState } from "../data/sync";
import type { Customer, Item, LookupHit, StatementRow, Supplier, WorkOrderRow } from "../data/types";
import { CarPlate } from "../screens/common";
import { daysIn, go, Link, useHotkey, useCan, useSession } from "../lib";
import { can } from "@jc/core";
import { activeNav, isNavRoot, navLabel, sectionOf, visibleNav, visibleSections, type NavItem } from "./sections";
import { SearchTools } from "../screens/SearchTools";
import { canListen } from "../device";

/** Phone tables become cards: each cell carries its column name, shown as a small label (app.css). */
function labelCells(root: HTMLElement) {
  root.querySelectorAll("table").forEach((t) => {
    const heads = [...t.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
    if (!heads.length) return;
    t.querySelectorAll("tbody tr, tfoot tr").forEach((tr) => [...tr.children].forEach((td, i) => {
      if (heads[i] && td.getAttribute("data-label") !== heads[i]) td.setAttribute("data-label", heads[i]);
    }));
  });
}

export function Shell({ path, children }: { path: string; children: ReactNode }) {
  const { user } = useSession();
  // The digit style chosen in Settings applies on every screen and survives a reload.
  const { setDigits } = useDigits();
  const savedDigits = useSetting<string | null>("display.digits", null);
  useEffect(() => { if (savedDigits === "latn" || savedDigits === "arab") setDigits(savedDigits); }, [savedDigits, setDigits]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  useHotkey("k", () => setPaletteOpen(true));
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    let frame = 0;
    const run = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => labelCells(el)); };
    run();
    const mo = new MutationObserver(run);
    mo.observe(el, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  const inShop = useApi<WorkOrderRow[]>("/work-orders?status=in_shop");
  const current = path === "/" ? "/" : activeNav(path);
  const section = sectionOf(path);
  const sections = visibleSections(user);
  const home: NavItem = { to: "/", label: "الرئيسية", icon: LayoutGrid };
  // Inside a section: its own pages. On the home page or Settings: the sections themselves.
  const items: NavItem[] = section ? [home, ...visibleNav(section, user)] : [home, ...sections.map((s) => ({ to: visibleNav(s, user)[0].to, label: s.label, icon: s.icon }))];
  return (
    <div className="app">
      <nav className="rail" aria-label="القائمة الرئيسية">
        <Link to="/" className="rail__logo" aria-label="Jeep City – الرئيسية">
          <img src="/brand/stacked-colour.svg" alt="Jeep City El Tantawy USA" width={168} height={104} />
        </Link>
        {section && <>
          <div className="rail__sections" role="group" aria-label="الأقسام">
            {sections.map((s) => <Link key={s.id} to={visibleNav(s, user)[0].to} className="rail__section" aria-current={s.id === section.id} aria-label={s.label} title={s.label}><s.icon aria-hidden /></Link>)}
          </div>
          <p className="rail__title">{section.label}</p>
        </>}
        <ul className="rail__nav">
          {items.map((n) => (
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
        <TopBar path={path} onSearch={() => setPaletteOpen(true)} onVoice={() => { setVoiceOpen(true); setPaletteOpen(true); }} inShop={inShop.data ?? []} />
        {section && isNavRoot(path) && visibleNav(section, user).length > 1 && (
          <nav className="subtabs" aria-label={`صفحات ${section.label}`}>
            {visibleNav(section, user).map((n) => <Link key={n.to} to={n.to} aria-current={current === n.to ? "page" : undefined}>{n.label}</Link>)}
          </nav>
        )}
        <main className="page" id="main" ref={mainRef}>{children}</main>
      </div>
      {/* Phones: the four sections (same as the home tiles), with labels, at the bottom within thumb reach. */}
      <nav className="tabbar" aria-label="الأقسام">
        {[{ id: "home", to: "/", label: "الرئيسية", icon: LayoutGrid, on: path === "/" }, ...sections.map((s) => ({ id: s.id, to: visibleNav(s, user)[0].to, label: s.short, icon: s.icon, on: s.id === section?.id }))].map((t) => (
          <Link key={t.id} to={t.to} className="tabbar__item" aria-current={t.on ? "page" : undefined}>
            <span className="tabbar__icon"><t.icon aria-hidden />{t.id === "reception" && !!inShop.data?.length && <span className="tabbar__count num">{inShop.data.length}</span>}</span>
            <span className="tabbar__label">{t.label}</span>
          </Link>
        ))}
      </nav>
      <CommandPalette open={paletteOpen} listening={voiceOpen} onClose={() => { setPaletteOpen(false); setVoiceOpen(false); }} />
    </div>
  );
}

function TopBar({ path, onSearch, onVoice, inShop }: { path: string; onSearch: () => void; onVoice: () => void; inShop: WorkOrderRow[] }) {
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
      {/* Phone app bar: back on detail pages, and where you are. */}
      {!isNavRoot(path) && <button type="button" className="icon-btn appbar__back" aria-label="رجوع" onClick={() => (history.length > 1 ? history.back() : go(activeNav(path) || "/"))}><ArrowRight /></button>}
      <span className="appbar__title">{path === "/" ? "Jeep City" : navLabel(path) ?? ""}</span>
      <button type="button" className="search-trigger" onClick={onSearch} aria-label="بحث">
        <Search aria-hidden />
        <span>ابحث برقم اللوحة، الشاسيه، العميل، الصنف أو رقم البيان</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      {canListen() && <button type="button" className="icon-btn topbar__mic" aria-label="بحث بالصوت: قول رقم اللوحة أو اسم العميل" title="بحث بالصوت" onClick={onVoice}><Mic /></button>}
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
        {can(user, "settings.manage") && <Link to="/settings" className="icon-btn" aria-label="الإعدادات" title="الإعدادات"><Settings /></Link>}
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
              {can(user, "settings.manage") && <button type="button" className="pop__item phone-only" onClick={() => { setMenu(""); go("/settings"); }}><Settings />الإعدادات</button>}
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
function CommandPalette({ open, onClose, listening }: { open: boolean; onClose: () => void; listening: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [hits, setHits] = useState<Hit[]>([]);
  const f = useFmt();
  const seeSuppliers = useCan("supplier.manage");
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
        seeSuppliers ? api<Supplier[]>(`/suppliers?${qs({ q: text })}`).catch(() => []) : Promise.resolve([] as Supplier[]),
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
  }, [q, seeSuppliers]);

  const shown = q.trim().length < 2 ? actions : hits;
  const pick = (h?: Hit) => { if (!h) return; onClose(); go(h.to); };
  const groups = [...new Set(shown.map((h) => h.group))];
  let idx = -1;
  return (
    <dialog ref={ref} className="palette" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-label="بحث شامل">
      <div className="palette__input">
        <button type="button" className="icon-btn palette__close" aria-label="إغلاق البحث" onClick={onClose}><ArrowRight /></button>
        <Search aria-hidden />
        <input autoFocus value={q} placeholder="لوحة، شاسيه، اسم عميل، موبايل، صنف، باركود، رقم بيان أو أمر شغل"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === "Enter") pick(shown[sel]);
          }} />
        {open && <SearchTools onText={(t) => { setQ(t); setSel(0); }} autoListen={listening} />}
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

