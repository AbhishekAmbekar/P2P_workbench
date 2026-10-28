/* Drives the Requests and PRs screen. Usage: node tests/ui-requests.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, clickText, role, tab, toastText, fill, submit } = t;

const row = id => $$('#view tr[data-id="' + id + '"]')[0];
const open = id => {
  if ($("#view button.small") && !row(id)) clickText("#view button.small", "All");
  click(row(id));
};
const form = () => $('form[data-form="reqSubmit"]');
const note = v => { $("#decisionNote").value = v; };
const btn = label => $$("#view button").find(b => b.textContent.trim() === label);
const change = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("change", { bubbles: true })); };

click($("#resetBtn"));

test("requests list shows every status and the filter counts add up", () => {
  role("buyer"); tab("requests");
  check($$("#view tr[data-id]").length === 14, "expected 14 rows");
  clickText("#view button.small", "Awaiting approval");
  check($$("#view tr[data-id]").length === 2, "expected 2 awaiting approval, got " + $$("#view tr[data-id]").length);
  clickText("#view button.small", "Rejected or cancelled");
  check($$("#view tr[data-id]").length === 1, "expected 1 rejected");
  clickText("#view button.small", "All");
});

test("only the requester sees the new request button", () => {
  role("buyer"); tab("requests");
  check(!btn("New request"), "buyer should not see the button");
  role("requester");
  check(btn("New request"), "requester should see the button");
});

test("form previews the approval route and fills the standard price when the item changes", () => {
  role("requester"); tab("requests");
  click(btn("New request"));
  const f = form();
  check($("#reqPreview").textContent.indexOf("Quality, then Director") >= 0 || $("#reqPreview").textContent.indexOf("Quality") >= 0, "preview: " + $("#reqPreview").textContent);
  change(f.elements.itemId, "MR-402");
  check(f.elements.estUnit.value === "9.4", "price not filled: " + f.elements.estUnit.value);
  check($("#reqPreview").textContent.indexOf("contract price") >= 0, "contract hint missing");
  change(f.elements.itemId, "CP-202");
  f.elements.qty.value = "30";
  f.elements.qty.dispatchEvent(new w.Event("input", { bubbles: true }));
  check($("#reqPreview").textContent.indexOf("Engineering") >= 0, "engineering missing");
  check($("#reqPreview").textContent.indexOf("Executive") < 0, "executive should not apply at $19,200");
  f.elements.qty.value = "100";
  f.elements.qty.dispatchEvent(new w.Event("input", { bubbles: true }));
  check($("#reqPreview").textContent.indexOf("Executive") >= 0, "executive should apply at $64,000");
});

test("a bad request shows the policy message and does not create anything", () => {
  const before = JSON.parse(w.localStorage.getItem("p2p-workbench-v2")).state.requests.length;
  const f = form();
  f.elements.reason.value = "";
  submit(f);
  check(toastText().indexOf("reason") >= 0, "toast: " + toastText());
  check(JSON.parse(w.localStorage.getItem("p2p-workbench-v2")).state.requests.length === before);
});

test("a good request is created, selected, and routed to the manager", () => {
  const f = form();
  change(f.elements.itemId, "MR-405");
  f.elements.qty.value = "12";
  f.elements.reason.value = "Quarterly shutdown kits";
  submit(f);
  check(toastText().indexOf("REQ-1015") >= 0, "toast: " + toastText());
  check(text().indexOf("Approval chain") >= 0, "detail panel should open");
  check(text().indexOf("Manager: waiting") >= 0, "manager should be waiting");
  check(!form(), "form should close");
});

test("wrong role cannot approve and is told who is next", () => {
  role("director"); open("REQ-1015");
  check(!btn("Approve"), "director should not see approve");
  check(text().indexOf("Waiting on the Manager") >= 0);
});

test("manager approval issues a PR number for a one step chain", () => {
  role("manager"); open("REQ-1015");
  click(btn("Approve"));
  check(toastText().indexOf("PR-") >= 0, "toast: " + toastText());
  check(text().indexOf("Approved") >= 0);
});

test("rejecting without a reason is blocked, with a reason it works", () => {
  role("manager"); open("REQ-1012");
  note(""); click(btn("Reject"));
  check(toastText().indexOf("reason") >= 0, "toast: " + toastText());
  open("REQ-1012"); note("Budget frozen this quarter"); click(btn("Reject"));
  check(toastText().indexOf("Rejected") >= 0, "toast: " + toastText());
});

test("the director sees approve on a request waiting for them", () => {
  role("director"); open("REQ-1006");
  check(btn("Approve"), "director should see approve on REQ-1006");
  click(btn("Approve"));
  check(toastText().indexOf("PR-") >= 0, "final approval should issue a PR: " + toastText());
});

test("requester can cancel an approved request, buyer cannot", () => {
  role("buyer"); open("REQ-1015");
  check(!btn("Cancel this request"));
  role("requester"); open("REQ-1015");
  click(btn("Cancel this request"));
  check(toastText().indexOf("cancelled") >= 0, "toast: " + toastText());
});

test("approved request offers the next step to sourcing", () => {
  role("buyer"); open("REQ-1007");
  check(text().indexOf("Next step is sourcing") >= 0);
  check(btn("Go to RFx") && btn("Go to purchase orders"));
});

t.done();
