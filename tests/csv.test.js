/* Run with: node tests/csv.test.js
 * Checks the CSV reader and writer, every export, and every import against the engine rules. */
const assert = require("assert");
const P = require("../js/logic.js");
const seed = require("../js/seed.js");
const C = require("../js/csv.js");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("ok    " + name); }
  catch (e) { failed++; console.log("FAIL  " + name + "\n      " + e.message); }
}
function throwsWith(fn, text) {
  try { fn(); } catch (e) {
    assert.ok(e.message.indexOf(text) >= 0, "Expected error containing '" + text + "' but got '" + e.message + "'");
    return;
  }
  assert.fail("Expected an error containing '" + text + "' but nothing was thrown");
}

const NOW = "2026-10-26T14:00:00.000Z";
const day = n => P.addDays("2026-10-26", n);
const csv = rows => rows.map(r => r.join(",")).join("\n");
const run = (s, id, rows, role) => C.runImport(s, id, csv(rows), role, NOW, { requester: "Test", fileName: "test.csv" });

// An approved request for a contract item, ordered but not yet confirmed by the supplier.
function unconfirmedPO() {
  const s = P.newState();
  const r = P.createRequest(s, "requester", NOW, { requester: "T", itemId: "MR-402", qty: 50, estUnit: 9.4, needBy: day(30),
    site: "Plant A", costCenter: "CC-300 Maintenance", reason: "Bearings for line 2" });
  r.approvals.forEach(a => P.decide(s, a.role, NOW, r.id, "Approved", ""));
  const po = P.createPO(s, "buyer", NOW, r.id, { supplierId: "meridian", unitPrice: 9.1, leadDays: 10 });
  return { s, po };
}

// ---------- reading and writing ----------
test("reads quoted values with commas, doubled quotes and line breaks", () => {
  const rows = C.parse('a,b,c\r\n"x, y","say ""hi""","line 1\nline 2"\r\n');
  assert.deepStrictEqual(rows, [["a", "b", "c"], ["x, y", 'say "hi"', "line 1\nline 2"]]);
});

test("reads a file with a byte order mark, semicolons or tabs", () => {
  assert.deepStrictEqual(C.parse("﻿PO;Quantity\nPO-1;5"), [["PO", "Quantity"], ["PO-1", "5"]]);
  assert.deepStrictEqual(C.parse("PO\tQuantity\nPO-1\t5"), [["PO", "Quantity"], ["PO-1", "5"]]);
});

test("an unclosed quote is reported, not guessed", () => {
  throwsWith(() => C.parse('a,b\n"open,2'), "never closed");
});

test("writing quotes values that need it and guards against spreadsheet formulas", () => {
  const t = C.stringify([["a,b", 'q"t', "=SUM(A1)", "-5", -5, "@x", "plain"]]);
  assert.strictEqual(t, '"a,b","q""t",\'=SUM(A1),-5,-5,\'@x,plain\r\n');
});

test("what is written reads back the same", () => {
  const rows = [["Note", "Value"], ["Line one\nline two, with comma", "12.50"], ['He said "ok"', ""]];
  assert.deepStrictEqual(C.parse(C.stringify(rows)), rows);
});

// ---------- exports ----------
test("every screen with records has an export with headings and one row per record", () => {
  const s = seed(NOW);
  const counts = { dashboard: 4, requests: s.requests.length, pos: s.pos.length, grn: s.grns.length, invoices: s.invoices.length,
    suppliers: P.REF.suppliers.length, audit: s.audit.length, expedite: P.expediteList(s, NOW).length };
  Object.keys(counts).forEach(tab => {
    const f = C.exportCSV(s, tab, NOW), rows = C.parse(f.text);
    assert.strictEqual(rows.length - 1, counts[tab], tab + " row count");
    assert.strictEqual(f.rows, counts[tab], tab + " reported count");
    assert.ok(f.name.indexOf("2026-10-26.csv") > 0, tab + " file name");
  });
  assert.throws(() => C.exportCSV(s, "guide", NOW));
});

test("the RFx export has a row for every invited supplier, quoted or not", () => {
  const s = seed(NOW), rows = C.parse(C.exportCSV(s, "rfx", NOW).text);
  const invited = s.rfx.reduce((t, x) => t + x.invited.length, 0);
  assert.strictEqual(rows.length - 1, invited);
  const noQuote = rows.filter(r => r[0] === "RFX-3004" && r[10] === "No quote");
  assert.strictEqual(noQuote.length, 2);
});

test("the PO export shows status, receipts and delivery health", () => {
  const s = seed(NOW), rows = C.parse(C.exportCSV(s, "pos", NOW).text), h = rows[0];
  const po1 = rows.find(r => r[0] === "PO-4001");
  assert.strictEqual(po1[h.indexOf("Status")], "Partially received");
  assert.strictEqual(po1[h.indexOf("Accepted")], "1200");
  assert.strictEqual(po1[h.indexOf("PO value")], "83000.00");
});

// ---------- import checks that apply to every import ----------
test("an import is refused for the wrong role", () => {
  throwsWith(() => run(seed(NOW), "requests", [["Item"]], "buyer"), "is for the Requester role");
});

test("missing columns are named", () => {
  throwsWith(() => run(seed(NOW), "receipts", [["PO", "Note"], ["PO-4001", "x"]], "warehouse"), "Missing column: Quantity");
});

test("an empty file and a file with only headings are refused", () => {
  throwsWith(() => run(seed(NOW), "receipts", [[""]], "warehouse"), "empty");
  throwsWith(() => run(seed(NOW), "receipts", [["PO", "Quantity"]], "warehouse"), "no rows");
});

test("headings match in any case and with spaces or underscores", () => {
  const res = run(seed(NOW), "receipts", [["po_number", "QUANTITY"], ["PO-4006", "5"]], "warehouse");
  assert.ok(res.ok, JSON.stringify(res.errors));
});

test("one bad row means nothing is imported, and each problem names its row", () => {
  const s = seed(NOW), before = JSON.stringify(s);
  const res = run(s, "receipts", [["PO", "Quantity", "Result", "Note"], ["PO-4006", "5", "", ""], ["PO-9999", "1", "", ""], ["PO-4006", "99", "", ""]], "warehouse");
  assert.strictEqual(res.ok, false);
  assert.deepStrictEqual(res.errors.map(e => e.row), [3, 4]);
  assert.ok(res.errors[0].text.indexOf("PO-9999 was not found") >= 0);
  assert.ok(res.errors[1].text.indexOf("Over receipt") >= 0);
  assert.strictEqual(JSON.stringify(s), before, "the original data must not change");
});

test("a good import adds one audit entry saying where the rows came from", () => {
  const res = run(seed(NOW), "receipts", [["PO", "Quantity"], ["PO-4006", "5"], ["PO-4006", "5"]], "warehouse");
  const last = res.state.audit[res.state.audit.length - 1];
  assert.strictEqual(last.entity, "CSV import");
  assert.strictEqual(last.action, "Imported 2 receipts from test.csv");
});

test("blank lines are skipped and row numbers still match the file", () => {
  const res = run(seed(NOW), "receipts", [["PO", "Quantity"], [""], ["PO-9999", "1"]], "warehouse");
  assert.strictEqual(res.errors[0].row, 3);
});

// ---------- requests ----------
test("requests import raises requests with the same approval route as the form", () => {
  const s = seed(NOW);
  const res = run(s, "requests", [["Item", "Quantity", "Est unit price", "Need by", "Site", "Cost center", "Reason"],
    ["CP-202", "10", "$640.00", "12/15/2026", "plant a", "CC-200", "New line controls"],
    ["Sealed bearing 6205", "100", "9.40", day(20), "Plant B", "CC-300 Maintenance", "Spares"]], "requester");
  assert.ok(res.ok, JSON.stringify(res.errors));
  const added = res.state.requests.slice(-2);
  assert.deepStrictEqual(added[0].approvals.map(a => a.role), ["manager", "engineering", "director"]);
  assert.strictEqual(added[0].needBy, "2026-12-15");
  assert.strictEqual(added[0].site, "Plant A");
  assert.strictEqual(added[0].costCenter, "CC-200 Engineering");
  assert.strictEqual(added[1].itemId, "MR-402");
  assert.strictEqual(added[0].requester, "Test");
});

test("requests import applies the engine rules and the lookups", () => {
  const head = ["Item", "Quantity", "Est unit price", "Need by", "Site", "Cost center", "Reason"];
  const res = run(seed(NOW), "requests", [head,
    ["XX-1", "1", "1", day(5), "Plant A", "CC-100", "Reason here"],
    ["MR-405", "1.5", "84", day(5), "Plant A", "CC-100", "Reason here"],
    ["MR-405", "1", "84", day(-1), "Plant A", "CC-100", "Reason here"],
    ["MR-405", "1", "84", "next week", "Plant A", "CC-100", "Reason here"],
    ["MR-405", "1", "84", day(5), "Moon base", "CC-100", "Reason here"]], "requester");
  const t = res.errors.map(e => e.text);
  assert.ok(t[0].indexOf("Unknown item") >= 0);
  assert.ok(t[1].indexOf("whole number") >= 0);
  assert.ok(t[2].indexOf("in the past") >= 0);
  assert.ok(t[3].indexOf("is not a date") >= 0);
  assert.ok(t[4].indexOf("Unknown site") >= 0);
});

test("requests that together pass a budget escalate to the Executive in order", () => {
  const head = ["Item", "Quantity", "Est unit price", "Need by", "Site", "Cost center", "Reason"];
  const rows = [head];
  for (let i = 0; i < 6; i++) rows.push(["MR-203", "5", "910", day(30), "Plant A", "CC-400 Quality", "Pump overhaul"]);
  const res = run(seed(NOW), "requests", rows, "requester");
  assert.ok(res.ok, JSON.stringify(res.errors));
  const added = res.state.requests.slice(-6);
  assert.strictEqual(added[0].overBudget, false);
  assert.strictEqual(added[5].overBudget, true);
});

// ---------- quotes ----------
test("quotes import adds quotes to an open RFx by supplier name or ID", () => {
  const res = run(seed(NOW), "quotes", [["RFx", "Supplier", "Unit price", "Lead days", "Tariff %", "Freight per unit", "Valid until"],
    ["rfx-3004", "Helio Components", "37.50", "20", "5%", "0.40", ""],
    ["RFX-3004", "tidewater", "36", "25", "", "", day(40)]], "buyer");
  assert.ok(res.ok, JSON.stringify(res.errors));
  const x = res.state.rfx.find(r => r.id === "RFX-3004");
  assert.strictEqual(x.quotes.length, 3);
  const helio = x.quotes.find(q => q.supplierId === "helio");
  assert.strictEqual(helio.tariffPct, 5);
  assert.strictEqual(helio.validUntil, day(30));
});

test("quotes import refuses uninvited suppliers and closed RFx", () => {
  const res = run(seed(NOW), "quotes", [["RFx", "Supplier", "Unit price", "Lead days"],
    ["RFX-3004", "Northfield Metals", "30", "10"], ["RFX-3003", "Brightpath Electronics", "30", "10"]], "buyer");
  assert.ok(res.errors[0].text.indexOf("not invited") >= 0);
  assert.ok(res.errors[1].text.indexOf("closed") >= 0);
});

// ---------- confirmations ----------
test("a confirmation confirms an unconfirmed PO", () => {
  const { s, po } = unconfirmedPO();
  const res = run(s, "confirmations", [["PO", "Promised date"], [po.id, day(12)]], "buyer");
  assert.ok(res.ok, JSON.stringify(res.errors));
  const after = res.state.pos[0];
  assert.strictEqual(after.confirmed, true);
  assert.strictEqual(after.promisedDate, day(12));
});

test("moving a confirmed date needs a note, and the same date is no change", () => {
  const s = seed(NOW);
  const bad = run(s, "confirmations", [["PO", "Promised date", "Note"], ["PO-4006", day(20), ""]], "buyer");
  assert.ok(bad.errors[0].text.indexOf("why the date moved") >= 0);
  const good = run(s, "confirmations", [["PO", "Promised date", "Note"], ["PO-4006", day(20), "Supplier short on stock"],
    ["PO-4007", "2026-10-28", ""]], "buyer");
  assert.ok(good.ok, JSON.stringify(good.errors));
  assert.strictEqual(good.state.pos.find(p => p.id === "PO-4006").promisedDate, day(20));
  assert.ok(good.rows[1].text.indexOf("no change") >= 0);
});

// ---------- receipts ----------
test("receipts import posts accepted, rejected and held goods with the note rule", () => {
  const res = run(seed(NOW), "receipts", [["PO", "Quantity", "Result", "Note"],
    ["PO-4006", "10", "accepted", ""], ["PO-4006", "2", "Rejected", "Crushed cases"], ["PO-4006", "3", "on hold", "Check seal"]], "warehouse");
  assert.ok(res.ok, JSON.stringify(res.errors));
  assert.deepStrictEqual(P.grnTotals(res.state, "PO-4006"), { accepted: 10, hold: 3, rejected: 2 });
  const bad = run(seed(NOW), "receipts", [["PO", "Quantity", "Result"], ["PO-4006", "2", "Rejected"], ["PO-4006", "2", "Lost"]], "warehouse");
  assert.ok(bad.errors[0].text.indexOf("Add a note") >= 0);
  assert.ok(bad.errors[1].text.indexOf("must be Accepted, Rejected or Hold") >= 0);
});

// ---------- invoices ----------
test("invoices import runs the three way match and keeps exceptions as exceptions", () => {
  const res = run(seed(NOW), "invoices", [["Invoice number", "PO", "Quantity", "Unit price", "Invoice date"],
    ["NF-9001", "PO-4001", "1200", "41.50", day(0)], ["SP-77", "PO-4003", "20", "385", day(0)]], "ap");
  assert.ok(res.ok, JSON.stringify(res.errors));
  const [a, b] = res.state.invoices.slice(-2);
  assert.strictEqual(a.status, "Matched");
  assert.strictEqual(b.status, "Exception");
  assert.ok(res.rows[1].text.indexOf("exception") >= 0);
});

test("invoices import catches a repeated invoice number as a duplicate", () => {
  const res = run(seed(NOW), "invoices", [["Invoice number", "PO", "Quantity", "Unit price", "Invoice date"],
    ["NF-9001", "PO-4001", "600", "41.50", day(0)], ["nf-9001", "PO-4001", "600", "41.50", day(0)]], "ap");
  const last = res.state.invoices[res.state.invoices.length - 1];
  assert.ok(last.match.issues.some(i => i.code === "DUPLICATE"));
});

// ---------- suppliers ----------
test("supplier emails import saves addresses, checks them and skips blanks", () => {
  const res = run(seed(NOW), "contacts", [["Supplier", "Email"], ["Meridian MRO", "orders@meridian.example"], ["atlas", ""]], "buyer");
  assert.ok(res.ok, JSON.stringify(res.errors));
  assert.strictEqual(res.state.contacts.meridian, "orders@meridian.example");
  assert.ok(res.rows[1].text.indexOf("skipped") >= 0);
  const bad = run(seed(NOW), "contacts", [["Supplier", "Email"], ["atlas", "not an email"]], "buyer");
  assert.ok(bad.errors[0].text.indexOf("does not look like an email") >= 0);
});

test("document renewals import unblocks a supplier, with the same rules as the form", () => {
  const res = run(seed(NOW), "documents", [["Supplier", "Document", "New expiry", "What was checked"],
    ["Cobalt Ridge Chemicals", "Sub-tier disclosure", day(365), "Disclosure rev 4 reviewed by Q"]], "quality");
  assert.ok(res.ok, JSON.stringify(res.errors));
  assert.strictEqual(res.state.docs.cobaltridge.subtier, day(365));
  const bad = run(seed(NOW), "documents", [["Supplier", "Document", "New expiry", "What was checked"],
    ["kestrel", "origin", day(-2), "Checked"], ["kestrel", "Passport", day(30), "Checked"]], "quality");
  assert.ok(bad.errors[0].text.indexOf("must be in the future") >= 0);
  assert.ok(bad.errors[1].text.indexOf("Unknown document") >= 0);
});

test("templates hold the column headings for each import", () => {
  C.imports.forEach(spec => {
    const t = C.template(spec.id), head = C.parse(t.text)[0];
    assert.deepStrictEqual(head, spec.cols.map(c => c.label), spec.id);
  });
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
