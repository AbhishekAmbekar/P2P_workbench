/* Drives role focus: sidebar groups, view only lines and each role's default slice. Usage: node tests/ui-roles.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, clickText, role, tab } = t;

const group = name => {
  const out = []; let on = false;
  [...$("#tabs").children].forEach(el => {
    if (el.classList.contains("navgrp") || el.classList.contains("navmore")) { on = el.textContent === name; return; }
    if (on && el.dataset.arg) out.push(el.dataset.arg);
  });
  return out;
};
const rows = () => $$("#view tr[data-id]").map(r => r.dataset.id);
const band = () => $("#view .band").textContent;

click($("#resetBtn"));

test("Accounts Payable works on invoices and follows POs, receipts and suppliers", () => {
  role("ap");
  check(group("Your work").join() === "invoices", "work " + group("Your work"));
  check(group("View only").join() === "pos,grn,suppliers,audit", "view " + group("View only"));
  check($('#tabs .navmore'), "more screens toggle");
  check($$("#tabs button.more.hid").length === 3, "three folded screens");
});

test("More screens opens the folded sections, so nothing is hidden for good", () => {
  click($("#tabs .navmore"));
  check($$("#tabs button.more.hid").length === 0, "unfolded");
  check($('#tabs .navmore').getAttribute("aria-expanded") === "true");
  click($("#tabs .navmore"));
  check($$("#tabs button.more.hid").length === 3, "folded again");
});

test("opening a folded screen keeps the group open and marks it view only", () => {
  tab("rfx");
  check($$("#tabs button.more.hid").length === 0, "open while on a folded screen");
  check(band().indexOf("View only") >= 0 && band().indexOf("The Buyer runs sourcing here") >= 0, band());
});

test("a role's own screens show no view only line", () => {
  tab("invoices");
  check(band().indexOf("View only") < 0, "AP works here");
  role("buyer"); tab("invoices");
  check(band().indexOf("View only") < 0, "Buyer fixes price gaps here");
});

test("the VP follows everything and works only on approvals", () => {
  role("executive");
  check(group("Your work").join() === "requests");
  check(group("View only").length === 7, "view " + group("View only"));
  check(!$("#tabs .navmore"), "nothing folded for the VP");
  tab("pos");
  check(band().indexOf("You are working as Executive, so this screen is for reading") >= 0);
});

test("the Manager follows every screen like the Director and VP, and gets Oversight", () => {
  role("manager");
  check(group("Your work").join() === "requests", "work " + group("Your work"));
  check(group("View only").length === 7, "view " + group("View only"));
  role("director"); const dir = group("View only").join();
  role("manager");
  check(group("View only").join() === dir, "same as the Director");
  check(!$("#tabs .navmore"), "nothing folded");
  tab("dashboard");
  check($("#view h2").textContent === "Oversight", "oversight home");
});

test("each role opens Requests on its own slice", () => {
  role("requester"); tab("requests");
  check(rows().sort().join() === "REQ-1001,REQ-1008,REQ-1010,REQ-1014", "mine " + rows());
  role("manager"); tab("requests");
  check(rows().join() === "REQ-1012", "waiting on manager " + rows());
  role("director"); tab("requests");
  check(rows().join() === "REQ-1006", "waiting on director " + rows());
  role("buyer"); tab("requests");
  check(rows().join() === "REQ-1007", "approved PRs " + rows());
});

test("a filter picked by hand stays until the role changes", () => {
  role("manager"); tab("requests");
  clickText("#view button.small", "All");
  check(rows().length === 14);
  tab("pos"); tab("requests");
  check(rows().length === 14, "kept");
  role("requester"); role("manager");
  check(rows().join() === "REQ-1012", "back to the role default");
});

test("the Warehouse opens Purchase orders on what is still due in", () => {
  role("warehouse"); tab("pos");
  check(rows().sort().join() === "PO-4001,PO-4003,PO-4006,PO-4007", "open " + rows());
  clickText("#view button.small", "All");
  check(rows().length === 7);
  role("buyer"); tab("pos");
  check(rows().length === 7, "buyer sees all");
  clickText("#view button.small", "Late or at risk");
  check(rows().sort().join() === "PO-4001,PO-4006,PO-4007", "risk " + rows());
});

t.done();
