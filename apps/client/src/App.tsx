import type { ReactNode } from "react";
import { match, useHashPath, useSession } from "./lib";
import { can, type Action } from "@jc/core";
import { Shell } from "./shell/Shell";
import { Login } from "./screens/Login";
import { Dashboard } from "./screens/Dashboard";
import { Home } from "./screens/Home";
import { Reception } from "./screens/Reception";
import { Intake } from "./screens/Intake";
import { WorkOrderScreen } from "./screens/WorkOrder";
import { StatementScreen } from "./screens/Statement";
import { Statements } from "./screens/Statements";
import { ConditionReport } from "./screens/ConditionReport";
import { Items, ItemDetail } from "./screens/Items";
import { Suppliers } from "./screens/Suppliers";
import { Customers, CustomerFile } from "./screens/Customers";
import { CashDrawer } from "./screens/CashDrawer";
import { Reports } from "./screens/Reports";
import { Alerts } from "./screens/Alerts";
import { SettingsScreen, UsersScreen } from "./screens/Settings";
import { NoAccess } from "./screens/NoAccess";
import { DirectSale } from "./screens/DirectSale";
import { PrintStatement, PrintJobCard, PrintCondition, PrintReceipt, PrintReport, PrintLabels } from "./print/Prints";
import { LabelMaker } from "./screens/Labels";
import { PublicStatus } from "./screens/PublicStatus";

type Route = { path: string; render: (p: Record<string, string>) => ReactNode; perm?: Action; bare?: boolean };
const routes: Route[] = [
  { path: "/", render: () => <Home /> },
  { path: "/board", render: () => <Dashboard /> },
  { path: "/users", render: () => <UsersScreen />, perm: "settings.manage" },
  { path: "/reception", render: () => <Reception /> },
  { path: "/intake", render: () => <Intake /> },
  { path: "/direct-sale", render: () => <DirectSale /> },
  { path: "/work-orders/:id", render: (p) => <WorkOrderScreen id={p.id} /> },
  { path: "/condition/:id", render: (p) => <ConditionReport id={p.id} /> },
  { path: "/statements", render: () => <Statements /> },
  { path: "/statements/new", render: () => <StatementScreen /> },
  { path: "/statements/:id", render: (p) => <StatementScreen id={p.id} /> },
  { path: "/items", render: () => <Items />, perm: "item.view" },
  { path: "/items/:id", render: (p) => <ItemDetail id={p.id} />, perm: "item.view" },
  { path: "/labels", render: () => <LabelMaker />, perm: "label.print" },
  { path: "/customers", render: () => <Customers /> },
  { path: "/customers/:id", render: (p) => <CustomerFile id={p.id} /> },
  { path: "/cars/:id", render: (p) => <CustomerFile vehicleId={p.id} /> },
  { path: "/suppliers", render: () => <Suppliers />, perm: "supplier.manage" },
  { path: "/cash", render: () => <CashDrawer />, perm: "cash.manage" },
  { path: "/reports", render: () => <Reports />, perm: "report.view" },
  { path: "/alerts", render: () => <Alerts /> },
  { path: "/settings", render: () => <SettingsScreen />, perm: "settings.manage" },
  { path: "/print/statement/:id", render: (p) => <PrintStatement id={p.id} />, bare: true },
  { path: "/print/receipt/:id", render: (p) => <PrintReceipt id={p.id} />, bare: true },
  { path: "/print/job-card/:id", render: (p) => <PrintJobCard id={p.id} />, bare: true },
  { path: "/print/condition/:id", render: (p) => <PrintCondition id={p.id} />, bare: true },
  { path: "/print/labels", render: () => <PrintLabels />, bare: true },
  { path: "/print/report/:id", render: (p) => <PrintReport id={p.id} />, bare: true, perm: "report.view" },
];

export function App() {
  const path = useHashPath();
  const { user, ready } = useSession();
  // The customer's status page (QR on prints) opens without a login.
  const pub = match("/s/:token", path);
  if (pub) return <PublicStatus token={pub.token} />;
  if (!ready) return null;
  if (!user || path.startsWith("/login")) return <Login switching={!!user && path.includes("switch=1")} />;
  for (const r of routes) {
    const params = match(r.path, path);
    if (!params) continue;
    if (r.bare) return <>{r.render(params)}</>;
    return <Shell path={path}>{r.perm && !can(user, r.perm) ? <NoAccess /> : r.render(params)}</Shell>;
  }
  return <Shell path={path}><NoAccess missing /></Shell>;
}
