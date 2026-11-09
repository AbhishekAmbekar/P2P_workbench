/* Drives the Projects screen and the project links on requests. Usage: node tests/ui-projects.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, role, tab, toastText, submit } = t;

const listRows = () => [...$$("#view table")[0].querySelectorAll("tr[data-id]")];
const row = id => listRows().find(r => r.dataset.id === id);
const btn = label => $$("#view button").find(b => b.textContent.trim() === label);
const change = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("change", { bubbles: true })); };

click($("#resetBtn"));

test("the list shows every project, worst first, with what holds it up", () => {
  role("requester"); tab("projects");
  check(listRows().length === 5, "five projects, got " + listRows().length);
  check(listRows()[0].dataset.id === "PRJ-9001", "the pump overhaul is worst, got " + listRows()[0].dataset.id);
  check(row("PRJ-9001").textContent.indexOf("Pump seal overhaul kit") >= 0 && row("PRJ-9001").textContent.indexOf("$8,400") >= 0, row("PRJ-9001").textContent);
  check(row("PRJ-9004").textContent.indexOf("5 d") >= 0, "a project with no cost per day shows days, not dollars");
});

test("a project shows each item's step, who holds it, and the gating item with its cost", () => {
  click(row("PRJ-9001"));
  check(text().indexOf("Holding the project up: Pump seal overhaul kit") >= 0, "gating note");
  check(text().indexOf("At $4,200 a day of downtime, that costs $8,400") >= 0, "cost of delay");
  check($$("#view tr.gate").length === 1, "the gating row is marked");
  check([...$$("#view tr")].some(r => r.textContent.indexOf("Maintenance technician labor") >= 0 && r.textContent.indexOf("Manager") >= 0), "the technician request waits on the Manager");
  check($$("#view .stg.cur").length >= 3, "rows show where they wait");
  check(text().indexOf("Timeline to the target date") >= 0);
});

test("a project without a cost per day says so instead of inventing one", () => {
  click(row("PRJ-9004"));
  check(text().indexOf("No downtime cost per day is set, so the delay is shown in days") >= 0, "days note");
  check(text().indexOf("Quality, receipt on hold") >= 0, "the film on quality hold blocks it");
});

test("the Requester creates a project and adds a request to it", () => {
  click(btn("New project"));
  let f = $('form[data-form="prjCreate"]');
  f.elements.name.value = "x"; submit(f);
  check(toastText().indexOf("name people will recognise") >= 0, "toast: " + toastText());
  f = $('form[data-form="prjCreate"]');
  f.elements.name.value = "Compressor C-3 rebuild"; f.elements.criticality.value = "Low"; submit(f);
  check(toastText().indexOf("PRJ-9006 created") >= 0, "toast: " + toastText());
  check(text().indexOf("No requests in this project yet") >= 0);
  const sel = $("#prjAdd-PRJ-9006");
  sel.value = "REQ-1012";
  click(btn("Add"));
  check(toastText().indexOf("REQ-1012 added to PRJ-9006") >= 0, "toast: " + toastText());
  check(text().indexOf("Pump seal overhaul kit") >= 0, "the request now shows in the project");
});

test("a new request can be raised straight into a project", () => {
  tab("requests"); click(btn("New request"));
  const f = $('form[data-form="reqSubmit"]');
  change(f.elements.itemId, "MR-401");
  f.elements.reason.value = "Spare hoses for the compressor rebuild";
  f.elements.projectId.value = "PRJ-9006";
  submit(f);
  check(toastText().indexOf("REQ-1022") >= 0, "toast: " + toastText());
  check(text().indexOf("Part of PRJ-9006") >= 0, "the request panel names its project");
});

test("the Buyer follows projects but cannot create one, and can add a request to a project", () => {
  role("buyer"); tab("projects");
  check(!btn("New project"), "only the Requester creates projects");
  tab("requests");
  w.App.sel.reqFilter = "all"; w.App.sel.requests = "REQ-1007"; w.App.render();
  const pick = $("#prjPick-REQ-1007");
  check(pick, "the Buyer sees a project picker on a request");
});

test("the project has its own record page with its history", () => {
  w.App.openRecord("PRJ-9001");
  check(text().indexOf("Line 2 pump P-204 overhaul") >= 0 && text().indexOf("Where each item stands") >= 0 && text().indexOf("Project created") >= 0, "record page");
  w.App.openRecord("PO-4011");
  check(text().indexOf("PRJ-9001") >= 0, "the PO page links to its project");
});

t.done();
