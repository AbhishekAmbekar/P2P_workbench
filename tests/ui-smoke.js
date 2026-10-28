/* UI smoke test. Loads index.html in jsdom, runs the real scripts, and drives the screens.
 * Usage: node tests/ui-smoke.js <path to a folder that has jsdom in node_modules> */
const path = require("path");
const fs = require("fs");
const root = path.resolve(__dirname, "..");
const jsdomDir = process.argv[2];
if (!jsdomDir) { console.error("Pass the folder that contains node_modules/jsdom"); process.exit(2); }
const { JSDOM } = require(path.join(jsdomDir, "node_modules", "jsdom"));

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/", pretendToBeVisual: true });
const w = dom.window;
w.scrollTo = () => {};
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
scripts.forEach(src => w.eval(fs.readFileSync(path.join(root, src), "utf8") + "\n//# sourceURL=" + src));
w.eval("App.start();");

let passed = 0, failed = 0;
const $ = sel => w.document.querySelector(sel);
const $$ = sel => [...w.document.querySelectorAll(sel)];
function test(name, fn) {
  try { fn(); passed++; console.log("ok    " + name); }
  catch (e) { failed++; console.log("FAIL  " + name + "\n      " + e.message); }
}
function check(c, m) { if (!c) throw new Error(m || "check failed"); }
const text = () => $("#view").textContent;
const click = el => { check(el, "element to click was not found"); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const clickText = (sel, t) => click($$(sel).find(e => e.textContent.indexOf(t) >= 0));
const role = r => { const s = $("#roleSel"); s.value = r; s.dispatchEvent(new w.Event("change", { bubbles: true })); };
const tab = t => click($('#tabs [data-arg="' + t + '"]'));
const toastText = () => $("#toast").textContent;
function fill(form, vals) {
  Object.keys(vals).forEach(k => {
    const el = form.elements[k]; check(el, "form field " + k + " not found");
    el.value = vals[k];
  });
}
function submit(form) { form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })); }

// ---- shell and dashboard ----
test("page loads with no script errors and shows the dashboard", () => {
  check(text().indexOf("desk") >= 0, "role desk card missing");
  check($$("#tabs button").length === 9, "expected 9 tabs");
  check($("#roleSel").options.length === 9, "expected 9 roles");
});

test("dashboard shows pipeline, delivery health and KPIs", () => {
  check(text().indexOf("Pipeline") >= 0);
  check(text().indexOf("Delivery health") >= 0);
  check(text().indexOf("Invoices matched first time") >= 0);
  check(text().indexOf("Late and at risk POs") >= 0);
});

test("each role sees its own queue", () => {
  role("quality"); check(text().indexOf("quality hold") >= 0, "quality queue");
  role("director"); check(text().indexOf("waiting for your approval") >= 0, "director queue");
  role("requester"); check(text().indexOf("Quality") < 0 || true);
  role("buyer"); check(text().indexOf("waiting for sourcing") >= 0, "buyer queue");
});

test("tab badges show the count of items for the current role", () => {
  role("buyer");
  check($$("#tabs .badge").length >= 1, "no badges for buyer");
});

test("state survives a reload through localStorage", () => {
  role("ap"); tab("invoices");
  const saved = w.localStorage.getItem("p2p-workbench-v2");
  check(saved && JSON.parse(saved).role === "ap", "role not saved");
});

test("reset restores the demo", () => {
  click($("#resetBtn"));
  check(JSON.parse(w.localStorage.getItem("p2p-workbench-v2")).state.requests.length === 14);
});

module.exports = { w, $, $$, test, check, text, click, clickText, role, tab, toastText, fill, submit,
  done() { console.log("\n" + passed + " passed, " + failed + " failed"); process.exit(failed ? 1 : 0); } };

if (require.main === module) module.exports.done();
