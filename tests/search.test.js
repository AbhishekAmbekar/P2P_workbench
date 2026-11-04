/* Run with: node tests/search.test.js
 * Checks what the search finds and in what order. */
const assert = require("assert");
const P = require("../js/logic.js");
const seed = require("../js/seed.js");
const S = require("../js/search.js");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("ok    " + name); }
  catch (e) { failed++; console.log("FAIL  " + name + "\n      " + e.message); }
}

const NOW = "2026-10-26T14:00:00.000Z";
const s = seed(NOW);
const TABS = [{ id: "dashboard", label: "Dashboard" }, { id: "requests", label: "Requests and PRs" }, { id: "rfx", label: "RFx" },
  { id: "pos", label: "Purchase orders" }, { id: "expedite", label: "Expedite" }, { id: "grn", label: "Receipts (GRN)" },
  { id: "invoices", label: "Invoices" }, { id: "suppliers", label: "Suppliers" }, { id: "audit", label: "Audit trail" }, { id: "guide", label: "Guide" }];
const find = q => S.search(s, q, NOW, TABS);
const ids = q => find(q).map(e => e.id);

test("a full record number goes straight to the top, in any letter case", () => {
  ["PO-4001", "po-4001", "RFX-3002", "GRN-5003", "INV-6002"].forEach(q => assert.strictEqual(ids(q)[0], q.toUpperCase(), q));
});

test("a request is found by its PR number or its request number", () => {
  assert.strictEqual(find("PR-2001")[0].open, "PR-2001");
  assert.strictEqual(find("REQ-1001")[0].open, "PR-2001");
});

test("an invoice is found by the supplier's own invoice number", () => {
  assert.strictEqual(ids("MM-20413")[0], "INV-6002");
});

test("part of a number lists every record that starts with it, newest first", () => {
  const r = ids("po-40").filter(x => /^PO-/.test(x));
  assert.deepStrictEqual(r, ["PO-4010", "PO-4009", "PO-4008", "PO-4007", "PO-4006", "PO-4005", "PO-4004", "PO-4003", "PO-4002", "PO-4001"]);
});

test("a contract number or the word contract finds contracts", () => {
  assert.strictEqual(ids("ct-8002")[0], "CT-8002");
  assert.ok(ids("contract scaffold").indexOf("CT-8003") >= 0, "finds the scaffold contract by item");
});

test("a supplier name finds the supplier first, then its orders and sourcing", () => {
  const r = find("northfield");
  assert.strictEqual(r[0].kind, "Supplier");
  assert.ok(r.slice(1, 3).every(e => e.kind === "PO"), "POs next, got " + r.slice(1, 3).map(e => e.kind));
  assert.ok(r.some(e => e.kind === "RFx") && r.some(e => e.kind === "Invoice"));
});

test("delivery health and status words find the matching records", () => {
  assert.deepStrictEqual(ids("late").filter(x => /^PO-/.test(x)), ["PO-4006"]);
  assert.deepStrictEqual(ids("at risk").sort(), ["PO-4001", "PO-4007"]);
  assert.ok(ids("hold").indexOf("GRN-5003") >= 0);
  assert.ok(ids("exception").indexOf("INV-6002") >= 0);
});

test("an item name or code finds the records for that item", () => {
  const r = find("bearing");
  assert.strictEqual(r[0].id, "PO-4004");
  assert.ok(r.some(e => e.kind === "Request"));
  assert.ok(ids("RM-101").indexOf("PO-4001") >= 0);
});

test("every word must match, so more words narrow the list", () => {
  const all = find("meridian").length, narrow = find("meridian gloves");
  assert.ok(narrow.length > 0 && narrow.length < all);
  assert.ok(narrow.every(e => /glove/i.test(e.words + e.sub)));
});

test("screens are found by their name or other words for them", () => {
  assert.strictEqual(ids("receipts")[0], "grn");
  assert.strictEqual(find("accounts payable").find(e => e.kind === "Screen").id, "invoices");
  assert.strictEqual(find("vendor").find(e => e.kind === "Screen").id, "suppliers");
});

test("a supplier with expired documents can be found by that", () => {
  assert.ok(ids("expired").indexOf("kestrel") >= 0);
});

test("nothing matches nonsense, and an empty box returns nothing", () => {
  assert.deepStrictEqual(find("xyzzy"), []);
  assert.deepStrictEqual(find("   "), []);
});

test("results stop at the limit", () => {
  assert.ok(find("e").length <= S.LIMIT);
});

test("search reads the data and never changes it", () => {
  const before = JSON.stringify(s);
  find("po"); find("northfield late");
  assert.strictEqual(JSON.stringify(s), before);
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
