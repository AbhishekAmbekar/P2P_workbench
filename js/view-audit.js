/* Audit trail: every action the engine took, who did it and what changed. Newest first. */
(function () {
  "use strict";
  var App = window.App, P = App.P, REF = App.REF, esc = App.esc;

  var KINDS = [
    { id: "", label: "All records" }, { id: "REQ", label: "Requests and PRs" }, { id: "RFX", label: "RFx" },
    { id: "PO", label: "Purchase orders" }, { id: "GRN", label: "Receipts" }, { id: "INV", label: "Invoices" }
  ];
  var LIMIT = 200;

  App.actions.auditChange = function (target) {
    App.sel.audit = App.sel.audit || {};
    App.sel.audit[target.name] = target.value;
    App.render();
  };

  function when(iso) { return String(iso).slice(0, 16).replace("T", " "); }

  App.views.audit = function () {
    var f = App.sel.audit || {}, kind = f.kind || "", who = f.who || "";
    var all = App.state.audit.slice().reverse().filter(function (a) {
      return (!kind || a.entity.indexOf(kind + "-") === 0) && (!who || a.role === who);
    });
    var rows = all.slice(0, LIMIT);

    var kindOpts = KINDS.map(function (k) {
      return '<option value="' + k.id + '"' + (k.id === kind ? " selected" : "") + ">" + esc(k.label) + "</option>";
    }).join("");
    var roleOpts = '<option value="">All roles</option>' + REF.roles.map(function (r) {
      return '<option value="' + r.id + '"' + (r.id === who ? " selected" : "") + ">" + esc(r.label) + "</option>";
    }).join("");

    return "<h2>Audit trail</h2>" +
      '<p class="hint">Every action is recorded with the role that took it, the record it touched and the reason. Nothing here can be edited.</p>' +
      '<form data-change="auditChange" class="form" style="margin-bottom:10px;grid-template-columns:repeat(auto-fit,minmax(200px,260px))" onsubmit="return false">' +
      '<label>Record type<select name="kind">' + kindOpts + "</select></label>" +
      '<label>Role<select name="who">' + roleOpts + "</select></label></form>" +
      '<div class="wrap"><table><tr><th>When</th><th>Role</th><th>Record</th><th>Action</th><th>Detail</th></tr>' +
      (rows.length ? rows.map(function (a) {
        return "<tr><td>" + esc(when(a.at)) + "</td><td>" + esc(P.roleLabel(a.role)) + "</td><td>" + esc(a.entity) + "</td><td>" + esc(a.action) +
          '</td><td class="muted">' + esc(a.note) + "</td></tr>";
      }).join("") : '<tr><td colspan="5" class="empty">No entries match.</td></tr>') + "</table></div>" +
      '<p class="hint">Showing ' + rows.length + " of " + all.length + " entries" + (all.length > LIMIT ? " (latest " + LIMIT + ")" : "") + ".</p>";
  };
})();
