/* Drives the dashboard charts and the oversight home. Usage: node tests/ui-dashboard.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, role, tab } = t;

const P = w.App.P;
const h2 = () => $("#view h2").textContent;
const card = title => $$("#view .card").find(c => { const h = c.querySelector("h3"); return h && h.textContent.indexOf(title) === 0; });

click($("#resetBtn"));

test("everyone gets the four charts with legends", () => {
  role("buyer"); tab("dashboard");
  ["Budget by cost center", "Spend by category", "Delivery health", "Invoices"].forEach(n => check(card(n), "missing " + n));
  check(card("Budget by cost center").querySelectorAll(".hb-row").length === 4, "one row per cost center");
  check(card("Spend by category").querySelectorAll(".cc-group").length === 4, "one group per category");
  check(card("Budget by cost center").textContent.indexOf("Committed (issued POs)") >= 0, "legend");
});

test("chart numbers come from the engine, so they match the tables", () => {
  const m = P.metrics(w.App.state, w.App.now());
  const cc = m.budget[0];
  const tip = card("Budget by cost center").querySelector(".m-com").getAttribute("data-tip");
  check(tip.indexOf(w.App.money(cc.ordered).replace(/\.00$/, "")) >= 0, "committed tip " + tip);
  check(card("Budget by cost center").textContent.indexOf(cc.pct + "% of") >= 0, "percent label");
  const keys = $$("#view .ch-key").map(k => k.textContent.trim());
  check(keys.indexOf(m.ctb.Clear + " Clear") >= 0 && keys.indexOf(m.ctb["At Risk"] + " At risk") >= 0 && keys.indexOf(m.ctb.Late + " Late") >= 0, "delivery keys " + keys);
});

test("the spend axis tops out at a round number just above the largest bar", () => {
  const labels = $$("#view .cc-axis span").map(s => s.textContent);
  check(labels.join(",") === "$120k,$60k,$0", "axis " + labels);
});

test("a cost center with nothing committed draws no committed bar", () => {
  const row = $$("#view .hb-row").find(r => r.textContent.indexOf("CC-200") === 0);
  check(!row.querySelector(".m-com") && row.querySelector(".m-pipe"), "only pipeline");
});

test("focusing a bar shows its value in a tooltip", () => {
  const bar = card("Spend by category").querySelector(".m-pipe");
  bar.dispatchEvent(new w.FocusEvent("focusin", { bubbles: true }));
  check(w.App.tipText().indexOf("Raw materials: pipeline") === 0, "tip " + w.App.tipText());
});

test("clicking a delivery state opens Purchase orders on that slice", () => {
  click($$("#view .ch-key").find(k => k.textContent.indexOf("At risk") >= 0));
  check(w.App.tab === "pos" && w.App.sel.poFilter === "risk", "risk filter");
  check($$("#view tr[data-id]").length === 3, "three late or at risk POs");
});

test("the Director and VP get the oversight home", () => {
  role("executive"); tab("dashboard");
  check(h2() === "Oversight", h2());
  check($('#tabs [data-arg="dashboard"]').textContent.indexOf("Oversight") === 0, "sidebar label");
  const ex = card("Invoice exceptions by value");
  check(ex, "exceptions card");
  const ids = [...ex.querySelectorAll("a.rec")].map(a => a.dataset.id);
  check(ids.join() === "INV-6003,INV-6002", "largest first " + ids);
  check(ex.textContent.indexOf("Warehouse") >= 0 && ex.textContent.indexOf("Buyer") >= 0, "fix owners");
  role("director"); tab("dashboard");
  check(h2() === "Oversight");
  role("ap"); tab("dashboard");
  check(h2() === "Dashboard" && !card("Invoice exceptions by value"), "others keep the dashboard");
});

t.done();
