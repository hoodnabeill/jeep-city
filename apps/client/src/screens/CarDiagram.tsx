import type { Mark as ServerMark } from "../data/types";

/** A damage mark as the diagram draws it: x and y in percent, numbered from 1. */
export type Mark = { id: number; x: number; y: number; kind: "scratch" | "dent" | "damage"; note: string; photo?: boolean };

/** Server marks keep x and y in tenths of a percent. */
export const toDiagramMarks = (marks: ServerMark[]): Mark[] => marks.map((m, i) => ({ id: i + 1, x: m.x / 10, y: m.y / 10, kind: m.kind, note: m.note ?? "" }));

export const MARK_KIND = {
  scratch: { label: "خدش", cls: "pin--scratch", color: "#B45309" },
  dent: { label: "دقة / انبعاج", cls: "pin--dent", color: "#1D4ED8" },
  damage: { label: "كسر / تلف", cls: "pin--damage", color: "#B42318" },
} as const;

/** Top view of an SUV, front to the right. Tap adds a numbered mark (x, y in % of the drawing). */
export function CarDiagram({ marks, onAdd, readOnly }: { marks: Mark[]; onAdd?: (x: number, y: number) => void; readOnly?: boolean }) {
  return (
    <div className="diagram" style={readOnly ? { cursor: "default" } : undefined}
      onClick={(e) => {
        if (readOnly || !onAdd) return;
        const r = e.currentTarget.getBoundingClientRect();
        onAdd(Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, Math.round(((e.clientY - r.top) / r.height) * 1000) / 10);
      }}
      role={readOnly ? "img" : "button"} aria-label={readOnly ? "مخطط السيارة وعليه علامات الاستلام" : "مخطط السيارة: اضغط على مكان الخدش أو الدقة لإضافة علامة"}>
      <svg viewBox="0 0 520 300" aria-hidden>
        <g fill="none" stroke="#0B0B0B" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
          <g fill="#2B2A27" stroke="none">
            <rect x="96" y="52" width="66" height="16" /><rect x="96" y="232" width="66" height="16" />
            <rect x="352" y="52" width="66" height="16" /><rect x="352" y="232" width="66" height="16" />
          </g>
          <path fill="#FFFFFF" d="M70 74 C70 64 78 60 92 60 L440 60 C462 60 474 70 478 92 L484 130 L484 170 L478 208 C474 230 462 240 440 240 L92 240 C78 240 70 236 70 226 Z" />
          <path d="M484 118 L494 120 L494 180 L484 182" />
          <path d="M70 92 L60 94 L60 206 L70 208" />
          <path d="M478 96 C450 92 410 90 380 92 L380 208 C410 210 450 208 478 204" />
          <path d="M440 110 L440 190" strokeWidth="1.2" />
          <path fill="#E9E6DC" d="M380 92 L340 102 L340 198 L380 208 Z" />
          <rect x="150" y="102" width="190" height="96" fill="#F5F3EC" />
          <rect x="210" y="118" width="80" height="64" strokeWidth="1.2" />
          <path d="M160 102 L160 198 M330 102 L330 198" strokeWidth="1" strokeDasharray="4 4" />
          <path fill="#E9E6DC" d="M150 102 L118 96 L118 204 L150 198 Z" />
          <path d="M118 96 L80 92 L80 208 L118 204" />
          <path d="M340 60 L340 102 M250 60 L250 102 M160 60 L160 102" strokeWidth="1.4" />
          <path d="M340 198 L340 240 M250 198 L250 240 M160 198 L160 240" strokeWidth="1.4" />
          <path d="M300 66 L318 66 M210 66 L228 66 M300 234 L318 234 M210 234 L228 234" strokeWidth="3" />
          <path fill="#FFFFFF" d="M356 60 L362 40 L384 42 L378 60" />
          <path fill="#FFFFFF" d="M356 240 L362 260 L384 258 L378 240" />
          <path d="M478 80 L470 74 M478 220 L470 226" strokeWidth="5" stroke="#F5C518" />
          <path d="M72 78 L82 76 M72 222 L82 224" strokeWidth="5" stroke="#B42318" />
        </g>
        <g fontFamily="Cairo Variable, Cairo, sans-serif" fontSize="14" fontWeight="700" fill="#5C5A55" textAnchor="middle">
          <text x="508" y="155" transform="rotate(90 508 155)">أمام</text>
          <text x="26" y="155" transform="rotate(-90 26 155)">خلف</text>
          <text x="260" y="28">الجانب الأيسر (السائق)</text>
          <text x="260" y="285">الجانب الأيمن</text>
        </g>
      </svg>
      {marks.map((m) => (
        <span key={m.id} className={`pin ${MARK_KIND[m.kind].cls}`} style={{ left: `${m.x}%`, top: `${m.y}%` }} title={`${MARK_KIND[m.kind].label}: ${m.note}`}>{m.id}</span>
      ))}
    </div>
  );
}
