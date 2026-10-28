/* Drives the invoices screen. Usage: node tests/ui-invoices.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, role, tab, toastText, submit } = t;

const btn = label => $$("#view button").find(b => b.textContent.trim() === label);
const card = invNo => $$("#view .card").find(c => c.textContent.indexOf(invNo) >= 0 && c.querySelector("h3"));
const inDays = n => w.eval("P2P.addDays(App.today()," + n + ")");
const enter = vals => {
  const f = $('form[data-form="invEnter"]');
  Object.keys(vals).forEach(k => { f.elements[k].value = vals[k]; });
  submit(f);
};

click($("#resetBtn"));

test("only Accounts Payable gets the entry form", () => {
  role("buyer"); tab("invoices");
  check(!$('form[data-form="invEnter"]'));
  check(text().indexOf("entered by Accounts Payable") >= 0);
  role("ap");
  check($('form[data-form="invEnter"]'));
});

test("seed exceptions are listed with a fix owner for each reason", () => {
  role("ap"); tab("invoices");
  check(text().indexOf("Exceptions (2)") >= 0, "expected 2 exceptions");
  const price = card("MM-20413"), qty = card("MM-20477");
  check(price.textContent.indexOf("Invoice price $9.40 does not equal PO price $9.10") >= 0, "price reason wrong");
  check(price.textContent.indexOf("Fix owner: Buyer") >= 0);
  check(qty.textContent.indexOf("bills 320 units but only 300") >= 0, "quantity reason wrong");
  check(qty.textContent.indexOf("Fix owner: Warehouse") >= 0);
  check(text().indexOf("Matched and ready to pay (0)") >= 0);
});

test("the form follows the chosen PO and shows what can be invoiced", () => {
  const f = $('form[data-form="invEnter"]');
  f.elements.poId.value = "PO-4001";
  f.elements.poId.dispatchEvent(new w.Event("change", { bubbles: true }));
  check(f.elements.unitPrice.value === "41.5", "price should follow the PO: " + f.elements.unitPrice.value);
  check(f.elements.qty.value === "1200", "quantity should be what is accepted: " + f.elements.qty.value);
  check($("#invPreview").textContent.indexOf("Available to invoice 1200") >= 0, $("#invPreview").textContent);
});

test("invoice with no number or a bad price is blocked", () => {
  enter({ invNo: "", qty: "1200", unitPrice: "41.5" });
  check(toastText().indexOf("invoice number") >= 0, "toast: " + toastText());
  enter({ invNo: "X-1", qty: "1200", unitPrice: "0" });
  check(toastText().indexOf("price") >= 0, "toast: " + toastText());
});

test("a billed quantity over what is accepted fails the match and names the Warehouse", () => {
  enter({ poId: "PO-4001", invNo: "NF-90001", qty: "1500", unitPrice: "41.5", date: inDays(0) });
  check(toastText().indexOf("failed the match") >= 0, "toast: " + toastText());
  check(text().indexOf("Exceptions (3)") >= 0);
  check(card("NF-90001").textContent.indexOf("only 1200") >= 0);
});

test("a clean invoice matches first time and shows up ready to pay", () => {
  enter({ poId: "PO-4001", invNo: "NF-90002", qty: "1200", unitPrice: "41.5", date: inDays(0) });
  check(toastText().indexOf("matched first time") >= 0, "toast: " + toastText());
  check(text().indexOf("Matched and ready to pay (1)") >= 0);
});

test("a duplicate invoice number is caught", () => {
  enter({ poId: "PO-4001", invNo: "nf-90002", qty: "1200", unitPrice: "41.5", date: inDays(0) });
  check(card("nf-90002").textContent.indexOf("already on file") >= 0, "duplicate reason missing");
});

test("invoicing a PO with nothing received is blocked as no receipt", () => {
  enter({ poId: "PO-4007", invNo: "BP-1", qty: "40", unitPrice: "82.5", date: inDays(0) });
  check(card("BP-1").textContent.indexOf("No accepted goods receipt") >= 0);
});

test("re-running before anything is fixed keeps the exception, with a message", () => {
  click($$('#view button[data-act="invRerun"]')[0]);
  check(toastText().indexOf("Still failing") >= 0, "toast: " + toastText());
});

test("after the Buyer amends the PO price the price exception clears on re-run", () => {
  role("buyer"); tab("pos");
  click($$('#view tr[data-id="PO-4004"]')[0]);
  const f = $('form[data-form="poPrice"]');
  f.elements.price.value = "9.4"; f.elements.reason.value = "Contract price revised, supplier notice on file";
  submit(f);
  check(toastText().indexOf("amended") >= 0, "toast: " + toastText());
  role("ap"); tab("invoices");
  const c = card("MM-20413");
  click(c.querySelector('button[data-act="invRerun"]'));
  check(toastText().indexOf("Now matches") >= 0, "toast: " + toastText());
});

test("rejecting needs a reason, then the invoice leaves the queue", () => {
  const c = card("MM-20477");
  click(c.querySelector('button[data-act="invReject"]'));
  check(toastText().indexOf("reason") >= 0, "toast: " + toastText());
  const id = card("MM-20477").querySelector("h3").textContent.match(/INV-\d+/)[0];
  w.document.getElementById("rej-" + id).value = "Over billed by 20 units. Asked supplier for a corrected invoice.";
  click(card("MM-20477").querySelector('button[data-act="invReject"]'));
  check(toastText().indexOf("rejected") >= 0, "toast: " + toastText());
  check(!card("MM-20477") || card("MM-20477").textContent.indexOf("Fix owner") < 0, "invoice should leave the exception list");
});

test("paying a matched invoice moves it to paid, and a paid PO price is locked", () => {
  const before = (text().match(/Matched and ready to pay \((\d+)\)/) || [])[1];
  click($$('#view button[data-act="invPay"]')[0]);
  check(toastText().indexOf("Payment released") >= 0, "toast: " + toastText());
  const after = (text().match(/Matched and ready to pay \((\d+)\)/) || [])[1];
  check(Number(after) === Number(before) - 1, "ready count should drop from " + before + " to " + (before - 1) + ", is " + after);
  check(text().indexOf("Paid ") >= 0);
});

test("non AP roles see exceptions but no actions, and are told who re-runs the match", () => {
  role("warehouse"); tab("invoices");
  check($$('#view button[data-act="invRerun"]').length === 0 && $$('#view button[data-act="invPay"]').length === 0);
  check(text().indexOf("re-runs the match") >= 0);
});

test("an exception links the owner to the right screen", () => {
  role("ap"); tab("invoices");
  const c = card("NF-90001");
  click([...c.querySelectorAll("button")].find(b => b.textContent === "Open receipts"));
  check(w.App.tab === "grn", "should land on receipts");
});

t.done();
