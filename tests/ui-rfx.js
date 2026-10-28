/* Drives the RFx screen. Usage: node tests/ui-rfx.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, clickText, role, tab, toastText, fill, submit } = t;

const btn = label => $$("#view button").find(b => b.textContent.trim() === label);
const rowOf = id => $$('#view tr[data-id="' + id + '"]')[0];
const openRfx = id => click(rowOf(id));

click($("#resetBtn"));

test("buyer sees approved PRs waiting for sourcing, others are told who starts it", () => {
  role("buyer"); tab("rfx");
  check(text().indexOf("Approved PRs waiting for sourcing") >= 0, "waiting panel missing");
  check(btn("Start RFx"), "buyer should see Start RFx");
  role("requester");
  check(!btn("Start RFx") && text().indexOf("Buyer starts this") >= 0);
});

test("going to RFx from an approved request opens the start form with matching suppliers", () => {
  role("buyer"); tab("requests");
  click($$('#view tr[data-id="REQ-1007"]')[0]);
  click(btn("Go to RFx"));
  check($('form[data-form="rfxStart"]'), "start form missing");
  const boxes = $$('input[name="inv"]');
  check(boxes.length === 9, "expected 9 component suppliers, got " + boxes.length);
  const unq = boxes.find(b => b.value === "orbit");
  check(unq && !unq.checked, "not qualified supplier should not be pre-checked");
  const conditional = boxes.find(b => b.value === "kestrel");
  check(conditional && !conditional.checked, "conditional supplier should not be pre-checked");
  check(!$$('input[name="inv"]').some(b => b.value === "meridian"), "MRO only supplier should not be offered");
});

test("bad weights and a lone supplier are blocked with clear messages", () => {
  const f = $('form[data-form="rfxStart"]');
  f.elements.wPrice.value = "60";
  submit(f);
  check(toastText().indexOf("add up to 100") >= 0, "toast: " + toastText());
  f.elements.wPrice.value = "50";
  $$('input[name="inv"]').forEach(b => { b.checked = b.value === "atlas"; });
  submit(f);
  check(toastText().indexOf("two suppliers") >= 0, "toast: " + toastText());
});

test("a valid RFx opens and appears in the list", () => {
  const f = $('form[data-form="rfxStart"]');
  $$('input[name="inv"]').forEach(b => { b.checked = ["northfield", "atlas", "tidewater"].includes(b.value); });
  submit(f);
  check(toastText().indexOf("RFX-3006") >= 0, "toast: " + toastText());
  check(text().indexOf("no quote yet") >= 0, "supplier chips missing");
  const closeBtn = btn("Close bidding and compare");
  check(closeBtn && closeBtn.disabled, "close should be disabled with no quotes");
});

test("quotes can be recorded and revised, and an uninvited price is validated", () => {
  const q = $('form[data-form="rfxQuote"]');
  fill(q, { supplierId: "northfield", unitPrice: "0", leadDays: "20" });
  submit(q);
  check(toastText().indexOf("price") >= 0, "toast: " + toastText());
  fill($('form[data-form="rfxQuote"]'), { supplierId: "northfield", unitPrice: "24", leadDays: "20", terms: "Net 45" });
  submit($('form[data-form="rfxQuote"]'));
  fill($('form[data-form="rfxQuote"]'), { supplierId: "atlas", unitPrice: "23.4", leadDays: "30" });
  submit($('form[data-form="rfxQuote"]'));
  fill($('form[data-form="rfxQuote"]'), { supplierId: "tidewater", unitPrice: "25", leadDays: "15" });
  submit($('form[data-form="rfxQuote"]'));
  check(text().indexOf("3 of 3") >= 0 || $$("#view tr[data-id=RFX-3006] td").some(c => c.textContent.indexOf("3 of 3") >= 0), "three quotes expected");
  check(btn("Close bidding and compare") && !btn("Close bidding and compare").disabled);
});

test("closing bidding shows a scored comparison and an award button per eligible supplier", () => {
  click(btn("Close bidding and compare"));
  check(text().indexOf("Top eligible quote") >= 0, "comparison missing");
  check($$('#view button[data-act="rfxAward"]').length === 3);
  check(toastText().indexOf("Bidding closed") >= 0);
});

test("awarding the top scored supplier needs no note, off ranking needs one", () => {
  const awards = $$('#view button[data-act="rfxAward"]');
  click(awards[2]);
  check(toastText().indexOf("justification") >= 0, "toast: " + toastText());
  $("#awardNote").value = "";
  click($$('#view button[data-act="rfxAward"]')[0]);
  check(toastText().indexOf("Awarded to") >= 0, "toast: " + toastText());
  check(text().indexOf("Awarded to") >= 0);
});

test("a supplier that is not qualified cannot be awarded", () => {
  openRfx("RFX-3003");
  check(text().indexOf("Cannot award") >= 0, "orbit should be blocked");
  const orbitRow = $$("#view table tr").find(r => r.textContent.indexOf("Orbit Controls") >= 0 && r.textContent.indexOf("Cannot award") >= 0);
  check(orbitRow, "orbit row with block missing");
});

test("a conditional supplier needs a written justification", () => {
  role("buyer"); tab("rfx"); openRfx("RFX-3003");
  const pine = $$("#view table tr").find(r => r.textContent.indexOf("Pinecrest") >= 0);
  click(pine.querySelector('button[data-act="rfxAward"]'));
  check(toastText().indexOf("justification") >= 0, "toast: " + toastText());
  $("#awardNote").value = "Only supplier with the required lead time on control boards";
  click($$("#view table tr").find(r => r.textContent.indexOf("Pinecrest") >= 0).querySelector('button[data-act="rfxAward"]'));
  check(toastText().indexOf("Awarded to Pinecrest") >= 0, "toast: " + toastText());
});

test("other roles see the comparison but no quote form or award buttons", () => {
  role("requester"); tab("rfx"); openRfx("RFX-3004");
  check(!$('form[data-form="rfxQuote"]'), "requester should not see the quote form");
  check($$('#view button[data-act="rfxAward"]').length === 0);
  check(text().indexOf("entered by the Buyer") >= 0);
});

test("an awarded RFx points to PO creation, a PO linked one points to the PO", () => {
  role("buyer"); tab("rfx"); openRfx("RFX-3005");
  check(btn("Create the PO"), "create PO button missing");
  openRfx("RFX-3001");
  check(btn("View the PO"), "view PO button missing");
});

t.done();
