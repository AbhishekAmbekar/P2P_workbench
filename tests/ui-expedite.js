/* Drives the Expedite screen and its email drafts. Usage: node tests/ui-expedite.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, role, tab, toastText, submit } = t;

const btn = label => $$("#view button").find(b => b.textContent.trim() === label);
const change = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("change", { bubbles: true })); };
const typeIn = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
const form = () => $('form[data-change="chaseEdit"]');
const rows = () => $$("#view table tr").slice(1);
const state = () => JSON.parse(w.localStorage.getItem("p2p-workbench-v2")).state;

// Stand ins for the browser features jsdom does not have. The app must call them with the right things.
let opened = [], copied = [], downloads = [];
w.open = (url) => { opened.push(url); return null; };
w.navigator.clipboard = { writeText: s => { copied.push(s); return { then: ok => ok() }; } };
w.URL.createObjectURL = () => "blob:test";
w.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };

click($("#resetBtn"));

test("the list is ranked and the buyer tab badge counts it", () => {
  role("buyer");
  check($('#tabs [data-arg="expedite"] .badge').textContent === "4", "badge should show 4");
  tab("expedite");
  check(rows().length === 4, "expected 4 rows, got " + rows().length);
  check(rows()[0].textContent.indexOf("PO-4006") >= 0 && rows()[0].textContent.indexOf("Late") >= 0, "worst PO should be first: " + rows()[0].textContent);
  check(rows()[0].textContent.indexOf("Promised 5 days after the need by date") >= 0);
  check(text().indexOf("no email saved") >= 0, "demo suppliers have no address");
});

test("other roles can read the list but cannot draft", () => {
  role("warehouse"); tab("expedite");
  check(rows().length === 4);
  check(!btn("Draft email"), "warehouse should not see Draft email");
  check(text().indexOf("The Buyer chases suppliers") >= 0);
  role("buyer");
});

test("drafting builds a message from the PO", () => {
  click(rows()[0].querySelector('button[data-act="chasePick"]'));
  check(form(), "draft form missing");
  check(form().elements.subject.value === "PO-4006: can the delivery date move up?", form().elements.subject.value);
  const b = form().elements.body.value;
  check(b.indexOf("Hi Meridian MRO team") === 0 && b.indexOf("20 cases of Grease cartridge") > 0 && b.indexOf("Jordan Lee") > 0, b);
  check(form().elements.to.value === "", "no address yet");
  check(form().elements.remember.checked, "remember should start ticked");
});

test("changing the message type rewrites the draft", () => {
  change(form().elements.kind, "overdue");
  check(form().elements.subject.value.indexOf("past the promised date") > 0, form().elements.subject.value);
  change(form().elements.kind, "late");
  check(form().elements.subject.value.indexOf("can the delivery date move up") > 0);
});

test("a bad address is refused and nothing is logged", () => {
  const before = state().audit.length;
  typeIn(form().elements.to, "oops");
  click(btn("Open in Gmail"));
  check(toastText().indexOf("does not look like an email") >= 0, "toast: " + toastText());
  check(opened.length === 0, "nothing should open");
  check(state().audit.length === before, "no audit entry for a refused draft");
});

test("opening in Gmail uses what is on screen, saves the address, and logs a draft", () => {
  typeIn(form().elements.to, "orders@example.com");
  typeIn(form().elements.body, "Hi team,\n\nMy own edited text.\n\nJordan");
  click(btn("Open in Gmail"));
  check(opened.length === 1 && opened[0].indexOf("https://mail.google.com/mail/?view=cm") === 0, "gmail url: " + opened[0]);
  check(opened[0].indexOf("to=orders%40example.com") > 0 && decodeURIComponent(opened[0]).indexOf("My own edited text.") > 0, "edits must be in the link");
  check(toastText().indexOf("Draft opened in Gmail") >= 0, "toast: " + toastText());
  const a = state().audit.slice(-2);
  check(a.some(x => x.action.indexOf("Supplier email saved for Meridian MRO") === 0), "saved address should be logged");
  const last = state().audit[state().audit.length - 1];
  check(last.action.indexOf("Chase email drafted for Meridian MRO") === 0 && last.note.indexOf("Gmail") > 0, JSON.stringify(last));
  check(state().contacts.meridian === "orders@example.com", "address should persist");
});

test("the list shows the last draft date and the address is remembered for the next draft", () => {
  const today = w.eval("App.today()");
  check(rows()[0].textContent.indexOf(today) >= 0, "last draft date missing: " + rows()[0].textContent);
  check(rows()[0].textContent.indexOf("no email saved") < 0, "address should now be saved");
  click(btn("Close"));
  check(!form(), "form should close");
  click(rows()[0].querySelector('button[data-act="chasePick"]'));
  check(form().elements.to.value === "orders@example.com", "address should be filled in");
  check(!form().elements.remember.checked, "remember should not start ticked when one is already saved");
});

test("copy and file download both work and are logged with how the draft was used", () => {
  click(btn("Copy text"));
  check(copied.length === 1 && copied[0].indexOf("To: orders@example.com\nSubject: PO-4006") === 0, copied[0]);
  check(toastText().indexOf("Copied") >= 0);
  click(btn("Download draft file"));
  check(downloads[0] === "PO-4006-chase.eml", "file name: " + downloads[0]);
  const notes = state().audit.filter(x => x.action.indexOf("Chase email drafted") === 0).map(x => x.note);
  check(notes.some(n => n.indexOf("copy") > 0) && notes.some(n => n.indexOf("a draft file") > 0), notes.join(" | "));
});

test("opening in the mail app and in Outlook also work", () => {
  click(btn("Open in mail app"));
  check(toastText().indexOf("Draft opened in your mail app") >= 0, "toast: " + toastText());
  click(btn("Open in Outlook"));
  check(opened[1].indexOf("https://outlook.office.com/mail/deeplink/compose") === 0, opened[1]);
});

test("the audit trail shows the draft under POs and never says sent", () => {
  tab("audit");
  change($('select[name="kind"]'), "PO");
  const body = $("#view table").textContent;
  check(body.indexOf("Chase email drafted for Meridian MRO") >= 0, "draft entry missing");
  check(body.indexOf("cannot tell if it was sent") >= 0);
  check(!/email sent/i.test(body), "the app must not claim it sent mail");
  change($('select[name="kind"]'), "");
});

test("every role can open the Expedite tab without an error", () => {
  [...$("#roleSel").options].forEach(o => {
    role(o.value); tab("expedite");
    check(text().indexOf("Could not draw") < 0, o.value + ": " + text().slice(0, 100));
  });
});

t.done();
