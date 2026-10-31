---
version: 1
slug: "jeep-city-system-apps-client"
primary_target: "jeep-city-system/apps/client"
related_targets: []
---

# Surface: Jeep City System client (all Phase 1 screens)

Mode: Operate. Audience: reception engineers at the counter and the admin/owner; job: receive a car, run its work order, hand it over with a statement that adds up. Constraints: Arabic RTL, light only, brand Paper theme pinned by the brief, static sample data (synthetic, labelled).

## Direction contract

THESIS: A counter tool that feels like the shop's own paperwork made calm: the statement and Job Card keep the paper form's order, so the accountant and engineers recognise them at once. Refuses the grey admin template with a blue accent and dozens of toolbar icons (YAZSYS).

OWN-WORLD: Black #0B0B0B navigation rail carrying the colour badge; white work surface, #F5F3EC raised panels, #D9D6CC hairlines; yellow #F5C518 only as fill: the one primary button per screen and the active nav block, both square with one 45° cut corner; yellow on black is also allowed where the brand rule allows it (the amount-due figure, the أصلي grade chip, the print rule). Cairo for Arabic, Barlow tabular figures for money, codes, VIN. Muted green/amber/red only for state.

STORY: The engineer types or scans a plate, sees the car file and last odometer, opens a work order, adds labor and parts with Enter, and at handover converts to a statement whose totals block reads exactly like the old paper.

FIRST VIEWPORT: Right: black rail (logo, 9 nav items). Top bar: Ctrl+K search field, sync state, low-stock bell, user and switch-user. Home: today strip (sales, drawer, cars in shop, low stock) as one ruled row, then the cars-in-shop board in three status columns, recent statements under it. Primary action "استقبال سيارة" top-left, yellow.

FORM: Pinned brand world (brief), standard app shell: side rail + top bar + command palette. Signature move: every car is shown as a small Egyptian licence plate chip (blue مصر · EGYPT band, letters | digits), the thread from search to car file to statement. Roll waived: the owner's brief pins the world ("Brand: Jeep City logo is a winged shield JC emblem, black / yellow / gray ... Use the logo files and exact hex values given in the background notes"), and the approved Phase 0 plan fixed the Paper theme. seed: none (brief-pinned world, no roll)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
