# P2P Workbench: notes for working on this project

A procure to pay web app: request, PR approval, RFx, PO, goods receipt, invoice, plus an Expedite tab for chasing suppliers. It is a portfolio project that should also be useful to anyone who buys things. Plain HTML, CSS and JavaScript. No framework and no build step. Hosted on GitHub Pages from the `main` branch. All data is fictional.

## How to work here

- Work on a branch and open a pull request. Do not push to `main`. The owner reviews and merges, and the live site rebuilds from `main`.
- Change only what the request needs. Edit files in place. Do not regenerate the whole project.
- Run every test suite before committing (commands below). Add tests for new rules.
- Keep the guide screen (`js/view-guide.js`) and `README.md` in step with what the app does. Update the check count in the README when tests are added.
- Do not claim more than the app does. Be honest in the UI text and the README about limits.

## Structure

- `index.html` loads the scripts in a fixed order: `data.js`, `logic.js`, `csv.js`, `seed.js`, `app.js`, `csv-ui.js`, the `view-*.js` files, then `App.start()`. Check for duplicate script tags when adding a file.
- `js/data.js`: reference data. Thresholds, roles, cost centers and budgets, spend categories, suppliers, items.
- `js/logic.js`: the workflow engine. Pure functions on a state object. Every action checks the role and throws a readable `Error` when a rule is broken. Nothing here touches the page.
- `js/csv.js`: CSV reader and writer, one export per screen, and the import specs. Pure, like `logic.js`. Each import row calls an engine action, never writes records directly. Imports run on a copy of the state and keep it only if every row passed.
- `js/seed.js`: builds the demo by running real engine actions with backdated times.
- `js/app.js`: shell, role switch, tabs, saving to localStorage, and `App.run`, which runs an engine action, saves, redraws and shows a message or the error.
- `js/csv-ui.js`: the CSV bar and import panel. `App.render` puts the bar above every screen that has an export or import.
- `js/view-*.js`: one file per screen. Events use `data-act`, `data-form` and `data-change` attributes and `App.actions.*`.
- `css/style.css`: styling, with dark mode. `.wrap` around wide tables keeps phones from scrolling sideways.
- `tests/`: engine checks and screen tests.

## Rules the app enforces (keep these true)

- Approval chain: Manager always. Quality or Engineering when the item is flagged. Director from $5,000. Executive from $50,000, or when the request would take its cost center over budget.
- An RFx is needed from $10,000 unless a contract exists. A PO may exceed the approved PR value by 10% at most. A PO price more than 10% above the contract or standard price needs a written reason.
- RFx ranking uses landed cost (price, tariff, freight), lead time and supplier quality. Weights add up to 100. Unqualified suppliers cannot win. A conditional supplier, a single bid or a pick that is not top ranked needs a justification.
- Expired quotes and expired or missing supplier documents block the award and the PO.
- Receipts can be partial. Over receipt is blocked. Rejected units do not count as received. Units on quality hold count as received until Quality decides.
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
```

The screen tests need jsdom installed in a folder outside the repo. Pass an absolute path, because the tests resolve it from the `tests` folder:

```
mkdir ../jsdom-tmp && cd ../jsdom-tmp && npm install jsdom && cd -
for f in ui-smoke ui-requests ui-rfx ui-pos ui-grn ui-invoices ui-controls ui-expedite ui-e2e ui-csv; do node tests/$f.js "$PWD/../jsdom-tmp"; done
```

Also check the phone width (390 px) for sideways scrolling after layout changes.

## Planned next

1. A way to start with an empty workspace. (CSV import and export is done.)
2. A settings screen: cost centers, categories, thresholds and users editable, not fixed in code.
3. Supplier scorecard from receipt and invoice history.
4. Contracts with dates and remaining volume, blanket orders and releases.
5. Returns and credit notes for rejected goods.
6. Reorder points and safety stock for MRO items.
7. Spend analysis over time, and a planning view (requirements against stock and open POs) as a separate module.

Not planned without a backend: sending mail from the app, supplier login or quote portal, shared data between users, reading email replies.
