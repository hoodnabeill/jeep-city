---
name: Jeep City System
description: Arabic RTL counter tool for one Jeep City service centre, in the brand's Paper theme (black rail, white work surface, yellow as fill only).
colors:
  jc-yellow: "#F5C518"
  jc-yellow-hover: "#E9B900"
  jc-yellow-press: "#D6A900"
  jc-yellow-tint: "#FDF4CF"
  jc-black: "#0B0B0B"
  surface: "#FFFFFF"
  surface-raised: "#F5F3EC"
  surface-hover: "#FAF9F5"
  surface-sunken: "#EFECE3"
  line: "#D9D6CC"
  line-strong: "#B9B5A9"
  line-input: "#949085"
  text-muted: "#5C5A55"
  text-subtle: "#6F6C64"
  accent-ink: "#7A5C00"
  rail-raised: "#171716"
  rail-line: "#2E2D2A"
  rail-muted: "#A6A6A6"
  ok: "#1D6F42"
  ok-bg: "#E4F1E9"
  warn: "#8A5300"
  warn-bg: "#FBEFD2"
  bad: "#B42318"
  bad-bg: "#FCE8E6"
  work: "#5E4700"
  work-bg: "#FDF1C4"
  grade-copy-bg: "#E9ECF1"
  grade-copy: "#27323F"
  grade-used-bg: "#F1E5D6"
  grade-used: "#643F1E"
  plate-band: "#8DC2EC"
  chart-labor: "#2a78d6"
  chart-parts: "#1baf7a"
  chart-oils: "#eda100"
  pin-scratch: "#B45309"
  pin-dent: "#1D4ED8"
typography:
  figure-due:
    fontFamily: "Barlow, Segoe UI, Arial, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.15
    fontFeature: "\"tnum\" 1, \"lnum\" 1"
  figure:
    fontFamily: "Barlow, Segoe UI, Arial, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 600
    lineHeight: 1.25
    fontFeature: "\"tnum\" 1, \"lnum\" 1"
  headline:
    fontFamily: "Cairo Variable, Cairo, Segoe UI, Tahoma, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "0em"
  title:
    fontFamily: "Cairo Variable, Cairo, Segoe UI, Tahoma, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Cairo Variable, Cairo, Segoe UI, Tahoma, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Cairo Variable, Cairo, Segoe UI, Tahoma, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.6
  caption:
    fontFamily: "Cairo Variable, Cairo, Segoe UI, Tahoma, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 700
    lineHeight: 1
  numeric:
    fontFamily: "Barlow, Segoe UI, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    fontFeature: "\"tnum\" 1, \"lnum\" 1"
rounded:
  none: "0px"
  plate: "3px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  s-7: "48px"
  s-8: "64px"
components:
  button-primary:
    backgroundColor: "{colors.jc-yellow}"
    textColor: "{colors.jc-black}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.jc-yellow-hover}"
  button-primary-active:
    backgroundColor: "{colors.jc-yellow-press}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.jc-black}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-hover}"
  button-dark:
    backgroundColor: "{colors.jc-black}"
    textColor: "{colors.surface}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.jc-black}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "44px"
  nav-item:
    backgroundColor: "{colors.jc-black}"
    textColor: "{colors.rail-muted}"
    padding: "0 14px"
    height: "46px"
  nav-item-hover:
    backgroundColor: "{colors.rail-raised}"
    textColor: "{colors.surface}"
  nav-item-active:
    backgroundColor: "{colors.jc-yellow}"
    textColor: "{colors.jc-black}"
  grade-original:
    backgroundColor: "{colors.jc-black}"
    textColor: "{colors.jc-yellow}"
    typography: "{typography.caption}"
    height: "24px"
  grade-copy:
    backgroundColor: "{colors.grade-copy-bg}"
    textColor: "{colors.grade-copy}"
    typography: "{typography.caption}"
    height: "24px"
  grade-used:
    backgroundColor: "{colors.grade-used-bg}"
    textColor: "{colors.grade-used}"
    typography: "{typography.caption}"
    height: "24px"
  badge-ok:
    backgroundColor: "{colors.ok-bg}"
    textColor: "{colors.ok}"
    typography: "{typography.caption}"
    height: "24px"
  badge-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn}"
    typography: "{typography.caption}"
    height: "24px"
  badge-bad:
    backgroundColor: "{colors.bad-bg}"
    textColor: "{colors.bad}"
    typography: "{typography.caption}"
    height: "24px"
  badge-work:
    backgroundColor: "{colors.work-bg}"
    textColor: "{colors.work}"
    typography: "{typography.caption}"
    height: "24px"
  plate:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.jc-black}"
    rounded: "{rounded.plate}"
    width: "112px"
    height: "40px"
  plate-lg:
    width: "184px"
    height: "64px"
  totals-due:
    backgroundColor: "{colors.jc-black}"
    textColor: "{colors.jc-yellow}"
    typography: "{typography.figure-due}"
    padding: "16px 20px 18px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.none}"
    padding: "20px"
---

# Design System: Jeep City System

## Overview

**Creative North Star: "The Shop's Own Paperwork, Made Calm"**

The system is the workshop's paper forms rebuilt as a counter tool. A black brand rail carries the colour badge and the nine sections; the work happens on a white sheet with warm-grey raised panels and hairline rules, the way a printed statement is ruled. The statement and Job Card keep the old paper form's order on screen and on print, so the accountant and the engineers read them without learning anything new. Density is operational: 44px controls, 54px table rows, figures in tabular Latin numerals, everything reachable from the keyboard and the Ctrl+K palette.

Brand yellow is scarce on purpose. It fills; it never writes on white. One yellow primary button per screen, the yellow active nav block, the yellow rule under a printed header. Where yellow meets black (the amount-due figure, the أصلي grade chip) it is the brand's own pairing. Every corner is square except one 45° cut, cut out with clip-path, which is the system's only shape gesture. Each car appears as a small Egyptian licence plate, the thread from search to car file to statement.

The world rejects the grey admin template with a blue accent and rows of toolbar icons (the old YAZSYS program). Light mode only, Arabic RTL, the brand Paper theme pinned by the owner's brief.

**Key Characteristics:**
- Black rail (#0B0B0B) beside a white work surface, warm-grey raised panels, hairline rules.
- Yellow as fill only, one primary per screen.
- Square everything, one 45° cut corner on the primary button, active nav item, grade chips and avatars.
- Egyptian plate chip for every car.
- Totals in the paper form's order, on screen and on print.
- Cairo for Arabic, Barlow tabular figures for money, codes, VIN, dates.

## Colors

A pinned brand pair (yellow, black) on warm paper neutrals, with muted functional colours that carry state and nothing else.

### Primary
- **Jeep City Yellow** (#F5C518): the fill of the one primary button per screen, the active rail item, the 1.2mm rule under every printed document header, text selection, and the input focus halo (55% alpha). Darkens to Hover Yellow (#E9B900) and Press Yellow (#D6A900). Yellow Tint (#FDF4CF) marks a selected table row.
- **Brand Black** (#0B0B0B): body text, the rail ground, selected segmented/chip/tab states, focus outlines, the amount-due band, the dark button, toasts, the plate ink.

### Neutral
- **Paper White** (#FFFFFF): the work surface, inputs, panels, the printed sheet.
- **Raised Paper** (#F5F3EC): raised panels, table headers, board columns, dialog footers, totals footer rows; also the printed table header fill.
- **Hover Paper** (#FAF9F5) and **Sunken Paper** (#EFECE3): row hover; avatar and photo wells.
- **Hairline** (#D9D6CC): every panel border and row rule. **Strong Line** (#B9B5A9): scrollbars, dashed signature line. **Input Line** (#949085): input, select, segmented and secondary-button strokes, dark enough to read as a control.
- **Muted Ink** (#5C5A55) and **Subtle Ink** (#6F6C64): secondary text, placeholders.
- **Gold Ink** (#7A5C00): the only gold-family colour that may be text on white.
- **Rail Raised** (#171716), **Rail Line** (#2E2D2A), **Rail Muted** (#A6A6A6): rail hover, rail dividers, inactive rail labels and muted text on black.

### State (functional, not brand)
- **Done Green** (#1D6F42 on #E4F1E9), **Watch Amber** (#8A5300 on #FBEFD2), **Fault Red** (#B42318 on #FCE8E6), **In-Work Ochre** (#5E4700 on #FDF1C4). Always text on its own tint; red also strokes the danger button and invalid fields.

### Part grades
- **أصلي**: Jeep City Yellow on Brand Black. **كوبي**: Slate (#27323F on #E9ECF1). **مستعمل**: Brown (#643F1E on #F1E5D6).

### Data and diagram
- **Chart series**: Labor Blue (#2a78d6), Parts Aqua (#1baf7a), Oils Amber (#eda100), chosen for colour-blind separation. Used for the sales bars, split bar and legend keys.
- **Plate Band Blue** (#8DC2EC): the مصر · EGYPT band of the plate chip only.
- **Damage pins**: scratch (#B45309), dent (#1D4ED8), damage (Fault Red), white numerals in a 2px white ring.

### Named Rules
**The Fill-Only Yellow Rule.** Yellow #F5C518 is a fill, never text on white or on raised paper. Yellow figures and labels appear only on Brand Black: the amount-due figure, the أصلي grade chip, the active-nav count, the warn toast icon.

**The One Yellow Button Rule.** Each screen has at most one yellow primary button, in the page head (dialogs carry their own single primary). Every other action is secondary, ghost or dark.

**The State-Is-Not-Brand Rule.** Green, amber, red and ochre mean status only. They never decorate, and yellow never signals status.

## Typography

**Arabic Font:** Cairo Variable (with Cairo, Segoe UI, Tahoma, sans-serif)
**Figures Font:** Barlow 500/600/700 (with Segoe UI, Arial, sans-serif)

**Character:** Cairo carries every Arabic word in clear, upright weights from 400 to 900; Barlow carries every number, code, VIN and date as a left-to-right isolated run with tabular lining figures, so columns of money align like a ledger.

### Hierarchy
- **Amount Due** (Barlow 700, 2.25rem, 1.15): the statement's amount-due figure only, yellow on black.
- **Figure** (Barlow 600, 1.6rem, 1.25): today-strip values; odometer readings at 1.35rem.
- **Headline** (Cairo 800, 1.625rem, 1.3): one page title per screen; 1.35rem under 760px.
- **Title** (Cairo 700, 1.125rem, 1.3): panel and section titles; dialog titles at 1.375rem.
- **Body** (Cairo 400, 1rem, 1.6): running text and inputs; tables at 0.95rem.
- **Label** (Cairo 600, 0.875rem): field labels, table headers, tabs, segmented options.
- **Caption** (Cairo 700, 0.78rem, 1): badges, grade chips, hints and errors (600, line-height 1.5).

### Named Rules
**The Isolated Figure Rule.** Every number, code, VIN, plate digit and date is a Barlow run with `direction: ltr; unicode-bidi: isolate` and tabular lining numerals. RTL text never reorders a figure.

**The Paper Date Rule.** Dates read 2026/10/28 (Latin run). Times read 12-hour with ص or م, as a separate run joined by a muted " · ". Western digits by default; Arabic-Indic digits are a user setting applied to the same formats.

## Layout

The shell is a fixed grid: a 232px black rail on the right (RTL start) and a fluid main column with a 64px sticky top bar (Ctrl+K search trigger up to 560px, sync state, low-stock bell, user). Pages sit at 28px/32px padding, max 1560px wide. Spacing steps on a 4px base (4, 8, 12, 16, 24, 32, 48, 64); 24px between stacked panels, 16-20px inside them.

Recurring grids: main + 360px side column (sticky under the top bar) for work order and statement; main + 400px for intake; two equal columns; a three-column status board; the today strip as one ruled row of auto-fit cells (min 170px) divided by hairlines. Label/value pairs use a hairline-gapped definition grid (1px gap over the line colour).

Responsive: at 1280px the side column narrows to 340px. At 1100px the rail collapses to 76px icons with the yellow shield, and all two-column layouts stack. At 760px the rail becomes a 64px bottom bar, page padding drops to 20px/16px, and form grids go to one column.

Print: A4 statement and condition report at `@page` margin 10mm, A4 Job Card at 9mm, the thermal receipt at 80mm wide (auto height, 3mm margin). Print colours are forced exact.

## Elevation & Depth

Flat by default. Depth comes from tonal layering (white on Raised Paper, Raised Paper on white) and 1px hairlines. Shadows exist only on layers that float above the page.

### Shadow Vocabulary
- **Pop** (`box-shadow: 0 10px 28px -8px rgb(11 11 11 / 0.22), 0 2px 6px rgb(11 11 11 / 0.08)`): popovers, overflow menus, the line-item picker, toasts.
- **Dialog** (`box-shadow: 0 24px 60px -12px rgb(11 11 11 / 0.35)`): dialogs and the command palette, over a 45-50% black backdrop.
- **Sheet** (`box-shadow: 0 12px 40px -18px rgb(11 11 11 / 0.45)`): the on-screen print preview of A4 sheets and receipts on the grey stage (#E4E1D7); removed in print.

### Named Rules
**The Floating-Only Shadow Rule.** A shadow means the layer floats: popover, dialog, palette, toast, print preview sheet. Panels, tables and tiles stay flat and use borders.

## Shapes

Square by rule: border-radius 0 on buttons, inputs, panels, badges, dialogs. The one exception is the plate chip (3px), which copies a real licence plate.

The brand gesture is a single 45° cut on the bottom end corner (bottom-left in RTL), made with `clip-path: polygon(0 0, 100% 0, 100% 100%, cut 100%, 0 calc(100% - cut))`. Cut sizes: 10px on the primary button and the active nav item, 6px on grade chips, 7px on avatars, 12px on empty-state icon wells. Badges use square 7px dots, never circles.

### Named Rules
**The One Cut Rule.** Only one corner is ever cut, always at 45°, always by clip-path. Never round a corner to soften it.

## Components

### Buttons
Firm, bold and quiet until they are the one that matters.
- **Shape:** square, 44px tall (34px small, 52px large), 18px side padding, Cairo 700 at 0.94rem, 18px icons.
- **Primary:** Jeep City Yellow fill, black text, 10px cut corner. Hover Yellow, then Press Yellow.
- **Focus:** an inset double ring (2px black, then 2px of the button's own fill); on the dark button a 2px yellow inset ring.
- **Secondary (default):** white with an Input Line stroke; hover goes to black stroke on Hover Paper.
- **Dark:** black fill, white text, hover #262624. **Ghost:** no stroke, Raised Paper on hover. **Danger:** white with red stroke and text, red tint on hover. **WhatsApp:** white with a green stroke (#9BC9AE, text #12603A).
- **Keyboard hint:** a Kbd chip (Barlow 600, 11px, 2px bottom border) inside the button, e.g. Ctrl S.
- **Disabled:** 45% opacity.

### Chips, Badges and Grade Chips
- **State badge:** 24px tall (30px large), Caption type, state colour on its tint, optional square dot.
- **Grade chip:** the badge shape with a 6px cut corner: أصلي yellow on black, كوبي slate, مستعمل brown. On print the أصلي chip is black with white text and a black stroke; the others are outlined.
- **Toggle chip:** 40px, Input Line stroke, black stroke on hover, black fill with white text when pressed; the add chip is dashed.

### Cards / Containers
- **Panel:** white, 1px Hairline, square; 56px head with an 18px title, 20px body, ruled foot. **Raised panel:** Raised Paper, no border.
- **Car tile:** white tile with hairline on a Raised Paper board column; black stroke on hover.
- **Document head:** car block on Raised Paper (plate, model, VIN in Barlow) beside a hairline definition grid.

### Inputs / Fields
- **Style:** white, 1px Input Line, square, 44px, 12px padding; numeric inputs align left in Barlow.
- **Focus:** black stroke plus a 3px yellow halo (`rgb(245 197 24 / 0.55)`).
- **Error:** red stroke on a faint red ground (#FFFBFA), red caption with an icon, a red halo on focus. **Read-only:** Raised Paper with a hairline.
- **Segmented control:** joined square cells in an Input Line frame; the selected cell is black with white text. Status steps, fuel level and the condition tri-state use the same joined-cell grammar, the tri-state taking state tints.

### Navigation
- **Rail:** Brand Black, logo at 168px, nine 46px items in Cairo 600 at 0.94rem, Rail Muted text, 20px line icons. Hover: Rail Raised with white text. Active: a solid yellow block with black 700 text and a 10px cut corner; its count chip turns black with yellow figures. Focus: 2px yellow outline.
- **Tabs:** muted labels, active label black 700 with a 3px black underline.
- **Settings sub-nav:** active item is a black block with white text.
- **Command palette:** Ctrl+K, 680px, 64px input row, grouped results, Raised Paper for the selected hit.

### Tables
Raised Paper header row (42px, Label type, muted), 54px body rows (44px compact) ruled by hairlines, Hover Paper on hover, Yellow Tint when selected. Number cells are Barlow 500, left-aligned, isolated. Footer rows sit on Raised Paper in 700.

### Egyptian Plate Chip (signature)
Every car is shown as a private-car licence plate: 112x40px (184x64px large), 1.5px black stroke (2px large), 3px radius, white ground. A top band (30% height) in Plate Band Blue carries مصر and EGYPT; the body is split by a black rule into Arabic letters (Cairo 800, 15px) and digits (Barlow 700, 15px). It appears in search, car tiles, the car file, work orders and statements. On print it reduces to a black-outlined plate cell.

### Totals Block (signature)
The statement totals keep the paper form's order, identical on screen and in print: إجمالي المصنعيات, إجمالي قطع الغيار, إجمالي خصم, صافي المصنعيات, صافي قطع الغيار, صافي الزيوت, إجمالي خامات, إجمالي بيان (bold), then the amount-due band. On screen the band is Brand Black with the figure in Jeep City Yellow (Amount Due type) and the amount in words beneath; while editing, the two category discount rows (amount or %) sit above the totals on Raised Paper. On print the band is black with a white 16pt figure, followed by the amount in words.

### Print Templates
A4 statement, A4 Job Card and A4 condition report share one header: shop block, centred bilingual title (Arabic 18pt 900 with the old form's English label in letter-spaced Barlow), a black-and-white number box, the logo, and a 1.2mm yellow rule beneath. Field grids and tables use 1px black rules with Raised Paper header cells, matching the paper form; English labels from the old form sit beside Arabic labels as isolated runs. Preview mode adds a 6% black watermark. The 80mm receipt is single-column with dashed rules and a QR code.

## Do's and Don'ts

### Do:
- **Do** use Jeep City Yellow (#F5C518) only as a fill: one primary button per screen, the active nav block, the printed header rule.
- **Do** put yellow figures or text only on Brand Black (#0B0B0B): the amount-due figure and the أصلي chip.
- **Do** cut exactly one corner at 45° with clip-path (10px buttons and nav, 6px grade chips, 7px avatars); keep every other corner square.
- **Do** show every car as the Egyptian plate chip.
- **Do** keep the totals in the paper form's order on screen and on print.
- **Do** set money, codes, VIN and dates in Barlow tabular figures as isolated LTR runs; dates as 2026/10/28, time 12-hour with ص / م.
- **Do** use the chart series Labor Blue (#2a78d6), Parts Aqua (#1baf7a), Oils Amber (#eda100) for every labor/parts/oils breakdown.
- **Do** print A4 at 10mm margins, the Job Card at 9mm, receipts at 80mm.

### Don't:
- **Don't** set yellow text on white or Raised Paper; use Gold Ink (#7A5C00) when a gold-family text colour is needed.
- **Don't** place a second yellow button on a screen.
- **Don't** use green, amber, red or ochre for anything but state.
- **Don't** round corners or cut more than one corner.
- **Don't** add shadows to panels, tables or tiles at rest; shadows are for floating layers only.
- **Don't** rebuild the grey admin template with a blue accent and rows of toolbar icons.
