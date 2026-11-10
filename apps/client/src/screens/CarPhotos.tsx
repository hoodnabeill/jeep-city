import { useEffect, useRef, useState } from "react";
import { Camera, ImageOff } from "lucide-react";
import { Button, Dialog, Panel, useFmt, When } from "@jc/ui";
import { api } from "../data/api";
import { useAction, useApi } from "../data/hooks";

type Photo = { id: string; at: string; note: string | null; by: string | null };

/** Photos never change once taken, so each one is downloaded once per session. */
const cache = new Map<string, string>();
function usePhoto(id: string) {
  const [src, setSrc] = useState(cache.get(id) ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (cache.has(id)) return;
    let alive = true;
    api<{ dataUrl: string }>(`/photos/${id}`).then((r) => { cache.set(id, r.dataUrl); if (alive) setSrc(r.dataUrl); }).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [id]);
  return { src, failed };
}

/** Phone photos are 4000px; about 1600px is plenty to show damage and keeps uploads quick on the shop Wi-Fi. */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL("image/jpeg", 0.8);
}

function Thumb({ p, onOpen }: { p: Photo; onOpen: (src: string) => void }) {
  const { src, failed } = usePhoto(p.id);
  return (
    <button type="button" className="photo-thumb" onClick={() => src && onOpen(src)} aria-label={`صورة ${p.note ?? ""} بواسطة ${p.by ?? ""}`}>
      {src ? <img src={src} alt="" /> : failed ? <ImageOff aria-hidden /> : <span className="photo-thumb__wait" aria-hidden />}
      <span className="photo-thumb__meta"><When iso={p.at} /></span>
    </button>
  );
}

export function CarPhotos({ workOrderId, canAdd }: { workOrderId: string; canAdd: boolean }) {
  const f = useFmt();
  const run = useAction();
  const list = useApi<Photo[]>(`/work-orders/${workOrderId}/photos`);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const photos = list.data ?? [];
  return (
    <Panel title="صور السيارة" sub={photos.length ? `${f.n(photos.length)} صورة` : "صوّر العربية من كل ناحية وأي خبطة أو خدش"} icon={<Camera />}
      actions={canAdd ? <Button size="sm" icon={<Camera />} disabled={busy} onClick={() => input.current?.click()}>{busy ? "بيترفع…" : "صوّر"}</Button> : undefined}>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setBusy(true);
        await run(async () => api(`/work-orders/${workOrderId}/photos`, { method: "POST", body: { dataUrl: await shrink(file) } }), "اتحفظت الصورة.");
        setBusy(false);
      }} />
      {photos.length ? (
        <div className="photo-grid">{photos.map((p) => <Thumb key={p.id} p={p} onOpen={setOpen} />)}</div>
      ) : (
        <p className="hint-line">مفيش صور لسه.{canAdd && " دوس «صوّر» والموبايل هيفتح الكاميرا."}</p>
      )}
      <Dialog open={!!open} onClose={() => setOpen(null)} title="صورة السيارة" wide>
        {open && <img src={open} alt="صورة السيارة" className="photo-full" />}
      </Dialog>
    </Panel>
  );
}
