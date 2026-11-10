// Phone e2e (Pixel 7 emulation) on the DEMO server: tab bar, full-screen search with mic, back arrow, car photo upload, bottom sheets, cards, floating action.
// Run: node ~/.claude/skills/playwright-skill/run.js e2e/phone.js
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { chromium, devices } = require("playwright");
const URL = process.env.TARGET_URL || "http://localhost:5180";
const OUT = process.env.OUT || path.join(os.tmpdir(), "jc-phone-flows");
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (ok, what) => { results.push(`${ok ? "PASS" : "FAIL"}  ${what}`); };

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "ar-EG" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL);
  await page.getByLabel("اسم المستخدم").fill("mahmoud");
  await page.getByRole("textbox", { name: "كلمة المرور" }).fill("demo-pass-2026");
  await page.getByRole("button", { name: "دخول" }).click();
  await page.locator(".home-tile").first().waitFor();
  const tabs = await page.locator(".tabbar__label").allTextContents();
  check(tabs.length >= 3 && tabs[0] === "الرئيسية", `tab bar labels: ${tabs.join(" | ")}`);

  // Search screen
  await page.getByRole("button", { name: "بحث", exact: true }).click();
  await page.locator(".palette[open]").waitFor();
  const box = await page.locator(".palette[open]").boundingBox();
  check(box && box.width >= 400 && box.height >= 800, `search opens full screen (${Math.round(box.width)}x${Math.round(box.height)})`);
  check(await page.getByRole("button", { name: "بحث بالصوت" }).first().isVisible(), "mic button in search");
  await page.keyboard.type("281");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "a-search.png") });
  await page.getByRole("button", { name: "إغلاق البحث" }).click();

  // Work order: back arrow, photos
  await page.goto(`${URL}/#/board`);
  await page.locator(".car-tile").first().click();
  await page.waitForURL(/work-orders/);
  check(await page.getByRole("button", { name: "رجوع" }).isVisible(), "detail page shows a back arrow");
  check(!(await page.locator(".subtabs").count()), "detail page has no section tabs");
  await page.getByRole("tab", { name: /الاستلام/ }).click().catch(() => {});
  await page.getByText("صور السيارة").waitFor({ timeout: 8000 });
  // Upload a generated 1200x900 photo through the camera input.
  const jpeg = await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 1200; c.height = 900;
    const g = c.getContext("2d"); g.fillStyle = "#3a6"; g.fillRect(0, 0, 1200, 900); g.fillStyle = "#fff"; g.font = "120px sans-serif"; g.fillText("Jeep", 400, 480);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  const before = await page.locator(".photo-thumb").count();
  await page.locator("input[type=file][capture]").setInputFiles({ name: "car.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg, "base64") });
  await page.waitForFunction((n) => document.querySelectorAll(".photo-thumb img").length > n, before, { timeout: 10000 }).catch(() => {});
  check((await page.locator(".photo-thumb img").count()) > before, "photo uploads and shows as a thumbnail");
  const toast = await page.locator(".toast").first().boundingBox().catch(() => null);
  const bar = await page.locator(".tabbar").boundingBox();
  check(!toast || toast.y + toast.height <= bar.y, "toast sits above the tab bar");
  await page.screenshot({ path: path.join(OUT, "b-photos.png") });
  await page.locator(".photo-thumb").last().click();
  await page.locator("dialog[open] img").waitFor({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
  const sheet = await page.locator("dialog[open]").boundingBox();
  const vh = page.viewportSize().height;
  check(sheet && Math.abs(sheet.y + sheet.height - vh) < 2, "dialogs open as bottom sheets");
  await page.screenshot({ path: path.join(OUT, "c-sheet.png") });
  await page.keyboard.press("Escape");

  // A list as cards + floating action
  await page.goto(`${URL}/#/customers`);
  await page.waitForTimeout(1800);
  const fab = await page.locator(".page-head__actions .btn--primary").boundingBox();
  check(fab && fab.y > vh - 200, "the main action floats above the tab bar");
  const card = await page.locator("main tbody tr").first().boundingBox();
  check(card && card.width > 300, "table rows are full-width cards");
  await page.screenshot({ path: path.join(OUT, "d-customers.png") });
  check(errors.length === 0, `no page errors ${errors.slice(0, 2).join(" | ")}`);
  await browser.close();
  console.log(results.join("\n"));
  console.log("shots:", OUT);
})();
