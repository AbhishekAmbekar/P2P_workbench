/* Drives the purchase orders screen. Usage: node tests/ui-pos.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, clickText, role, tab, toastText, fill, submit } = t;

const btn = label => $$("#view button").find(b => b.textContent.trim() === label);
const poRow = id => $$('#view tr[data-id="' + id + '"]')[0];
const openPO = id => click(poRow(id));
const inDays = n => w.eval("P2P.addDays(App.today()," + n + ")");

click($("#resetBtn"));

test("buyer sees PRs ready for a PO with the right route for each", () => {
  role("buyer"); tab("pos");
  check(text().indexOf("PRs ready for a PO") >= 0);
  const rows = $$("#view table")[0].textContent;
  check(rows.indexOf("RFx awarded") >= 0, "awarded route missing");
  check(rows.indexOf("Needs RFx") >= 0, "needs RFx route missing");
  check(btn("Create PO") && btn("Review"));
});

test("other roles cannot create POs", () => {
  role("warehouse"); tab("pos");
  check(text().indexOf("Buyer creates this") >= 0);
  check(!btn("Create PO"));
});

test("a large uncontracted request is sent back to RFx, not ordered directly", () => {
  role("buyer"); tab("pos");
  click(btn("Review"));
  check(text().indexOf("need an RFx") >= 0, "message missing");
  check(btn("Start an RFx"));
  click(btn("Start an RFx"));
  check(w.App.tab === "rfx" && $('form[data-form="rfxStart"]'), "should land on the RFx start form");
});

test("an awarded RFx creates a PO with the awarded supplier and price", () => {
  role("buyer"); tab("pos");
  click(btn("Create PO"));
  check(text().indexOf("Awarded to Brightpath") >= 0 || text().indexOf("Brightpath Electronics at $219.00") >= 0, "award details missing");
  submit($('form[data-form="poCreate"]'));
  check(toastText().indexOf("PO-4008") >= 0, "toast: " + toastText());
  check(text().indexOf("Brightpath Electronics") >= 0 && text().indexOf("$13,140.00") >= 0, "PO detail wrong");
  check(text().indexOf("not confirmed") >= 0);
});

test("the supplier date can be confirmed", () => {
  const f = $('form[data-form="poConfirm"]');
  check(f, "confirm form missing");
  f.elements.date.value = inDays(20);
  submit(f);
  check(toastText().indexOf("confirmed") >= 0, "toast: " + toastText());
  check(text().indexOf("supplier confirmed") >= 0);
  check(!$('form[data-form="poConfirm"]'), "confirm form should be gone");
});

test("a late PO explains what to do", () => {
  openPO("PO-4006");
  check(text().indexOf("Late") >= 0, "late status missing");
  check(text().indexOf("pull in") >= 0, "advice missing");
});

test("moving a promise date needs a note and updates the delivery status", () => {
  openPO("PO-4007");
  check(text().indexOf("At Risk") >= 0, "seed PO should be at risk");
  let f = $('form[data-form="poMove"]');
  f.elements.date.value = inDays(6);
  f.elements.note.value = "";
  submit(f);
  check(toastText().indexOf("note") >= 0, "toast: " + toastText());
  f = $('form[data-form="poMove"]');
  f.elements.date.value = inDays(6);
  f.elements.note.value = "Supplier slipped the ship date";
  submit(f);
  check(toastText().indexOf("updated") >= 0, "toast: " + toastText());
  check($$("#view .card").some(c => c.textContent.indexOf("Late") >= 0 && c.textContent.indexOf("Slack is -2") >= 0), "should now be Late with slack of -2 days");
});

test("price amendments need a reason and stay within 10 percent of the approved value", () => {
  openPO("PO-4007");
  let f = $('form[data-form="poPrice"]');
  f.elements.price.value = "88"; f.elements.reason.value = "";
  submit(f);
  check(toastText().indexOf("Explain") >= 0, "toast: " + toastText());
  f = $('form[data-form="poPrice"]');
  f.elements.price.value = "95"; f.elements.reason.value = "Supplier raised the price after quoting";
  submit(f);
  check(toastText().indexOf("10% above") >= 0, "toast: " + toastText());
  f = $('form[data-form="poPrice"]');
  f.elements.price.value = "88"; f.elements.reason.value = "Surcharge agreed in writing";
  submit(f);
  check(toastText().indexOf("amended") >= 0, "toast: " + toastText());
  check(text().indexOf("$3,520.00") >= 0, "new PO value missing");
});

test("a contract buy takes its supplier and price from the contract", () => {
  w.eval(`(function(){var s=App.state,P=P2P,n=App.now();
    var r=P.createRequest(s,"requester",n,{requester:"Test",itemId:"MR-404",qty:10,estUnit:96,needBy:P.addDays(App.today(),30),site:"Plant A",costCenter:"CC-300 Maintenance",reason:"Contract buy test"});
    P.decide(s,"manager",n,r.id,"Approved","ok");})()`);
  role("buyer"); tab("pos");
  check(text().indexOf("Contract") >= 0, "contract route missing");
  const rowBtn = $$("#view table")[0].querySelectorAll("tr");
  const r = [...rowBtn].find(x => x.textContent.indexOf("Grease") >= 0);
  click(r.querySelector("button"));
  check(text().indexOf("Source: contract") >= 0 && text().indexOf("Meridian MRO") >= 0, "contract details missing");
  check(!$('select[name="supplierId"]'), "no supplier choice on a contract buy");
});

test("a small direct buy lists only qualified suppliers for the category", () => {
  w.eval(`(function(){var s=App.state,P=P2P,n=App.now();
    var r=P.createRequest(s,"requester",n,{requester:"Test",itemId:"MR-401",qty:20,estUnit:58,needBy:P.addDays(App.today(),30),site:"Plant A",costCenter:"CC-300 Maintenance",reason:"Direct buy test"});
    P.decide(s,"manager",n,r.id,"Approved","ok");})()`);
  role("buyer"); tab("pos");
  const r = [...$$("#view table")[0].querySelectorAll("tr")].find(x => x.textContent.indexOf("Hydraulic hose") >= 0);
  click(r.querySelector("button"));
  const opts = [...$('select[name="supplierId"]').options].map(o => o.textContent);
  check(opts.length === 3, "expected 3 qualified MRO suppliers, got " + opts.length + ": " + opts.join("|"));
  check(!opts.some(o => o.indexOf("Kestrel") >= 0 || o.indexOf("Orbit") >= 0));
  const f = $('form[data-form="poCreate"]');
  f.elements.unitPrice.value = "70";
  submit(f);
  check(toastText().indexOf("10% above") >= 0, "overrun message expected: " + toastText());
  f.elements.unitPrice.value = "59";
  submit(f);
  check(toastText().indexOf("issued") >= 0, "toast: " + toastText());
});

test("non buyers can read a PO but not change it, and can jump to receiving", () => {
  role("warehouse"); tab("pos"); openPO("PO-4003");
  check(text().indexOf("manages dates and prices") >= 0);
  check(!$('form[data-form="poPrice"]'));
  click(btn("Receive goods"));
  check(w.App.tab === "grn", "should switch to the receipts tab");
});

t.done();
