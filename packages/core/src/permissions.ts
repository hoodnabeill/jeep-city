/**
 * Permission matrix (PLAN §7). The server enforces it; the UI uses it only to hide controls.
 * One row per action → the roles allowed. Change a rule here and in permissions.test.ts.
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
  "label.print": BOTH,
  "settings.manage": ADMIN,            // settings, users, technicians, devices, import, backups
  "audit.view": ADMIN,
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof PERMISSIONS;

export function can(role: Role | undefined | null, action: Action): boolean {
  return !!role && (PERMISSIONS[action] as readonly Role[]).includes(role);
}

/** Arabic message shown when the server refuses an action. */
export const DENIED_MESSAGE: Partial<Record<Action, string>> = {
  "statement.editSaved": "البيان محفوظ ولا يمكن تعديله إلا من الإدارة.",
  "statement.cancel": "إلغاء البيان من صلاحية الإدارة فقط.",
  "stock.issueOverAvailable": "الكمية المطلوبة أكبر من المتاح في المخزن. الصرف بالسالب من صلاحية الإدارة فقط.",
  "odometer.lowerThanPrevious": "قراءة العداد أقل من آخر قراءة. الإدارة فقط تقدر تكمل مع ذكر السبب.",
  "cost.view": "أسعار التكلفة للإدارة فقط.",
};
export const deniedMessage = (a: Action) => DENIED_MESSAGE[a] ?? "هذا الإجراء من صلاحية الإدارة فقط.";
