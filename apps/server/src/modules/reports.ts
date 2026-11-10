/**
 * General report (التقرير العام), Admin only (report.view). Every report has the same shape so the client can show,
 * print and export any of them: { title, columns, rows, totals?, summary? }. Money is in piasters, quantities in thousandths.
 * Dates are shop days in Cairo; a statement's day is its statement_date.
 */
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { requirePerm } from "../auth/auth";
import type { Db } from "../db/client";
import { AppError } from "../errors";

export type Col = { key: string; label: string; type: "text" | "date" | "int" | "money" | "qty" };
export type Report = { title: string; columns: Col[]; rows: Record<string, unknown>[]; totals?: Record<string, number>; summary?: Record<string, number>; note?: string };

const Q = z.object({ from: z.iso.date(), to: z.iso.date() });
const day = (col: SQL) => sql`(${col} at time zone 'Africa/Cairo')::date`;

async function rows(db: Db, q: SQL): Promise<Record<string, unknown>[]> {
  return ((await db.execute(q)) as unknown as { rows: Record<string, unknown>[] }).rows;
}
/** Postgres sends bigint sums as strings. Only columns declared money, qty or int become numbers; text such as phones and item codes keeps its leading zeros. */
const typed = (columns: Col[], rs: Record<string, unknown>[]) => {
  const numeric = new Set(columns.filter((c) => c.type === "money" || c.type === "qty" || c.type === "int").map((c) => c.key));
  return rs.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, numeric.has(k) && v !== null ? Number(v) : v])));
};
const sum = (rs: Record<string, unknown>[], keys: string[]) => Object.fromEntries(keys.map((k) => [k, rs.reduce((a, r) => a + (Number(r[k]) || 0), 0)]));

const finalIn = (from: string, to: string) => sql`s.status = 'final' and s.statement_date between ${from} and ${to}`;

/**
 * Net profit for a date range, on new-system statements only (Byte statements carry no cost, D-80):
 * sales without VAT - cost of parts sold - expenses - technician bonuses - (sales returns - cost of the returned stock).
 */
export async function profitSummary(db: Db, from: string, to: string) {
  const [p] = await rows(db, sql`select
      coalesce(sum(s.amount_due_pt) filter (where s.kind <> 'byte'), 0) as "newSalesPt",
      coalesce(sum(coalesce((s.totals->>'taxPt')::bigint, 0)) filter (where s.kind <> 'byte'), 0) as "taxPt",
      coalesce(sum(s.amount_due_pt) filter (where s.kind = 'byte'), 0) as "byteSalesPt",
      (select coalesce(sum(-m.qty_milli * m.unit_cost_pt / 1000), 0) from stock_movements m
         left join doc_lines l on m.ref_type = 'doc_line' and l.id = m.ref_id
         join statements s2 on s2.id = coalesce(l.statement_id, case when m.ref_type = 'statement' then m.ref_id end)
         where s2.status = 'final' and s2.kind <> 'byte' and s2.statement_date between ${from} and ${to}) as "cogsPt",
      (select coalesce(sum(e.amount_pt), 0) from expenses e where ${day(sql`e.spent_at`)} between ${from}::date and ${to}::date) as "expensesPt",
      (select coalesce(sum(b.amount_pt), 0) from bonuses b where ${day(sql`b.given_at`)} between ${from}::date and ${to}::date) as "bonusesPt",
      (select coalesce(sum(r.total_pt), 0) from sales_returns r join statements s3 on s3.id = r.statement_id
         where s3.kind <> 'byte' and ${day(sql`r.created_at`)} between ${from}::date and ${to}::date) as "returnsPt",
      (select coalesce(sum(m.qty_milli * m.unit_cost_pt / 1000), 0) from stock_movements m
         where m.kind = 'sales_return' and ${day(sql`m.created_at`)} between ${from}::date and ${to}::date) as "returnedCostPt"
    from statements s where ${finalIn(from, to)}`);
  const x = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Number(v)])) as Record<string, number>;
  x.profitPt = x.newSalesPt - x.taxPt - x.cogsPt - x.expensesPt - x.bonusesPt - (x.returnsPt - x.returnedCostPt);
  return x;
}

export const REPORTS: Record<string, { title: string; ranged: boolean; run: (db: Db, from: string, to: string) => Promise<Omit<Report, "title">> }> = {
  sales: {
    title: "المبيعات والربح", ranged: true,
    async run(db, from, to) {
      const net = (c: string) => sql.raw(`coalesce((s.totals->'net'->>'${c}')::bigint, 0)`);
      const rs = await rows(db, sql`select s.statement_date as date, count(*)::int as count,
          sum(${net("labor")}) as labor, sum(${net("part")}) as parts, sum(${net("oil")}) as oils, sum(${net("material")} + ${net("paint")}) as materials,
          sum(coalesce((s.totals->>'discountPt')::bigint, 0)) as discount, sum(coalesce((s.totals->>'taxPt')::bigint, 0)) as tax, sum(s.amount_due_pt) as total
        from statements s where ${finalIn(from, to)} group by s.statement_date order by s.statement_date`);
      const summary = await profitSummary(db, from, to);
      return {
        rows: rs, summary, totals: sum(rs, ["count", "labor", "parts", "oils", "materials", "discount", "tax", "total"]),
        columns: [
          { key: "date", label: "اليوم", type: "date" }, { key: "count", label: "بيانات", type: "int" }, { key: "labor", label: "المصنعيات", type: "money" },
          { key: "parts", label: "قطع الغيار", type: "money" }, { key: "oils", label: "الزيوت", type: "money" }, { key: "materials", label: "الخامات", type: "money" },
          { key: "discount", label: "الخصم", type: "money" }, { key: "tax", label: "الضريبة", type: "money" }, { key: "total", label: "الإجمالي", type: "money" },
        ],
        note: summary.byteSalesPt ? "الربح محسوب على بيانات النظام الجديد فقط؛ بيانات بايت بلا تكلفة." : undefined,
      };
    },
  },
  "top-items": {
    title: "أكثر الأصناف مبيعًا", ranged: true,
    async run(db, from, to) {
      const rs = await rows(db, sql`select max(l.name) as name, max(l.code) as code, sum(l.qty_milli) as qty, sum(l.qty_milli * l.unit_price_pt / 1000) as value, count(distinct s.id)::int as statements
        from doc_lines l join statements s on s.id = l.statement_id
        where ${finalIn(from, to)} and l.archived_at is null and l.category <> 'labor'
        group by coalesce(l.variant_id::text, l.name) order by value desc limit 200`);
      return { rows: rs, totals: sum(rs, ["value"]), columns: [
        { key: "name", label: "الصنف", type: "text" }, { key: "code", label: "الكود", type: "text" }, { key: "qty", label: "الكمية", type: "qty" },
        { key: "statements", label: "بيانات", type: "int" }, { key: "value", label: "المبيعات", type: "money" }] };
    },
  },
  "stock-value": {
    title: "قيمة المخزون", ranged: false,
    async run(db) {
      const rs = await rows(db, sql`select i.name_ar as name, i.code, sum(sl.qty_milli) as qty, max(sl.avg_cost_pt) as cost, sum(sl.qty_milli * sl.avg_cost_pt / 1000) as value, sum(sl.qty_milli * v.sell_price_pt / 1000) as "sellValue"
        from stock_levels sl join item_variants v on v.id = sl.variant_id join items i on i.id = v.item_id
        where sl.qty_milli > 0 and i.archived_at is null group by i.id order by value desc`);
      return { rows: rs, totals: sum(rs, ["value", "sellValue"]), columns: [
        { key: "name", label: "الصنف", type: "text" }, { key: "code", label: "الكود", type: "text" }, { key: "qty", label: "الرصيد", type: "qty" },
        { key: "cost", label: "متوسط التكلفة", type: "money" }, { key: "value", label: "القيمة بالتكلفة", type: "money" }, { key: "sellValue", label: "القيمة بسعر البيع", type: "money" }] };
    },
  },
  "low-stock": {
    title: "أصناف تحت الحد الأدنى", ranged: false,
    async run(db) {
      const rs = await rows(db, sql`select i.name_ar as name, i.code, coalesce(sl.qty_milli, 0) as qty, v.min_qty_milli as min, i.location
        from item_variants v join items i on i.id = v.item_id left join stock_levels sl on sl.variant_id = v.id
        where v.archived_at is null and i.archived_at is null and i.track_stock and v.min_qty_milli > 0 and coalesce(sl.qty_milli, 0) <= v.min_qty_milli
        order by coalesce(sl.qty_milli, 0) - v.min_qty_milli`);
      return { rows: rs, columns: [
        { key: "name", label: "الصنف", type: "text" }, { key: "code", label: "الكود", type: "text" }, { key: "qty", label: "الرصيد", type: "qty" },
        { key: "min", label: "الحد الأدنى", type: "qty" }, { key: "location", label: "المكان", type: "text" }] };
    },
  },
  "slow-movers": {
    title: "الأصناف الراكدة (لم تُصرف 90 يومًا)", ranged: false,
    async run(db) {
      const rs = await rows(db, sql`select i.name_ar as name, i.code, sum(sl.qty_milli) as qty, sum(sl.qty_milli * sl.avg_cost_pt / 1000) as value,
          (select max(${day(sql`m.created_at`)})::text from stock_movements m join item_variants v2 on v2.id = m.variant_id where v2.item_id = i.id and m.qty_milli < 0) as "lastOut"
        from stock_levels sl join item_variants v on v.id = sl.variant_id join items i on i.id = v.item_id
        where sl.qty_milli > 0 and i.archived_at is null and not exists (
          select 1 from stock_movements m join item_variants v2 on v2.id = m.variant_id where v2.item_id = i.id and m.qty_milli < 0 and m.created_at > now() - interval '90 days')
        group by i.id order by value desc`);
      return { rows: rs, totals: sum(rs, ["value"]), note: "يعتمد على الصرف المسجل في النظام الجديد؛ الأصناف المستوردة من بايت تظهر هنا حتى تُصرف أول مرة.", columns: [
        { key: "name", label: "الصنف", type: "text" }, { key: "code", label: "الكود", type: "text" }, { key: "qty", label: "الرصيد", type: "qty" },
        { key: "value", label: "القيمة بالتكلفة", type: "money" }, { key: "lastOut", label: "آخر صرف", type: "date" }] };
    },
  },
  debts: {
    title: "مديونيات العملاء", ranged: false,
    async run(db) {
      const rs = await rows(db, sql`select c.name, c.mobile, b.balance, (select max(s.statement_date) from statements s where s.customer_id = c.id and s.status = 'final') as "lastStatement"
        from (select customer_id, sum(amount_pt) as balance from customer_ledger group by customer_id having sum(amount_pt) > 0) b join customers c on c.id = b.customer_id
        order by b.balance desc`);
      return { rows: rs, totals: sum(rs, ["balance"]), columns: [
        { key: "name", label: "العميل", type: "text" }, { key: "mobile", label: "الموبايل", type: "text" }, { key: "lastStatement", label: "آخر بيان", type: "date" },
        { key: "balance", label: "المديونية", type: "money" }] };
    },
  },
  suppliers: {
    title: "أرصدة الموردين", ranged: false,
    async run(db) {
      const rs = await rows(db, sql`select sp.name, sp.phone, b.balance from (select supplier_id, sum(amount_pt) as balance from supplier_ledger group by supplier_id having sum(amount_pt) <> 0) b
        join suppliers sp on sp.id = b.supplier_id order by b.balance desc`);
      return { rows: rs, totals: sum(rs, ["balance"]), columns: [
        { key: "name", label: "المورد", type: "text" }, { key: "phone", label: "التليفون", type: "text" }, { key: "balance", label: "الرصيد المستحق له", type: "money" }] };
    },
  },
  expenses: {
    title: "المصروفات حسب البند", ranged: true,
    async run(db, from, to) {
      const rs = await rows(db, sql`select ec.name as category, count(*)::int as count, sum(e.amount_pt) as amount
        from expenses e join expense_categories ec on ec.id = e.category_id where ${day(sql`e.spent_at`)} between ${from}::date and ${to}::date
        group by ec.name order by amount desc`);
      return { rows: rs, totals: sum(rs, ["count", "amount"]), columns: [
        { key: "category", label: "البند", type: "text" }, { key: "count", label: "عدد", type: "int" }, { key: "amount", label: "المبلغ", type: "money" }] };
    },
  },
  people: {
    title: "أداء المهندسين والفنيين", ranged: true,
    /**
     * Per person, for the cars they were on (engineer = reception engineer; technician = assigned on the work order):
     * cars received in the period, comebacks, cars delivered (final statement in the period), labor and parts of those
     * statements, average days in the shop, and bonuses. A car with two technicians counts for each of them.
     */
    async run(db, from, to) {
      const assigned = (pid: SQL) => sql`join assignments a on a.wid = x.wid and a.pid = ${pid}`;
      const rs = await rows(db, sql`
        with received as (
          select w.id as wid, w.comeback from work_orders w
          where w.archived_at is null and w.type = 'repair' and ${day(sql`w.entered_at`)} between ${from}::date and ${to}::date
        ), delivered as (
          select s.work_order_id as wid, s.totals, extract(epoch from s.created_at - w.entered_at) / 86400 as days
          from statements s join work_orders w on w.id = s.work_order_id where ${finalIn(from, to)}
        ), assignments as (
          select 'u:' || w.reception_user_id::text as pid, w.id as wid from work_orders w where w.reception_user_id is not null
          union all select 't:' || t.technician_id::text, t.work_order_id from work_order_technicians t
        ), people as (
          select 'u:' || u.id::text as pid, u.id as uid, null::uuid as tid, u.display_name as name, case when u.role = 'admin' then 'إدارة' else 'مهندس' end as role from users u
          union all select 't:' || t.id::text, null, t.id, t.name, 'فني' from technicians t
        )
        select * from (
          select p.name, p.role,
            (select count(*) from received x ${assigned(sql`p.pid`)})::int as cars,
            (select count(*) from received x ${assigned(sql`p.pid`)} where x.comeback)::int as comebacks,
            (select count(*) from delivered x ${assigned(sql`p.pid`)})::int as delivered,
            (select coalesce(sum((x.totals->'net'->>'labor')::bigint), 0) from delivered x ${assigned(sql`p.pid`)}) as labor,
            (select coalesce(sum(coalesce((x.totals->'net'->>'part')::bigint, 0) + coalesce((x.totals->'net'->>'oil')::bigint, 0)), 0) from delivered x ${assigned(sql`p.pid`)}) as parts,
            (select round(avg(x.days)) from delivered x ${assigned(sql`p.pid`)})::int as days,
            (select coalesce(sum(b.amount_pt), 0) from bonuses b where (b.user_id = p.uid or b.technician_id = p.tid) and ${day(sql`b.given_at`)} between ${from}::date and ${to}::date) as bonuses
          from people p
        ) r where r.cars > 0 or r.delivered > 0 or r.bonuses > 0
        order by r.delivered desc, r.cars desc, r.name`);
      return {
        rows: rs, totals: sum(rs, ["labor", "parts", "bonuses"]),
        note: "العربية اللي عليها أكتر من فني بتتحسب لكل واحد فيهم. المصنعيات وقطع الغيار من بيانات العربيات اللي اتسلمت في الفترة.",
        columns: [
          { key: "name", label: "الاسم", type: "text" }, { key: "role", label: "الصفة", type: "text" },
          { key: "cars", label: "عربيات استلمها", type: "int" }, { key: "delivered", label: "عربيات اتسلمت", type: "int" },
          { key: "comebacks", label: "رجعت تاني", type: "int" }, { key: "days", label: "متوسط أيام في الورشة", type: "int" },
          { key: "labor", label: "المصنعيات", type: "money" }, { key: "parts", label: "قطع الغيار والزيوت", type: "money" }, { key: "bonuses", label: "المكافآت", type: "money" },
        ],
      };
    },
  },
  cash: {
    title: "سجل الصندوق", ranged: true,
    async run(db, from, to) {
      const rs = await rows(db, sql`select ${day(sql`cs.opened_at`)}::text as date, cs.opening_pt as opening, cs.expected_pt as expected, cs.counted_pt as counted, cs.difference_pt as difference, cs.note
        from cash_sessions cs where ${day(sql`cs.opened_at`)} between ${from}::date and ${to}::date order by cs.opened_at`);
      return { rows: rs, totals: sum(rs, ["difference"]), columns: [
        { key: "date", label: "اليوم", type: "date" }, { key: "opening", label: "رصيد الفتح", type: "money" }, { key: "expected", label: "المتوقع", type: "money" },
        { key: "counted", label: "المعدود", type: "money" }, { key: "difference", label: "الفرق", type: "money" }, { key: "note", label: "ملاحظة", type: "text" }] };
    },
  },
};

export function reportRoutes(app: FastifyInstance, db: Db, auth: preHandlerHookHandler) {
  const admin = [auth, requirePerm("report.view")];
  app.get("/reports", { preHandler: admin }, async () => Object.entries(REPORTS).map(([id, r]) => ({ id, title: r.title, ranged: r.ranged })));
  app.get("/reports/:id", { preHandler: admin }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const r = REPORTS[id];
    if (!r) throw new AppError(404, "not_found", "هذا التقرير غير موجود.");
    const { from, to } = Q.parse(req.query);
    if (from > to) throw new AppError(422, "bad_range", "تاريخ البداية بعد تاريخ النهاية.");
    const rep = await r.run(db, from, to);
    return { title: r.title, ...rep, rows: typed(rep.columns, rep.rows) };
  });
}
