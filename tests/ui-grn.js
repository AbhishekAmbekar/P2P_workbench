/* Drives the receipts screen. Usage: node tests/ui-grn.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, role, tab, toastText, submit } = t;

const btnIn = (scope, label) => [...scope.querySelectorAll("button")].find(b => b.textContent.trim() === label);
const openRow = po => [...$$("#view table")[0].querySelectorAll("tr")].find(r => r.textContent.indexOf(po) === 0);
const pick = po => click(btnIn(openRow(po), "Receive"));

click($("#resetBtn"));

test("open POs show what is left to receive and exclude finished ones", () => {
  role("warehouse"); tab("grn");
  const tbl = $$("#view table")[0].textContent;
  check(tbl.indexOf("PO-4001") >= 0 && tbl.indexOf("PO-4006") >= 0, "open POs missing");
  check(tbl.indexOf("PO-4002") < 0 && tbl.indexOf("PO-4004") < 0, "received POs should not be listed");
  check(openRow("PO-4001").textContent.indexOf("800") >= 0, "800 units should be open on PO-4001");
});

test("only the warehouse can post receipts", () => {
  role("buyer"); tab("grn");
  check(!$$("#view button").some(b => b.textContent.trim() === "Receive"));
  check(text().indexOf("Receiving is done by the Warehouse") >= 0);
});

test("over receipt, missing notes and zero quantity are blocked", () => {
  role("warehouse"); tab("grn"); pick("PO-4001");
  let f = $('form[data-form="grnPost"]');
  f.elements.qty.value = "900"; submit(f);
  check(toastText().indexOf("Over receipt") >= 0 && toastText().indexOf("800") >= 0, "toast: " + toastText());
  f = $('form[data-form="grnPost"]');
  f.elements.qty.value = "10"; f.elements.result.value = "Rejected"; f.elements.note.value = ""; submit(f);
  check(toastText().indexOf("note") >= 0, "toast: " + toastText());
  f = $('form[data-form="grnPost"]');
  f.elements.qty.value = "0"; f.elements.result.value = "Accepted"; submit(f);
  check(toastText().indexOf("whole number") >= 0, "toast: " + toastText());
});

test("a rejected delivery is recorded but does not reduce what is still open", () => {
  const f = $('form[data-form="grnPost"]');
  f.elements.qty.value = "30"; f.elements.result.value = "Rejected"; f.elements.note.value = "Plating flaked on 30 plates"; submit(f);
  check(toastText().indexOf("GRN-") >= 0 && toastText().indexOf("rejected") >= 0, "toast: " + toastText());
  check(openRow("PO-4001").textContent.indexOf("800") >= 0, "open quantity should still be 800");
});

test("receiving the rest completes the PO and removes it from the open list", () => {
  pick("PO-4001");
  const f = $('form[data-form="grnPost"]');
  f.elements.qty.value = "800"; f.elements.result.value = "Accepted"; submit(f);
  check(toastText().indexOf("800 accepted") >= 0, "toast: " + toastText());
  check(!openRow("PO-4001"), "PO-4001 should leave the open list");
  check(text().indexOf("Plating flaked") >= 0, "rejection note should appear in history");
});

test("a held receipt shows to everyone but only Quality gets the release form", () => {
  role("warehouse"); tab("grn"); pick("PO-4006");
  const f = $('form[data-form="grnPost"]');
  f.elements.qty.value = "20"; f.elements.result.value = "Hold"; f.elements.note.value = "Label does not match certificate"; submit(f);
  check(text().indexOf("Label does not match certificate") >= 0, "new hold should be listed");
  check(!$('form[data-form="grnRelease"]'), "warehouse should not see the release form");
  check(text().indexOf("Waiting on the Quality role") >= 0);
  role("quality");
  check($$('form[data-form="grnRelease"]').length === 2, "quality should see 2 release forms");
});

test("releasing a hold needs an inspection result, and the outcome flows into the PO", () => {
  role("quality"); tab("grn");
  let f = $$('form[data-form="grnRelease"]')[0];
  const id = f.dataset.id;
  f.elements.note.value = ""; submit(f);
  check(toastText().indexOf("inspection result") >= 0, "toast: " + toastText());
  f = $$('form[data-form="grnRelease"]').find(x => x.dataset.id === id);
  f.elements.decision.value = "Accepted"; f.elements.note.value = "Retested thickness, all rolls in tolerance"; submit(f);
  check(toastText().indexOf("released as accepted") >= 0, "toast: " + toastText());
  check(text().indexOf("Inspection: Retested thickness") >= 0, "inspection note should show in history");
});

test("rejecting a hold records the decision", () => {
  const f = $$('form[data-form="grnRelease"]')[0];
  check(f, "one hold should remain");
  f.elements.decision.value = "Rejected"; f.elements.note.value = "Certificate cannot be reconciled, return to supplier"; submit(f);
  check(toastText().indexOf("released as rejected") >= 0, "toast: " + toastText());
  check(!$('form[data-form="grnRelease"]'), "no holds should remain");
});

test("quality holds appear as a badge for Quality and clear when released", () => {
  role("quality");
  check(!$('#tabs [data-arg="grn"] .badge'), "receipts badge should be gone after releasing all holds");
});

t.done();
