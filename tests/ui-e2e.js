/* End to end: one request all the way from the form to a paid invoice, using only the screens.
 * Usage: node tests/ui-e2e.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, role, tab, toastText, fill, submit } = t;

const btn = label => $$("#view button").find(b => b.textContent.trim() === label);
const change = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("change", { bubbles: true })); };
const inDays = n => w.eval("P2P.addDays(App.today()," + n + ")");
const row = id => $$('#view tr[data-id="' + id + '"]')[0];
let reqId, prNo, rfxId, poId, grnTotal;

click($("#resetBtn"));

test("1. requester raises a 100 unit control board request", () => {
  role("requester"); tab("requests"); click(btn("New request"));
  const f = $('form[data-form="reqSubmit"]');
  change(f.elements.itemId, "CP-202");
  f.elements.qty.value = "100"; f.elements.qty.dispatchEvent(new w.Event("input", { bubbles: true }));
  f.elements.reason.value = "Control board build for the spring program";
  check($("#reqPreview").textContent.indexOf("Engineering") >= 0 && $("#reqPreview").textContent.indexOf("Executive") >= 0);
  check($("#reqPreview").textContent.indexOf("must run an RFx") >= 0, "RFx hint expected");
  submit(f);
  reqId = toastText().match(/REQ-\d+/)[0];
  check(text().indexOf("Manager: waiting") >= 0);
});

test("2. four approvers approve in order and a PR number appears", () => {
  const chain = ["manager", "engineering", "director", "executive"];
  chain.forEach((r, i) => {
    role(r); tab("requests"); click(row(reqId));
    check(btn("Approve"), r + " should see Approve");
    click(btn("Approve"));
    if (i < chain.length - 1) check(toastText().indexOf("next approver") >= 0, "toast: " + toastText());
  });
  prNo = toastText().match(/PR-\d+/)[0];
  check(prNo, "PR number expected");
});

test("3. buyer cannot order directly because the value needs an RFx", () => {
  role("buyer"); tab("pos");
  const r = [...$$("#view table")[0].querySelectorAll("tr")].find(x => x.textContent.indexOf(prNo) >= 0);
  check(r.textContent.indexOf("Needs RFx") >= 0, "route should say Needs RFx");
});

test("4. buyer runs the RFx: invite, quote, close, award", () => {
  tab("rfx");
  const r = [...$$("#view table")[0].querySelectorAll("tr")].find(x => x.textContent.indexOf(prNo) >= 0);
  click(r.querySelector("button"));
  $$('input[name="inv"]').forEach(b => { b.checked = ["brightpath", "helio", "pinecrest"].includes(b.value); });
  submit($('form[data-form="rfxStart"]'));
  rfxId = toastText().match(/RFX-\d+/)[0];
  const q = (sup, price, lead) => { fill($('form[data-form="rfxQuote"]'), { supplierId: sup, unitPrice: price, leadDays: lead }); submit($('form[data-form="rfxQuote"]')); };
  q("brightpath", "628", "21"); q("helio", "615", "30"); q("pinecrest", "600", "35");
  click(btn("Close bidding and compare"));
  check($$('#view button[data-act="rfxAward"]').length === 3);
  const top = $$("#view table")[1] ? $$("#view table tr") : [];
  const first = [...$$("#view table")].map(x => x).pop().querySelectorAll("tr")[1];
  const supName = first.cells[1].textContent;
  const needsNote = /Conditional/.test(first.textContent);
  if (needsNote) $("#awardNote").value = "Best overall score, extra incoming inspection planned";
  click(first.querySelector('button[data-act="rfxAward"]'));
  check(toastText().indexOf("Awarded to") >= 0, "toast: " + toastText());
});

test("5. buyer issues the PO from the award and confirms the date", () => {
  tab("pos");
  const r = [...$$("#view table")[0].querySelectorAll("tr")].find(x => x.textContent.indexOf(prNo) >= 0);
  check(r.textContent.indexOf("RFx awarded") >= 0);
  click(r.querySelector("button"));
  submit($('form[data-form="poCreate"]'));
  poId = toastText().match(/PO-\d+/)[0];
  const f = $('form[data-form="poConfirm"]'); f.elements.date.value = inDays(25); submit(f);
  check(text().indexOf("supplier confirmed") >= 0);
});

test("6. warehouse receives the order in two parts, one rejected", () => {
  role("warehouse"); tab("grn"); click(row(poId));
  let f = $('form[data-form="grnPost"]');
  f.elements.qty.value = "60"; f.elements.result.value = "Accepted"; submit(f);
  f = $('form[data-form="grnPost"]');
  f.elements.qty.value = "5"; f.elements.result.value = "Rejected"; f.elements.note.value = "Connector pins bent"; submit(f);
  f = $('form[data-form="grnPost"]');
  check(f.elements.qty.value === "40", "40 units should still be open, form shows " + f.elements.qty.value);
  f.elements.qty.value = "40"; f.elements.result.value = "Accepted"; submit(f);
  check(!row(poId), "fully received PO should leave the open list");
});

test("7. accounts payable catches a one cent price gap, then pays a clean invoice", () => {
  role("ap"); tab("invoices");
  const f = $('form[data-form="invEnter"]');
  change(f.elements.poId, poId);
  fill(f, { invNo: "E2E-1", qty: "100", unitPrice: "600.01", date: inDays(0) }); submit(f);
  check(toastText().indexOf("failed the match") >= 0, "toast: " + toastText());
  check(text().indexOf("does not equal PO price") >= 0 && text().indexOf("Fix owner: Buyer") >= 0);
  const g = $('form[data-form="invEnter"]');
  change(g.elements.poId, poId);
  fill(g, { invNo: "E2E-2", qty: "100", unitPrice: g.elements.unitPrice.value, date: inDays(0) }); submit(g);
  check(toastText().indexOf("matched first time") >= 0, "toast: " + toastText());
  const ready = $$("#view tr").find(r => r.textContent.indexOf("E2E-2") >= 0);
  click(ready.querySelector('button[data-act="invPay"]'));
  check(toastText().indexOf("Payment released") >= 0);
});

test("8. the audit trail has the whole story and can be filtered", () => {
  tab("audit");
  const all = $$("#view tbody tr, #view table tr").length;
  check(text().indexOf("Final approval") >= 0 && text().indexOf("Payment released") >= 0 && text().indexOf("Awarded to") >= 0, "key events missing");
  change($('select[name="kind"]'), "INV");
  const body = $("#view table").textContent;
  check(body.indexOf("Payment released") >= 0 && body.indexOf("Final approval") < 0, "filter to INV failed");
  change($('select[name="kind"]'), "");
  change($('select[name="who"]'), "buyer");
  check($("#view table").textContent.indexOf("Final approval") < 0, "buyer filter failed");
  change($('select[name="who"]'), "");
});

test("9. dashboard counts moved and the guide renders", () => {
  tab("dashboard");
  check(text().indexOf("Invoices matched first time") >= 0);
  tab("guide");
  check(text().indexOf("The six stages") >= 0 && text().indexOf("Try this walk through") >= 0);
  check($$("#view tr").length >= 9, "roles table missing");
});

test("10. every tab renders without an error box, for every role", () => {
  const tabs = ["dashboard", "requests", "rfx", "pos", "grn", "invoices", "suppliers", "audit", "guide"];
  $("#roleSel") && [...$("#roleSel").options].forEach(o => {
    role(o.value);
    tabs.forEach(x => { tab(x); check(text().indexOf("Could not draw") < 0, o.value + " / " + x + ": " + text().slice(0, 120)); });
  });
});

t.done();
