# Jeep City System

Shop management system for Jeep City – El Tantawy USA. Plan: [PLAN.md](PLAN.md). Assumptions: [DECISIONS.md](DECISIONS.md).

**Current state: Phase 5 done.** Everything runs on the real server and keeps working through internet cuts (Phase 4). Phase 5 added the general report on real data (print / PDF / Excel), Ctrl+K search over customers, cars, items, work orders, statements and suppliers, alerts and reminders with one-click WhatsApp, editable WhatsApp texts, the QR label maker with scan mode, a QR status link for customers on printed documents, the condition report on real data, and the customer's on-screen signature on the Job Card. The shop's Byte data can be imported (below). Next: Phase 6 (shop server with Docker, Cloudflare Tunnel, backups, installer; D-88).

## Run it locally

Needs Node 20+ and npm. Two terminals:

```bash
npm install
DEMO_PASSWORD=demo-pass-2026 npm run demo -w @jc/server
npm run server
```

```bash
npm run dev
```

Open http://localhost:5180 and log in as `ahmed` (admin) or `mahmoud` / `karim` (engineers) with the demo password. The demo data is synthetic and loads through the real API.

## What to try

- **Home dashboard:** the cars-in-shop board, the today strip and the alerts.
- **Ctrl+K** anywhere: search by plate (`لفو`, `281` or `281لفو`; diplomatic `12345`), chassis, customer, item code, statement or work order number. Hamza, taa marbuta and alef maqsura variants are ignored.
- **Reception → استقبال سيارة:** car lookup, odometer with previous reading and difference, the car diagram (tap to mark scratches and dents), fuel, belongings, signature pad. Press «فتح أمر الشغل» with no odometer reading to see the inline error.
- **Work order 13552:** add labor with Enter, issue parts (type `فلتر` then Enter), ready-made packages, the WhatsApp message templates, the cost-approval dialog.
- **Statement 9309:** the real statement used as the totals fixture (labor 2,500, parts 11,350, discount 850, due 13,000) and split payment (cash + Visa with reference). Ctrl+P opens the A4 print preview; the ⋯ menu has the 80 mm receipt and cancel.
- **New statement from work order 13553:** change discounts (amount or %) and split payments; the remaining amount updates.
- **Switch user** (top bar → user menu → تبديل المستخدم → محمود سمير): engineer view. Cost prices, cash drawer, suppliers, reports and settings disappear, and a saved statement shows as locked.
- **Sync indicator** (top bar): click to cycle through متصل / يتم المزامنة / غير متصل.
- **Settings → عام:** switch to Arabic-Indic digits. **Settings → الأجهزة:** scanner test field.
- **Print previews:** A4 statement, A4 Job Card (from a work order), A4 condition report (work order 13554), 80 mm receipt.

## Byte data (real shop data, local only)

The shop's Byte database can be loaded into a separate local database, `apps/server/.data/byte`. Its files stay on this PC and are ignored by git. See DECISIONS D-71..D-79.

1. Attach a copy of `Byte_Data_2014.MDF` / `.LDF` to SQL Server LocalDB as `ByteCopy` (instance `jcmig`). Never attach the files the shop gave.
2. Export: `powershell -File apps/server/scripts/byte/export.ps1 -Out <folder outside the repo>`
3. Import into an empty database: `IMPORT_ADMIN_PASSWORD=... PGLITE_DIR=./.data/byte npm run import:byte -w @jc/server -- <that folder>`
4. Run on it: `npm run server:byte` (instead of `npm run server`) and `npm run dev`. Log in as `ahmed` with the import password.

## Try offline

Stop `npm run server` while the app is open. The top bar turns «غير متصل». Receive a car, add a part by barcode, save the statement: the top bar counts the waiting changes. Start the server again: they upload by themselves and the statement gets its number.

## Server and tests

```bash
npm test
```

Runs 109 tests: the totals formulas against the real statement 9309, Arabic amounts in words, normalizers and the permission matrix (`packages/core`), and the server (`apps/server`). Server tests cover login and rate limits, an engineer refused by the server when editing a saved statement, stock and weighted cost, payments, cancel, and numbering. They run against in-memory Postgres (PGlite), so nothing needs installing.

Run the server locally. It keeps data in `apps/server/.data`; set `DATABASE_URL` for a real PostgreSQL.

```bash
ADMIN_USERNAME=ahmed ADMIN_PASSWORD=change-me-please npm run seed -w @jc/server
```

```bash
npm run server
```

Demo data for local review (synthetic, through the real API; users ahmed = admin, mahmoud / karim = engineers): `DEMO_PASSWORD=... npm run demo -w @jc/server`.

The API listens on port 8787 (`/health`, `/auth/login`, `/statements`, `/work-orders/:id/issue`, `/stock/...`).

## Folders

```
packages/core    shared logic: money, totals (★ for Aslam), amount in words, normalizers, permissions
packages/ui      design system: tokens, fonts (bundled), components
apps/client      React app: shell, screens, print templates, mock data
apps/server      Fastify API, Drizzle schema + SQL migrations (drizzle/), auth, stock, statements
```

`apps/desktop` and `deploy/` arrive in Phase 6.
