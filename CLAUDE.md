# P2P Workbench: notes for working on this project

A procure to pay web app: request, PR approval, RFx, PO, goods receipt, invoice, plus an Expedite tab for chasing suppliers. It is a portfolio project that should also be useful to anyone who buys things. Plain HTML, CSS and JavaScript. No framework and no build step. Hosted on GitHub Pages from the `main` branch. All data is fictional.

## How to work here

- Work on a branch and open a pull request. Do not push to `main`. The owner reviews and merges, and the live site rebuilds from `main`.
- Change only what the request needs. Edit files in place. Do not regenerate the whole project.
- Run every test suite before committing (commands below). Add tests for new rules.
- Keep the guide screen (`js/view-guide.js`) and `README.md` in step with what the app does. Update the check count in the README when tests are added.
- Do not claim more than the app does. Be honest in the UI text and the README about limits.

## Structure

- `index.html` loads the scripts in a fixed order: `data.js`, `item-guides.js`, `logic.js`, `csv.js`, `search.js`, `seed.js`, `app.js`, `csv-ui.js`, `search-ui.js`, `charts.js`, the `view-*.js` files, `view-record.js`, then `App.start()`. Check for duplicate script tags when adding a file. Every css and js link ends in `?v=N`. Raise N by one in any pull request that changes a css or js file, or browsers keep the old copy for up to 10 minutes after a merge.
- `js/data.js`: reference data. Thresholds, roles, role focus (`focus`: the screens each role works on and views, and `screenOwners`: who works on each screen), cost centers and budgets, spend categories, suppliers, items.
- `js/logic.js`: the workflow engine. Pure functions on a state object. Every action checks the role and throws a readable `Error` when a rule is broken. Nothing here touches the page.
- `js/csv.js`: CSV reader and writer, one export per screen, and the import specs. Pure, like `logic.js`. Each import row calls an engine action, never writes records directly. Imports run on a copy of the state and keep it only if every row passed.
- `js/search.js`: `P.search.search(state, query, now, tabs)` finds and ranks records, suppliers and screens. Pure. Every word must match; a full record number goes to the top. No SAP codes: the owner decided search only.
- `js/search-ui.js`: the header search box and panel. Ctrl K, Cmd K or / opens it (/ only when not typing in a field). Recently opened records are kept under the separate key `p2p-workbench-recent`.
- `js/seed.js`: builds the demo by running real engine actions with backdated times.
- `js/app.js`: shell, the Working as menu (a button and list that open downward, with the hidden `#roleSel` select holding the value), sidebar sections (`App.tabs`, with `group` labels), saving to localStorage, and `App.run`, which runs an engine action, saves, redraws and shows a message or the error.
- `js/charts.js`: `App.charts.budget`, `.spend` and `.split` return plain HTML charts. Committed is indigo `#4338ca`, pipeline orange `#eb6834`: this pair passed the dataviz palette validator (lightness band, color blind and normal vision separation, contrast). States use the status colors and always carry a written label. Marks carry `data-tip`; the shell in `app.js` shows it as a tooltip on hover, focus or tap.
- `js/csv-ui.js`: the CSV bar and import panel. `App.render` puts the bar above every screen that has an export or import.
- `js/view-services.js`: the Service entries screen and `App.serviceBar(po)`, the ordered, accepted, waiting and remaining bar also used on the PO panel and record page.
- `js/view-contracts.js`: the Contracts screen, `App.contractBar(c)` and `App.contractNotes`. `App.route(r)` in `app.js` says how an approved request will be sourced (RFx awarded, Contract CT-x, Needs RFx, Direct buy).
- `js/view-projects.js`: the Projects screen, `App.projectBody(p)` (facts, gating note and cards, shared with the record page) and `App.projectPicker` (the project control on a request's panel).
- `js/item-guides.js`: `window.P2P_ITEM_GUIDES`, written guides per item (what, where, drawing as an inline SVG schematic, specs with why, questions to ask, optional `sameAs`). Plain data. Guides exist for the demo items used in projects.
- `js/view-items.js`: the item card, `App.itemPage(id)`, opened like a record (`#MR-203`; item numbers are in the record ID pattern). `App.itemLink`, `App.itemBtn` and `App.itemLessonsNote` (shown on the new request form and every RFx).
- `js/view-record.js`: the full page for one record (REQ, PR, RFX, PO, GRN, SES, INV, CT, PRJ), built on `P.docFlow`. A contract page has no document flow; it lists its releases. Read only. `App.openRecord(id)`, `App.recLink(id)` and `App.recBtn(id)` open it. The address shows `#tab` or `#PO-4001`, and opening a record adds a Back step.
- Card grid (owner's decision): side by side cards use `App.card(title, body, note, full)` inside `<div class="secs">`. Two equal columns (one below 1100px), every card a fixed 380px (`--sec-h`), and the body (`.secbody`) scrolls with a sticky table header when it holds more. Cards never grow with their content. `App.evenCards` makes a card alone in its row span the row, so there are no gaps. Record pages, the Contracts detail panel and the dashboard use it. A page shows the same cards in the same order whatever the record's status; an empty card says why it is empty.
- `js/view-*.js`: one file per screen. Events use `data-act`, `data-form` and `data-change` attributes and `App.actions.*`.
- `css/style.css`: styling. Always light, even when the computer is in dark mode. Dark colors exist under `:root.dark` for a future switch, but nothing turns them on. White and indigo theme, full width layout. Inter font, shipped in `fonts/` under the SIL Open Font License, so nothing loads from outside. Type sizes are the `--fs-*` variables, 14px base. `App.page` in `app.js` turns each screen's leading `<h2>` and `<p class="hint">` into the white header band with the CSV buttons. Keep the red, amber and green status colors as they are. The demo data note sits in the footer. `.wrap` around wide tables keeps phones from scrolling sideways.
- `tests/`: engine checks and screen tests.

## Rules the app enforces (keep these true)

- Approval chain: Manager always. Quality or Engineering when the item is flagged. Director from $5,000. Executive from $50,000, or when the request would take its cost center over budget.
- An RFx is needed from $10,000 unless an active contract covers the item. A PO may exceed the approved PR value by 10% at most. A PO price more than 10% above the contract or standard price needs a written reason.
- RFx ranking uses one adjusted price per unit (bonus and malus, owner agreed to industry practice): landed cost (price, tariff, freight) plus dollar adjustments from `adjustQuote` in `logic.js` for payment terms against standard (cost of capital), a conditional supplier (one time cost over the quantity), schedule risk (days short of a buffer before the need date, planned on the frozen usual slip) and supplier rating below target. Defaults in `REF.adjust`. The Buyer sets them per RFx (`P.startRFx`, `P.setAdjustments`) while Open; `closeBidding` locks `x.adj`, `x.evalDate` and `x.slips`. Lowest adjusted price ranks first. Old RFx with `weights` and no `adj` use the defaults. Unqualified suppliers cannot win. A conditional supplier, a single bid or a pick that is not the lowest adjusted price needs a justification.
- Closing bidding starts a technical review (`P.techEvaluate`, `P.techSubmit`) by the item's reviewer: Engineering if `needsEngineering`, else Quality if `needsQuality`, else the Requester. Each offer is Acceptable or Not acceptable (a reason is required); every offer must be done before it goes back to the Buyer. The reviewer's panel shows no prices. A failed offer is not eligible.
- The Buyer recommends an award (`P.recommendAward`); it does not stand until approved (`P.decideAward`). Director always; Executive also from $50,000 of landed value or for a conditional supplier, a single bid or a pick that is not the top eligible quote. Approvals go in order. A rejection needs a reason and returns the RFx to Evaluating, keeping the old recommendation in `pastRecommendations`. The Manager does not approve awards (owner's decision). RFx saved before this change have no `techRole` and count as technically acceptable.
- Contracts (`state.contracts`, CT numbers, `P.createContract`, `P.decideContract`): a supplier, agreed prices per item, start and end dates, a value cap. The Buyer drafts; the Director approves, plus the Executive from $50,000 of cap (`P.contractChain`), in order, a reason to reject. Qualified supplier, current documents, one contract per item at a time unless the other is used up. `P.contractFor(s, itemId, today)` gives the active contract; `createPO` releases from it at the contract rate, sets `po.contractId`, and blocks a release past the remaining cap. Used up, expired, not started, pending or rejected contracts do not apply, so normal sourcing returns. Warns at 80% used and within 60 days of the end. Contract prices are no longer on items in `data.js`; saved data from before is migrated by `P.migrateContracts` in `load()`. Blanket orders are folded into contracts (owner agreed to industry practice). No amendments yet.
- Projects (`state.projects`, PRJ numbers, owner's idea to go beyond an ERP): optional. `P.createProject` (Requester only): name, target date, criticality High, Medium or Low (required), downtime cost per day (optional; owner's point that requesters rarely know it, so with none the app shows days, never an invented figure). A request carries `projectId`, set when raised or by `P.linkToProject` (Requester or Buyer, from any record of the request; null unlinks); its RFx, PO, receipts, service entries and invoices follow it. `P.projectStatus` gives one row per request: step (Request, Approval, Sourcing, Order, Delivery, Ready), who holds it, days since it last moved, expected date, and state against the target (late after it, at risk within 5 days, blocked on a hold or rejection; not yet ordered uses the need by date). Goods are ready when received; a service when booked in time. The latest open item is the gating item. Saved data without `state.projects` is handled in `load()`. Part 2 (done): `P.deliveryRecord(s, supplierId)` takes the last 8 deliveries, promised against received, from confirmed goods POs with a receipt plus `state.deliveries` (history from before the workspace, seeded; missing in old saved data is handled in `load()`). From 3 deliveries the usual slip is the median, never below zero; `P.plannedDate` adds it to an open PO's promise, and project rows plan on it and show both dates. Services booked before the project's ready date are flagged idle (`st.idle`). The gating note offers the Buyer a chase draft on Expedite. Part 3 (done): the item card. `P.addLesson` (Engineering, Quality, Requester; owner's idea that the right people log failures and the card keeps learning): item, kind, what happened, why (or "Not known yet"), what to do next time, optional source. `P.itemKnowledge` adds failed technical reviews and rejected or held receipts on its own, plus buying history. `P.similarItems` flags look alike items (same category, two shared words, or `sameAs`); there are no stock levels, so the card says so. `MR-209` is a deliberate look alike of `MR-203` in the demo. Saved data without `state.lessons` is handled in `load()`. Guides are editable (owner agreed): `P.editGuide(s, role, now, f, base)` (Engineering, Quality) saves a full new version in `state.guideEdits` with a reason; `P.itemGuide(s, itemId, base)` lays the latest version over the written guide from `item-guides.js` (the drawing and `sameAs` stay with it); the written guide is version 1. `P.lessonsSinceGuide` lists lessons newer than the last version, and the card flags them. Saved data without `state.guideEdits` is handled in `load()`. Next idea: an AI draft of a guide, reviewed by Engineering before it shows (needs a backend or the user's own key).
- Expired quotes and expired or missing supplier documents block the award and the PO.
- Receipts can be partial. Over receipt is blocked. Rejected units do not count as received. Units on quality hold count as received until Quality decides.
- Service items (`service: true` in `data.js`) are ordered as a quantity of hours, days, weeks or months at a rate. The Requester records service entries (`P.postService`, SES numbers) from the site log and the supplier's report. Approvers release them in order by value (`P.decideService`, chain from `P.serviceChain` and `REF.serviceRelease`): Manager always, Director from $5,000, Executive from $10,000 (owner's decision, from his JSW experience). Any of them can send it back with a reason. Entries saved without `releases` get them on first read (`P.serviceReleases`). An entry cannot pass the ordered quantity. Submitted entries use up the PO like held goods; only accepted service can be invoiced. Above `serviceWarnPct` (80) the PO warns. Service POs have no goods receipt and are left out of delivery health and expedite. Missing service exceptions go to the next releaser when work is waiting, else the Requester. Saved data without `state.ses` is handled in `load()`.
- Invoices need an exact three way match: price to the cent, and quantity against accepted, not yet invoiced units. Duplicates are caught. Each exception names who can fix it.
- Delivery health: slack is need by date minus promised date. Under 5 days is At Risk, below zero is Late.
- CSV import only adds records through engine actions, as the role that owns the action. One failing row means nothing is imported. Import does not edit or delete records, and does not create POs, awards or approvals.
- Email: the app never sends mail. It builds a draft and opens it in the user's own mail program, Gmail or Outlook, or copies it. The audit trail says "drafted", never "sent". Demo suppliers have no email address.

## Content rules

- Keep it generic across industries. Categories are spend categories (Direct: raw materials, components, packaging. Indirect: MRO). Items are neutral examples from different industries. Do not put industry labels such as energy, automotive or renewables in categories, suppliers or text.
- All demo data is fictional. Do not use real company names, people or email addresses.
- Write UI text and docs in plain, short sentences. No hyphens in prose, and no marketing or filler phrasing.

## Saved data

State is saved in the browser under the key `p2p-workbench-v2`. If a change would break old saved data, either handle the missing field in code (like `state.contacts`) or bump the key and tell the owner to press Reset demo.

## Tests

```
node tests/logic.test.js
node tests/csv.test.js
node tests/search.test.js
```

The screen tests need jsdom installed in a folder outside the repo. Pass an absolute path, because the tests resolve it from the `tests` folder:

```
mkdir ../jsdom-tmp && cd ../jsdom-tmp && npm install jsdom && cd -
for f in ui-smoke ui-requests ui-rfx ui-pos ui-grn ui-invoices ui-controls ui-expedite ui-e2e ui-csv ui-records ui-shell ui-search ui-roles ui-dashboard ui-services ui-contracts ui-projects ui-items; do node tests/$f.js "$PWD/../jsdom-tmp"; done
```

Also check the phone width (390 px) for sideways scrolling after layout changes.

GitHub Actions (`.github/workflows/tests.yml`) runs all of these on every pull request to main and every push to main, with jsdom installed in the runner's temp folder. It runs every `tests/ui-*.js` file, so a new screen suite needs no workflow change. Still run the tests locally before pushing. Check the pull request's status before telling the owner it is ready.

## Planned next

Agreed order after the UI brainstorm. Search is done (no SAP codes, by the owner's choice). Record numbers in tables link to record pages (done in `App.render`, which rewrites a cell that starts with REQ, PR, RFX, PO, GRN, SES, INV, CT or PRJ and a number). Role focus part 1 is done: sidebar groups per role from `REF.focus` (`App.focus`, `App.viewOnly` in `app.js`), the view only line in the band, default filters on Requests and Purchase orders (reset when the role changes), Import shown only to the role that runs it. The Requester's badge counts only their own rejected requests. The Manager follows every screen like the Director and VP (owner's decision), and all three get the Oversight home (`App.oversees`). Part 2 is done: dashboard charts for everyone, and the Oversight home (approvals, charts, invoice exceptions by value).

Service POs and consumption is done: service items, monthly service entries recorded by the Requester and released by value, the PO consumption bar with an 80% warning, exact service invoice matching, and the clearing list on Invoices. Contracts and releases are done (planned item 4), with blanket orders folded in. Projects parts 1 to 3 are done (grouping, project map, gating item, optional cost of delay, supplier delivery records, planned dates, idle bookings, item cards with lessons learned). Possible follow up: contract amendments (extend the date or raise the cap with a new approval). Then:

1. A way to start with an empty workspace. (CSV import and export is done.)
2. A settings screen: cost centers, categories, thresholds and users editable, not fixed in code.
3. Supplier scorecard from receipt and invoice history.
4. Contracts with dates and remaining volume, blanket orders and releases (done).
5. Returns and credit notes for rejected goods.
6. Reorder points and safety stock for MRO items.
7. Spend analysis over time, and a planning view (requirements against stock and open POs) as a separate module.

Not planned without a backend: sending mail from the app, supplier login or quote portal, shared data between users, reading email replies.
