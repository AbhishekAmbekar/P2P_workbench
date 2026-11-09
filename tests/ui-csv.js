/* Drives the CSV bar on each screen. Usage: node tests/ui-csv.js <jsdom folder> */
const t = require("./ui-smoke.js");
const { w, $, $$, test, check, text, click, role, tab, toastText } = t;

// jsdom has no object URLs, so record what would be downloaded.
let downloads = 0;
w.URL.createObjectURL = () => { downloads++; return "blob:test"; };
w.URL.revokeObjectURL = () => {};

const btn = label => $$("#view button").find(b => b.textContent.trim() === label);
const panel = () => $("#view .card");
const grnCount = () => w.App.state.grns.length;

click($("#resetBtn"));

test("every screen with records has Export CSV, the guide has none", () => {
  role("buyer");
  ["dashboard", "requests", "rfx", "pos", "expedite", "grn", "invoices", "suppliers", "audit"].forEach(id => {
    tab(id); check(btn("Export CSV"), "no export on " + id);
  });
  tab("guide"); check(!btn("Export CSV") && !btn("Import CSV"), "guide should have no CSV bar");
});

test("export downloads a CSV of the records on that screen", () => {
  tab("pos"); const before = downloads;
  click(btn("Export CSV"));
  check(downloads === before + 1, "no download started");
  const f = w.App.csv.last;
  check(/^p2p-purchase-orders-\d{4}-\d\d-\d\d\.csv$/.test(f.name), "file name " + f.name);
  check(f.text.indexOf("PO-4001") >= 0 && f.text.indexOf("PO,Request,PR") === 0, "content");
  check(toastText().indexOf("13 rows") >= 0, "toast " + toastText());
});

test("import shows only on screens that have one, and only to the role that runs it", () => {
  tab("audit"); check(!btn("Import CSV"), "audit should not import");
  tab("expedite"); check(!btn("Import CSV"), "expedite should not import");
  role("buyer"); tab("grn");
  check(!btn("Import CSV"), "the Buyer cannot import receipts");
  check(btn("Export CSV"), "export stays for everyone");
  role("warehouse"); tab("grn"); click(btn("Import CSV"));
});

test("the right role sees the columns, a template and a file picker", () => {
  role("warehouse");
  check(text().indexOf("Import receipts") >= 0);
  check(panel().textContent.indexOf("Over receipt is blocked") >= 0);
  check($('#view input[type=file][data-import="receipts"]'), "file picker missing");
  click(btn("Download template"));
  check(w.App.csv.last.name === "p2p-receipts-template.csv", "template name");
  check(w.App.csv.last.text.trim() === "PO,Quantity,Result,Note", "template headings " + w.App.csv.last.text);
});

test("a file with a bad row imports nothing and lists the rows to fix", () => {
  const n = grnCount();
  w.App.csvImport("receipts", "PO,Quantity\nPO-4006,5\nPO-4006,500\n", "bad.csv");
  check(grnCount() === n, "nothing should be saved");
  check(text().indexOf("Nothing was imported") >= 0, "error note missing");
  check(text().indexOf("Row 3: Over receipt") >= 0, "row message missing: " + text());
  check(toastText().indexOf("1 row needs fixing") >= 0, "toast " + toastText());
});

test("a good file imports every row, saves, and lists what was done", () => {
  const n = grnCount();
  w.App.csvImport("receipts", "PO,Quantity,Result,Note\nPO-4006,5,,\nPO-4007,2,Hold,Check labels\n", "good.csv");
  check(grnCount() === n + 2, "two receipts expected");
  check(text().indexOf("Imported 2 rows from good.csv") >= 0, "summary missing");
  const saved = JSON.parse(w.localStorage.getItem("p2p-workbench-v2")).state;
  check(saved.grns.length === n + 2, "not saved");
  check(saved.audit[saved.audit.length - 1].action === "Imported 2 receipts from good.csv", "audit entry");
});

test("closing the panel hides it and the import result", () => {
  click(btn("Close import"));
  check(!$("#view input[type=file]") && text().indexOf("Imported 2 rows") < 0);
});

// A real file pick goes through FileReader, which finishes after this turn.
const fileTest = new Promise(resolve => {
  role("ap"); tab("invoices"); click(btn("Import CSV"));
  const input = $('#view input[type=file][data-import="invoices"]');
  const file = new w.File(["Invoice number,PO,Quantity,Unit price,Invoice date\nNF-1,PO-4001,1200,41.50,2026-11-01\n"], "inv.csv", { type: "text/csv" });
  Object.defineProperty(input, "files", { value: [file] });
  const n = w.App.state.invoices.length;
  input.dispatchEvent(new w.Event("change", { bubbles: true }));
  setTimeout(() => {
    test("choosing a file runs the import", () => {
      check(w.App.state.invoices.length === n + 1, "invoice not added");
      check(text().indexOf("Imported 1 row from inv.csv") >= 0, "summary missing");
    });
    resolve();
  }, 200);
});

fileTest.then(() => t.done());
