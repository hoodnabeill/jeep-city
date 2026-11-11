/**
 * Phone app (Capacitor) behaviour that a web page cannot do on its own. Does nothing in the browser or on the desktop app.
 * - Android back button: closes an open sheet or menu first, then goes back a page, and leaves the app from the home page.
 * - Status bar: white with dark icons, under the app bar, not drawn over it.
 * - Over-the-air updates: every GitHub release carries web.zip (the built screens) and web.json ({version, sha256}).
 *   On start and on return to the app, a newer version downloads quietly and switches in the next time the app goes to
 *   the background. A bundle that fails to start is rolled back on the next launch (notifyAppReady never ran).
 *   shortcut: only the screens update this way; a new native plugin or permission still needs a new APK/IPA install.
 */
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { App } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { isNewerVersion } from "@jc/core";
import { version } from "../package.json";

const RELEASES = "https://github.com/hoodnabeill/jeep-city/releases";
let pending = "";

async function checkForUpdate() {
  // Native HTTP: GitHub's download links send no CORS headers.
  const res = await CapacitorHttp.get({ url: `${RELEASES}/latest/download/web.json` });
  if (res.status !== 200) return;
  const latest = (typeof res.data === "string" ? JSON.parse(res.data) : res.data) as { version: string; sha256: string };
  if (!isNewerVersion(latest.version, version) || latest.version === pending) return;
  const bundle = await CapacitorUpdater.download({ url: `${RELEASES}/download/v${latest.version}/web.zip`, version: latest.version, checksum: latest.sha256 });
  await CapacitorUpdater.next({ id: bundle.id });
  pending = latest.version;
}

export function setUpNativeShell() {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.classList.add("is-native");
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
  StatusBar.setStyle({ style: Style.Light }).catch(() => {});
  StatusBar.setBackgroundColor({ color: "#FFFFFF" }).catch(() => {});

  CapacitorUpdater.notifyAppReady().catch(() => {});
  const update = () => { checkForUpdate().catch(() => {}); }; // offline or no release yet: try again next time
  update();
  App.addListener("resume", update);

  App.addListener("backButton", () => {
    const sheet = [...document.querySelectorAll("dialog[open]")].pop() as HTMLDialogElement | undefined;
    if (sheet) { sheet.dispatchEvent(new Event("cancel", { cancelable: true })); sheet.close(); return; }
    const pop = document.querySelector("[aria-expanded='true']") as HTMLElement | null;
    if (pop) { pop.click(); return; }
    const hash = location.hash.replace(/^#/, "") || "/";
    if (hash === "/" || hash.startsWith("/login")) App.exitApp();
    else history.back();
  });
}
