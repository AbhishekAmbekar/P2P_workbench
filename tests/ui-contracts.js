/* Drives the Contracts screen and contract releases. Usage: node tests/ui-contracts.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, role, tab, toastText, submit } = t;

const row = id => [...$$("#view table")[0].querySelectorAll("tr")].find(r => r.textContent.indexOf(id) === 0);
const pick = id => click(row(id));
const btn = label => $$("#view button").find(b => b.textContent.trim() === label);
const newRequest = (itemId, qty) => w.eval(`(function(){var s=App.state,P=P2P,n=App.now();
  var r=P.createRequest(s,"requester",n,{requester:"Test",itemId:"${itemId}",qty:${qty},estUnit:P2P.REF.items.find(function(i){return i.id==="${itemId}"}).stdPrice,needBy:P.addDays(App.today(),30),site:"Plant A",costCenter:"CC-300 Maintenance",reason:"Contract release test"});
  r.approvals.forEach(function(a){P.decide(s,a.role,n,r.id,"Approved","ok")});App.save();return r.prNo;})()`);

click($("#resetBtn"));

test("the list shows each contract with its cap, use and status", () => {
  role("buyer"); tab("contracts");
  ["CT-8001", "CT-8002", "CT-8003", "CT-8004", "CT-8005"].forEach(id => check(row(id), id + " missing"));
  check(row("CT-8001").textContent.indexOf("50%") >= 0 && row("CT-8001").textContent.indexOf("Active") >= 0, row("CT-8001").textContent);
  check(row("CT-8003").textContent.indexOf("Used up") >= 0, "scaffold contract is used up");
  check(row("CT-8002").textContent.indexOf("Ends in 40 d") >= 0, "technician contract ends soon");
});

test("a contract that ends soon and is mostly used warns the Buyer", () => {
  pick("CT-8002");
  check(text().indexOf("Start the renewal now") >= 0 && text().indexOf("Over 80% of the cap is released") >= 0, "warnings");
  check(text().indexOf("PO-4008") >= 0, "release listed");
  check(![...$$("#view .legend span")].some(x => x.textContent.indexOf("Invoiced") === 0), "Invoiced is not a legend item, since it is not a part of the bar");
  check($("#view .barnote").textContent === "Invoiced $13,728.00 of the $13,728.00 received.", "note: " + $("#view .barnote").textContent);
});

test("drafting a contract checks the terms and sends it to the Director", () => {
  click(btn("Draft a contract"));
  let f = $('form[data-form="ctCreate"]');
  f.elements.supplierId.value = "tidewater"; f.elements.title.value = "Hydraulic hose assemblies";
  f.elements.item1.value = "MR-401"; f.elements.price1.value = "55"; submit(f);
  check(toastText().indexOf("value cap") >= 0, "toast: " + toastText());
  f = $('form[data-form="ctCreate"]');
  f.elements.supplierId.value = "tidewater"; f.elements.title.value = "Hydraulic hose assemblies";
  f.elements.item1.value = "MR-401"; f.elements.price1.value = "55"; f.elements.cap.value = "12000"; submit(f);
  check(toastText().indexOf("CT-8006 drafted") >= 0 && toastText().indexOf("Director") >= 0, "toast: " + toastText());
  check(!$('form[data-form="ctCreate"]'), "form closes");
});

test("the Director approves in turn, and the Executive decides on large contracts after", () => {
  role("director"); tab("contracts"); pick("CT-8004");
  check(!btn("Approve"), "the Director already approved CT-8004");
  check(text().indexOf("Waiting for the Executive") >= 0);
  pick("CT-8006");
  click(btn("Approve"));
  check(toastText().indexOf("Approved. Releases can be issued") >= 0, "toast: " + toastText());
  role("executive"); tab("contracts"); pick("CT-8004");
  click(btn("Reject"));
  check(toastText().indexOf("Give a reason") >= 0, "toast: " + toastText());
  $("#ctNote-CT-8004").value = "Rate is above the market, renegotiate";
  click(btn("Reject"));
  check(row("CT-8004").textContent.indexOf("Rejected") >= 0);
});

test("an approved request for a contract item is released from the contract", () => {
  const pr = newRequest("MR-401", 20);
  role("buyer"); tab("pos");
  const r = [...$$("#view table")[0].querySelectorAll("tr")].find(x => x.textContent.indexOf(pr) === 0);
  check(r && r.textContent.indexOf("Contract CT-8006") >= 0, "route: " + (r && r.textContent));
  click(r.querySelector("button"));
  check(text().indexOf("Source: release of CT-8006") >= 0 && text().indexOf("$55.00") >= 0, "release details");
  submit($('form[data-form="poCreate"]'));
  check(toastText().indexOf("issued to Tidewater") >= 0, "toast: " + toastText());
  tab("contracts"); pick("CT-8006");
  check(text().indexOf("Releases (1)") >= 0 && text().indexOf("$1,100.00") >= 0, "release on the contract");
});

test("an item on a used up contract goes back to normal sourcing", () => {
  const pr = newRequest("SV-503", 4);
  role("buyer"); tab("pos");
  const r = [...$$("#view table")[0].querySelectorAll("tr")].find(x => x.textContent.indexOf(pr) === 0);
  check(r && r.textContent.indexOf("Direct buy") >= 0, "route: " + (r && r.textContent));
});

test("the contract has its own record page", () => {
  w.App.openRecord("CT-8001");
  check(text().indexOf("Agreed rates") >= 0 && text().indexOf("PO-4004") >= 0 && text().indexOf("Director") >= 0, "contract page");
  check(text().indexOf("Work on it in Contracts") >= 0);
});

t.done();
