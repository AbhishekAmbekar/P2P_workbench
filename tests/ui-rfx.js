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

test("an adjustment value out of range and a lone supplier are blocked with clear messages", () => {
  const f = $('form[data-form="rfxStart"]');
  check(f.elements.capitalPct.value === "8" && f.elements.bufferDays.value === "10", "the defaults are filled in");
  f.elements.capitalPct.value = "45";
  submit(f);
  check(toastText().indexOf("Cost of capital (% a year) must be between 0 and 30") >= 0, "toast: " + toastText());
  f.elements.capitalPct.value = "8";
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

test("the Buyer can change the adjustment values while bidding is open, and each offer shows its bonus and malus", () => {
  const f = $('form[data-form="rfxAdjust"]');
  check(f, "the values are editable while open");
  f.elements.bufferDays.value = "12";
  submit(f);
  check(toastText().indexOf("Adjustment values saved") >= 0, "toast: " + toastText());
  check(text().indexOf("Malus") >= 0 && text().indexOf("short of the 12 day buffer") >= 0, "malus lines use the new buffer");
  check(text().indexOf("Adjusted unit") >= 0);
});

// The technical reviewer marks every offer acceptable, then sends the recommendation to the Buyer.
function techAllOk() {
  $$('form[data-form="rfxTech"]').forEach((f, i) => {
    const form = $$('form[data-form="rfxTech"]')[i];
    form.elements.result.value = "Acceptable";
    submit(form);
  });
  click(btn("Send to the Buyer"));
}

test("closing bidding sends the RFx to the technical reviewer before any award", () => {
  click(btn("Close bidding and compare"));
  check(toastText().indexOf("Bidding closed") >= 0);
  check(text().indexOf("Technical evaluation by Requester") >= 0, "reviewer missing");
  check($$('#view button[data-act="rfxAward"]').length === 0, "no award buttons during technical review");
  check(text().indexOf("Waiting for the Requester") >= 0, "buyer is told who is next");
});

test("the reviewer must give a reason for a failed offer and evaluate every offer before sending", () => {
  role("requester"); tab("rfx"); openRfx("RFX-3006");
  check($$('form[data-form="rfxTech"]').length === 3, "one row per offer");
  check(btn("Send to the Buyer").disabled, "send is disabled until all are done");
  const f = $$('form[data-form="rfxTech"]')[0];
  f.elements.result.value = "Not acceptable"; f.elements.note.value = "";
  submit(f);
  check(toastText().indexOf("does not meet the spec") >= 0, "toast: " + toastText());
  techAllOk();
  check(toastText().indexOf("Technical recommendation sent to the Buyer") >= 0, "toast: " + toastText());
});

test("the Buyer recommends among acceptable offers, and off ranking needs a note", () => {
  role("buyer"); tab("rfx"); openRfx("RFX-3006");
  check(text().indexOf("Lowest eligible") >= 0 && text().indexOf("Ranked on the adjusted price") >= 0, "comparison missing");
  const recs = $$('#view button[data-act="rfxAward"]');
  check(recs.length === 3 && recs[0].textContent === "Recommend", "three Recommend buttons");
  click(recs[2]);
  check(toastText().indexOf("justification") >= 0, "toast: " + toastText());
  $("#awardNote").value = "";
  click($$('#view button[data-act="rfxAward"]')[0]);
  check(toastText().indexOf("sent for approval: Director.") >= 0, "a clean $19,600 award goes to the Director only: " + toastText());
  check(text().indexOf("Award pending approval") >= 0 && text().indexOf("Waiting for the Director") >= 0);
  check(text().indexOf("locked when bidding closed") >= 0 && !$('form[data-form="rfxAdjust"]'), "values are locked after close");
  check(/is \$[\d,.]+ (higher|lower) for the order on the same basis/.test(text()), "the approver sees the gap to the next offer");
});

test("the Director approves the award, and only then can a PO follow", () => {
  role("director"); tab("rfx"); openRfx("RFX-3006");
  click(btn("Reject, back to the Buyer"));
  check(toastText().indexOf("reason") >= 0, "a rejection needs a reason");
  click(btn("Approve award"));
  check(toastText().indexOf("Award approved") >= 0, "toast: " + toastText());
  role("buyer"); tab("rfx"); openRfx("RFX-3006");
  check(text().indexOf("Awarded to") >= 0 && btn("Create the PO"), "award stands, PO can be created");
});

test("an offer that failed the technical check cannot be recommended", () => {
  openRfx("RFX-3003");
  const orbitRow = $$("#view table tr").find(r => r.textContent.indexOf("Orbit Controls") >= 0);
  check(orbitRow && orbitRow.textContent.indexOf("Not acceptable") >= 0 && orbitRow.textContent.indexOf("revision C") >= 0, "technical note shown");
  check(orbitRow.textContent.indexOf("Fails spec") >= 0 && !orbitRow.querySelector('button[data-act="rfxAward"]'), "orbit should be blocked");
});

test("a conditional supplier needs a written justification and goes to the Executive too", () => {
  role("buyer"); tab("rfx"); openRfx("RFX-3003");
  const pine = $$("#view table tr").find(r => r.textContent.indexOf("Pinecrest") >= 0);
  click(pine.querySelector('button[data-act="rfxAward"]'));
  check(toastText().indexOf("justification") >= 0, "toast: " + toastText());
  $("#awardNote").value = "Only supplier with the required lead time on control boards";
  click($$("#view table tr").find(r => r.textContent.indexOf("Pinecrest") >= 0).querySelector('button[data-act="rfxAward"]'));
  check(toastText().indexOf("Director, then Executive") >= 0, "toast: " + toastText());
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
