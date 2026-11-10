import { BarChart3, Bell, CarFront, FileText, Handshake, LayoutDashboard, Package, QrCode, Truck, UserRoundCog, Users, Wallet, type LucideIcon } from "lucide-react";
import { can, type Action, type PermissionHolder, type Section } from "@jc/core";

export type NavItem = { to: string; label: string; icon: LucideIcon; perm?: Action; count?: true };
export type AppSection = { id: Section; label: string; sub: string; icon: LucideIcon; nav: NavItem[] };

/** The four home tiles. A tile (and each page in it) shows only to users with the page's permission. */
export const SECTIONS: AppSection[] = [
  {
    id: "reception", label: "الاستقبال", sub: "السيارات في الورشة، العملاء، البيانات والمذكرات", icon: CarFront,
    nav: [
      { to: "/board", label: "لوحة الورشة", icon: LayoutDashboard },
      { to: "/reception", label: "الاستقبال", icon: CarFront, count: true },
      { to: "/statements", label: "بيانات العملاء", icon: FileText },
      { to: "/customers", label: "العملاء والسيارات", icon: Users },
      { to: "/alerts", label: "المذكرات والتنبيهات", icon: Bell },
    ],
  },
  {
    id: "inventory", label: "المخزن", sub: "الأصناف والأرصدة، الملصقات، الموردين والمشتريات", icon: Package,
    nav: [
      { to: "/items", label: "الأصناف والأرصدة", icon: Package, perm: "item.view" },
      { to: "/labels", label: "ملصقات الأصناف", icon: QrCode, perm: "label.print" },
      { to: "/suppliers", label: "الموردين والمشتريات", icon: Truck, perm: "supplier.manage" },
    ],
  },
  {
    id: "accounts", label: "الحسابات والتقارير", sub: "صندوق الكاش والمصروفات والتقارير وأرباح الشركاء", icon: Wallet,
    nav: [
      { to: "/cash", label: "صندوق الكاش", icon: Wallet, perm: "cash.manage" },
      { to: "/reports", label: "التقارير", icon: BarChart3, perm: "report.view" },
      { to: "/partners", label: "الشركاء", icon: Handshake, perm: "partners.manage" },
    ],
  },
  {
    id: "users", label: "المستخدمين", sub: "الحسابات والصلاحيات والفنيين", icon: UserRoundCog,
    nav: [{ to: "/users", label: "المستخدمين والصلاحيات", icon: UserRoundCog, perm: "settings.manage" }],
  },
];

export const visibleNav = (s: AppSection, who: PermissionHolder | null | undefined) => s.nav.filter((n) => !n.perm || can(who, n.perm));
export const visibleSections = (who: PermissionHolder | null | undefined) => SECTIONS.filter((s) => visibleNav(s, who).length > 0);

/** The nav entry a path belongs to (detail pages light up their list page). */
export function activeNav(path: string): string {
  if (path.startsWith("/work-orders") || path.startsWith("/intake") || path.startsWith("/condition") || path.startsWith("/direct-sale")) return "/reception";
  if (path.startsWith("/cars")) return "/customers";
  return SECTIONS.flatMap((s) => s.nav).find((n) => path.startsWith(n.to))?.to ?? "";
}
export const sectionOf = (path: string) => SECTIONS.find((s) => s.nav.some((n) => n.to === activeNav(path)));
