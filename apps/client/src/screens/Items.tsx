import { useState } from "react";
import { PackageSearch, Pencil, Plus, QrCode, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import {
  Badge, Button, Chip, DL, Dialog, EmptyState, Field, GradeBadge, GRADE_LABEL, IconButton, Input, Money, Panel, Segmented, Select, useFmt, When,
} from "@jc/ui";
import { PageHead, PageState } from "../shell/Shell";
import { go, queryParam, useCan } from "../lib";
import { api } from "../data/api";
import { qs, useAction, useApi } from "../data/hooks";
import type { Grade, Item, Movement, Variant } from "../data/types";
import { QrLabel, useLabelSize } from "./Labels";
import { toPt, toMilli } from "@jc/core";
import { SearchTools } from "./SearchTools";

type ItemType = Item["type"];
const TYPE_LABEL: Record<ItemType, string> = { part: "قطع غيار", oil: "زيوت", material: "خامات", labor: "مصنعيات", paint: "بويات" };
const MOVE_LABEL: Record<string, string> = {
  opening: "رصيد افتتاحي", purchase_in: "شراء", purchase_return: "مرتجع مشتريات", issue_out: "صرف لأمر شغل", issue_return: "مرتجع من أمر شغل",
  sale_out: "بيع مباشر", sales_return: "مرتجع مبيعات", adjustment: "تسوية", count: "جرد", statement_edit: "تعديل بيان", statement_cancel: "إلغاء بيان",
};
const isLow = (v: Variant) => v.minQtyMilli > 0 && v.qtyMilli <= v.minQtyMilli;

export function Items() {
  const f = useFmt();
  const canManage = useCan("item.manage");
  const seeCost = useCan("cost.view");
  const [type, setType] = useState<"all" | ItemType>("all");
  const [q, setQ] = useState("");
  const [low, setLow] = useState(queryParam("low") === "1");
  const [newOpen, setNewOpen] = useState(false);
  const [shelf, setShelf] = useState(queryParam("location") ?? "");
  const shelves = useApi<string[]>("/items/locations").data ?? [];
  const list = useApi<Item[]>(`/items?${qs({ q: q.trim() || undefined, type: type === "all" ? undefined : type, low: low ? "1" : undefined, location: shelf || undefined })}`);
  const rows = list.data ?? [];
  return (
    <div>
      <PageHead title="المخزن والأصناف" sub={<>{f.n(rows.length)} صنف في هذه القائمة · مخزن رئيسي واحد</>}
        actions={<><Button icon={<QrCode />} onClick={() => go("/labels")}>ملصقات QR</Button>{canManage && <Button variant="primary" icon={<Plus />} onClick={() => setNewOpen(true)}>صنف جديد</Button>}</>} />
      <div className="toolbar">
        <div className="input-group grow"><Search /><Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && rows.length === 1) go(`/items/${rows[0].id}`); }} placeholder="اسم الصنف، الكود، الاسم الإنجليزي أو امسح الباركود" aria-label="بحث في الأصناف" /><span className="input-group__end"><SearchTools onText={setQ} voice={false} /></span></div>
        <Segmented label="نوع الصنف" value={type} onChange={setType} options={[{ value: "all", label: "الكل" }, ...(["part", "oil", "material", "labor"] as const).map((t) => ({ value: t, label: TYPE_LABEL[t] }))]} />
        <Select value={shelf} onChange={(e) => setShelf(e.target.value)} aria-label="مكان التخزين" style={{ width: 170 }}>
          <option value="">كل الأماكن</option>
          {shelves.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Chip pressed={low} onToggle={() => setLow(!low)}>تحت الحد الأدنى فقط</Chip>
      </div>
      <PageState loading={list.loading && !list.data} error={list.error} onRetry={list.reload} />
      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>الصنف</th><th>النوع</th><th>الجودات والرصيد</th><th className="num">سعر البيع</th>{seeCost && <th className="num">التكلفة (متوسط)</th>}<th>المكان</th></tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="is-clickable" tabIndex={0} onClick={() => go(`/items/${i.id}`)} onKeyDown={(e) => e.key === "Enter" && go(`/items/${i.id}`)}>
                  <td><span className="cell-main">{i.nameAr}</span><span className="cell-sub"><span className="lat">{i.code}</span>{i.nameEn && <> · <span className="lat">{i.nameEn}</span></>}</span></td>
                  <td>{TYPE_LABEL[i.type]}</td>
                  <td>
                    {!i.trackStock ? <span className="subtle">خدمة</span> : (
                      <span className="row" style={{ gap: 8 }}>
                        {i.variants.map((v) => (
                          <span key={v.id} className="row" style={{ gap: 6 }}>
                            {v.grade && <GradeBadge grade={v.grade} />}
                            <span className="num" style={{ fontWeight: 600, color: v.qtyMilli <= 0 ? "var(--bad)" : isLow(v) ? "var(--warn)" : undefined }}>{f.n(v.qtyMilli / 1000)}</span>
                            {v.qtyMilli <= 0 ? <Badge tone="bad">نفد</Badge> : isLow(v) && <Badge tone="warn">منخفض</Badge>}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="num">{i.variants.map((v) => <span key={v.id} style={{ display: "block" }}><Money pt={v.sellPricePt} cur={false} />{i.type === "oil" && <span className="money__cur">/لتر</span>}</span>)}</td>
                  {seeCost && <td className="num muted">{i.trackStock ? i.variants.map((v) => <span key={v.id} style={{ display: "block" }}><Money pt={v.avgCostPt ?? 0} cur={false} /></span>) : "—"}</td>}
                  <td className="lat muted">{i.location ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.data && rows.length === 0 && <EmptyState icon={<PackageSearch />} title="لا يوجد صنف بهذا البحث" body="لو الصنف جديد على المخزن، الإدارة تضيفه من «صنف جديد». الباركود الممسوح يجب أن يطابق الكود كاملًا." />}
      </div>
      {newOpen && <ItemDialog onClose={() => setNewOpen(false)} />}
    </div>
  );
}

type VariantDraft = { id?: string; grade: Grade | ""; price: string; min: string; barcode: string; opening: string; cost: string };
function ItemDialog({ item, onClose }: { item?: Item; onClose: () => void }) {
  const run = useAction();
  const [d, setD] = useState({ code: item?.code ?? "", nameAr: item?.nameAr ?? "", nameEn: item?.nameEn ?? "", type: item?.type ?? "part" as ItemType, unit: item?.unit ?? "قطعة", location: item?.location ?? "" });
  const [vs, setVs] = useState<VariantDraft[]>(item?.variants.map((v) => ({ id: v.id, grade: v.grade ?? "", price: String(v.sellPricePt / 100), min: String(v.minQtyMilli / 1000), barcode: v.barcode ?? "", opening: "", cost: "" })) ?? [{ grade: "original", price: "", min: "0", barcode: "", opening: "", cost: "" }]);
  const setV = (i: number, p: Partial<VariantDraft>) => setVs(vs.map((v, k) => (k === i ? { ...v, ...p } : v)));
  const save = async () => {
    const body = {
      ...d, nameEn: d.nameEn || null, location: d.location || null,
      variants: vs.map((v) => ({
        id: v.id, grade: v.grade || null, sellPricePt: toPt(v.price), minQtyMilli: toMilli(v.min || 0), barcode: v.barcode || null,
        ...(!item && v.opening ? { openingQtyMilli: toMilli(v.opening), openingCostPt: toPt(v.cost || 0) } : {}),
      })),
    };
    const r = await run(() => api(item ? `/items/${item.id}` : "/items", { method: item ? "PATCH" : "POST", body }), item ? "تم حفظ الصنف." : "تمت إضافة الصنف.");
    if (r) onClose();
  };
  const valid = d.code.trim() && d.nameAr.trim().length >= 2 && vs.every((v) => v.price !== "" && Number(v.price) >= 0);
  return (
    <Dialog open onClose={onClose} title={item ? `تعديل ${item.nameAr}` : "صنف جديد"} wide
      footer={<><Button onClick={onClose}>رجوع</Button><Button variant="primary" disabled={!valid} onClick={save}>حفظ</Button></>}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="form-grid" style={{ ["--cols" as string]: 3 }}>
          <Field label="الكود" required><Input className="lat" dir="ltr" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} placeholder="P-2201" /></Field>
          <Field label="الاسم بالعربي" required><Input value={d.nameAr} onChange={(e) => setD({ ...d, nameAr: e.target.value })} /></Field>
          <Field label="الاسم بالإنجليزي"><Input className="lat" dir="ltr" value={d.nameEn} onChange={(e) => setD({ ...d, nameEn: e.target.value })} /></Field>
          <Field label="النوع"><Select value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as ItemType, unit: e.target.value === "oil" ? "لتر" : e.target.value === "labor" ? "عملية" : d.unit })}>{(["part", "oil", "material", "labor"] as const).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</Select></Field>
          <Field label="الوحدة"><Input value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} /></Field>
          <Field label="مكان التخزين"><Input className="lat" value={d.location} onChange={(e) => setD({ ...d, location: e.target.value })} /></Field>
        </div>
        <table className="table table--compact">
          <thead><tr><th>الجودة</th><th className="num">سعر البيع</th><th className="num">الحد الأدنى</th><th>الباركود</th>{!item && <th className="num">رصيد افتتاحي</th>}{!item && <th className="num">تكلفة الوحدة</th>}<th /></tr></thead>
          <tbody>
            {vs.map((v, i) => (
              <tr key={i}>
                <td><Select size="sm" value={v.grade} onChange={(e) => setV(i, { grade: e.target.value as Grade | "" })}><option value="">—</option>{(["original", "copy", "used"] as const).map((g) => <option key={g} value={g}>{GRADE_LABEL[g]}</option>)}</Select></td>
                <td><Input size="sm" num type="number" min={0} value={v.price} onChange={(e) => setV(i, { price: e.target.value })} /></td>
                <td><Input size="sm" num type="number" min={0} value={v.min} onChange={(e) => setV(i, { min: e.target.value })} /></td>
                <td><Input size="sm" className="lat" dir="ltr" value={v.barcode} onChange={(e) => setV(i, { barcode: e.target.value })} /></td>
                {!item && <td><Input size="sm" num type="number" min={0} value={v.opening} onChange={(e) => setV(i, { opening: e.target.value })} /></td>}
                {!item && <td><Input size="sm" num type="number" min={0} value={v.cost} onChange={(e) => setV(i, { cost: e.target.value })} /></td>}
                <td>{!v.id && vs.length > 1 && <IconButton size="sm" label="حذف الجودة" onClick={() => setVs(vs.filter((_, k) => k !== i))}><Trash2 /></IconButton>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {vs.length < 3 && <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setVs([...vs, { grade: "copy", price: "", min: "0", barcode: "", opening: "", cost: "" }])}>إضافة جودة</Button>}
      </div>
    </Dialog>
  );
}

export function ItemDetail({ id }: { id: string }) {
  const f = useFmt();
  const canManage = useCan("item.manage");
  const canAdjust = useCan("stock.adjust");
  const seeCost = useCan("cost.view");
  const run = useAction();
  const q = useApi<Item & { movements: Movement[]; stats: { variantId: string; used30Milli: number; used90Milli: number; lastUsedAt: string | null }[] }>(`/items/${id}`);
  const labelSize = useLabelSize();
  const [g, setG] = useState(0);
  const [edit, setEdit] = useState(false);
  const [adj, setAdj] = useState<{ qty: string; reason: string } | null>(null);
  const it = q.data;
  if (!it) return <PageState loading={q.loading} error={q.error} onRetry={q.reload} />;
  const v = it.variants[Math.min(g, it.variants.length - 1)];
  const moves = it.movements.filter((m) => m.variantId === v.id);
  // Balance after each movement, walking back from today's balance (the list is newest first).
  const after = moves.reduce<number[]>((acc, m, k) => [...acc, k === 0 ? v.qtyMilli : acc[k - 1] - moves[k - 1].qtyMilli], []);
  const st = it.stats.find((s) => s.variantId === v.id);
  const perDay = (st?.used90Milli ?? 0) / 90;
  const coverDays = perDay > 0 ? Math.floor(v.qtyMilli / perDay) : null;
  return (
    <div className="stack">
      <PageHead back={{ to: "/items", label: "المخزن والأصناف" }}
        title={<>{it.nameAr}<span className="lat muted" style={{ fontSize: 18, fontWeight: 600 }}>{it.code}</span></>}
        sub={<>{TYPE_LABEL[it.type]}{it.nameEn && <> · <span className="lat">{it.nameEn}</span></>}</>}
        actions={<>
          {canAdjust && it.trackStock && <Button icon={<SlidersHorizontal />} onClick={() => setAdj({ qty: "", reason: "" })}>تسوية رصيد</Button>}
          {canManage && <Button variant="primary" icon={<Pencil />} onClick={() => setEdit(true)}>تعديل</Button>}
        </>} />
      <div className="grid-main-side">
        <div className="stack">
          <Panel title="الجودات والأسعار" sub="كل جودة لها سعرها ورصيدها." flush>
            <table className="table">
              <thead><tr><th>الجودة</th><th className="num">الرصيد</th><th className="num">الحد الأدنى</th><th className="num">سعر البيع</th>{seeCost && <th className="num">متوسط التكلفة</th>}{seeCost && <th className="num">هامش الربح</th>}<th>الباركود</th></tr></thead>
              <tbody>
                {it.variants.map((x, k) => (
                  <tr key={x.id} className={`is-clickable${x.id === v.id ? " is-selected" : ""}`} onClick={() => setG(k)}>
                    <td>{x.grade ? <GradeBadge grade={x.grade} size="lg" /> : "—"}</td>
                    <td className="num" style={{ color: x.qtyMilli <= 0 ? "var(--bad)" : isLow(x) ? "var(--warn)" : undefined, fontWeight: 700 }}>{it.trackStock ? f.n(x.qtyMilli / 1000) : "—"} <span style={{ fontFamily: "var(--font-ar)", fontSize: 12 }}>{it.unit}</span></td>
                    <td className="num">{f.n(x.minQtyMilli / 1000)}</td>
                    <td className="num"><Money pt={x.sellPricePt} cur={false} /></td>
                    {seeCost && <td className="num muted"><Money pt={x.avgCostPt ?? 0} cur={false} /></td>}
                    {seeCost && <td className="num" style={{ color: "var(--ok)" }}>{x.sellPricePt && x.avgCostPt ? `${f.n(Math.round(((x.sellPricePt - x.avgCostPt) / x.sellPricePt) * 100))}%` : "—"}</td>}
                    <td className="lat muted">{x.barcode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          {it.trackStock && (
            <Panel title={<>حركة المخزن · {v.grade ? GRADE_LABEL[v.grade] : it.nameAr}</>} sub="الرصيد = مجموع الحركات. لا تُحذف حركة أبدًا." flush>
              <table className="table">
                <thead><tr><th>الوقت</th><th>الحركة</th><th>السبب</th><th className="num">الكمية</th><th className="num">الرصيد بعدها</th>{seeCost && <th className="num">التكلفة</th>}<th>بواسطة</th></tr></thead>
                <tbody>
                  {moves.map((m, k) => (
                    <tr key={m.id}>
                      <td><When iso={m.at} /></td>
                      <td className="cell-main">{MOVE_LABEL[m.kind] ?? m.kind}</td>
                      <td className="muted">{m.reason ?? ""}</td>
                      <td className="num" style={{ color: m.qtyMilli < 0 ? "var(--bad)" : "var(--ok)", fontWeight: 700 }}>{m.qtyMilli > 0 ? "+" : "−"}{f.n(Math.abs(m.qtyMilli) / 1000)}</td>
                      <td className="num">{f.n(after[k] / 1000)}</td>
                      {seeCost && <td className="num muted">{m.unitCostPt !== undefined ? <Money pt={m.unitCostPt} cur={false} /> : "—"}</td>}
                      <td>{m.by ?? "—"}</td>
                    </tr>
                  ))}
                  {!moves.length && <tr><td colSpan={7} className="hint-line" style={{ textAlign: "center" }}>لا توجد حركات بعد.</td></tr>}
                </tbody>
              </table>
            </Panel>
          )}
        </div>
        <aside className="stack sticky-side">
          {it.trackStock && (
            <Panel title="تحليل الصنف" sub={v.grade ? GRADE_LABEL[v.grade] : undefined}>
              <DL items={[
                { label: "اتصرف آخر 30 يوم", value: f.n((st?.used30Milli ?? 0) / 1000) },
                { label: "اتصرف آخر 90 يوم", value: f.n((st?.used90Milli ?? 0) / 1000) },
                { label: "آخر صرف", value: st?.lastUsedAt ? <When iso={st.lastUsedAt} /> : "لم يُصرف بعد" },
                { label: "الرصيد يكفي", value: coverDays === null ? "—" : `حوالي ${f.n(coverDays)} يوم` },
                ...(seeCost ? [{ label: "قيمة الرصيد بالتكلفة", value: <Money pt={Math.round((v.qtyMilli * (v.avgCostPt ?? 0)) / 1000)} /> }] : []),
              ]} cols={2} />
            </Panel>
          )}
          <Panel title="الملصق" icon={<QrCode />} sub="معاينة 40 × 30 مم. الطباعة على الطابعة الحرارية في المرحلة القادمة.">
            <div className="stack" style={{ gap: 14, justifyItems: "center" }}>
              <QrLabel r={{ qr: v.barcode ?? it.code, name: it.nameAr, sub: `${it.code}${v.grade ? ` · ${GRADE_LABEL[v.grade]}` : ""}`, pricePt: v.sellPricePt }} size={labelSize} price />
            </div>
          </Panel>
          <Panel title="بيانات الصنف" raised>
            <DL cols={1} items={[
              { label: "الوحدة", value: it.unit },
              { label: "مكان التخزين", value: <span className="lat">{it.location ?? "—"}</span> },
              { label: "طريقة التكلفة", value: "متوسط مرجح (يتحدث مع كل شراء)" },
            ]} />
          </Panel>
        </aside>
      </div>
      {edit && <ItemDialog item={it} onClose={() => setEdit(false)} />}
      <Dialog open={!!adj} onClose={() => setAdj(null)} title={`تسوية رصيد · ${it.nameAr}${v.grade ? ` (${GRADE_LABEL[v.grade]})` : ""}`}
        footer={<><Button onClick={() => setAdj(null)}>رجوع</Button><Button variant="primary" disabled={!adj?.qty || Number(adj.qty) === 0 || (adj?.reason.trim().length ?? 0) < 3} onClick={async () => {
          const r = await run(() => api("/stock/adjust", { method: "POST", body: { variantId: v.id, qtyMilli: toMilli(adj!.qty), reason: adj!.reason } }), "تمت التسوية وسُجلت في سجل المراجعة.");
          if (r) setAdj(null);
        }}>حفظ التسوية</Button></>}>
        <div className="form-grid" style={{ ["--cols" as string]: 2 }}>
          <Field label="الرصيد الحالي"><Input num readOnly value={f.n(v.qtyMilli / 1000)} /></Field>
          <Field label="الكمية (+ زيادة / − عجز)" required><Input num value={adj?.qty ?? ""} onChange={(e) => setAdj({ ...adj!, qty: e.target.value })} placeholder="-1" /></Field>
          <Field label="السبب" required className="span-all"><Input value={adj?.reason ?? ""} onChange={(e) => setAdj({ ...adj!, reason: e.target.value })} placeholder="مثال: عجز جرد" /></Field>
        </div>
      </Dialog>
    </div>
  );
}

