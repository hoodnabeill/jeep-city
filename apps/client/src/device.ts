/**
 * Microphone and camera, on every platform the app runs on:
 * - Voice: the phone app uses the system speech recogniser (Android's Google dialog / iOS Speech); browsers and the
 *   desktop app use the Web Speech API where the engine provides it. Egyptian Arabic.
 * - Scanning: the phone app opens the system QR/barcode scanner (ML Kit). Desktops keep their USB scanner.
 */
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { BarcodeFormat, BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { spokenToSearch } from "@jc/core";

const native = Capacitor.isNativePlatform();
type WebRecognizer = {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start(): void; abort(): void;
};
const WebSpeech = (globalThis as unknown as { SpeechRecognition?: new () => WebRecognizer; webkitSpeechRecognition?: new () => WebRecognizer }).SpeechRecognition
  ?? (globalThis as unknown as { webkitSpeechRecognition?: new () => WebRecognizer }).webkitSpeechRecognition;

/** Can this device take a voice search? */
export const canListen = () => native || !!WebSpeech;
/** Can this device scan with its camera? (desktops scan with the USB scanner into any search box) */
export const canScan = () => native;

export class DeviceError extends Error {}

/** Listen once and return the search text (plate letters said by name become letters). */
export async function listen(): Promise<string> {
  if (native) {
    const { available } = await SpeechRecognition.available();
    if (!available) throw new DeviceError("التعرف على الصوت مش متاح على الموبايل ده.");
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== "granted") throw new DeviceError("اسمح للتطبيق باستخدام الميكروفون من إعدادات الموبايل.");
    const r = await SpeechRecognition.start({ language: "ar-EG", maxResults: 3, partialResults: false, popup: true, prompt: "قول رقم اللوحة وحروفها، أو اسم العميل" });
    const heard = r.matches?.[0] ?? "";
    if (!heard) throw new DeviceError("مسمعتش حاجة. جرّب تاني.");
    return spokenToSearch(heard);
  }
  if (!WebSpeech) throw new DeviceError("البحث بالصوت محتاج متصفح Chrome أو Edge.");
  return new Promise((resolve, reject) => {
    const rec = new WebSpeech();
    rec.lang = "ar-EG"; rec.interimResults = false; rec.maxAlternatives = 3; rec.continuous = false;
    let done = false;
    rec.onresult = (e) => { done = true; resolve(spokenToSearch(e.results[0]?.[0]?.transcript ?? "")); };
    rec.onerror = (e) => {
      done = true;
      reject(new DeviceError(e.error === "not-allowed" ? "اسمح للبرنامج باستخدام الميكروفون." : e.error === "no-speech" ? "مسمعتش حاجة. جرّب تاني." : e.error === "network" ? "البحث بالصوت محتاج إنترنت." : "البحث بالصوت مش شغال على الجهاز ده."));
    };
    rec.onend = () => { if (!done) reject(new DeviceError("مسمعتش حاجة. جرّب تاني.")); };
    rec.start();
  });
}

/** Open the camera scanner and return the code read (a QR label, a barcode, or a chassis barcode). */
export async function scanCode(): Promise<string> {
  if (!native) throw new DeviceError("المسح بالكاميرا من تطبيق الموبايل. على الكمبيوتر استخدم الماسح.");
  if (Capacitor.getPlatform() === "android") {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      await BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => {});
      throw new DeviceError("الماسح بيتحمّل لأول مرة على الموبايل ده. جرّب تاني بعد دقيقة.");
    }
  }
  const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode, BarcodeFormat.Code128, BarcodeFormat.Code39, BarcodeFormat.Ean13, BarcodeFormat.DataMatrix] });
  const code = barcodes[0]?.rawValue?.trim();
  if (!code) throw new DeviceError("ماقريتش أي كود.");
  return code;
}
