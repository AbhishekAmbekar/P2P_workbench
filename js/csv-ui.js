/* CSV bar shown at the top of each screen: Export CSV, and Import CSV where the screen has one.
 * The rules live in js/csv.js. This file only draws the bar and the import panel and moves files in and out.
 * App.sel.csvOpen holds the tab whose import panel is open. App.sel.csvResult holds the last import outcome. */
(function () {
  "use strict";
  var App = window.App, P = App.P, C = P.csv, esc = App.esc;
  var SHOW = 50;

  App.csv = { last: null };

  // Saves text as a file. Excel needs the byte order mark to read the file as UTF-8.
  function download(f) {
    App.csv.last = f;
    var blob = new Blob(["﻿" + f.text], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) { /* nothing to free */ } }, 2000);
  }

  App.actions.csvExport = function (el) {
    try {
      var f = C.exportCSV(App.state, el.dataset.arg, App.now());
      download(f);
      App.toast("Downloaded " + f.name + " with " + f.rows + " row" + (f.rows === 1 ? "" : "s") + ".");
    } catch (e) { App.toast(e.message, true); }
  };
  App.actions.csvTemplate = function (el) {
    try { var f = C.template(el.dataset.arg); download(f); App.toast("Downloaded " + f.name + "."); }
    catch (e) { App.toast(e.message, true); }
  };
  App.actions.csvToggle = function (el) {
    App.sel.csvOpen = App.sel.csvOpen === el.dataset.arg ? null : el.dataset.arg;
    App.sel.csvResult = null;
    App.render();
  };

  // Runs an import and keeps the result only if every row passed. Also used by the tests.
  App.csvImport = function (id, text, fileName) {
    var spec = C.imports.filter(function (x) { return x.id === id; })[0], res;
    try {
      res = C.runImport(App.state, id, text, App.role, App.now(), {
        requester: App.roleInfo("requester").persona.split(",")[0], fileName: fileName || ""
      });
    } catch (e) {
      App.sel.csvResult = { tab: spec ? spec.tab : App.tab, ok: false, file: fileName, errors: [{ row: null, text: e.message }], rows: [] };
      App.render(); App.toast(e.message, true);
      return null;
    }
    App.sel.csvResult = { tab: spec.tab, ok: res.ok, file: fileName, errors: res.errors, rows: res.rows };
    if (res.ok) {
      App.state = res.state;
      App.save(); App.render();
      App.toast("Imported " + res.total + " row" + (res.total === 1 ? "" : "s") + ".");
    } else {
      App.render();
      App.toast("Nothing was imported. " + res.errors.length + " row" + (res.errors.length === 1 ? " needs" : "s need") + " fixing.", true);
    }
    return res;
  };

  document.addEventListener("change", function (e) {
    var input = e.target;
    if (!input.matches || !input.matches("input[type=file][data-import]") || !input.files || !input.files[0]) return;
    var file = input.files[0], reader = new FileReader();
    reader.onload = function () { App.csvImport(input.dataset.import, String(reader.result), file.name); };
    reader.onerror = function () { App.toast("Could not read that file.", true); };
    reader.readAsText(file);
  });

  function resultHtml(r) {
    var list = function (items) {
      var shown = items.slice(0, SHOW).map(function (x) { return "<li>" + (x.row ? "Row " + x.row + ": " : "") + esc(x.text) + "</li>"; }).join("");
      var more = items.length > SHOW ? "<li>and " + (items.length - SHOW) + " more</li>" : "";
      return '<ul style="margin:6px 0;padding-left:20px">' + shown + more + "</ul>";
    };
    if (r.ok) return '<div class="note"><b>Imported ' + r.rows.length + " row" + (r.rows.length === 1 ? "" : "s") + (r.file ? " from " + esc(r.file) : "") + ".</b>" + list(r.rows) + "</div>";
    return '<div class="note bad"><b>Nothing was imported.</b> Fix ' + (r.errors.length === 1 && !r.errors[0].row ? "this" : "these rows") +
      " and try again. Row numbers count the heading as row 1." + list(r.errors) + "</div>";
  }

  function panel(tab, specs) {
    var spec = specs.filter(function (x) { return x.role === App.role; })[0];
    if (!spec) {
      return '<div class="card" style="margin-bottom:12px"><p class="hint" style="margin:0">' + specs.map(function (x) {
        return esc(x.title) + " is for the " + esc(P.roleLabel(x.role)) + " role.";
      }).join(" ") + " Switch roles at the top.</p></div>";
    }
    var cols = '<div class="wrap"><table><tr><th>Column</th><th>Needed</th><th>What to put</th></tr>' + spec.cols.map(function (c) {
      return "<tr><td>" + esc(c.label) + "</td><td>" + (c.req ? "Yes" : "No") + '</td><td class="muted">' + esc(c.help) + "</td></tr>";
    }).join("") + "</table></div>";
    var r = App.sel.csvResult && App.sel.csvResult.tab === tab ? App.sel.csvResult : null;
    return '<div class="card" style="margin-bottom:12px"><h3>' + esc(spec.title) + "</h3>" +
      '<p class="hint">' + esc(spec.intro) + " Each row goes through the same checks as the form. If any row fails, nothing is imported and every problem is listed. " +
      "Dates can be 2026-12-15 or 12/15/2026. Up to " + C.MAX_ROWS.toLocaleString("en-US") + " rows at a time.</p>" + cols +
      '<div class="actions csvpick"><button type="button" class="ghost" data-act="csvTemplate" data-arg="' + spec.id + '">Download template</button>' +
      '<label>Choose a CSV file <input type="file" accept=".csv,text/csv" data-import="' + spec.id + '"></label></div>' +
      (r ? resultHtml(r) : "") + "</div>";
  }

  // The buttons go in the screen's header band. The import panel, when open, goes just under it.
  App.csvParts = function (tab) {
    // Import shows only to a role that can run an import on this screen. Export is for everyone.
    var canExport = !!C.exports[tab], specs = C.importsFor(tab).filter(function (x) { return x.role === App.role; });
    if (!canExport && !specs.length) return { bar: "", panel: "" };
    var open = App.sel.csvOpen === tab && specs.length;
    return { bar: '<div class="csvbar">' +
      (canExport ? '<button type="button" class="small ghost" data-act="csvExport" data-arg="' + tab + '">Export CSV</button>' : "") +
      (specs.length ? '<button type="button" class="small ghost" data-act="csvToggle" data-arg="' + tab + '">' + (open ? "Close import" : "Import CSV") + "</button>" : "") +
      "</div>", panel: open ? panel(tab, specs) : "" };
  };
})();
