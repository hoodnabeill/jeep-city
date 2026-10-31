# Decisions and assumptions

Every assumption made while building the system. Correct any line and the code follows.
Status: **assumed** (my default, tell me if wrong) · **Aslam** (confirm with the accountant) · **accepted** (you approved the default on 2026-10-30) · **brief** (written in the brief).

## Scope and look

| ID | Decision | Status |
|---|---|---|
| D-01 | One shop, one branch, one warehouse. `warehouse_id` is kept on stock rows for later. | brief |
| D-02 | Arabic only, RTL, light mode only. Western digits by default; Arabic-Indic digits is a setting. | brief |
| D-03 | Fonts bundled locally: Cairo for Arabic (from the brand), Barlow for Latin codes, VIN and part numbers. | assumed |
| D-04 | Colours from the brand Paper theme: surface `#FFFFFF`, surface-raised `#F5F3EC`, line `#D9D6CC`, text `#0B0B0B`, text-muted `#5C5A55`, accent-ink `#7A5C00`, yellow `#F5C518` as a fill only (text on yellow `#0B0B0B`), never yellow text on white. Square corners, 45° cuts. | brief |
| D-05 | The brand has no status colours, so functional colours are added: green `#1D6F42`, amber `#8A5300`, red `#B42318` (each on a light tint) for states; grade badges أصلي black/yellow, كوبي slate, مستعمل brown. Charts use blue `#2a78d6` (labor), aqua `#1baf7a` (parts), amber `#eda100` (oils), checked for colour-blind separation. | assumed |
| D-06 | `frontend-design` skill is not installed; the `impeccable` design skill is used in Phase 1 instead. | assumed |
| D-46 | App shell: black navigation rail with the colour logo, white work area, yellow only for the active nav item and the one primary button per screen. | assumed |
| D-47 | Cars are shown as an Egyptian private-car plate chip (light-blue «مصر · EGYPT» band, letters, digits). Other plate types (taxi, commercial) have other band colours; add later if needed. | assumed |
| D-48 | On screen, the item code sits under the item name to give the name room; the printed statement keeps a separate «كود الصنف» column as on the paper form. | assumed |
| D-49 | Time is shown 12-hour with ص / م; dates as 2026/10/28. Date and time are rendered as separate runs so RTL never reorders them. | assumed |

## Money and totals (see PLAN §3)

| ID | Decision | Status |
|---|---|---|
| D-07 | Money is integer piasters. Quantities are integer thousandths (7.5 L = 7500). Line value = qty × price rounded half-up to 1 piaster. No floats. | brief |
| D-08 | A line's totals category comes from its item type (labor, part, oil, material, paint). The real-statement fixture enters the engine oil as a **parts** line, because its parts total (11350) includes the oil. When does صافي الزيوت get a value in the old system? | Aslam |
| D-09 | إجمالي خامات = net materials (after the materials discount, which is off by default). | Aslam |
| D-10 | Discounts: one per category (labor, parts shown; oils, materials, paint hidden until enabled). Each is an amount or a percent. Percent is rounded half-up to the piaster. A discount can never exceed its category gross. | brief + Aslam |
| D-11 | VAT: one rate per category, **off by default**. When on, tax = net after discount × rate, unless the customer is marked tax-exempt. Print modes: أصل (original) and معاينة (preview, watermarked). | brief + Aslam |
| D-12 | Amount in words: "فقط … جنيه مصري", and "و … قرش" when there are piasters. Simple form without tanween. | assumed |
| D-13 | Cost = weighted average cost, recomputed on each purchase receipt. Each outgoing stock movement stores the cost at that moment, so past profit never changes. If stock is zero or negative at receipt, the average resets to the purchase cost. | assumed |
| D-14 | Stock leaves when a part is **issued** to a work order (إذن صرف), not when the statement is made. Direct sale deducts at sale. Unused parts returned from a work order add back. | brief |

## Numbering and workflow

| ID | Decision | Status |
|---|---|---|
| D-15 | Work order numbers: each PC holds a reserved block of 20 from the server, so a Job Card prints with its real number even offline. Two PCs' numbers may interleave in time; a retired PC's unused numbers become gaps. | accepted 2026-10-30 |
| D-16 | Statement numbers: assigned by the server at finalize, gap-free. An offline statement shows "بانتظار الرقم" and prints as preview until synced. | accepted 2026-10-30 |
| D-17 | Purchases, purchase returns, sales returns and direct sales are numbered by the server. | assumed |
| D-18 | Flow: work order (جاري الشغل → جاهز للتسليم) → statement with exit time (تم التسليم). Inquiry and condition-report orders can be closed without a statement. | brief, accepted 2026-10-30 |
| D-19 | Lines live in one `doc_lines` table. Finalizing links the work order's lines to the statement. An admin edit changes lines in place and stores a full before/after revision plus compensating stock and ledger entries. | assumed |
| D-25 | Cancelling a statement (Admin, with reason) returns its issued parts to stock, reverses its customer-debt entries and records refunds of its payments (cash refund = cash out of the drawer). | accepted 2026-10-30 |
| D-26 | Direct sale (بيع مباشر) has its own number series. | accepted 2026-10-30 |
| D-41 | A new work order needs an odometer reading. The previous reading and the difference are shown. A lower reading needs Admin and a reason. | brief |
| D-42 | Issuing more than the available quantity is blocked; Admin can override with a reason. Offline over-issues from two PCs are accepted and flagged. | brief |
| D-43 | Payment methods, default order: كاش، إنستا باي، فودافون كاش، فيزا، آجل. Electronic methods require a reference number. Editable in Settings. | brief + Aslam |

## Roles

| ID | Decision | Status |
|---|---|---|
| D-20 | Admin-only data (cost, profit, cash drawer, ledgers, reports) is never stored on any PC's local copy. Admin screens for it read from the server, so they need a connection. | assumed |
| D-21 | Each PC keeps a refresh token for every user who logged in on it (max 30 days). During an internet cut, work continues and "switch user" works for those users only. | assumed |
| D-22 | Engineers can record payments (cash, card…) on statements they create, but cannot see the cash drawer. | accepted 2026-10-30 |
| D-23 | Collecting old customer debt is Admin only. Engineers see a "عليه مديونية" badge, not the amount history. | assumed |
| D-24 | Sales returns are Admin only. | assumed |
| D-40 | Technicians (الفنيين) are a list separate from system users. Bonuses can go to an engineer or a technician. | accepted 2026-10-30 |
| D-38 | Idle timeout 15 minutes (setting) locks the screen; unlock with the password or switch user. | assumed |

## Platform and sync

| ID | Decision | Status |
|---|---|---|
| D-27 | Desktop shell: Tauri 2. Needs the Rust toolchain on this PC at Phase 6 only. Fallback: Electron. | accepted 2026-10-30 |
| D-28 | Local store: plain IndexedDB through a small key–value wrapper (no Dexie needed), same in desktop, PWA and phone. | assumed |
| D-29 | Realtime: SSE notifies "changes up to N", the client pulls. Writes go through an outbox of commands with idempotency keys. | assumed |
| D-30 | Store UTC, show Africa/Cairo. Dates `2026/10/28`, times 12-hour with ص / م. | assumed |
| D-39 | Photos, signatures and attachments are resized on the client (long side 1600 px, JPEG), queued offline, stored on the VPS disk and included in backups. | assumed |
| D-44 | Hosting: one VPS with Docker Compose (Caddy, API, Postgres, backup). Daily dump kept 14 days on the VPS and copied off-site with rclone. Target and domain to be chosen. | accepted 2026-10-30 |

## Devices, labels, sharing

| ID | Decision | Status |
|---|---|---|
| D-31 | Printing through the OS print dialog (A4 and 80 mm templates). ESC/POS direct printing later. | brief |
| D-32 | Label QR holds the variant's barcode value. If empty, a stable code is generated once (e.g. `JC000123`) and never changes after printing. Default label 40×30 mm. | assumed |
| D-33 | Scanner = keyboard wedge. A scan is detected as a fast keystroke burst ending in Enter; the suffix key and speed are set in Settings → Devices. | brief |
| D-34 | Customer status page: link with a 32-byte random token (stored hashed), read-only, that car's documents only, expires after 30 days (setting), can be revoked. | assumed |
| D-35 | WhatsApp numbers: Arabic-Indic digits → Western, strip spaces, dashes, `+`, `00`; `01xxxxxxxxx` → `201xxxxxxxxx`. A valid Egyptian mobile is `20` + `1[0125]` + 8 digits; anything else shows an inline error. Messages use `wa.me` with prefilled text from editable templates. | brief |
| D-36 | Plates are stored as letters and digits separately plus a normalized search key. Search accepts any spacing or order ("لفو281", "281 ل ف و", "281"). Shown inside `<bdi>` so RTL never scrambles it. | assumed |
| D-37 | Arabic search ignores tashkeel and tatweel and treats ا/أ/إ/آ, ه/ة, ى/ي and Arabic-Indic/Western digits as equal. | brief |

## Phase 2 (backend and data)

| ID | Decision | Status |
|---|---|---|
| D-50 | Amount in words, simple form: «مائة» spelling, groups joined with «و», «مائتا ألف» before a scale word, 3–10 thousand/million take the plural («آلاف», «ملايين»), 11+ the singular («ثلاثة عشر ألف»). 101,000 reads «مائة وواحد ألف». Zero reads «صفر». | Aslam |
| D-51 | Percent discounts are stored in basis points (12.5 % = 1250), so a percent can have two decimals. | assumed |
| D-52 | When an admin edits a saved statement and changes the payments, the old split is refunded in full and the new split recorded. The audit trail then shows both. If the amount due changes, the payments must be updated in the same edit. | assumed |
| D-53 | Cash drawer: cash movements are an append-only list with a time. A drawer session is a time window (open to close), so offline payments never need a session to exist first. | assumed |
| D-54 | Login: access token 15 minutes, refresh token 30 days, rotated on every use. Reusing an old refresh token ends that whole login. Five login attempts per minute per IP and username. | assumed |
| D-55 | Items have a «track stock» flag: labor and services such as welding are not stock-tracked. | assumed |
| D-56 | Start numbers default to work order 13548 and statement 9309 (the brief's examples). Set the real next numbers in Settings before go-live. | you |
| D-57 | The database itself refuses any update or delete on ledgers (stock, cash, customer and supplier ledgers, payments, audit, revisions). | assumed |
| D-58 | The typed OpenAPI file is generated in Phase 3 from the zod schemas the server already validates with. | assumed |

## Phase 3

| ID | Decision | Status |
|---|---|---|
| D-59 | Sales return value = qty × unit price minus the line's proportional share of its category discount. | Aslam |
| D-60 | The client keeps the refresh token in local storage for now; move it to the OS keychain through Tauri in Phase 6. | assumed |
| D-61 | Engineers add catalog items at list price only. Free-text lines and price changes are Admin only. | assumed |
| D-62 | Moved to Phase 5 (search, reports, alerts, labels, printing): the report screen on real data, condition reports, label printing, the customer QR status link, editable WhatsApp templates, and storing the customer's on-screen signature. Until then prints carry no QR and the Job Card has an empty signature line. | assumed |
| D-63 | A new statement takes the work order's lines as they are; lines are edited on the work order before saving. After saving, only Admin edits (quantities, removals, discounts, payments) with a reason. | assumed |

## Phase 4 (offline and sync)

| ID | Decision | Status |
|---|---|---|
| D-64 | Works offline: car lookup, receiving a car (new customer and car too), the work order and its lines, parts issue, converting to a statement (its number comes when the connection returns), and every page already visited. Needs the connection: printing a statement, admin edits, cancel, payments of old debts, purchases, cash drawer, settings, reports. | assumed |
| D-65 | Queued writes are replayed in order through the normal API, so the same rules, permissions and audit apply. Each runs exactly once (mutation id). A rejected write appears in the top bar with the server's message. | assumed |
| D-66 | A part issued offline beyond the stock is accepted when it reaches the server and flagged in the audit log (`stock.offline_over_issue`); only the server's own replay can use this exception. | assumed |
| D-67 | Opening the app without a connection continues as the last user of this PC. Switching user while offline is not possible. A queued write is sent only while the user who made it is logged in. | assumed |
| D-68 | Each PC keeps a reserve of 20 work-order numbers and takes a new reserve when fewer than 5 are left. Numbers left in a reserve become gaps (D-15). | accepted |

## Egyptian plates

| ID | Decision | Status |
|---|---|---|
| D-69 | A plate is stored as type + letters + digits (`vehicles.plate_type`, `plate_letters`, `plate_digits`, plus `plate_key` for search). Types are an editable table (Settings → أنواع اللوحات): Arabic label, top-bar color, text color, digits only, small (motorcycle: two lines), to confirm, active, order. Seeded: ملاكي (light blue), نقل (red), أتوبيس / حكومة (gray), ليموزين وسياحة (beige), دبلوماسي (green, digits only, shown ### - ##), جمارك / مؤقت / ترانزيت (yellow), منطقة حرة (yellow), شرطة (dark blue, white text), دراجة نارية (light blue, small), دراجة نارية شرطة (dark blue, small). لوحة قديمة (white) is seeded inactive. حكومي and قوات مسلحة are seeded inactive with no color and marked "to confirm"; the plate shows a hatched bar until a color is set. There is no taxi (أجرة) type. The color values are close to the described colors and can be changed in Settings. | assumed |
| D-70 | Plate input: the 17 plate letters (أ ب ج د ر س ص ط ع ف ق ل م ن هـ و ى) are offered as buttons. Any Arabic letter is accepted, with a soft warning for letters outside the set. Up to 3 letters and 1 to 7 digits. Search ignores spaces and dashes, alef/hamza, ya/alef maqsura, ta marbuta and tatweel variants, and Arabic-Indic digits, and finds a plate whether letters or digits are typed first. Every plate on screen and in print (vehicle card, search results, cars-in-shop board, Job Card, statement) is the same plate component with the type's colors. | assumed |

## Old system (Byte) data: inspection only

Inspected on 2026-10-31. No import code has been written.

**Where the copy is.** The copy is at `jeep-city-system\Byte_Prog` (inside the project folder), not at `jeep-city-work\byte_prog`. A second copy is in `Downloads\Byte_Prog` with `Byte_Prog.rar`. `.gitignore` now ignores `Byte_Prog/`, `byte_prog/`, `*.mde`, `*.mdb`, `*.ldb` and `*.laccdb`. The project folder is not a git repository yet, so nothing has been committed either way. `Account.zip` inside the folder holds older copies of the same front-ends only.

**How it was read.** Each file was read into memory with `mdb-reader` (pure JavaScript, installed in a temporary folder, not a project dependency). Nothing opened the files for writing; the file times were the same before and after. No password was asked for. The values of `tblPassword_Store`, `BackDBs.MyPass`, the users and password tables and `sn.txt` were not read. `TeamViewerQS_Byte_Login.exe` was not run. YAZSYS was ignored.

**Main finding: the data is not in the .mde files.** All nine files are Access 2000–2003 (Jet 4) front-ends: forms, queries and reports. Their tables are linked tables. They connect through the ODBC data source `Cars_Data` to a Microsoft SQL Server database named `Byte_Data_2014`, with Windows login (`Trusted_Connection=Yes`). The server is the PC named `BYTE`; the links were also saved from `DESKTOP-41IHR28` and `DESKTOP-38I4514`. The front-ends alone give no row counts; the back-end itself is described below. `Reciption_Reci_All_IN_One.mde` is large (≈ 486 MB) because of its 154 forms and 426 queries and because it was never compacted. It is not large because of data.

| File | Linked tables (distinct back-end tables) | Local tables (rows) | Queries | Forms |
|---|---|---|---|---|
| Reciption_Reci_All_IN_One.mde | 178 (170) | `tWork_Orders_Main_ExportErrors` (858: Error, Field, Row: a log of a failed export), `أخطاء اللصق` (1), `system` (1) | 426 | 154 |
| StoreXP_All.mde | 177 (170) | `tblPassword_Store` (1, not read), `system` (1) | 138 | 66 |
| Reciption_BOX.mde | 177 (170) | `BackDBs`, `BackDBs1` (1 each: backup path and a password, not read), `system`, `system1` | 348 | 131 |
| Reciption_Full.mde | 177 (170) | `BackDBs` (1), `system` (1) | 289 | 130 |
| Reciption_Felowup.mde | 143 (143) | `BackDBs` (1), `system` (1) | 295 | 129 |
| Reciption_Reci.mde | 177 (170) | `system` (1) | 317 | 139 |
| Reciption_Loding.mde, StoreXP_OUT.mde | 143 / 177 | as above | 312 / 151 | 135 / 70 |
| sHIFT.mde | 0 | none | 0 | 2 |

Together the front-ends link 178 distinct `dbo` tables. Eight of them are not linked from the main file: `Mint_Type`, `ScreenJuncUser`, `Screens`, `sysdiagrams`, `Table1`, `TblOptions`, `tCust_Khnow` and `tMent_Shcdoual`. The links store no column lists. The columns below are the ones the saved queries use, so a table may have more.

| Our entity | Byte table(s) in `Byte_Data_2014` | Columns seen (main ones) |
|---|---|---|
| Customers | `tCustmers_Data` (100 columns, a generic Byte template that also has real-estate fields); `tCust_Data` (9); `العملاء` (accounting customers) | `No`, `Cust_Name`, `Cust_Tel_Mobile`, `Cust_Tel_Home`, `Cust_Tel_Work`, `Cust_Address`, `Co_Name`, `Notes`, `Cust_Car_No`; `tCust_No`, `tCust_Name`, `tCust_Mobile`, `tCust_Tel`, `tCust_Adres`, `tCust_National`. Each work order also carries its own copy of the customer's name and phones. |
| Vehicles | `tCars_Data` (162 columns) | `Car_No` (plate), `Car_Shaceh_No` (chassis), `Car_Motor_No`, `Car_Type`, `Car_Kind`, `Model`, `Traz`, `Car_Color`, `Licence_No`, `Licence_Type`, `Licence_End_Date`, `Last_KM`, `Last_visit_Date`, `Granty_*`, `Cust_Name`, `Cust_Tel_Mobile`, many `Change_*` service-interval fields |
| Work orders (= statements) | `tWork_Orders_Main` (235 columns); copies `TWORK`, `tWork_Order` | `Work_Order_No`, `Work_Order_Date`, `Work_Order_In_Time`, `Work_Care_No` (plate), `Cust_Car_Shase_No`, `Work_Care_Model`, `Work_Care_Counter` (km), `Work_Care_Truble` (complaint), `Work_Care_Recive_Name`, `Licence_Type`, `Work_Order_Statuse`, `Total_Work`, `Total_Spar_Part`, `Disc1..3`, `Total_Net`, `Payed_mony`, `Amount_Visa`, `DownPayMent`, `Total_Baky`, `iNVOICE`, `Payed_Order_No`, `Notes`, and journal fields `Acc_No_*` / `Amount_*`. Byte has no separate statement table: the totals and payments sit on the work order row. |
| Work order lines | `tWork_Orders_Sub` (labor), `tWork_Orders_Sub_SparPart` (parts), `tWork_Orders_Sub_Khmat` (materials), `tWork_Orders_Poyat` (paint), `tWork_Orders_Sub_Loading`, `tWork_Orders_Sub_Free_Service`, `tWork_Orders_Late` | `Work_Order_No`, `Item_No`, `Item_Name`, `Item_Quantity`, `Item_Price`, `Item_Total`, `Item_Techecal` / `Tehnial_Name` (technician), `Item_Done`, `Item_Not_Done_Why`, `Mentinance_Pay_type` |
| Inspections / estimates | `tMokaisa_Main`, `tMokaisa_Sub`, `tMokaisa_Sub_Spare_Part` | same shape as work orders |
| Items | `tItemDataMain` (master); `tItem_Data` (labor and service price list); `tItem_Group`, `tItemUnit`, `tItemState` | `ItemCode`, `ItemCode2`, `ItemName`, `Item_Group`, `Car_Type`, `Model`, `Unit`, `Sale_Price`, `Ubi_Price`, `Mini_Requird`, `Location`, `Suply_Name`, `Start_Balance-Quantity`; `Item_No`, `Item_Name`, `Item_Price`, `Item_Time` |
| Stock | `tItemsDataSub` (quantity per store), `tStoreData` (stores) | `ItemCode`, `StoreName`, `CurrentQuantity`, `Unit_Price`, `Location` |
| Stock moves, purchases, issues | `tTranslateOrderMain` / `tTranslateOrderSub` (+ `_Del`), `tInvoice_No` | `TransID`, `TransType`, `Move_Type`, `OrderDate`, `Supplyer_Name`, `StoreNameFrom` / `StoreNameTo`, `Invoice_No`, `Total_Net`; lines: `ItemCode`, `TransQuantity`, `Q_Import`, `Q_Export`, `Unit_Price`, `cost`, `Old_Balance`, `Balance` |
| Suppliers | `tGiversData` (no columns used by the queries); in practice free text in `Supplyer_Name` / `Suply_Name` / `Item_Giver` | to be checked on the restored database |
| Cash and accounts | `tAccount_Data`, `tAccount_Data_Move`, `tBox_Data`, `tAccount`; a general ledger (`قيود اليومية…`, `الحسابات`, `مراكز التكلفة`, `حسابات البنوك`, `الشيكات`) | `No`, `Date`, `Madin` / `Daean` (debit/credit), `Pay_Type`, `Work_Order_No`, `Invoice`, `FromAccount`, `ToAccout`, `Notes`, `User_Name` |
| People | `tEng_Data`, `tEmpluy_Data`, `tWarash_Data`, `tMangers`, `tEng_Mangers`; HR: `عاملين`, `حركة مرتبات`, `سلف`, `غياب` | names only |
| Lookups | `tCars_Type`, `tCars_Model`, `Car_Type`, `Color`, `Pay_Type`, `tCitys`, `Order_Type`, `Work_Type`, `Cars_Statuse` | |
| Users (not imported) | `users`, `tUsers_Data`, `tblPassword`, `tblPassword1/2`, `tblPassword_store`, `_Refund`, `_Update`, `security`, `pass` | not read |

**Back-end database (inspected 2026-10-31).** The shop copied `Byte_Data_2014.MDF` and `Byte_Data_2014_Log.LDF` from the `BYTE` PC into `jeep-city-system\` (ignored by git: `*.mdf`, `*.ldf`, `*.bak`). SQL Server 2022 LocalDB was installed on this PC, with the instance named `jcmig`. A **copy** of the two files was attached from the temporary folder as `ByteCopy` and set to READ_ONLY; the files the shop brought were not opened. The database is SQL Server 2014 format, collation `Arabic_CI_AS`, and attached cleanly. Only counts and value categories were queried. No customer rows were printed, and the users and password tables were not read.

It holds 179 tables. 100 have rows; the general ledger, HR, payroll, contracts and the separate customer tables (`tCustmers_Data`, `tCust_Data`) are empty. There are 16 foreign keys, all from line tables to their header, and no stored procedures of the shop's own.

| Table | Rows | What it really holds |
|---|---|---|
| `tWork_Orders_Main` | 12,061 | Work orders 1 to 13,557, from 2019-12-25 to 2026-10-31 (1,288 in 2026). Status: 10,149 `مغلق`, 1,912 `مفتوح`; only 42 of the open ones are from the last 30 days, the oldest is from 2020. Each row also holds the customer's name and phones (mobile filled in 11,942) and the car's plate (`Work_Care_No`), chassis (`Cust_Car_Shase_No`) and km. Total of `Total_Net`: about 72.9 M EGP. 3,990 orders have a discount. Tax flag is `لا` on all but one. |
| `tWork_Orders_Sub` | 16,154 | Labor lines (5 distinct technicians). `Mentinance_Pay_type` is never filled. |
| `tWork_Orders_Sub_SparPart` | 33,254 | Parts lines on 8,735 work orders, about 62.1 M EGP. |
| `tWork_Orders_Sub_Khmat_Spent` / `_Khmat` | 302 / 5 | Materials and outside work. |
| `tCars_Data` | 4,304 | One row per car **with its owner** (there is no separate customer table in use). 3,772 distinct plates, 3,697 distinct chassis numbers (208 without one), 3,389 distinct owner names. Several columns are used for something other than their name: `Car_Type` holds the governorate, `Car_Kind` holds the model (`JEEP WK2` 926, `JEEP JK` 851, `JEEP KK` 472, `JEEP RENEGADE` 470, …), and the mobile is in `Cust_Tel_Home` (`Cust_Tel_Mobile` is empty in every row). 228 work orders have a plate that is not in this table. |
| `tItemDataMain` | 3,596 | Items, all of type `قطع غيار`. The primary key is `ItemName`; 3,498 distinct codes, 23 without a code. |
| `tTranslateOrderMain` / `Sub` | 16,751 / 39,024 | Store moves: 8,584 `صادر` (issues; 8,077 linked to a work order) and 8,152 `وارد` (receipts). Lines refer to items by name. `tItemsDataSub` (stock per store) is empty, so the stock on hand must be computed from the opening balance plus these moves. Stores: `الرئيسى`, `الفرعى 1`, `الفرعى 2`. Only one supplier name is ever typed; `tGiversData` has 2 rows. |
| `tAccount_Data` | 10,676 | Cash book since 2017. 10,220 rows are payments of 9,300 work orders (`Daean`, about 57.7 M EGP). The rest are operating expenses and other income (types such as `مصروفات تشغيل`, `دفعة تحت حساب قطع غيار`). The payment fields on the work order itself (`Payed_mony`) are almost never used. |
| `العملاء` | 7 | Company customers (accounting). |
| Lookups | small | `tEng_Data` (8 engineers), `Color` (48), `tCitys` (64), `tStreets` (279), `tItem_Group` (81), `KM_Mint_Type` (22), `tCars_Type` (12), `tCars_Model` (7). |
| Users and passwords | 3–4 rows each | `users`, `tUsers_Data`, `tblPassword*`: not read, not imported. |

Plate text: in work orders, 6,065 plates look like `A A A 999` and 3,996 like `A A A 9999` (A = Arabic letter, 9 = digit), 799 like `A A 9999`. The rest have extra or missing spaces, digits first, a `*`, or are empty (531 cars, 28 work orders). `Licence_Type` is empty in all 12,061 work orders, so the old data never records the plate type.

| ID | Decision | Status |
|---|---|---|
| D-71 | The migration source is the SQL Server database `Byte_Data_2014` (copy received 2026-10-31). The import will read a read-only LocalDB copy of it, never the shop's live server. Before go-live, a fresh copy is taken and imported again so the last days are not lost. | accepted |
| D-72 | Plate type on import: Byte has no plate type (`Licence_Type` is always empty). Plates of the standard shape (2–3 Arabic letters and 3–4 digits, in any order or spacing) import as ملاكي. Digits-only, empty, `*` and any other shape import as ملاكي and are flagged for review. | assumed |
| D-73 | Not imported: Byte users and passwords (instruction), and the security tables. The general ledger, HR, payroll, contracts and real-estate tables are empty, so nothing is lost by leaving them out. | accepted |
| D-74 | Proposed mapping (no code yet). Customers come from `tCars_Data` owners plus the name and phones on each work order, merged by mobile, then by name. Cars come from `tCars_Data`: plate, `Car_Shaceh_No`, `Car_Kind` as the model. Work orders, labor lines and part lines come from `tWork_Orders_*`. Payments come from `tAccount_Data` rows linked to a work order. Items come from `tItemDataMain`; stock on hand is the opening balance plus the `وارد`/`صادر` moves, per store. | proposed |
| D-75 | Byte's last work order is 13,557 (today). The new system's work-order numbering must continue after the highest imported number, not at the 13,548 used for the demo (D-15 already blocks going below a used number). | assumed |
| D-76 | Of the 1,912 work orders still `مفتوح` in Byte, only 42 are from the last 30 days. On import, open work orders older than 30 days before the import date come in as closed (history, flagged "closed on import"); the recent ones stay open. Decided by the shop on 2026-10-31. | accepted |
| D-77 | The Byte import runs in two steps. `apps/server/scripts/byte/export.ps1` exports four JSON files from the read-only LocalDB copy. `npm run import:byte` then loads them into an **empty** database; it refuses to run into one that already has customers. What is imported: customers merged by mobile, then by name (3,477; a car with no owner name gets its own «بدون اسم (من بايت)» customer, never a shared one); cars from `tCars_Data` plus cars that appear only on work orders (3,897; 543 empty Byte rows with no name, phone or plate and no visit are skipped); all 12,061 work orders as history with their 49,710 lines, km readings and technicians; 3,596 items with categories, sale price, minimum quantity and opening stock in the main store; and debts still due as opening balances. Each history work order keeps Byte's total in its internal notes. Old statements: see D-80. | accepted |
| D-78 | Byte's work-order lines are barely linked to its item list: Byte's "item code" is the item name, and line codes are barcodes. Only 713 of 33,254 part lines match an item, so the others come in as free-text lines (code and name kept). History lines do not move stock: Byte already did. 134 items with negative stock in Byte start at 0. Cars with a non-standard or missing plate (294) have a review note in the car's notes. | accepted |
| D-79 | Every database has an identity (`system.dbId`, created at first start) that is sent with each sync pull. A PC whose local copy came from another database (the demo, a restore, the import) clears it and starts again; unsent changes go to the failures list instead of reaching the wrong data. | accepted |
| D-80 | Byte's 10,149 closed work orders (`مغلق`) are imported as statements of a separate kind, «بيان من بايت». Their number is the work-order number, and they never use the new statement series. They are read-only: the server refuses edits and cancels. Totals use our formula over the imported lines. Byte's own net is kept by turning the difference into an amount discount, labor first, then parts. In 248 statements Byte's total is higher than the lines; the lines' total is kept and the gap is written in the statement. Byte lines with a negative price (18) are discounts typed as lines: they are kept at 0, with the amount in their name. The paid amount is the total minus what Byte still shows as due, split into card (Byte's visa amount) and cash. These payments are for display only and add no ledger or cash-drawer rows, because the balance already comes from D-77. The statements list shows newest first by date and says when it shows only the latest 200 (the same applies to customers: latest 300 by last visit, with the total count). | accepted |

## Deployment (changed by the shop on 2026-10-31)

| ID | Decision | Status |
|---|---|---|
| D-88 | No VPS. The server is a dedicated PC in the shop: Ubuntu Server, Docker Compose, PostgreSQL. Outside access is through Cloudflare Tunnel, with no open router ports. Staff PCs use the LAN address in the shop and fall back to the tunnel address otherwise; the desktop app keeps working on the LAN when the internet is down, and phones sync whenever they reach the server. Phase 6 adds: start on boot, a daily database dump kept 14 days, a daily copy to cloud storage, a restore script with a tested restore, a health check, and a short README for setup and recovery. Secrets live in env files outside git. Replaces the VPS / Caddy plan in PLAN §6. | accepted |
| D-89 | The QR status link (D-85) uses the tunnel address as `share.baseUrl`, so customers can open it from anywhere. | assumed |
| D-90 | All three apps live in this one repository and reuse the same React client: Windows = Tauri 2 (`apps/desktop`, NSIS installer), Android and iOS = Capacitor 8 (`apps/mobile`, native projects committed). They are built on GitHub Actions (workflow **Apps**); CI runs the tests on every push. iOS builds for the simulator until an Apple Developer account and signing secrets are added. | accepted |
| D-91 | The Windows and phone apps keep a list of server addresses per device: the LAN address first, then the tunnel. An address with a fallback after it gets 3 s to answer; the LAN is tried again at most once a minute. Defaults come from the repository variable `SERVER_URLS`; each device can change them on the login screen. The server allows the app origins (tauri://, capacitor://, https://localhost) through CORS; auth stays a Bearer token. | accepted |

## Phase 5 (search, reports, alerts, labels, printing)

| ID | Decision | Status |
|---|---|---|
| D-81 | The general report has ten reports with one shape (columns, rows, totals): sales and profit, top items, stock value, low stock, slow movers (90 days without issue), customer debts, supplier balances, expenses by category, engineers' and technicians' work with bonuses, and the cash drawer history. Admin only. Print or PDF goes through a print page with the shop header; Excel export is a UTF-8 CSV that Excel opens with Arabic intact. Profit = sales of the new system − cost of the parts issued to those statements (their stock-movement cost) − expenses in the period. Byte statements count in sales but not in profit, because they have no cost. | assumed |
| D-82 | Alerts: due reminders and customer debts with no ledger movement for `alerts.debtDays` (default 30) appear in the top-bar bell and on the «المذكرات والتنبيهات» screen, together with low stock and cars in the shop for `workshop.longStayDays`. Service reminders are set from a work order by date or by odometer; a km reminder is due once the car's last reading passes it. Debts are shown to Admin only. Reminders need the connection (they are not in the offline copy). | assumed |
| D-83 | The WhatsApp texts live in Settings (`whatsapp.templates`) with placeholders {الاسم} {السيارة} {رقم_الأمر} {الموعد}. A placeholder with no value stays visible in the message, so the gap is noticed. The greeting uses the first name and skips titles such as م/، د.، الأستاذ؛ «السيد» is kept, because in Egypt it is often the first name. | assumed |
| D-84 | QR labels: one label per page at `labels.size` (default 40×30 mm), printed through the Windows dialog. The QR holds the variant's barcode. A variant without one gets «JC» + 8 digits the first time its label is printed, because Byte item codes are Arabic text that a keyboard-wedge scanner cannot type back. Scan mode is an input that keeps the focus unless the user is typing in another field. | accepted |
| D-85 | Customer status link: each printed Job Card, statement and condition report carries a QR to a read-only page about that visit only (car, status, dates, work done, statement total and paid). It has no phone numbers and no other visits. Each print makes a new link of 24 random bytes; only its SHA-256 hash is stored. It expires after `share.days` (default 30), and the public endpoint is limited to 30 requests a minute. The link uses `share.baseUrl` (the VPS address, Phase 6) or this PC's address. A print made offline goes out without the QR. | assumed |
| D-86 | The condition report starts from the checklist in Settings (`condition.checklist`, 25 checks) and saves one report per work order. Turning recommendations into work-order lines at their suggested price is Admin only, the same rule as free-price lines (D-61). | assumed |
| D-87 | The customer signs on the screen (reception) when the car is received, or later from the work order. It is stored as a PNG file under `FILES_DIR` (content-addressed) and printed in the Job Card's signature box. Signing needs the connection; offline, the work order is saved and the customer signs later. | assumed |

## Not in this build

| ID | Decision | Status |
|---|---|---|
| D-45 | Not built now: multi-branch, WhatsApp Business API, payment gateways, ESC/POS, migration of old statements (later changed by the shop: D-80), the old invoice device. | brief |
