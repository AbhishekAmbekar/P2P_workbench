# P2P Workbench: notes for working on this project

A procure to pay web app: request, PR approval, RFx, PO, goods receipt, invoice, plus an Expedite tab for chasing suppliers. It is a portfolio project that should also be useful to anyone who buys things. Plain HTML, CSS and JavaScript. No framework and no build step. Hosted on GitHub Pages from the `main` branch. All data is fictional.

## How to work here

- Work on a branch and open a pull request. Do not push to `main`. The owner reviews and merges, and the live site rebuilds from `main`.
- Change only what the request needs. Edit files in place. Do not regenerate the whole project.
- Run every test suite before committing (commands below). Add tests for new rules.
- Keep the guide screen (`js/view-guide.js`) and `README.md` in step with what the app does. Update the check count in the README when tests are added.
- Do not claim more than the app does. Be honest in the UI text and the README about limits.

## Structure

- `index.html` loads the scripts in a fixed order: `data.js`, `logic.js`, `csv.js`, `search.js`, `seed.js`, `app.js`, `csv-ui.js`, `search-ui.js`, `charts.js`, the `view-*.js` files, `view-record.js`, then `App.start()`. Check for duplicate script tags when adding a file. Every css and js link ends in `?v=N`. Raise N by one in any pull request that changes a css or js file, or browsers keep the old copy for up to 10 minutes after a merge.
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
- `js/view-record.js`: the full page for one record (REQ, PR, RFX, PO, GRN, SES, INV), built on `P.docFlow`. Read only. `App.openRecord(id)`, `App.recLink(id)` and `App.recBtn(id)` open it. The address shows `#tab` or `#PO-4001`, and opening a record adds a Back step.
- `js/view-*.js`: one file per screen. Events use `data-act`, `data-form` and `data-change` attributes and `App.actions.*`.
- `css/style.css`: styling. Always light, even when the computer is in dark mode. Dark colors exist under `:root.dark` for a future switch, but nothing turns them on. White and indigo theme, full width layout. Inter font, shipped in `fonts/` under the SIL Open Font License, so nothing loads from outside. Type sizes are the `--fs-*` variables, 14px base. `App.page` in `app.js` turns each screen's leading `<h2>` and `<p class="hint">` into the white header band with the CSV buttons. Keep the red, amber and green status colors as they are. The demo data note sits in the footer. `.wrap` around wide tables keeps phones from scrolling sideways.
- `tests/`: engine checks and screen tests.

## Rules the app enforces (keep these true)

- Approval chain: Manager always. Quality or Engineering when the item is flagged. Director from $5,000. Executive from $50,000, or when the request would take its cost center over budget.
- An RFx is needed from $10,000 unless a contract exists. A PO may exceed the approved PR value by 10% at most. A PO price more than 10% above the contract or standard price needs a written reason.
- RFx ranking uses landed cost (price, tariff, freight), lead time and supplier quality. Weights add up to 100. Unqualified suppliers cannot win. A conditional supplier, a single bid or a pick that is not top ranked needs a justification.
- Closing bidding starts a technical review (`P.techEvaluate`, `P.techSubmit`) by the item's reviewer: Engineering if `needsEngineering`, else Quality if `needsQuality`, else the Requester. Each offer is Acceptable or Not acceptable (a reason is required); every offer must be done before it goes back to the Buyer. The reviewer's panel shows no prices. A failed offer is not eligible.
- The Buyer recommends an award (`P.recommendAward`); it does not stand until approved (`P.decideAward`). Director always; Executive also from $50,000 of landed value or for a conditional supplier, a single bid or a pick that is not the top eligible quote. Approvals go in order. A rejection needs a reason and returns the RFx to Evaluating, keeping the old recommendation in `pastRecommendations`. The Manager does not approve awards (owner's decision). RFx saved before this change have no `techRole` and count as technically acceptable.
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
for f in ui-smoke ui-requests ui-rfx ui-pos ui-grn ui-invoices ui-controls ui-expedite ui-e2e ui-csv ui-records ui-shell ui-search ui-roles ui-dashboard ui-services; do node tests/$f.js "$PWD/../jsdom-tmp"; done
```

Also check the phone width (390 px) for sideways scrolling after layout changes.

GitHub Actions (`.github/workflows/tests.yml`) runs all of these on every pull request to main and every push to main, with jsdom installed in the runner's temp folder. It runs every `tests/ui-*.js` file, so a new screen suite needs no workflow change. Still run the tests locally before pushing. Check the pull request's status before telling the owner it is ready.

## Planned next

Agreed order after the UI brainstorm. Search is done (no SAP codes, by the owner's choice). Record numbers in tables link to record pages (done in `App.render`, which rewrites a cell that starts with REQ, PR, RFX, PO, GRN, SES or INV and a number). Role focus part 1 is done: sidebar groups per role from `REF.focus` (`App.focus`, `App.viewOnly` in `app.js`), the view only line in the band, default filters on Requests and Purchase orders (reset when the role changes), Import shown only to the role that runs it. The Requester's badge counts only their own rejected requests. The Manager follows every screen like the Director and VP (owner's decision), and all three get the Oversight home (`App.oversees`). Part 2 is done: dashboard charts for everyone, and the Oversight home (approvals, charts, invoice exceptions by value).

Service POs and consumption is done: service items, monthly service entries recorded by the Requester and released by value, the PO consumption bar with an 80% warning, exact service invoice matching, and the clearing list on Invoices. Next, agreed with the owner: **contracts, blanket orders and releases** (planned item 4), in its own pull request. Contracts and blanket orders also consume a PO over time, so reuse the service consumption pattern. Then:

1. A way to start with an empty workspace. (CSV import and export is done.)
2. A settings screen: cost centers, categories, thresholds and users editable, not fixed in code.
3. Supplier scorecard from receipt and invoice history.
4. Contracts with dates and remaining volume, blanket orders and releases (next, above).
5. Returns and credit notes for rejected goods.
6. Reorder points and safety stock for MRO items.
7. Spend analysis over time, and a planning view (requirements against stock and open POs) as a separate module.

Not planned without a backend: sending mail from the app, supplier login or quote portal, shared data between users, reading email replies.
