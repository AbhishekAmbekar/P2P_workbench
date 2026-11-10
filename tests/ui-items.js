/* Drives the item card and its lessons log. Usage: node tests/ui-items.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, role, tab, toastText, submit } = t;

const card = title => $$(".sec").find(c => c.querySelector("h3").childNodes[0].textContent.trim() === title);

click($("#resetBtn"));

test("an item with a guide shows what it is, a drawing, the specs that matter and what to ask", () => {
  role("buyer");
  w.App.openRecord("MR-203");
  check(text().indexOf("Pump seal overhaul kit") >= 0 && text().indexOf("mechanical seal stops the pumped liquid") >= 0, "what it is");
  check(card("How it fits together").querySelector("svg[role=img]"), "a labeled drawing");
  check(card("Specs that matter, and why").textContent.indexOf("Shaft diameter") >= 0);
  check(card("What to ask the supplier").querySelectorAll("li").length === 4);
});

test("the card shows logged lessons, and the Buyer reads them but cannot log one", () => {
  check(card("Lessons learned").textContent.indexOf("O-rings rated to 80 C") >= 0, "the Engineering lesson");
  check(!$('form[data-form="lesAdd"]'), "the Buyer does not log lessons");
  check(card("Lessons learned").textContent.indexOf("Engineering, Quality and the Requester log lessons") >= 0);
});

test("a look alike item in the master is flagged", () => {
  check(card("You may already have this").textContent.indexOf("MR-209") >= 0, "MR-209 flagged");
  check(card("You may already have this").textContent.indexOf("no stock levels") >= 0, "says honestly it cannot see stock");
});

test("failed technical reviews and held receipts feed the card on their own", () => {
  w.App.openRecord("CP-202");
  check(card("From technical reviews and receipts").textContent.indexOf("Board revision B offered") >= 0, "review failure");
  w.App.openRecord("PK-102");
  check(card("From technical reviews and receipts").textContent.indexOf("Film thickness out of spec") >= 0, "held receipt");
});

test("Quality logs a lesson from the card and it shows at once", () => {
  role("quality");
  w.App.openRecord("MR-402");
  check(card("What it is").textContent.indexOf("Size 6205") >= 0);
  let f = $('form[data-form="lesAdd"]');
  f.elements.what.value = "Bad"; submit(f);
  check(toastText().indexOf("what happened") >= 0, "toast: " + toastText());
  f = $('form[data-form="lesAdd"]');
  f.elements.kind.value = "Receipt or quality check";
  f.elements.what.value = "Two bearings in the box had no maker's marking.";
  f.elements.why.value = "Not known yet";
  f.elements.next.value = "Buy bearings only from the maker or an authorised distributor.";
  f.elements.source.value = "GRN-5004";
  submit(f);
  check(toastText().indexOf("LES-1105 saved") >= 0, "toast: " + toastText());
  check(card("Lessons learned").textContent.indexOf("no maker's marking") >= 0);
});

test("an item without a guide says so and still shows its history", () => {
  w.App.openRecord("MR-405");
  check(card("What it is").textContent.indexOf("No written guide for this item yet") >= 0);
  check(card("Buying history").textContent.indexOf("PO-") >= 0 || card("Buying history").textContent.indexOf("Not bought") >= 0);
});

test("the technical reviewer is pointed to past lessons, and screens link to the card", () => {
  role("engineering"); tab("rfx");
  w.App.sel.rfx = "RFX-3003"; w.App.render();
  check(text().indexOf("lessons from past problems") >= 0 || text().indexOf("lesson from past problems") >= 0, "lessons note on the review");
  role("requester"); tab("projects");
  w.App.sel.projects = "PRJ-9001"; w.App.render();
  check($$('#view a.rec[data-id="MR-203"]').length >= 1, "the project map links the seal kit to its card");
});

test("raising a request for an item with lessons shows them before the spec is written", () => {
  tab("requests");
  click($$("#view button").find(b => b.textContent.trim() === "New request"));
  const f = $('form[data-form="reqSubmit"]');
  f.elements.itemId.value = "MR-203"; f.elements.itemId.dispatchEvent(new w.Event("change", { bubbles: true }));
  check($("#reqLessons").textContent.indexOf("lesson from past problems") >= 0, "lessons note: " + $("#reqLessons").textContent);
  f.elements.itemId.value = "MR-403"; f.elements.itemId.dispatchEvent(new w.Event("change", { bubbles: true }));
  check($("#reqLessons").textContent === "", "gloves have no lessons");
});

test("search finds an item card", () => {
  const P = w.P2P;
  const hits = P.search.search(w.App.state, "seal kit", w.App.now(), w.App.tabs).map(h => h.id);
  check(hits.indexOf("MR-203") >= 0, "hits: " + hits.join());
});

t.done();
