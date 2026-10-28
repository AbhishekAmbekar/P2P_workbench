/* Drives the budget, landed cost, quote validity, supplier document and price variance features.
 * Usage: node tests/ui-controls.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, role, tab, toastText, fill, submit } = t;

const btn = label => $$("#view button").find(b => b.textContent.trim() === label);
const change = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("change", { bubbles: true })); };
const inDays = n => w.eval("P2P.addDays(App.today()," + n + ")");
const rowOf = id => $$('#view tr[data-id="' + id + '"]')[0];

// Raise a request through the engine and approve every step, so a test can start from an approved PR.
const raiseApproved = (itemId, qty, est, cc) => w.eval(`(function(){
  var s=App.state,P=P2P,n=App.now();
  var r=P.createRequest(s,"requester",n,{requester:"UI test",itemId:"${itemId}",qty:${qty},estUnit:${est},needBy:P.addDays(App.today(),40),site:"Plant A",costCenter:"${cc}",reason:"UI test request"});
  var st; while((st=r.approvals.find(function(a){return a.status==="Pending"}))) P.decide(s,st.role,n,r.id,"Approved","ok");
  return r.id; })()`);

click($("#resetBtn"));

// ---------- dashboard ----------
test("budget card shows every cost center with paid, ordered and requested amounts", () => {
  role("manager"); tab("dashboard");
  check(text().indexOf("Budget by cost center") >= 0);
  ["CC-100 Operations", "CC-200 Engineering", "CC-300 Maintenance", "CC-400 Quality"].forEach(c => check(text().indexOf(c) >= 0, c + " missing"));
  check(text().indexOf("80% used") >= 0 && text().indexOf("68% used") >= 0 && text().indexOf("81% used") >= 0 && text().indexOf("31% used") >= 0, "percentages wrong");
  check(text().indexOf("$29,880 left") >= 0, "remaining for CC-100 missing");
  check(text().indexOf("Paid $17,520") >= 0, "paid amount missing");
});

test("spend by category lists all four categories, with pipeline for the ones with no POs yet", () => {
  const card = $$("#view .card").find(c => c.querySelector("h3") && c.querySelector("h3").textContent === "Spend by category");
  const txt = card.textContent;
  ["Raw materials", "Components", "Packaging", "MRO"].forEach(c => check(txt.indexOf(c) >= 0, c + " missing"));
  check(txt.indexOf("$100,520 committed") >= 0, "raw materials committed missing");
  check(txt.indexOf("in pipeline") >= 0, "pipeline wording missing");
  check($$("#view .brow").length >= 8, "four categories plus four cost centers expected");
});

test("document and price KPIs are on the dashboard", () => {
  check(text().indexOf("Suppliers blocked by expired documents") >= 0);
  check(text().indexOf("POs priced above contract or standard price") >= 0);
});

// ---------- over budget ----------
test("a request that passes its budget says so in the preview and adds the Executive", () => {
  role("requester"); tab("requests"); click(btn("New request"));
  const f = $('form[data-form="reqSubmit"]');
  change(f.elements.itemId, "MR-405");
  change(f.elements.costCenter, "CC-300 Maintenance");
  f.elements.qty.value = "100"; f.elements.qty.dispatchEvent(new w.Event("input", { bubbles: true }));
  const p = $("#reqPreview").textContent;
  check(p.indexOf("102%") >= 0 && p.indexOf("Executive must also approve") >= 0, "preview: " + p);
  f.elements.reason.value = "Shutdown kits for the full plant";
  submit(f);
  check(/\d\. Executive: pending/.test(text()), "Executive should be a pending step in the chain");
  check(/1\. Manager: waiting/.test(text()), "Manager should be first");
  check(text().indexOf("past its budget") >= 0, "over budget note missing");
});

test("the over budget request shows on the dashboard as over budget", () => {
  tab("dashboard");
  check(text().indexOf("over budget") >= 0, "over budget wording missing");
});

// ---------- supplier documents ----------
test("suppliers tab puts blocked suppliers first and says who can renew", () => {
  role("buyer"); tab("suppliers");
  const rows = $$("#view table tr").slice(1);
  check(rows[0].textContent.indexOf("No, document expired") >= 0 && rows[1].textContent.indexOf("No, document expired") >= 0, "blocked suppliers should be first");
  check(rows.some(r => r.textContent.indexOf("Cobalt Ridge") >= 0 && r.textContent.indexOf("Sub-tier disclosure: expired") >= 0));
  check(text().indexOf("Quality records document renewals") >= 0);
  check(!$('form[data-form="docRenew"]'), "buyer must not see the renewal form");
});

test("a lapsed document blocks the award, and only Quality can renew it", () => {
  const id = raiseApproved("RM-101", 60, 42, "CC-200 Engineering");
  const rfx = w.eval(`(function(){var s=App.state,P=P2P,n=App.now();
    var x=P.startRFx(s,"buyer",n,"${id}",{type:"RFQ",invited:["cobaltridge","northfield"],wPrice:50,wLead:25,wQuality:25});
    P.addQuote(s,"buyer",n,x.id,{supplierId:"cobaltridge",unitPrice:40,leadDays:20});
    P.addQuote(s,"buyer",n,x.id,{supplierId:"northfield",unitPrice:41.5,leadDays:25});
    P.closeBidding(s,"buyer",n,x.id); return x.id; })()`);
  role("buyer"); tab("rfx"); click(rowOf(rfx));
  check(text().indexOf("Documents expired") >= 0, "pill missing");
  check($$('#view button[data-act="rfxAward"]').length === 1, "only Northfield should be awardable");
  check(text().indexOf("Quality must record a renewal") >= 0);

  role("quality"); tab("suppliers");
  let f = $('form[data-form="docRenew"]');
  fill(f, { supplierId: "cobaltridge", docType: "subtier", expiry: inDays(365), note: "" });
  submit(f);
  check(toastText().indexOf("what was checked") >= 0, "toast: " + toastText());
  f = $('form[data-form="docRenew"]');
  fill(f, { supplierId: "cobaltridge", docType: "subtier", expiry: inDays(365), note: "Disclosure SD-77 reviewed, ISO body confirmed" });
  submit(f);
  check(toastText().indexOf("Renewal recorded") >= 0, "toast: " + toastText());
  check(text().indexOf("1 supplier is blocked") >= 0, "blocked count should drop to 1");

  role("buyer"); tab("rfx"); click(rowOf(rfx));
  check($$('#view button[data-act="rfxAward"]').length === 2, "both suppliers should be awardable now");
  check(text().indexOf("Documents expired") < 0);
});

// ---------- quote validity ----------
test("an expired quote is flagged and can be revalidated by the buyer", () => {
  role("buyer"); tab("rfx"); click(rowOf("RFX-3004"));
  check(text().indexOf("expired") >= 0, "expired pill missing");
  let f = $('form[data-form="rfxRevalidate"]');
  check(f, "revalidate form missing");
  fill(f, { newDate: inDays(20), note: "" }); submit(f);
  check(toastText().indexOf("how the supplier confirmed") >= 0, "toast: " + toastText());
  f = $('form[data-form="rfxRevalidate"]');
  fill(f, { newDate: inDays(20), note: "Supplier confirmed by email" }); submit(f);
  check(toastText().indexOf("revalidated") >= 0, "toast: " + toastText());
  check(!$('form[data-form="rfxRevalidate"]'), "form should be gone once nothing is expired");
});

test("other roles cannot revalidate", () => {
  role("requester"); tab("rfx"); click(rowOf("RFX-3003"));
  check(!$('form[data-form="rfxRevalidate"]'));
});

// ---------- tariffs and landed cost ----------
test("tariff and freight on a quote show as landed cost in the comparison", () => {
  const id = raiseApproved("CP-302", 800, 24.5, "CC-100 Operations");
  role("buyer"); tab("rfx");
  const wait = [...$$("#view table")[0].querySelectorAll("tr")].find(r => r.textContent.indexOf("$19,600.00") >= 0);
  click(wait.querySelector("button"));
  $$('input[name="inv"]').forEach(b => { b.checked = ["northfield", "brightpath", "tidewater"].includes(b.value); });
  submit($('form[data-form="rfxStart"]'));
  const q = (sup, price, lead, extra) => { fill($('form[data-form="rfxQuote"]'), Object.assign({ supplierId: sup, unitPrice: price, leadDays: lead }, extra || {})); submit($('form[data-form="rfxQuote"]')); };
  q("northfield", "24", "20");
  q("brightpath", "20", "20", { tariffPct: "30", freight: "0" });
  q("tidewater", "25", "20");
  click(btn("Close bidding and compare"));
  check(text().indexOf("30% tariff") >= 0 && text().indexOf("$26.00") >= 0, "landed cost for the tariffed quote missing");
  check(text().indexOf("Landed total") >= 0 && text().indexOf("so a tariff can change the winner") >= 0);
  const first = $$("#view table")[$$("#view table").length - 1].querySelectorAll("tr")[1];
  check(first.cells[1].textContent.indexOf("Brightpath") < 0, "the tariffed quote should not win despite the lowest sticker price");
});

test("a bad tariff or a past validity date is refused", () => {
  const id = raiseApproved("CP-302", 800, 24.5, "CC-100 Operations");
  role("buyer"); tab("rfx");
  const wait = [...$$("#view table")[0].querySelectorAll("tr")].find(r => r.textContent.indexOf("$19,600.00") >= 0);
  click(wait.querySelector("button"));
  $$('input[name="inv"]').forEach(b => { b.checked = ["northfield", "tidewater"].includes(b.value); });
  submit($('form[data-form="rfxStart"]'));
  fill($('form[data-form="rfxQuote"]'), { supplierId: "northfield", unitPrice: "24", leadDays: "20", tariffPct: "150" });
  submit($('form[data-form="rfxQuote"]'));
  check(toastText().indexOf("between 0 and 100") >= 0, "toast: " + toastText());
  fill($('form[data-form="rfxQuote"]'), { supplierId: "northfield", unitPrice: "24", leadDays: "20", tariffPct: "0", validUntil: inDays(-2) });
  submit($('form[data-form="rfxQuote"]'));
  check(toastText().indexOf("in the past") >= 0, "toast: " + toastText());
});

// ---------- price variance on a PO ----------
test("a PO priced well above standard needs a reason, then shows landed cost and the flag", () => {
  const id = raiseApproved("MR-405", 10, 120, "CC-100 Operations");
  role("buyer"); tab("pos");
  const r = [...$$("#view table")[0].querySelectorAll("tr")].find(x => x.textContent.indexOf("$1,200.00") >= 0);
  click(r.querySelector("button"));
  let f = $('form[data-form="poCreate"]');
  fill(f, { supplierId: "atlas", unitPrice: "95", tariffPct: "10", freight: "2", leadDays: "7", varianceReason: "" });
  submit(f);
  check(toastText().indexOf("13% above the standard price") >= 0, "toast: " + toastText());
  f = $('form[data-form="poCreate"]');
  fill(f, { varianceReason: "Spot buy, the usual lot is allocated elsewhere" });
  submit(f);
  check(toastText().indexOf("issued") >= 0, "toast: " + toastText());
  check(text().indexOf("Landed cost") >= 0 && text().indexOf("$1,065.00") >= 0 && text().indexOf("10% tariff") >= 0, "landed cost missing");
  check(text().indexOf("above the standard price") >= 0 && text().indexOf("Spot buy") >= 0, "variance note missing");
});

// ---------- audit ----------
test("the audit trail records renewals, revalidations and the over budget escalation", () => {
  role("buyer"); tab("audit");
  const txt = text();
  check(txt.indexOf("Document renewed") >= 0, "renewal missing");
  check(txt.indexOf("Quote revalidated") >= 0, "revalidation missing");
  check(txt.indexOf("Over budget") >= 0, "over budget note missing");
});

t.done();
