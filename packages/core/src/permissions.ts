/**
 * Permission matrix (PLAN §7). The server enforces it; the UI uses it only to hide controls.
 * One row per action → the roles that get it by default. A user's own list (PermissionHolder) overrides it.
 */
export type Role = "admin" | "engineer";
export const ROLES: Role[] = ["admin", "engineer"];

const BOTH: Role[] = ["admin", "engineer"];
const ADMIN: Role[] = ["admin"];

export const PERMISSIONS = {
  "session.use": BOTH,                 // log in, switch user, global search
  "workOrder.create": BOTH,            // receive car, Job Card, intake, photos, signature
  "workOrder.edit": BOTH,              // open work orders only; status, lines, notes
  "conditionReport.manage": BOTH,
  "estimate.approve": BOTH,
  "stock.issue": BOTH,                 // issue parts to a work order, return unused
  "stock.issueOverAvailable": ADMIN,   // with a reason
  "odometer.lowerThanPrevious": ADMIN, // with a reason
  "statement.create": BOTH,            // statement / direct sale + its payments
  "statement.editSaved": ADMIN,        // creates a revision
  "statement.cancel": ADMIN,           // with a reason
  "payment.collectDebt": ADMIN,
  "customer.manage": BOTH,             // contact data, vehicles
  "customer.viewBalance": ADMIN,
  "item.view": BOTH,                   // name, code, sell price, stock
  "item.manage": ADMIN,                // create, edit, prices
  "cost.view": ADMIN,                  // cost prices, profit
  "stockCount.enter": BOTH,
  "stockCount.approve": ADMIN,
  "stock.adjust": ADMIN,
  "supplier.manage": ADMIN,            // suppliers, purchases, purchase returns
  "salesReturn.manage": ADMIN,
  "cash.manage": ADMIN,                // cash drawer, expenses
  "bonus.manage": ADMIN,
  "report.view": ADMIN,
  "partners.manage": ADMIN,            // partner shares, profit split, withdrawals
  "staff.manage": ADMIN,               // staff list, performance, advances, staff expenses and debts
  "label.print": BOTH,
  "settings.manage": ADMIN,            // settings, users, technicians, devices, import, backups
  "audit.view": ADMIN,
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof PERMISSIONS;
export const ACTIONS = Object.keys(PERMISSIONS) as Action[];

/** A user's own list overrides the role; null means "the role's defaults" (so new defaults reach untouched users). */
export type PermissionHolder = { role: Role; permissions?: readonly string[] | null };

export const roleDefaults = (role: Role): Action[] => ACTIONS.filter((a) => (PERMISSIONS[a] as readonly Role[]).includes(role));

export function can(who: PermissionHolder | undefined | null, action: Action): boolean {
  if (!who) return false;
  if (action === "session.use") return true;
  return who.permissions ? who.permissions.includes(action) : (PERMISSIONS[action] as readonly Role[]).includes(who.role);
}

/** The switches on the user screen: section (home tile) and Arabic label. session.use is implied by an active account. */
export type Section = "reception" | "inventory" | "accounts" | "staff" | "users";
export const SECTION_LABEL: Record<Section, string> = { reception: "الاستقبال", inventory: "المخزن", accounts: "الحسابات والتقارير", staff: "الموظفين", users: "المستخدمين والإعدادات" };
export const PERMISSION_INFO: Record<Exclude<Action, "session.use">, { section: Section; label: string }> = {
  "workOrder.create": { section: "reception", label: "استقبال سيارة وفتح أمر شغل" },
  "workOrder.edit": { section: "reception", label: "تعديل أوامر الشغل المفتوحة" },
  "conditionReport.manage": { section: "reception", label: "تقارير الحالة" },
  "estimate.approve": { section: "reception", label: "تسجيل موافقة العميل على التقدير" },
  "odometer.lowerThanPrevious": { section: "reception", label: "قبول قراءة عداد أقل من السابقة" },
  "customer.manage": { section: "reception", label: "بيانات العملاء والسيارات" },
  "statement.create": { section: "reception", label: "عمل بيان أو بيع مباشر وتحصيل قيمته" },
  "item.view": { section: "inventory", label: "يشوف الأصناف والأرصدة وسعر البيع" },
  "item.manage": { section: "inventory", label: "إضافة وتعديل الأصناف والأسعار" },
  "stock.issue": { section: "inventory", label: "صرف قطع على أمر شغل" },
  "stock.issueOverAvailable": { section: "inventory", label: "الصرف بأكبر من الرصيد المتاح" },
  "stock.adjust": { section: "inventory", label: "تسوية رصيد صنف" },
  "stockCount.enter": { section: "inventory", label: "إدخال الجرد" },
  "stockCount.approve": { section: "inventory", label: "اعتماد الجرد" },
  "supplier.manage": { section: "inventory", label: "الموردين والمشتريات" },
  "label.print": { section: "inventory", label: "طباعة ملصقات الأصناف" },
  "cost.view": { section: "accounts", label: "يشوف سعر التكلفة والربح" },
  "customer.viewBalance": { section: "accounts", label: "يشوف أرصدة ومديونيات العملاء" },
  "payment.collectDebt": { section: "accounts", label: "تحصيل مديونية عميل" },
  "statement.editSaved": { section: "accounts", label: "تعديل بيان محفوظ" },
  "statement.cancel": { section: "accounts", label: "إلغاء بيان" },
  "salesReturn.manage": { section: "accounts", label: "مرتجع المبيعات" },
  "cash.manage": { section: "accounts", label: "صندوق الكاش والمصروفات" },
  "bonus.manage": { section: "staff", label: "حوافز المهندسين والفنيين" },
  "staff.manage": { section: "staff", label: "الموظفين: الأداء والسلف والمصروفات والمديونيات" },
  "report.view": { section: "accounts", label: "التقارير ومبيعات اليوم" },
  "partners.manage": { section: "accounts", label: "الشركاء: النسب والأرباح والمسحوبات" },
  "settings.manage": { section: "users", label: "الإعدادات والمستخدمين والأجهزة" },
  "audit.view": { section: "users", label: "سجل العمليات" },
};

/** Arabic message shown when the server refuses an action. */
export const DENIED_MESSAGE: Partial<Record<Action, string>> = {
  "statement.editSaved": "البيان محفوظ ولا يمكن تعديله إلا من الإدارة.",
  "statement.cancel": "إلغاء البيان من صلاحية الإدارة فقط.",
  "stock.issueOverAvailable": "الكمية المطلوبة أكبر من المتاح في المخزن. الصرف بالسالب من صلاحية الإدارة فقط.",
  "odometer.lowerThanPrevious": "قراءة العداد أقل من آخر قراءة. الإدارة فقط تقدر تكمل مع ذكر السبب.",
  "cost.view": "أسعار التكلفة للإدارة فقط.",
};
export const deniedMessage = (a: Action) => DENIED_MESSAGE[a] ?? "ليس لديك صلاحية لهذا الإجراء. اطلب من الإدارة تفعيلها.";
