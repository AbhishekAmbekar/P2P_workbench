/* Drives the search panel. Usage: node tests/ui-search.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, click } = t;

const panel = () => $("#sp");
const input = () => $("#spq");
const type = v => { input().value = v; input().dispatchEvent(new w.Event("input", { bubbles: true })); };
const key = (el, k, extra) => el.dispatchEvent(new w.KeyboardEvent("keydown", Object.assign({ key: k, bubbles: true, cancelable: true }, extra || {})));
const rows = () => $$("#spres li[data-i]");

click($("#resetBtn"));
w.localStorage.removeItem("p2p-workbench-recent");

test("the header has a search box that opens the panel", () => {
  check($("#searchBtn") && $("#searchBtn").textContent.indexOf("Search") >= 0, "box missing");
  click($("#searchBtn"));
  check(panel() && !panel().hidden, "panel should open");
  check(w.document.activeElement === input(), "typing box should have focus");
  check($("#spres").textContent.indexOf("Type a record number") >= 0, "empty hint");
});

test("Escape closes it, Ctrl K and / open it", () => {
  key(input(), "Escape");
  check(panel().hidden, "escape");
  key(w.document.body, "k", { ctrlKey: true });
  check(!panel().hidden, "ctrl k");
  key(input(), "Escape");
  key(w.document.body, "/");
  check(!panel().hidden, "slash");
  key(input(), "Escape");
});

test("/ does not open search while typing in a form field", () => {
  t.role("requester"); t.tab("requests");
  click($$("#view button").find(b => b.textContent === "New request"));
  const reason = $('form[data-form="reqSubmit"] textarea[name="reason"]');
  key(reason, "/");
  check(panel().hidden, "should stay closed");
});

test("typing lists matches with their kind and status", () => {
  w.App.searchOpen();
  type("northfield");
  check(rows().length >= 5, "rows " + rows().length);
  check(rows()[0].textContent.indexOf("Supplier") >= 0 && rows()[0].textContent.indexOf("Northfield Metals") >= 0, "supplier first");
  check(rows()[0].classList.contains("on"), "first row highlighted");
  check($$("#spres .pill").length >= 5, "status pills");
});

test("arrows move and Enter opens the highlighted record page", () => {
  type("po-4001");
  check(rows()[0].textContent.indexOf("PO-4001") >= 0);
  key(input(), "Enter");
  check(panel().hidden, "closes");
  check($("#view h2").textContent === "PO-4001" && w.location.hash === "#PO-4001", "record opened");
  w.App.searchOpen(); type("rfx-30");
  key(input(), "ArrowDown");
  check(rows()[1].classList.contains("on"), "second row highlighted");
  const id = w.App.searchResults()[1].id;
  key(input(), "Enter");
  check($("#view h2").textContent === id, "opened " + id);
});

test("clicking a screen result goes to that screen", () => {
  w.App.searchOpen(); type("receipts");
  click(rows()[0]);
  check(w.App.tab === "grn" && !w.App.sel.rec, "on receipts");
});

test("an empty box shows records opened recently, newest first", () => {
  w.App.searchOpen();
  const heads = $$("#spres .sp-head").map(h => h.textContent);
  check(heads[0] === "Recently opened", "heading " + heads);
  check(rows()[0].textContent.indexOf("RFX-") >= 0 && rows()[1].textContent.indexOf("PO-4001") >= 0, "order");
  key(input(), "Escape");
});

test("no match says so plainly", () => {
  w.App.searchOpen(); type("xyzzy");
  check(rows().length === 0 && $("#spres").textContent.indexOf("Nothing matches") >= 0);
  key(input(), "Escape");
});

t.done();
