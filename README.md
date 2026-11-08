# SmartStock

Offline-first retail inventory management for small shops in Myanmar. Frontend only: HTML, CSS, vanilla JS, IndexedDB (browser storage). No build step.

## Run
Open the `smartstock/` folder in VS Code and start **Live Server** on `index.html` (or serve the folder with any static server). No internet is needed.

## Status — Phases 1–7 complete
| Area | State |
|---|---|
| Project structure, design tokens, responsive + print CSS | Done |
| Sidebar (16 items), top bar, drawer on mobile, light/dark, Burmese/English | Done |
| Storage layer (`js/storage.js`) | Done |
| Dashboard (computed from stored records, date filters, empty states) | Done |
| Settings (shop, MMK display, timezone, tax, theme) | Done |
| Purchase-price privacy (admin PIN) | Done (foundation) |
| Activity log page | Done |
| Global search (Ctrl+K), shortcuts help | Basic — searches collections that exist |
| Products (CRUD/archive, search, filters, sort, pagination, bulk price & stock, variants, images in IndexedDB, price history) | Done |
| Categories (CRUD, archive, safe delete with reassignment) | Done |
| Barcode (USB scanner capture, duplicate prevention, generated codes, Code 39 labels) | Done |
| Inventory (central stock service, movement history, valuation, weighted-average cost) | Done |
| Stock Take (sessions, counts, differences, confirm, apply, history) | Done |
| POS (search, barcode scan, cart, item + sale discounts, tax, customer, 6 payment methods, change, partial/credit payments) | Done |
| Sales history, refunds, cancellations, receipt printing (58mm / 80mm / A4) | Done |
| Purchases (draft → confirm, landed cost, supplier payments, invoice print, PIN-protected costs) | Done |
| Suppliers (CRUD, payables, payments, history) | Done |
| Customers (CRUD, credit sales, receivables, payments, history, walk-in summary) | Done |
| Expenses (7 categories, edit with audit, void, monthly summary) | Done |
| Cash management (daily drawer, additions/withdrawals, closing, reconciliation history, closing report) | Done |
| Financial management: profit & margins, inventory value/turnover/slow stock, receivables & payables (aging), cash flow, discounts & refunds, reconciliation | Done (Reports page) |
| Interactive charts (local SVG module), 13 report tabs with previous-period comparison, CSV + print, Notification centre | Done |
| Backup & Restore (checksummed JSON, preview, safety backup, atomic restore, undo), CSV data exports, migration framework, optional offline PWA | Done |

No fake data is generated anywhere. All 16 pages are now functional.

## Script load order (index.html)
`utils → storage → audit-log → settings → inventory → categories → barcode → products → stocktake → payments → sales → pos → suppliers → customers → purchases → expenses → cash-management → charts → csv → reports → backup → notifications → analytics → pwa → app`. Later phases add module files before `app.js`.

## Storage
Keys: `smartstock:{meta,settings,products,categories,sales,purchases,suppliers,customers,expenses,payments,stockMovements,stocktakes,notifications,auditLogs,cashSessions}`.
- All money is stored as integer MMK.
- Records use generated string ids (never array positions).
- Writes go through a write-ahead slot (`smartstock:_pending`) and are recovered on next load.
- Unreadable JSON is quarantined under `smartstock:_corrupt:*` instead of being discarded.
- Quota errors surface as a clear message; nothing is reported saved when it was not.
- Other browser tabs: `storage` events refresh data; stale writes are rejected with a conflict message.
- Browser storage (IndexedDB) is per browser profile and does **not** sync between computers, tablets or browsers.

## Purchase price privacy
`SS.privacy.canViewCost()` is the single permission check. Cost values are only computed after the admin PIN is entered and hide again when you navigate away or reload. Audit log views redact cost fields when locked. **The PIN lives in localStorage — it stops casual viewing, not someone with direct access to the browser profile.**

## Record schemas used by the dashboard (for upcoming modules)
- product: `{id, name, sku, barcode, categoryId, supplierId, unit, purchasePrice, avgCost, sellingPrice, stock, lowStockThreshold, status: 'active'|'archived'}`
- sale: `{id, number, createdAt, status, customerId, total, payments:[{method, amount}], lines:[{productId, productName, qty, unitPrice, lineTotal, costSnapshot}]}`
- expense: `{id, category, amount, date: 'YYYY-MM-DD', status}`
- stockMovement: `{id, productId, type, quantity, previousStock, newStock, reason, relatedId, createdAt}`

## Phase 2 notes
- **Only `SS.inventory.adjust()` changes stock.** It writes the movement first, then the product, and rolls the movement back if the product write fails.
- Quantities may be fractional (kg, litre); money is always integer MMK.
- Product images live in IndexedDB (resized to 320px JPEG), not in localStorage. They are not part of the JSON backup yet (Phase 7 will address this).
- Purchase price: hidden in lists, details, forms, search and audit views until the admin PIN is entered; `SS.products.view()` strips cost fields otherwise. Average cost changes only through stock receipts with a unit cost (purchases in Phase 4).
- Barcode labels use Code 39; test one with your scanner before printing a sheet.
- Variants are simple size / colour / model fields per product (not separate stock-keeping variants).

## Phase 3 notes
- **`SS.sales.complete()` is the only way a sale is recorded.** It validates stock, quantities and discounts, then writes: pending sale → stock movements → payment → customer balance → completed. If any write fails (e.g. storage full) everything is rolled back. If the browser closes mid-sale, the pending sale is rolled back on the next start and you get a notice.
- Each POS cart carries a one-time token, so a double click or repeated submit records one sale.
- Net sales revenue = total − tax. Tax is not revenue. Gross profit = revenue − cost of goods sold; every sale line keeps its own cost snapshot (average cost at the time of sale).
- Refunds reduce revenue and cost of goods sold on the **original sale** (not on the refund date). Refunds first reduce any unpaid balance on that sale, and only the rest is paid back. Returned goods go back into stock at the current average cost (the average is not changed).
- Completed sales are never deleted; they can only be refunded or cancelled. A sale with refunds cannot be cancelled (refund the rest instead).
- POS never shows purchase prices. If an item would sell below its cost, the cashier only sees the product names in a confirmation (no cost values).
- Partial/credit payments are off by default (Settings). Credit needs a named customer; customer payments and the full customer pages arrive in Phase 4.
- Shortcuts in POS: **F2** search, **F9** checkout; scanners work anywhere on the POS page.
- Printing: pick the paper size in the receipt window, then Print. The browser's print dialog must allow the paper size (set the printer's paper to match).

## Phase 4 notes
- **Purchases**: a draft changes nothing. **Confirming** adds stock once, updates the weighted-average cost, records the supplier payment and the unpaid balance. Extra costs (transport etc.) and the discount are spread over the lines, so stock cost includes them (landed cost). A confirmed purchase cannot be edited or confirmed again; use a supplier return in Inventory to take stock back.
- If a confirmation fails (storage full, etc.) everything is restored. If the browser closes mid-confirmation, the purchase returns to *draft* on the next start (stock, average cost, supplier balance and payment are undone) and you get a notice.
- **Purchase price privacy**: the Purchases list shows totals and balances only. Opening, creating or printing a purchase needs the administrator PIN; costs hide again when you leave the page. Supplier and customer pages never show unit costs.
- **Payments** (`js/payments.js`): customer and supplier payments are allocated to the oldest unpaid sale/purchase first (or a chosen one). Over-payment is refused. If a customer/supplier balance does not match their unpaid sales/purchases, the payment is refused instead of guessing.
- **Expenses** are operating costs only and never double-count stock purchases. They are edited (previous/new values go to the activity log) or voided; they are never deleted.
- **Cash drawer** counts physical cash only: cash sales, cash customer payments, cash refunds, cash expenses, cash supplier payments, and manual additions/withdrawals. Opening a day, closing it (a note is required when the count differs) and printing the closing report are in Cash Management. A closed day cannot be reopened. Cash payments are dated when recorded; expenses by their expense date.
- Dashboard cash card now comes from the same records as the cash drawer (received / paid out / net).

## Phase 5 notes
- **`SS.finance` (js/reports.js) is the only place financial figures are calculated**; the Reports page and Settings only display them.
- Five things are kept apart: **revenue** (sales excl. tax, minus refunds), **collected cash** (money actually received/paid, all methods), **profit** (revenue − cost of goods; operating profit also subtracts expenses), **inventory value**, and **receivables / payables**. A credit sale is revenue now, cash later; a stock purchase is not an expense until sold.
- **Cost privacy**: profit, margins, cost of goods and inventory cost value are calculated only after the admin PIN; otherwise the functions return `{locked:true}` and no cost is read. Unlock lasts while you stay inside Reports and ends when you open another page.
- Refunds reduce revenue/COGS on the original sale; the Discounts & refunds tab lists refunds by the date they were made.
- Turnover is unit-based (units sold ÷ stock now, days of cover); slow-moving = in stock and not sold in 30 days.
- **Reconciliation** (8 checks) compares customer/supplier balances with unpaid sales/purchases, each sale's paid + balance with refunds, payment records, stock with the latest movement, closed cash days with their records, interrupted sales/purchases, and data links. It only reports mismatches; it never edits records.
- Cash flow tab covers all payment methods; the "cash drawer only" line matches Cash Management.

## Phase 6 notes
- **Charts**: `js/charts.js` is a small dependency-free SVG module (line, bar, doughnut; hover/focus tooltips, legends, aria labels). **Chart.js was not used** — it could not be downloaded in the build environment (network blocked), so nothing was vendored. If you want Chart.js, place `chart.umd.js` in `js/vendor/` and swap the calls in `SS.charts`; the app works offline either way.
- **Reports** (13 tabs): Overview, Sales (trend vs the previous equally long period, category/payment donuts, best sellers), Profit, Inventory, Purchases, Expenses, Stock movements, Stocktake, Receivables, Payables, Cash flow, Reconciliation, Discounts & refunds. Daily/weekly/monthly/custom reports = the period selector.
- **CSV / Print**: every tab has *Download CSV* (UTF-8 with BOM for Excel, formula-looking cells neutralised) and *Print* (sidebar, tabs and buttons hidden). CSV contains only what the tab shows; profit/cost exports are refused until the admin PIN is entered. The browser can only report "download started" — it cannot confirm the file was saved. PDF/XLSX are not produced (no local export library).
- **Notifications**: generated from real data on every load — out/low stock, customer balances (flagged after 30 days), supplier balances, draft/interrupted purchases, discounts of 20%+ in the last 7 days, unclosed or mismatched cash days, reconciliation mismatches. Read/dismiss choices live in `smartstock:notifications`; an alert returns as new when the facts change (e.g. stock 4 → 3). Nav shows an unread badge. No purchase prices appear in alerts. **Not generated**: near-expiry/expired (products have no expiry date) and backup reminders (Backup is Phase 7).
- Dashboard gross/operating profit now show "hidden" until the admin PIN is entered.
- Fixed: the barcode `.label` CSS leaked into stat cards.

## Phase 7 notes
- **Backup file** (`smartstock-backup-YYYY-MM-DD-HHmm.json`): header (app, format, schema version, timestamp, shop, per-collection counts, SHA-256 checksum) + every storage key + product images (images are in the backup now). Data is validated before export and the finished file is parsed and checksum-checked again before it is saved.
- **"Saved" honesty**: in Chrome/Edge the File System Access API is used and success means the file was really written. In other browsers a normal download is used and the app only says "download started — check your Downloads folder"; a web page cannot confirm more than that. Cancelling the save dialog is not recorded as a backup.
- **Privacy**: a full backup contains purchase prices and the admin PIN hash, so creating or restoring one asks for the admin PIN (when a PIN is set). Keep the file somewhere safe. CSV exports include purchase prices only while the PIN is unlocked.
- **Restore**: choose a file → structure, ids, counts, schema and checksum are checked → preview (backup vs. current record counts, warnings) → you must save a safety backup of current data AND type RESTORE → all collections are replaced all-or-nothing and the result is read back and compared with the backup; any failure puts the previous data back unchanged. Document counters are restored, so invoice numbers continue correctly. A copy of the previous data is kept in the browser (if space allows) for **Undo last restore**. Invalid, damaged, tampered, truncated or newer-schema files are rejected with the reason and nothing is changed.
- **Migrations**: `SS.storage.MIGRATIONS[n](db)` upgrades plain data from schema n to n+1. The same steps run for stored data at startup (after a safety copy) and for older backups being restored. Schema is still 1, so no upgrade has been needed yet — the chained-migration logic is tested with a synthetic registry only.
- **CSV exports** (Backup page): products, inventory, sales, sale items, purchases (totals), customers, suppliers, expenses, stock movements.
- **Offline / PWA (optional)**: `manifest.webmanifest`, `sw.js`, icons. Off by default so Live Server development is unaffected; turn it on in Settings → Offline app (needs https:// or http://localhost — it cannot work from file://). The service worker caches only app files (HTML/CSS/JS/icons), network-first so code edits show while online; business data is never cached. Google Fonts are cached after their first online load; they are not bundled, so a first-ever offline visit uses fallback fonts. The status badge in the top bar shows Online/Offline.
- Backup reminder alert in Notifications: none yet, or older than 7 days.

## Phase 8 notes (final UI, accessibility, performance, testing)
- **Expiry & batches (spec §17) — added in this phase**; it had been left out of Phases 1–7. Per product, *Track batch numbers and expiry dates* keeps `product.batches` (number, expiry, mfg, qty); the batch quantities always add up to the stock. Stock is issued earliest-expiry-first (FEFO) or oldest-received-first (FIFO) — Settings → batch method. **Expired stock is never sold**; the "expired / written-off" stock movement uses expired batches first; a refund returns stock to the batches it came from. Near-expiry window: Settings (default 30 days). Stock that is in no batch shows as an "UNASSIGNED" batch. Reports now has **14 tabs** (new: Expiry, with CSV/print). Notifications now include near-expiry and expired stock.
- **Accessibility**: skip-to-content link (first Tab stop; first page load no longer steals focus), dialogs trap Tab and return focus to the opener, `role=alert` validation with focus on the first invalid field, `aria-sort`, live toast region, `prefers-reduced-motion`, visible focus ring. Text/badge colours were darkened (light theme) or lightened (dark theme) to reach WCAG AA contrast (4.5:1) in both themes. Remaining note: checkboxes are 18 px (24 px including spacing).
- **Performance**: `dayKey()` built a new `Intl.DateTimeFormat` on every call; with 5,000 sales Reports → Sales took 2.7 s. The formatter is now cached (0.44 s). Lists are paginated (15 rows), the POS grid shows at most 60 tiles.
- **Capacity**: see "Storage on IndexedDB" below (the first Phase 8 build used localStorage, about 5 MB; that limit is gone).
- **Offline app**: `sw.js` cache version is `smartstock-shell-v8`.
- Tests are listed in the delivery message; features that were not tested are named there.

## Storage on IndexedDB (after Phase 8)
- **What changed**: `js/storage.js` now keeps data in IndexedDB (database `smartstock-data`, store `kv`, one record per collection with a revision number) instead of localStorage. The rest of the app is unchanged: `SS.storage.read/write/collection/transaction` are still synchronous because all collections are loaded into memory once at start (`await SS.storage.init()`). Product images stay in their own IndexedDB (`smartstock-images`).
- **Saving**: a `write()` changes memory at once and queues a save. Everything written during one user action (e.g. a sale: sales + stock + movements + payments + customer) is saved in **one atomic IndexedDB transaction**, so a crash or power-off can no longer leave half a sale. `SS.storage.flush()` resolves when the data is really stored and rejects if it is not.
- **Never "saved" when it is not**: if a save fails (storage full, blocked, ...) the top bar shows a red **NOT SAVED — tap to retry**, a dialog explains it, and the data stays in memory so a backup can still be made. Tap the badge to retry. Closing the page while a save is pending or failed shows the browser's "leave page?" warning.
- **Several tabs**: tabs tell each other about saves (BroadcastChannel) and stay in sync. A save based on out-of-date data is refused (revision check): that save is undone completely, the latest data is loaded and a warning is shown — nothing is overwritten or merged blindly. Browsers without BroadcastChannel refresh when the tab becomes visible again.
- **Moving old data**: the first start of this version copies the data a localStorage build left behind into IndexedDB in one transaction, reads it back and compares it, then marks it as migrated. The old localStorage copy is **kept** (Settings -> Data & storage -> *Delete old copy*, only offered after a verified migration). If the copy fails, nothing changes, the app stops with an explanation and the next start tries again. IndexedDB data always wins over the old copy.
- **Space**: IndexedDB allows far more than 5 MB (typically a share of the free disk space). Settings shows usage / quota and whether the browser has promised not to clear the data (*persistent storage*; the app asks for it at start; browsers may refuse, so keep making backups).
- **Measured** (headless Chrome, desktop, this build): 5,000 products + 20,000 sales = 8.2 MB, cold start 1.7 s, one POS sale blocks the screen ~0.1 s and is stored after ~0.25 s. 10,000 products + 60,000 sales = 23 MB, cold start 4.5 s, a sale ~0.34 s blocking. Every save writes the whole collection that changed, so this grows with the number of records; a tablet will be slower than this PC. Beyond roughly 30,000 sales per-record storage would be the next step. The same data previously failed at "storage full".
- **Not tested**: real tablets/phones, Safari/iPad (its storage clean-up rules differ), IndexedDB inside the Artifact preview, genuine "disk full" on a real device (simulated with a fake database in Node tests and with a forced failure in Chrome), a browser crash in the middle of a transaction.
- Service worker cache is now `smartstock-shell-v9`.

## Burmese interface (Phase 8c)

The whole interface is translated to Burmese at runtime by a phrase translator (`SS.i18n.tr`, in `js/utils.js`) using the dictionary in `js/i18n-my.js` (~1,230 phrases, `{}` marks a variable part). English is the source text in the code, so switching to English (the **EN** button, or `?lang=en` in the URL for one load) shows the original text.

- Never translated: names, notes and other text you type, units, CSV file contents (kept in English so spreadsheets stay consistent).
- A phrase that is not in the dictionary simply shows in English. To add one, append a line to `js/i18n-my.js` or call `SS.i18n.addPhrases({ 'English text': 'မြန်မာ' })`.
- The Burmese was written by the assistant, not a professional translator — have a native speaker review it.
- Fixed in this phase: the Reports tabs without a period filter (Receivables, Payables, Reconciliation, Expiry) showed a stray "null".
