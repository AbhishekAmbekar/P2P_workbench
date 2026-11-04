/* Drives the sidebar, record pages, links and Back. Usage: node tests/ui-records.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, role, tab } = t;

const h2 = () => $("#view h2").textContent;
const flowIds = () => $$("#view .fstep b").map(b => b.textContent);

click($("#resetBtn"));
role("buyer");

test("the sidebar keeps all twelve sections, grouped for the role", () => {
  const groups = $$("#tabs .navgrp").map(g => g.textContent);
  check(groups.join(",") === "Your work,View only,Help", "groups " + groups);
  check($$('#tabs button[data-act="tab"]').length === 12, "twelve sections");
});

test("a PO opens as a full page with facts, document flow and sections", () => {
  w.App.openRecord("PO-4001");
  check(h2() === "PO-4001", "title " + h2());
  check(w.location.hash === "#PO-4001", "hash " + w.location.hash);
  check($('#tabs [data-arg="pos"]').classList.contains("on"), "sidebar should mark Purchase orders");
  check(flowIds().join(" ") === "REQ-1001 PR-2001 RFX-3001 PO-4001 GRN-5001 Not yet", "flow " + flowIds());
  ["Details", "Price", "Delivery and receipts", "Invoices", "History"].forEach(s => check(text().indexOf(s) >= 0, "section " + s));
  check(text().indexOf("1,200 of 2,000") >= 0, "received fact");
  check(text().indexOf("1,200 units can be billed") >= 0, "invoice step");
});

test("each step in the flow opens that record", () => {
  click($('#view .fstep a[data-id="RFX-3001"]'));
  check(h2() === "RFX-3001", "rfx page");
  check(text().indexOf("Ranking") >= 0 && text().indexOf("Northfield Metals") >= 0);
  click($('#view .fstep a[data-id="PR-2001"]'));
  check(h2() === "PR-2001 (REQ-1001)", "pr page " + h2());
  check(text().indexOf("Approvals") >= 0 && text().indexOf("Executive") >= 0);
});

test("receipts, invoices and requests not yet approved have pages too", () => {
  w.App.openRecord("GRN-5003");
  check(h2() === "GRN-5003" && text().indexOf("Hold") >= 0, "grn");
  w.App.openRecord("INV-6002");
  check(h2() === "INV-6002" && text().indexOf("Three way match") >= 0 && text().indexOf("Fix owner") >= 0, "invoice");
  w.App.openRecord("REQ-1012");
  check(text().indexOf("Waiting for Manager") >= 0, "pending PR step");
  check(flowIds().filter(x => x === "Not yet").length === 5, "later steps not yet");
});

test("a contract PO shows its contract in the flow and links to the contract page", () => {
  w.App.openRecord("PO-4004");
  check(text().indexOf("Release · MRO spares rate contract") >= 0, "flow step");
  w.App.openRecord("CT-8001");
  check(text().indexOf("MRO spares rate contract") >= 0 && text().indexOf("PO-4004") >= 0 && text().indexOf("Agreed rates") >= 0, "contract page");
});

test("an unknown record says so instead of breaking", () => {
  w.App.openRecord("PO-9999");
  check(h2() === "PO-9999 not found");
});

test("Work on it opens the record selected on its own screen", () => {
  w.App.openRecord("PO-4001");
  click([...$$("#view button")].find(b => b.textContent.indexOf("Work on it") === 0));
  check(w.App.tab === "pos" && !w.App.sel.rec && w.App.sel.pos === "PO-4001", "po selected");
  check(text().indexOf("Purchase orders") >= 0);
});

test("Full record buttons and audit trail links open record pages", () => {
  click([...$$("#view button")].find(b => b.textContent === "Full record"));
  check(h2() === "PO-4001", "full record from PO panel");
  tab("audit");
  check(!w.App.sel.rec, "a tab click leaves the record page");
  const link = $('#view a.rec[data-id^="INV-"]');
  check(link, "audit should link records");
  const id = link.dataset.id;
  click(link);
  check(h2() === id, "audit link opened " + id);
});

test("a link in the address opens the screen or record", () => {
  w.location.hash = "#grn";
  w.App.fromHash();
  check(w.App.tab === "grn" && !w.App.sel.rec, "screen from hash");
  w.location.hash = "#inv-6001";
  w.App.fromHash();
  check(h2() === "INV-6001", "record from hash, any case");
});

test("record numbers in every table are links to the record page", () => {
  [["requester", "requests", "REQ-1014"], ["buyer", "rfx", "RFX-3003"], ["buyer", "pos", "PO-4006"], ["buyer", "expedite", "PO-4006"],
   ["warehouse", "grn", "PO-4006"], ["ap", "invoices", "INV-6001"], ["buyer", "audit", "PO-4007"]].forEach(([r, tb, id]) => {
    role(r); tab(tb);
    const a = $('#view td a.rec[data-id="' + id + '"]');
    check(a, tb + " should link " + id);
    check(a.getAttribute("href") === "#" + id, tb + " href");
  });
});

test("clicking a link in a table opens the record, and clicking the row still opens the panel", () => {
  role("buyer"); tab("pos");
  click($('#view td a.rec[data-id="PO-4006"]'));
  check(h2() === "PO-4006" && w.App.sel.rec === "PO-4006", "record page");
  tab("pos");
  const row = $$("#view tr.clickable").find(r => r.textContent.indexOf("PO-4005") === 0);
  click(row.children[2]);
  check(!w.App.sel.rec && w.App.sel.pos === "PO-4005", "panel for PO-4005");
});

test("a PR number in a table opens its request page", () => {
  role("buyer"); tab("pos");
  click($('#view td a.rec[data-id="PR-2006"]'));
  check(h2() === "PR-2006 (REQ-1007)", h2());
});

t.done();
