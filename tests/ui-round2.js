/* Drives a best and final round (round 2) on the demo's control board RFx. Usage: node tests/ui-round2.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, role, tab, toastText, submit } = t;

const btn = label => $$("#view button").find(b => b.textContent.trim() === label);
const openRfx = id => click($$('#view tr[data-id="' + id + '"]')[0]);
const offerForm = sup => $('form[data-form="r2Offer"][data-sup="' + sup + '"]');

click($("#resetBtn"));

test("after the technical review the Buyer gets a suggested next step", () => {
  role("buyer"); tab("rfx"); openRfx("RFX-3003");
  check(text().indexOf("Suggested next step.") >= 0 && text().indexOf("2 eligible offers") >= 0, "strategy hint");
  check(text().indexOf("not a calculated optimum") >= 0, "the hint says what it is");
  check($('form[data-form="r2Open"]'), "the Buyer can open round 2");
  role("director"); tab("rfx"); openRfx("RFX-3003");
  check(!$('form[data-form="r2Open"]'), "only the Buyer opens it");
});

test("opening round 2 invites only the eligible offers and tells each its rank", () => {
  role("buyer"); tab("rfx"); openRfx("RFX-3003");
  submit($('form[data-form="r2Open"]'));
  check(toastText().indexOf("Round 2 is open") >= 0, "toast: " + toastText());
  check(offerForm("brightpath") && offerForm("pinecrest") && !offerForm("orbit"), "Orbit failed the review and is not invited");
  check(text().indexOf("1st of 2") >= 0 && text().indexOf("2nd of 2") >= 0);
  check(!btn("Recommend") && $$('#view button[data-act="rfxAward"]').length === 0, "no award while round 2 is open");
});

test("the email draft shows only that supplier's rank and offer", () => {
  click($$('#view button[data-act="r2Draft"]').find(b => b.dataset.sup === "pinecrest"));
  const body = $("form[data-r2mail]").elements.body.value;
  check(body.indexOf("ranks 2nd of 2") >= 0 && body.indexOf("$610.00 per unit") >= 0, "rank and own offer");
  check(body.indexOf("Brightpath") < 0 && body.indexOf("628") < 0, "nothing about the other offer");
  click($$('#view button[data-act="r2Mail"]').find(b => b.dataset.via === "copy"));
  check(w.App.state.audit.some(a => a.action === "Round 2 email drafted for Pinecrest Cable"), "logged as drafted");
});

test("a worse offer is refused, a better one is saved", () => {
  let f = offerForm("pinecrest");
  f.elements.unitPrice.value = "615"; submit(f);
  check(toastText().indexOf("higher than its binding round 1 price of $610.00") >= 0, "toast: " + toastText());
  f = offerForm("brightpath");
  f.elements.unitPrice.value = "612"; submit(f);
  check(toastText().indexOf("Brightpath Electronics's round 2 offer saved") >= 0, "toast: " + toastText());
  check(text().indexOf("Received") >= 0);
});

test("closing round 2 shows the saving, and the approver sees it", () => {
  click(btn("Close round 2 and compare"));
  check(toastText().indexOf("Round 2 closed") >= 0);
  check(text().indexOf("Saved against round 1, on landed cost for 40: Brightpath Electronics $640.00 (2.5%)") >= 0, "saving: " + text().slice(0, 0));
  check(!$('form[data-form="r2Open"]'), "one round only");
  click($$('#view button[data-act="rfxAward"]').find(b => b.dataset.sup === "brightpath"));
  check(toastText().indexOf("sent for approval: Director.") >= 0, "toast: " + toastText());
  role("director"); tab("rfx"); openRfx("RFX-3003");
  check(text().indexOf("Round 2 lowered this offer by $640.00 (2.5%)") >= 0, "the Director sees the round 2 saving");
  w.App.openRecord("RFX-3003");
  check(text().indexOf("Closed") >= 0 && text().indexOf("Brightpath Electronics $640.00") >= 0, "the record page shows round 2");
});

t.done();
