/**
 * Phone app (Capacitor) behaviour that a web page cannot do on its own. Does nothing in the browser or on the desktop app.
 * - Android back button: closes an open sheet or menu first, then goes back a page, and leaves the app from the home page.
 * - Status bar: white with dark icons, under the app bar, not drawn over it.
 */
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";

export function setUpNativeShell() {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.classList.add("is-native");
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
  StatusBar.setStyle({ style: Style.Light }).catch(() => {});
  StatusBar.setBackgroundColor({ color: "#FFFFFF" }).catch(() => {});

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
