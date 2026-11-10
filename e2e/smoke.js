/**
 * End-to-end smoke test: home tiles, sections, per-user permissions, main screens, phone layout.
 * Run against the DEMO server only (it changes a demo user's permissions, then restores them):
 *   node ~/.claude/skills/playwright-skill/run.js e2e/smoke.js
 * Env: TARGET_URL (default http://localhost:5180), API_URL (default http://localhost:8787),
 *      E2E_PASSWORD (demo password), PW_HEADLESS=true for no window, PW_CHANNEL (default msedge).
 * The server limits logins per minute: wait a minute between back-to-back runs.
 */
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const URL = process.env.TARGET_URL || "http://localhost:5180";
const API = process.env.API_URL || "http://localhost:8787";
const PASS = process.env.E2E_PASSWORD || "demo-pass-2026";
const SHOTS = process.env.PW_ARTIFACT_DIR || path.join(os.tmpdir(), "jc-e2e");
fs.mkdirSync(SHOTS, { recursive: true });
const failures = [];
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures.push(what); };

async function apiLogin(username) {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password: PASS }) });
  if (!r.ok) throw new Error(`login ${username}: ${r.status}`);
  return r.json();
}
const apiCall = (token, method, url, body) => fetch(`${API}${url}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });

async function session(browser, username) {
  const ctx = await browser.newContext({ locale: "ar-EG" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(URL);
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByRole("textbox", { name: "كلمة المرور" }).fill(PASS);
  await page.getByRole("button", { name: "دخول" }).click();
  await page.locator(".home-tile").first().waitFor();
  return { ctx, page, errors };
}

const tiles = (page) => page.locator(".home-tile__title").allTextContents();
const mainText = async (page) => (await page.locator("main").innerText()).trim();
async function open(page, hash) {
  await page.goto(`${URL}/#${hash}`);
  await page.locator("main").waitFor();
  // The live-update stream keeps the network busy, so wait for content instead of "network idle".
  await page.waitForFunction(() => (document.querySelector("main")?.textContent?.length ?? 0) > 40, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
}
const blocked = async (page) => (await mainText(page)).includes("ليس لديك صلاحية");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function resetKarim() {
  const at = (await apiLogin("ahmed")).accessToken;
  const karim = (await (await apiCall(at, "GET", "/users")).json()).find((u) => u.username === "karim");
  return (await apiCall(at, "PATCH", `/users/${karim.id}`, { permissions: null })).ok;
}

(async () => {
  // The downloaded Chromium fails to start on the shop PC (side-by-side error); installed Edge works.
  const browser = await chromium.launch({ headless: process.env.PW_HEADLESS === "true", channel: process.env.PW_CHANNEL || "msedge" });
  try {
    await resetKarim(); // start from the engineer defaults even if a previous run stopped half way
    /* ---------- Admin ---------- */
    const a = await session(browser, "ahmed");
    check(same(await tiles(a.page), ["الاستقبال", "المخزن", "الحسابات والتقارير", "المستخدمين"]), "admin sees the 4 tiles in order");
    check(await a.page.getByRole("link", { name: "الإعدادات" }).isVisible(), "admin sees the settings gear");

    const sections = {
      "/board": "الاستقبال", "/reception": "الاستقبال", "/statements": "الاستقبال", "/customers": "الاستقبال", "/alerts": "الاستقبال",
      "/items": "المخزن", "/stock-counts": "المخزن", "/labels": "المخزن", "/suppliers": "المخزن", "/cash": "الحسابات والتقارير", "/reports": "الحسابات والتقارير", "/partners": "الحسابات والتقارير", "/users": "المستخدمين",
    };
    for (const [hash, sec] of Object.entries(sections)) {
      await open(a.page, hash);
      const title = (await a.page.locator(".rail__title").textContent())?.trim();
      const text = await mainText(a.page);
      check(title === sec && text.length > 40 && !(await blocked(a.page)), `admin ${hash} opens in section ${sec}${title === sec ? "" : ` (rail says ${title})`} [${text.slice(0, 60).replace(/s+/g, " ")}]`);
    }
    await open(a.page, "/board");
    await a.page.locator(".car-tile").first().waitFor({ timeout: 10000 }).catch(() => {});
    check((await a.page.locator(".car-tile").count()) > 0, "board shows cars");
    await a.page.locator(".car-tile").first().click();
    await a.page.waitForURL(/work-orders/);
    check((await a.page.locator(".rail__title").textContent())?.trim() === "الاستقبال", "work order page stays in Reception");
    await a.page.getByRole("link", { name: "الإعدادات" }).click();
    await a.page.waitForURL(/settings/);
    check(!(await a.page.locator(".settings__nav").innerText()).includes("المستخدمون"), "settings no longer has the users tab");

    await open(a.page, "/users");
    await a.page.getByRole("row", { name: /كريم/ }).getByRole("button", { name: "الصلاحيات" }).click();
    const dlg = a.page.locator("dialog[open]");
    check((await dlg.locator("input[role=switch]").count()) === 28, "permission dialog shows 28 switches");
    await dlg.locator("label.switch", { hasText: "التقارير ومبيعات اليوم" }).click();
    await dlg.getByRole("button", { name: "حفظ" }).click();
    await a.page.getByRole("row", { name: /كريم/ }).getByText("صلاحيات مخصصة").waitFor();
    check(true, "admin gives karim the reports switch from the dialog");
    /* Partners: set two partners at 60/40, record a withdrawal, see it in the month. */
    await open(a.page, "/partners");
    await a.page.getByRole("button", { name: "الشركاء والنسب" }).click();
    const pd = a.page.locator("dialog[open]");
    const names = pd.getByRole("textbox", { name: "اسم الشريك" });
    while ((await names.count()) > 2) await pd.getByRole("button", { name: "حذف الشريك" }).last().click();
    if ((await names.count()) < 2) await pd.getByRole("button", { name: "إضافة شريك" }).click();
    await names.nth(0).fill("الشريك الأول");
    await names.nth(1).fill("الشريك الثاني");
    const pcts = pd.getByRole("textbox", { name: "النسبة %" });
    await pcts.nth(0).fill("60");
    await pcts.nth(1).fill("30");
    check(await pd.getByRole("button", { name: "حفظ" }).isDisabled(), "partners: save is blocked while shares total 90%");
    await pcts.nth(1).fill("40");
    await pd.getByRole("button", { name: "حفظ" }).click();
    await a.page.getByRole("cell", { name: "الشريك الثاني" }).first().waitFor();
    check((await a.page.locator("main tbody tr", { hasText: "الشريك الأول" }).first().innerText()).includes("60"), "partners: table shows the 60% partner");
    const before = await a.page.locator("main tr", { hasText: "سحب اختبار" }).count();
    await a.page.getByRole("button", { name: "تسجيل مسحوبات" }).click();
    const wd = a.page.locator("dialog[open]");
    await wd.getByRole("textbox", { name: "المبلغ" }).fill("150");
    await wd.getByRole("textbox", { name: "ملاحظة" }).fill("سحب اختبار");
    await wd.getByRole("button", { name: "حفظ" }).click();
    await wd.waitFor({ state: "hidden" }).catch(() => {});
    await a.page.waitForTimeout(800);
    check((await a.page.locator("main tr", { hasText: "سحب اختبار" }).count()) === before + 1, "partners: the withdrawal shows in the month list");
    await a.page.screenshot({ path: path.join(SHOTS, "partners.png"), fullPage: true });

    /* Inventory: item card analysis, shelf filter, and a stock count with no differences. */
    await open(a.page, "/items");
    check(await a.page.getByRole("combobox", { name: "مكان التخزين" }).isVisible(), "items: shelf filter is there");
    await a.page.locator("main tbody tr.is-clickable").filter({ hasNotText: "خدمة" }).first().click();
    await a.page.waitForURL((u) => u.hash.startsWith("#/items/"));
    await a.page.getByText("تحليل الصنف").waitFor();
    check(await a.page.getByRole("columnheader", { name: "الرصيد بعدها" }).isVisible().catch(() => false) || !(await a.page.getByText("حركة المخزن").count()), "item card: running balance column");
    const itemName = await a.page.locator("main h1").evaluate((h) => h.firstChild.textContent.trim());
    const sysQty = (await a.page.locator("main table").first().locator("tbody tr").first().locator("td").nth(1).innerText()).split(" ")[0].trim();
    await open(a.page, "/stock-counts");
    await a.page.getByRole("button", { name: "جرد جديد" }).click();
    await a.page.locator("dialog[open]").getByRole("textbox", { name: "اسم الجرد" }).fill("جرد اختبار e2e");
    await a.page.locator("dialog[open]").getByRole("button", { name: "ابدأ الجرد" }).click();
    await a.page.waitForURL((u) => /^#\/stock-counts\/[0-9a-f-]{36}$/.test(u.hash));
    await a.page.getByRole("textbox", { name: "بحث عن صنف للجرد" }).fill(itemName.slice(0, 12));
    const qtyBox = a.page.getByRole("textbox", { name: `عدد ${itemName}` }).first();
    await qtyBox.waitFor({ timeout: 8000 });
    await qtyBox.fill(sysQty.replace(/[^0-9.]/g, "") || "0");
    await qtyBox.press("Enter");
    await a.page.getByRole("textbox", { name: `المعدود من ${itemName}` }).first().waitFor({ timeout: 8000 });
    check((await a.page.getByText("فيها فرق: 0").count()) === 1, "count: counting the system quantity shows no difference");
    await a.page.getByRole("button", { name: "اعتماد الفروق" }).click();
    await a.page.locator("dialog[open]").getByRole("button", { name: "اعتماد" }).click();
    await a.page.getByText("اتعتمد").first().waitFor({ timeout: 8000 });
    check(true, "count: approved");
    await a.page.screenshot({ path: path.join(SHOTS, "count.png"), fullPage: true });

    check(a.errors.length === 0, `admin: no page errors${a.errors.length ? " -> " + a.errors.slice(0, 3).join(" | ") : ""}`);
    await a.page.screenshot({ path: path.join(SHOTS, "admin-users.png"), fullPage: true });

    /* ---------- Engineer (with the extra reports switch) ---------- */
    const e = await session(browser, "karim");
    check(same(await tiles(e.page), ["الاستقبال", "المخزن", "الحسابات والتقارير"]), "engineer + reports sees 3 tiles");
    check(!(await e.page.getByRole("link", { name: "الإعدادات" }).isVisible()), "engineer has no settings gear");
    await open(e.page, "/reports");
    check(!(await blocked(e.page)), "engineer opens reports");
    for (const hash of ["/cash", "/users", "/settings", "/suppliers", "/partners"]) { await open(e.page, hash); check(await blocked(e.page), `engineer is blocked from ${hash}`); }
    await open(e.page, "/items");
    check(!(await e.page.locator("th", { hasText: "التكلفة" }).count()), "engineer sees no cost column");
    await open(e.page, "/stock-counts");
    check(!(await blocked(e.page)), "engineer can open stock counts");
    await e.page.locator("main tbody tr.is-clickable").first().click();
    await e.page.waitForURL((u) => u.hash.startsWith("#/stock-counts/"));
    check(!(await e.page.getByRole("button", { name: "اعتماد الفروق" }).count()), "engineer cannot approve a count");
    await open(e.page, "/customers");
    check(!(await e.page.locator("th", { hasText: "المديونية" }).count()), "engineer sees no customer balances");
    const et = (await apiLogin("karim")).accessToken;
    for (const url of ["/expenses", "/bonuses", "/suppliers", "/audit", "/partners"]) {
      const r = await apiCall(et, "GET", url);
      check(r.status === 403, `server refuses engineer GET ${url} (${r.status})`);
    }
    check(e.errors.length === 0, `engineer: no page errors${e.errors.length ? " -> " + e.errors.slice(0, 3).join(" | ") : ""}`);

    /* ---------- Restore karim to the engineer defaults ---------- */
    check(await resetKarim(), "karim restored to role defaults");
    await open(e.page, "/");
    await e.page.reload();
    await e.page.locator(".home-tile").first().waitFor();
    check(same(await tiles(e.page), ["الاستقبال", "المخزن"]), "after reset the engineer sees 2 tiles");

    /* ---------- Phone layout ---------- */
    await a.page.setViewportSize({ width: 390, height: 844 });
    for (const hash of ["/", "/board", "/items", "/users", "/statements"]) {
      await open(a.page, hash);
      const over = await a.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(over <= 1, `phone ${hash}: no sideways scroll (${over}px)`);
    }
    await open(a.page, "/");
    await a.page.screenshot({ path: path.join(SHOTS, "phone-home.png"), fullPage: true });
  } catch (err) {
    failures.push(String(err)); console.log("ERROR", err);
  } finally {
    await browser.close();
  }
  console.log(`\n${failures.length ? `${failures.length} FAILED` : "ALL PASSED"} · screenshots in ${SHOTS}`);
  process.exitCode = failures.length ? 1 : 0;
})();
