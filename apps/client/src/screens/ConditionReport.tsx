import { useEffect, useState } from "react";
import { firstName, toPt } from "@jc/core";
import { Printer, Save, Wrench } from "lucide-react";
import { Badge, Button, Input, Money, Panel, useFmt } from "@jc/ui";
import { PageHead, PageState } from "../shell/Shell";
import { api } from "../data/api";
import { useAction, useApi } from "../data/hooks";
import { go, useCan } from "../lib";
import type { WorkOrder } from "../data/types";
import { carName, CarPlate, WhatsAppButton } from "./common";

export const CHECK_LABEL = { good: "ممتاز", watch: "يحتاج متابعة", urgent: "عاجل" } as const;
export type CheckStatus = keyof typeof CHECK_LABEL;
export type CheckItem = { id?: string; system: string; item: string; status: CheckStatus; note: string | null; recommendedText: string | null; recommendedPricePt: number | null };
export type Condition = { saved: boolean; updatedAt: string | null; items: CheckItem[] };

export function ConditionReport({ id }: { id: string }) {
  const f = useFmt();
  const run = useAction();
  const canPrice = useCan("item.manage");
  const woq = useApi<WorkOrder>(`/work-orders/${id}`);
  const cq = useApi<Condition>(`/work-orders/${id}/condition`);
  const [checks, setChecks] = useState<CheckItem[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { if (cq.data && !dirty) setChecks(cq.data.items); }, [cq.data, dirty]);
  const wo = woq.data;
  if (!wo || !checks) return <PageState loading={woq.loading || cq.loading} error={woq.error ?? cq.error} onRetry={() => { woq.reload(); cq.reload(); }} />;
  const c = wo.customer, v = wo.vehicle;
  const set = (i: number, p: Partial<CheckItem>) => { setDirty(true); setChecks(checks.map((x, k) => (k === i ? { ...x, ...p } : x))); };
  const systems = [...new Set(checks.map((x) => x.system))];
  const recs = checks.filter((x) => x.status !== "good" && x.recommendedText);
  const sum = recs.filter((r) => r.id && picked.includes(r.id)).reduce((a, r) => a + (r.recommendedPricePt ?? 0), 0);
  const count = (s: CheckStatus) => checks.filter((x) => x.status === s).length;
  const save = async () => {
    const r = await run(() => api(`/work-orders/${id}/condition`, { method: "PUT", body: { items: checks } }), "تم حفظ تقرير الحالة.");
    if (r) { setDirty(false); cq.reload(); }
    return r;
  };
  return (
    <div className="stack">
      <PageHead back={{ to: `/work-orders/${wo.id}`, label: `أمر شغل ${f.s(wo.number)}` }} title="تقرير حالة السيارة"
        sub={<><span className="lat">{carName(v)} {v?.year ?? ""}</span> · {c.name}{wo.odometerIn ? <> · <span className="num">{f.n(wo.odometerIn)}</span> كم</> : null}{cq.data?.saved ? "" : " · لم يُحفظ بعد"}</>}
        actions={<>
          <WhatsAppButton phone={c.whatsapp ?? c.mobile} size="md" label="إرسال للعميل" text={`أهلًا ${firstName(c.name)}، تقرير حالة سيارتك من Jeep City جاهز.`} />
          <Button icon={<Printer />} disabled={dirty || !cq.data?.saved} onClick={() => go(`/print/condition/${wo.id}`)}>طباعة / PDF</Button>
          <Button variant="primary" icon={<Save />} disabled={!dirty} onClick={save}>حفظ التقرير</Button>
        </>} />
      <div className="grid-main-side">
        <Panel title="الفحص" flush actions={<span className="row" style={{ gap: 6 }}><Badge tone="ok">{f.n(count("good"))} ممتاز</Badge><Badge tone="warn">{f.n(count("watch"))} متابعة</Badge><Badge tone="bad">{f.n(count("urgent"))} عاجل</Badge></span>}>
          <table className="checks">
            <tbody>
              {systems.map((s) => (
                <SystemRows key={s} system={s} checks={checks} set={set} />
              ))}
            </tbody>
          </table>
        </Panel>
        <aside className="sticky-side stack">
          <div className="doc-head__car" style={{ border: "1px solid var(--line)" }}>
            <CarPlate v={v} size="lg" />
            <span className="model lat">{carName(v)}</span>
            <span className="vin">{v?.chassis}</span>
          </div>
          <div className="totals">
            <div className="totals__title"><span>الأعمال المقترحة</span><span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>اختر ما وافق عليه العميل</span></div>
            <div className="pay" style={{ gap: 4 }}>
              {recs.map((r) => (
                <label key={r.id ?? r.item} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)", cursor: "pointer", flexWrap: "nowrap" }}>
                  <span className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                    <input type="checkbox" disabled={!r.id} checked={!!r.id && picked.includes(r.id)} onChange={() => r.id && setPicked(picked.includes(r.id) ? picked.filter((x) => x !== r.id) : [...picked, r.id])} style={{ width: 18, height: 18, accentColor: "#0B0B0B" }} />
                    <span><b style={{ fontSize: 14 }}>{r.recommendedText}</b><br /><Badge tone={r.status === "urgent" ? "bad" : "warn"}>{CHECK_LABEL[r.status]}</Badge></span>
                  </span>
                  <Money pt={r.recommendedPricePt ?? 0} cur={false} />
                </label>
              ))}
              {!recs.length && <p className="hint-line">اكتب عملًا مقترحًا وسعره بجانب أي بند «متابعة» أو «عاجل».</p>}
            </div>
            <div className="pay__sum"><span>إجمالي المختار (تقديري)</span><Money pt={sum} /></div>
            <Button variant="primary" block icon={<Wrench />} disabled={!picked.length || dirty || !canPrice} onClick={async () => {
              const r = await run(() => api(`/work-orders/${wo.id}/condition/convert`, { method: "POST", body: { itemIds: picked } }), <>أُضيف {f.n(picked.length)} بنود لأمر الشغل {f.s(wo.number)}.</>);
              if (r) go(`/work-orders/${wo.id}`);
            }}>تحويل المختار لأمر شغل</Button>
            {!canPrice && <p className="hint-line">التحويل بأسعار مقترحة من صلاحية الإدارة.</p>}
            {dirty && canPrice && <p className="hint-line">احفظ التقرير أولًا.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function SystemRows({ system, checks, set }: { system: string; checks: CheckItem[]; set: (i: number, p: Partial<CheckItem>) => void }) {
  return (
    <>
      <tr className="sys"><td colSpan={3}>{system}</td></tr>
      {checks.map((x, i) => x.system !== system ? null : (
        <tr key={x.id ?? `${x.system}-${x.item}`}>
          <td style={{ width: 200, fontWeight: 600 }}>{x.item}</td>
          <td style={{ width: 320 }}>
            <div className="tri" role="radiogroup" aria-label={x.item}>
              {(["good", "watch", "urgent"] as const).map((s) => (
                <button key={s} type="button" role="radio" className={s} aria-checked={x.status === s} onClick={() => set(i, { status: s })}>{CHECK_LABEL[s]}</button>
              ))}
            </div>
          </td>
          <td>
            <div className="stack" style={{ gap: 6 }}>
              <Input size="sm" value={x.note ?? ""} placeholder="ملاحظة" aria-label={`ملاحظة ${x.item}`} onChange={(e) => set(i, { note: e.target.value || null })} />
              {x.status !== "good" && (
                <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                  <Input size="sm" value={x.recommendedText ?? ""} placeholder="العمل المقترح" aria-label={`العمل المقترح ${x.item}`} onChange={(e) => set(i, { recommendedText: e.target.value || null })} />
                  <Input size="sm" num style={{ width: 110 }} value={x.recommendedPricePt != null ? String(x.recommendedPricePt / 100) : ""} placeholder="السعر" aria-label={`سعر ${x.item}`}
                    onChange={(e) => { const n = e.target.value.replace(/[^\d.]/g, ""); set(i, { recommendedPricePt: n ? toPt(n) : null }); }} />
                </div>
              )}
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
