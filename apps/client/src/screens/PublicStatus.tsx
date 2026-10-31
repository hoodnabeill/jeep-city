/** The page a customer opens from the QR on a printed Job Card or statement. No login; read-only; one visit. */
import { useEffect, useState } from "react";
import { Money, useFmt } from "@jc/ui";
import { apiBase } from "../data/api";
import { CarPlate, carName, WO_STATUS } from "./common";
import type { WOStatus } from "../data/types";

type Status = {
  shop: { name: string; address: string; phones: string[] }; greeting: string;
  workOrder: { number: number; status: WOStatus; enteredAt: string; expectedAt: string | null; odometerIn: number | null };
  vehicle: { make: string | null; model: string | null; year: number | null; plateType: string; plateLetters: string | null; plateDigits: string | null } | null;
  work: { name: string; category: string }[];
  statement: { number: number; kind: string; date: string; amountDuePt: number; paidPt: number } | null;
  expiresAt: string;
};

export function PublicStatus({ token }: { token: string }) {
  const f = useFmt();
  const [d, setD] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`${apiBase()}/public/status/${encodeURIComponent(token)}`)
      .then(async (r) => { const b = await r.json().catch(() => null); if (!r.ok) throw new Error(b?.error?.message ?? "تعذر فتح الرابط."); setD(b); })
      .catch((e: Error) => setErr(e.message === "Failed to fetch" ? "لا يوجد اتصال الآن. حاول مرة أخرى بعد قليل." : e.message));
  }, [token]);
  if (err) return <main className="public"><div className="public__card"><img src="/brand/horizontal-black.svg" alt="Jeep City" className="public__logo" /><p>{err}</p></div></main>;
  if (!d) return <main className="public"><div className="public__card"><p className="subtle">جاري التحميل…</p></div></main>;
  const st = WO_STATUS[d.workOrder.status];
  const due = d.statement ? d.statement.amountDuePt - d.statement.paidPt : 0;
  return (
    <main className="public">
      <div className="public__card">
        <img src="/brand/horizontal-black.svg" alt={d.shop.name} className="public__logo" />
        <h1>أهلًا {d.greeting}</h1>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          {d.vehicle && <CarPlate v={d.vehicle} size="lg" />}
          <span className="lat" style={{ fontWeight: 700, fontSize: 18 }}>{carName(d.vehicle)}{d.vehicle?.year ? ` · ${d.vehicle.year}` : ""}</span>
        </div>
        <p className={`public__status public__status--${st.tone}`}>{st.label}</p>
        <dl className="public__dl">
          <div><dt>أمر الشغل</dt><dd className="num">{f.s(d.workOrder.number)}</dd></div>
          <div><dt>الدخول</dt><dd className="num">{f.date(d.workOrder.enteredAt)}</dd></div>
          {d.workOrder.expectedAt && <div><dt>التسليم المتوقع</dt><dd className="num">{f.date(d.workOrder.expectedAt)}</dd></div>}
          {d.workOrder.odometerIn && <div><dt>العداد</dt><dd className="num">{f.n(d.workOrder.odometerIn)} كم</dd></div>}
        </dl>
        {d.work.length > 0 && (<>
          <h2>الأعمال</h2>
          <ul className="public__work">{d.work.map((w, i) => <li key={i}>{w.name}</li>)}</ul>
        </>)}
        {d.statement && (
          <dl className="public__dl">
            <div><dt>البيان</dt><dd className="num">{f.s(d.statement.number)} · {f.date(d.statement.date)}</dd></div>
            <div><dt>المطلوب</dt><dd><Money pt={d.statement.amountDuePt} /></dd></div>
            <div><dt>المدفوع</dt><dd><Money pt={d.statement.paidPt} /></dd></div>
            {due > 0 && <div><dt>المتبقي</dt><dd><Money pt={due} strong /></dd></div>}
          </dl>
        )}
        <footer className="public__foot">
          <b>{d.shop.name}</b><span>{d.shop.address}</span>
          {d.shop.phones.map((p) => <a key={p} href={`tel:${p.replace(/\s/g, "")}`} className="num">{p}</a>)}
          <span className="subtle">الرابط صالح حتى {f.date(d.expiresAt)}</span>
        </footer>
      </div>
    </main>
  );
}
