import { useEffect, useRef, useState } from "react";
import { Mic, ScanLine } from "lucide-react";
import { IconButton, useToast } from "@jc/ui";
import { canListen, canScan, DeviceError, listen, scanCode } from "../device";

/**
 * Mic and camera buttons beside a search box. Each fills the box with what was said or scanned (onText).
 * Hidden where the device can't do it, so the box never shows a button that fails.
 */
export function SearchTools({ onText, voice = true, scan = true, autoListen = false }: { onText: (text: string) => void; voice?: boolean; scan?: boolean; autoListen?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"" | "listen" | "scan">("");
  const run = async (kind: "listen" | "scan") => {
    if (busy) return;
    setBusy(kind);
    try {
      const text = kind === "listen" ? await listen() : await scanCode();
      if (text) onText(text);
    } catch (e) {
      // Closing the scanner or the voice dialog is not an error.
      if (e instanceof DeviceError) toast(e.message, "warn");
      else if (!/cancel/i.test(String((e as Error)?.message ?? e))) toast(kind === "listen" ? "البحث بالصوت مش شغال دلوقتي. جرّب تاني." : "المسح مش شغال دلوقتي. جرّب تاني.", "warn");
    } finally {
      setBusy("");
    }
  };
  const started = useRef(false);
  useEffect(() => {
    if (autoListen && !started.current && canListen()) { started.current = true; void run("listen"); }
  });
  return (
    <span className="search-tools">
      {voice && canListen() && (
        <IconButton label={busy === "listen" ? "بسمعك… قول رقم اللوحة أو اسم العميل" : "بحث بالصوت"} className={busy === "listen" ? "is-listening" : undefined} onClick={() => run("listen")} type="button">
          <Mic />
        </IconButton>
      )}
      {scan && canScan() && (
        <IconButton label="مسح بالكاميرا" onClick={() => run("scan")} type="button" disabled={busy === "scan"}>
          <ScanLine />
        </IconButton>
      )}
      <span className="sr-only" aria-live="polite">{busy === "listen" ? "بسمعك" : ""}</span>
    </span>
  );
}
