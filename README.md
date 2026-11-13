# P2P Workbench

A working model of the procure to pay cycle for a manufacturer. Six linked stages:

**Request, PR, RFx, PO, GRN, Invoice**

Switch between nine roles to play each person in the chain. A record created in one stage shows up in the next, every action is checked against policy, and every step lands in an audit trail.

**Everything in it is fictional.** The suppliers, prices, people and quantities are made up. It is a teaching and portfolio model, not a copy of any company's system.

## What it shows

| Stage | What happens | Rules enforced |
|---|---|---|
| Project (optional) | The Requester groups the requests that must land by one date | Target date and criticality required. Downtime cost per day optional |
| Request | A requester asks for an item | Approval route set by value, item type and budget |
| PR | Issued after the last approval | Approvals must happen in order by the right role |
| RFx | Invite suppliers, collect quotes, technical evaluation by the user side, compare acceptable offers on one adjusted price (bonus and malus), Buyer recommends, leadership approves | Two bidders or a sole source reason. Offers that fail the technical check, unqualified suppliers and suppliers with expired documents cannot win. Expired quotes cannot be awarded. Off ranking awards need a written reason. Director approves every award; the Executive too from $50,000 or for a single bid, a conditional supplier or an off ranking pick |
| Contract | Buyer drafts a rate contract: supplier, agreed prices, dates and a value cap | Director approves, plus the Executive from $50,000. Qualified supplier with current documents. One contract per item at a time |
| PO | Issue from an award, as a release from an active contract, or as a direct buy | RFx required at $10,000 or more with no active contract. A release must fit in what is left of the contract cap. PO capped at 10% over the approved value. A price more than 10% above the contract or standard price needs a reason |
| GRN | Warehouse posts accepted, rejected or held goods | No over receipt. Held goods wait for Quality |
| Service entry | Requester records monthly service work from the site log, approvers release it by value | Manager always, Director from $5,000, Executive from $10,000, in order. Cannot pass the ordered quantity. Warns above 80% used. Only released service can be invoiced |
| Invoice | Exact three way match against PO and receipts or accepted service | Price and quantity must agree. Duplicates are caught. Each gap goes to a named fix owner |

Spend categories are Direct (raw materials, components, packaging) and Indirect (MRO, services). Items are generic examples from different industries, so the tool is not tied to one business.

Approval route: Manager always. Quality for items flagged for inspection. Engineering for engineered components. Director from $5,000. Executive from $50,000, or whenever the request would take its cost center past budget.

### Controls added in the second version

- **Budget by cost center.** Paid, ordered, requested and remaining for each, on the dashboard. Going over budget adds the Executive.
- **Spend by category.** All four categories always shown, with committed spend (issued POs) and pipeline (requests not yet ordered) side by side.
- **Technical evaluation and award approval.** When bidding closes, the user side checks each offer against the spec before purchase compares prices: Engineering for engineered components, Quality for items flagged for inspection, the Requester for everything else. The reviewer marks each offer acceptable or not, with a reason when it fails, and does not see prices. This replaces asking for a technical recommendation by email. The Buyer then recommends a supplier among the acceptable offers, and the award goes for approval: the Director always, plus the Executive from $50,000 or for a single bid, a conditional supplier or a pick that is not the top acceptable offer. A rejection goes back to the Buyer with the reason. The Manager approves the request, not the award.
- **Landed cost.** Quotes carry a tariff percentage and freight per unit. Ranking uses landed cost, so a tariff can change the winner.
- **Adjusted price (bonus and malus).** Offers are ranked on one adjusted price per unit, not a points score: landed cost plus a dollar value for each difference that is not in the price. Payment terms longer than standard earn a bonus at the cost of capital. A conditional supplier carries the one time cost of extra checks. Schedule risk is priced per day short of a buffer before the need date, planned on the supplier's usual slip. A supplier rating below target carries a cost per point. This is the total cost of ownership approach used in strategic sourcing. The defaults (8% a year, net 45, $600, 10 days at 0.5%, rating 85 at 0.2%) are editable per RFx while bidding is open and lock when it closes, so they cannot be tuned after the prices are known. They are a buyer's estimates, not measured costs.
- **Best and final round.** After the technical review the RFx suggests a next step from the number of eligible offers and the gap between them: negotiate directly when there is one, or run one best and final round when there are two or more. It is a rule of thumb, not a calculated optimum. Round 2 invites only the eligible offers. Each supplier gets an email draft with its own rank and its own round 1 offer, never another supplier's. Round 1 offers stay binding, so a round 2 offer can only lower the price, shorten the lead time or lengthen the terms; the app refuses anything worse. One round only. The Buyer enters the replies, because there is no supplier portal, and the RFx, the award approval and the record page show what round 2 saved. A live auction would need a backend and is not built.
- **Quote validity.** Quotes expire. An expired quote must be revalidated before an award or PO.
- **Supplier documents.** Quality certificate, origin declaration and (for raw materials and components) a sub tier disclosure, each with an expiry date. Expired or missing documents block awards and POs until Quality records a renewal on the Suppliers tab.
- **Projects.** ERPs show one document at a time. A pump overhaul or a shutdown involves many: requests, an RFx, POs, a crane booking, technician hours. A project groups them and shows the job as one thing: each item's step, who holds it and for how long, the date it should be in place, and the one item holding the whole job up. The Requester creates the project with a target date and a criticality. A downtime cost per day is optional, because a maintenance engineer rarely knows it; it usually comes from production planning or plant finance. With it the app shows what the delay costs, and without it the delay is shown in days. Projects are optional, so everyday buying is unchanged. Each project has its own record page, such as `#PRJ-9001`. The demo has five, each held up by something different: a supplier, a quality hold, an approval, or nothing. Promised dates are not taken at face value: each supplier has a delivery record (promised against received, from receipts here and history brought in from before), and once it has 3 or more deliveries the project plans on the supplier's usual slip and shows both dates. A service booked before the rest can be ready, such as a crane, is flagged as standing idle. The Buyer can open a chase draft for the item holding the project up. The Suppliers screen shows each record. The item card explains what is being bought (below).
- **Item cards and lessons learned.** A buyer is often not the engineer. Every item has a card, such as `#MR-203`: what it is and where it is used, a labeled schematic where one helps (a drawing, not a photo, so it cannot show the wrong part), the specs that matter and why, and what to ask the supplier. The card also keeps what went wrong before. Engineering, Quality and the Requester log lessons (what happened, why, what to do next time), and failed technical reviews and rejected or held receipts are added on their own. A request or RFx for an item with lessons says so before the spec is written. The card flags items in the master that look like the same part under another number; the app has no stock levels, so it cannot say what is on hand. The guide is kept current in the app: Engineering and Quality edit it, each change needs a reason and becomes a new version with who made it and when, and the card flags lessons logged since the guide last changed. Written guides exist for the ten demo items used in projects; Engineering or Quality can write one for any other item. Drawings are not edited in the app. Drafting guides with AI would need a backend or the user's own API key.
- **Contracts and releases.** A rate contract fixes the supplier and price for some items, for a period, up to a value cap, the way plants run annual rate contracts. The Buyer drafts it on the Contracts screen. The Director approves it, plus the Executive from $50,000. Requests for contract items still go through approval for budget control. Once approved, the Buyer releases them from the contract at the agreed rate, with no RFx. Each release is a normal PO, so receipts, service entries, invoices and the three way match work as before. The contract shows released, received, invoiced and remaining value, warns above 80% used and within 60 days of its end, and blocks a release that would pass its cap. When it ends or the cap is used up, its items go back to normal sourcing. A blanket order is the same idea, so contracts cover both goods and services. There is no contract amendment yet: to extend one, draft a new contract that starts after the old one ends.
- **Price against reference.** Every PO is compared with the active contract rate or the standard price. Above 10% it needs a written reason.

- **Expedite and email drafts.** A ranked list of overdue, late, at risk and unconfirmed POs. The Buyer gets an editable chase message built from the PO, and opens it in their own mail program, Gmail or Outlook, copies it, or downloads a draft file. The app does not send mail and cannot tell if it was sent, so the audit trail says "drafted", never "sent". Sending from the app itself would need a small backend and is not built.

- **CSV import and export.** Every screen with records has Export CSV, which downloads what sits behind that screen as a file Excel or Google Sheets can open. Six screens also have Import CSV, for data that usually arrives in a spreadsheet: requests (Requester), supplier quotes (Buyer), supplier date confirmations (Buyer), goods receipts (Warehouse), supplier invoices (Accounts Payable), and supplier emails (Buyer) or document renewals (Quality). Each row runs through the same rules and role check as the form. If any row fails, nothing is imported and every problem is listed by row. Each import has a template with the headings, and dates can be 2026-12-15 or 12/15/2026. Import adds new records and actions. It does not edit or delete existing records, and you cannot import POs, awards or approvals, because those are decisions made on the screen.

- **Record pages.** Every request, PR, RFx, PO, receipt and invoice has its own page with its own link, such as `#PO-4001`. The page shows the key facts, the document flow from request to invoice with each step linked, and sections for details, price, approvals, receipts, invoices and history. Every record number in a table is a link to its page. Pages are for reading. The "Work on it" button opens the record on its own screen, where the actions are. The browser Back button returns to where you were.

- **Role focus.** The sidebar is grouped for the role you are working as. "Your work" lists the screens where that role acts. "View only" lists the screens it follows, such as Purchase orders for Accounts Payable. The rest sit under "More screens", one click away, so nothing is hidden. A view only screen says so under its title and names who works there. The Manager, Director and VP follow every screen and act only on approvals. Requests opens on the role's own slice: the Requester's own requests, what waits on an approver, or approved PRs for the Buyer. Purchase orders opens on what is still due in for the Warehouse. Import CSV shows only to the role that can run it. This sets focus only. The workflow rules still decide who can act.
- **Charts and the oversight home.** The dashboard has four charts: budget by cost center (committed and pipeline against the budget line), spend by category, delivery health and invoices by status. Hover, focus or tap a bar to see its exact value. Clicking a delivery or invoice state opens that list, already filtered. The numbers come from the same engine figures as the tables. The Manager, Director and VP get an Oversight home instead: approvals first, then the charts, invoice exceptions by value with their fix owners, the KPI tiles and the late list. Charts are plain HTML and CSS, with no library. There is no spend over time chart yet, because the demo has too little history to make one honest.
- **Service POs and consumption.** Material POs are cleared by receipt. Service POs are used up over time. A service item, such as technician labor per man hour, mobile crane hire per day, scaffold rental per week or a compressor maintenance contract per month, is ordered as a quantity at a rate. Each month the Requester, who sees the work on site, records a service entry from the site log and the supplier's timesheet or day sheet. The Manager releases it. From $5,000 the Director releases it too, and from $10,000 the Executive as well, in that order. Any of them can send it back to the Requester with a reason. The person who records an entry never releases it. The PO shows ordered, accepted, waiting and remaining value, and warns above 80% used. An entry cannot take the PO past its ordered quantity. Service invoices match exactly against released, not yet invoiced service. The Invoices screen lists every invoice waiting on a receipt or a service confirmation, with who has to act. Service POs are not on the delivery health or expedite lists, because they have no single delivery date. Each entry has its own record page, such as `#SES-7001`. Contracts and blanket orders with releases come next.
- **Search.** A search box in the header, also opened with Ctrl K, Cmd K or the / key. It finds any request, PR, RFx, PO, receipt, service entry or invoice by its number, the supplier's invoice number, the supplier, the item or a status such as late, at risk or hold. It also finds suppliers and screens. Every word typed must match. Enter opens the record page. With the box empty it shows the records you opened last, kept in this browser only.

Delivery health on the dashboard compares each supplier promise date with the need by date. Under 5 days of slack is At Risk. Below zero is Late.

## Industry problems it responds to, and its limits

| Problem | What the model does |
|---|---|
| Invoice exceptions. One benchmark (Ardent Partners 2025, quoted by [Tellius](https://www.tellius.com/resources/blog/blocked-invoices-three-way-match-linkage)) puts the average rate at 18.4% of invoices | Names a fix owner for every exception and tracks the first time match rate |
| Slower supplier deliveries ([US procurement survey](https://procurementmag.com/news/procurement-leaders-handle-volatility-as-us-factories-expand)) | Slack against need by date on every PO, schedule risk priced in the RFx |
| Tariffs and price volatility (same survey) | Landed cost ranking, quote expiry, price against reference |
| Compliance paperwork. Vendors often cannot share sub component details ([Energy Storage News](https://www.energy-storage.news/experts-weigh-in-on-navigating-supply-chain-bottlenecks-in-us-energy-storage/)) | Documents with expiry dates that gate awards and POs |

**Where it stops.** It tracks documents but does not verify them. It sees only the direct supplier, not sub suppliers. Invoice matching is exact, with no tolerance rules. There is no currency, customs classification or long lead time planning. A real system would need all of these.

## Try it

Open `index.html` in a browser. There is no install and no build step. The Guide tab has a six step walk through from a request to a paid invoice.

Data is saved in your browser only. The Reset demo button restores the starting data.

## Put it online with GitHub Pages

1. Create a public repo and upload everything in this folder.
2. Settings, then Pages. Set the source to "Deploy from a branch", pick `main` and `/ (root)`, and save.
3. After a minute the site is at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

## How it is built

Plain HTML, CSS and JavaScript. No framework and no dependencies. The Inter font file is included in `fonts/` under the SIL Open Font License.

- `js/data.js` holds reference data: roles, suppliers, items, budgets, thresholds.
- `js/logic.js` is the workflow engine. Pure functions with no page code, so the same rules run in the browser and in tests.
- `js/seed.js` builds the demo data by running the real workflow actions with back dated timestamps, so every demo record obeys the same rules a live user would face.
- `js/search.js` finds and ranks records, suppliers and screens. `js/search-ui.js` draws the search panel.
- `js/charts.js` builds the dashboard charts as plain HTML.
- `js/csv.js` reads and writes CSV, builds each export, and maps each import row to a workflow action.
- `js/app.js` is the shell: role switching, tabs, saving, error messages.
- `js/csv-ui.js` draws the CSV bar and import panel at the top of each screen.
- `js/view-*.js` is one file per screen. `js/view-record.js` draws the full page for any record.

## Tests

GitHub runs every suite below on each pull request and each push to main (`.github/workflows/tests.yml`). The pull request shows a green check when all pass, or a red cross with the failing suite named.

```
node tests/logic.test.js
```

runs 83 checks on the workflow engine, and

```
node tests/csv.test.js
```

runs 28 checks on CSV reading, writing, export and import, and `node tests/search.test.js` runs 15 checks on search. The screen tests drive the real page in a simulated browser and need jsdom:

```
mkdir ../jsdom-tmp && cd ../jsdom-tmp && npm install jsdom && cd -
for f in ui-smoke ui-requests ui-rfx ui-pos ui-grn ui-invoices ui-controls ui-expedite ui-e2e ui-csv ui-records ui-shell ui-search ui-roles ui-dashboard ui-services ui-contracts ui-projects ui-items; do node tests/$f.js "$PWD/../jsdom-tmp"; done
```

`ui-e2e.js` takes one request through all six stages to a paid invoice using only the screens. `ui-controls.js` covers budgets, landed cost, quote validity, supplier documents and price variance. `ui-csv.js` covers the CSV bar, the import panel and a real file pick. `ui-records.js` covers the sidebar, record pages, document flow links and links in the address. `ui-shell.js` covers the Working as menu, by mouse and keyboard. `ui-search.js` covers the search panel. `ui-roles.js` covers the sidebar groups, view only lines and each role's default slice. `ui-dashboard.js` covers the charts, their tooltips and clicks, and the oversight home. `ui-services.js` covers service entries, the release chain, the usage warning and the clearing list. `ui-contracts.js` covers drafting and approving contracts, releases from a contract and the return to normal sourcing. `ui-projects.js` covers the project list, the project map, creating a project and adding requests to it. `ui-round2.js` covers the best and final round: the suggested step, rank only drafts, the binding rule and the saving. `ui-items.js` covers the item card, logging a lesson, where lessons show up, and editing the guide.

## Natural next steps

- Contract amendments: extend the end date or raise the cap with a fresh approval.
- Invoice tolerance rules.
- Supplier scorecards built from receipt and invoice history.
- Sign in, and a shared backend so more than one person can use the same data.
