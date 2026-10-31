# Product

<!-- impeccable:product-schema 1 -->

Source: the master prompt and the Phase 0 plan the owner approved on 2026-10-30. No separate interview was run; every line below comes from those two documents.

## Platform

web

## Stack

React 19 + Vite + TypeScript client (Windows desktop through Tauri 2, phone later as PWA or Capacitor), Fastify + PostgreSQL server, npm workspaces. See PLAN.md §1.

## Users

- **Reception engineers (مهندس)** at the counter of a busy American-car service centre: receive cars, open work orders, issue parts, add labor, convert to the customer statement at handover. Often interrupted, a customer standing in front of them.
- **The owner / admin (إدارة)**: prices, stock, suppliers, cash drawer, reports, settings; edits saved statements.
- **The accountant (Aslam)** reads the statement totals block exactly as on the old paper form.
- Staff disliked the old Windows program (YAZSYS) for being ugly, expensive and limited. Someone new must work the system without training.

## Product Purpose

Run one shop's whole day: car intake and Job Card, work orders, parts issue from stock, the customer statement (بيان عميل) with split payments, inventory with quality grades, suppliers and purchases, customers and their car files, cash drawer, expenses, reports. Success: invoices, discounts, payments and stock always add up, several PCs stay in sync, and the screens feel clearly better than YAZSYS.

## Positioning

Built for Jeep City – El Tantawy USA only (Al-Rehab, Eastern Market, New Cairo): its statement form, its numbering (work orders near 13548, statements near 9309), its two category discounts, its part grades (أصلي / كوبي / مستعمل), oils sold by the liter.

## Operating Context

- Windows PCs at reception and in the office, several at once; short internet cuts happen. A tablet or the reception screen may take the customer's signature.
- Keyboard-wedge barcode/QR scanner; a thermal printer for labels and receipts (models not chosen yet); A4 printing for statements, Job Cards and condition reports.
- Customers are contacted on WhatsApp (wa.me links, Egyptian numbers).
- Egyptian plates mix Arabic letters and digits ("ل ف و 281").

## Capabilities and Constraints

- Arabic only, RTL, light mode only. Western digits by default (setting).
- Two roles: Admin and Engineer. Engineers never see cost, profit, cash or financial reports and cannot edit a saved statement.
- Money in EGP; dates like 2026/10/28; Africa/Cairo time.
- Must work offline through short cuts; fonts bundled locally.
- Open with Aslam: oils in totals, إجمالي خامات, rounding, VAT (DECISIONS.md D-08 to D-11).

## Brand Commitments

- Jeep City brand system (artifact DvYScFpmfrwBnb8QLrVus8), Paper theme for this app: surface `#FFFFFF`, surface-raised `#F5F3EC`, line `#D9D6CC`, text `#0B0B0B`, text-muted `#5C5A55`, accent-ink `#7A5C00`, yellow `#F5C518` as a fill only, text on yellow `#0B0B0B`. Never yellow text on white.
- Square corners; any diagonal or cut corner at 45°. No rounded cards, no gradients, no glow.
- Cairo for Arabic, Barlow for Latin labels, codes and specs.
- Logo kit in `logo/kit/` (badge, horizontal, stacked, shield). Black versions on white or paper, colour versions on black.
- The brand name stays "Jeep City" in English.

## Evidence on Hand

- One real statement (labor 2500, parts 11350, discount 850, due 13000) used as the totals fixture.
- No real customer, item or supplier data yet: YAZSYS export comes later. All prototype data is synthetic and must be labelled as such.

## Product Principles

1. The task comes first: one obvious yellow primary action per screen, nothing a new employee has to learn.
2. Money and stock are never ambiguous: every total is visible, labelled as on the paper form, and traceable.
3. The car is the thread: plate → car file → every visit, dated.
4. Fast at the counter: keyboard flow, scanner input, Enter adds a line.

## Accessibility & Inclusion

Large readable tables and big click and touch targets for a busy counter; text contrast at least 4.5:1 (yellow is never text on white).
