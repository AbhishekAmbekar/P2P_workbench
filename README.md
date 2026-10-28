# P2P Workbench

A working model of the procure to pay cycle for a manufacturer. Six linked stages:

**Request, PR, RFx, PO, GRN, Invoice**

Switch between nine roles to play each person in the chain. A record created in one stage shows up in the next, every action is checked against policy, and every step lands in an audit trail.

**Everything in it is fictional.** The suppliers, prices, people and quantities are made up. It is a teaching and portfolio model, not a copy of any company's system.

## What it shows

| Stage | What happens | Rules enforced |
|---|---|---|
| Request | A requester asks for an item | Approval route set by value, item type and budget |
| PR | Issued after the last approval | Approvals must happen in order by the right role |
| RFx | Invite suppliers, collect quotes, score on landed cost, award | Two bidders or a sole source reason. Unqualified suppliers and suppliers with expired documents cannot win. Expired quotes cannot be awarded. Off ranking awards need a written reason |
| PO | Issue from an award, a contract or a direct buy | RFx required at $10,000 or more with no contract. PO capped at 10% over the approved value. A price more than 10% above the contract or standard price needs a reason |
| GRN | Warehouse posts accepted, rejected or held goods | No over receipt. Held goods wait for Quality |
| Invoice | Exact three way match against PO and receipts | Price and quantity must agree. Duplicates are caught. Each gap goes to a named fix owner |

Spend categories are Direct (raw materials, components, packaging) and Indirect (MRO). Items are generic examples from different industries, so the tool is not tied to one business.

Approval route: Manager always. Quality for items flagged for inspection. Engineering for engineered components. Director from $5,000. Executive from $50,000, or whenever the request would take its cost center past budget.

### Controls added in the second version

- **Budget by cost center.** Paid, ordered, requested and remaining for each, on the dashboard. Going over budget adds the Executive.
- **Spend by category.** All four categories always shown, with committed spend (issued POs) and pipeline (requests not yet ordered) side by side.
- **Landed cost.** Quotes carry a tariff percentage and freight per unit. Ranking uses landed cost, so a tariff can change the winner.
- **Quote validity.** Quotes expire. An expired quote must be revalidated before an award or PO.
- **Supplier documents.** Quality certificate, origin declaration and (for raw materials and components) a sub tier disclosure, each with an expiry date. Expired or missing documents block awards and POs until Quality records a renewal on the Suppliers tab.
- **Price against reference.** Every PO is compared with the contract or standard price. Above 10% it needs a written reason.

Delivery health on the dashboard compares each supplier promise date with the need by date. Under 5 days of slack is At Risk. Below zero is Late.

## Industry problems it responds to, and its limits

| Problem | What the model does |
|---|---|
| Invoice exceptions. One benchmark (Ardent Partners 2025, quoted by [Tellius](https://www.tellius.com/resources/blog/blocked-invoices-three-way-match-linkage)) puts the average rate at 18.4% of invoices | Names a fix owner for every exception and tracks the first time match rate |
| Slower supplier deliveries ([US procurement survey](https://procurementmag.com/news/procurement-leaders-handle-volatility-as-us-factories-expand)) | Slack against need by date on every PO, lead time scored in the RFx |
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

Plain HTML, CSS and JavaScript. No framework and no dependencies.

- `js/data.js` holds reference data: roles, suppliers, items, budgets, thresholds.
- `js/logic.js` is the workflow engine. Pure functions with no page code, so the same rules run in the browser and in tests.
- `js/seed.js` builds the demo data by running the real workflow actions with back dated timestamps, so every demo record obeys the same rules a live user would face.
- `js/app.js` is the shell: role switching, tabs, saving, error messages.
- `js/view-*.js` is one file per screen.

## Tests

```
node tests/logic.test.js
```

runs 38 checks on the workflow engine. The screen tests drive the real page in a simulated browser and need jsdom:

```
mkdir ../jsdom-tmp && cd ../jsdom-tmp && npm install jsdom && cd ../p2p-workbench
for f in ui-smoke ui-requests ui-rfx ui-pos ui-grn ui-invoices ui-controls ui-e2e; do node tests/$f.js ../jsdom-tmp; done
```

`ui-e2e.js` takes one request through all six stages to a paid invoice using only the screens. `ui-controls.js` covers budgets, landed cost, quote validity, supplier documents and price variance.

## Natural next steps

- Invoice tolerance rules and a blanket order with releases.
- Supplier scorecards built from receipt and invoice history.
- Sign in, and a shared backend so more than one person can use the same data.
