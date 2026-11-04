/* Drives the Service entries screen. Usage: node tests/ui-services.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, role, tab, toastText, submit } = t;

const row = id => [...$$("#view table")[0].querySelectorAll("tr")].find(r => r.textContent.indexOf(id) === 0);
const pick = id => click(row(id));
const btnIn = (scope, label) => [...scope.querySelectorAll("button")].find(b => b.textContent.trim() === label);
const entryRow = id => [...$$("#view tr")].find(r => r.textContent.indexOf(id) === 0);

click($("#resetBtn"));

test("the screen lists only service POs with what is used and what is left", () => {
  role("buyer"); tab("services");
  const tbl = $$("#view table")[0].textContent;
  check(tbl.indexOf("PO-4008") >= 0 && tbl.indexOf("PO-4009") >= 0, "service POs missing");
  check(tbl.indexOf("PO-4001") < 0, "material POs should not be listed");
  check(row("PO-4009").textContent.indexOf("83%") >= 0, "crane hire should be 83% used: " + row("PO-4009").textContent);
});

test("a service PO over 80% used warns that it is running out", () => {
  pick("PO-4009");
  check(text().indexOf("Over 80% of this PO is used") >= 0 && text().indexOf("1 day remains") >= 0, text().slice(0, 600));
});

test("the Buyer cannot record more than is left on the PO", () => {
  const f = $('form[data-form="svcRecord"]');
  f.elements.qty.value = "2"; f.elements.note.value = "Crane day sheet CL-118, two lifts"; submit(f);
  check(toastText().indexOf("past its ordered quantity") >= 0 && toastText().indexOf("1 day") >= 0, "toast: " + toastText());
});

test("the Buyer records work and it waits for the Requester", () => {
  pick("PO-4008");
  const f = $('form[data-form="svcRecord"]');
  f.elements.qty.value = "10.5"; f.elements.note.value = "Weekend shutdown support, timesheet KFS-T-77"; submit(f);
  check(toastText().indexOf("SES-7006 recorded") >= 0, "toast: " + toastText());
  check(entryRow("SES-7006").textContent.indexOf("Waiting for the Requester") >= 0);
  check(!btnIn(entryRow("SES-7006"), "Accept"), "the Buyer should not see Accept");
});

test("only the Buyer sees the record form", () => {
  role("requester"); tab("services"); pick("PO-4008");
  check(!$('form[data-form="svcRecord"]'), "the Requester should not record work");
});

test("sending an entry back needs a reason", () => {
  click(btnIn(entryRow("SES-7006"), "Send back"));
  check(toastText().indexOf("Say what is wrong") >= 0, "toast: " + toastText());
  $("#svcNote-SES-7006").value = "Timesheet shows 8.5 hours, not 10.5";
  click(btnIn(entryRow("SES-7006"), "Send back"));
  check(toastText().indexOf("Sent back") >= 0, "toast: " + toastText());
  check(entryRow("SES-7006").textContent.indexOf("Rejected") >= 0);
});

test("accepting the waiting entry lets the blocked invoice match", () => {
  role("ap"); tab("invoices");
  const clearing = () => [...$$("#view .card")].find(c => c.textContent.indexOf("Waiting on a receipt or service confirmation") >= 0).textContent;
  check(clearing().indexOf("(2)") >= 0 && clearing().indexOf("PO-4008") >= 0 && clearing().indexOf("Requester") >= 0, "clearing list: " + clearing().slice(0, 300));
  role("requester"); tab("services"); pick("PO-4008");
  click(btnIn(entryRow("SES-7003"), "Accept"));
  check(toastText().indexOf("Accepted") >= 0, "toast: " + toastText());
  role("ap"); tab("invoices");
  const card = [...$$("#view .card")].find(c => c.textContent.indexOf("KFS-2291") >= 0 && btnIn(c, "Re-run the match"));
  check(card, "exception card for KFS-2291");
  click(btnIn(card, "Re-run the match"));
  check(toastText().indexOf("match") >= 0 || toastText().indexOf("Match") >= 0, "toast: " + toastText());
  check(clearing().indexOf("(1)") >= 0 && clearing().indexOf("PO-4008") < 0, "the service invoice should leave the clearing list");
});

test("the PO page shows consumption and the entry has its own record page", () => {
  role("buyer"); w.location.hash = "#PO-4008"; w.dispatchEvent(new w.HashChangeEvent("hashchange"));
  check(text().indexOf("Service consumption") >= 0, "PO record page");
  w.location.hash = "#SES-7003"; w.dispatchEvent(new w.HashChangeEvent("hashchange"));
  check(text().indexOf("SES-7003") >= 0 && text().indexOf("Accepted") >= 0, "SES page");
});

test("Quality can renew a document for a service supplier missing from older saved data", () => {
  delete w.App.state.docs.keystone;            // as in data saved before the service suppliers existed
  role("quality"); tab("suppliers");
  const f = $('form[data-form="docRenew"]');
  f.elements.supplierId.value = "keystone"; f.elements.docType.value = "quality";
  f.elements.note.value = "Certificate QC-2207 checked by Quality"; submit(f);
  check(toastText().indexOf("Renewal recorded") >= 0, "toast: " + toastText());
});

t.done();
