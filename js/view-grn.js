/* Receipts (GRN): the warehouse posts goods against a PO, Quality decides what happens to held goods.
 * App.sel.grn holds the selected PO id. */
(function () {
  "use strict";
  var App = window.App, P = App.P, esc = App.esc;

  var prevGoto = App.actions.goto;
  App.actions.goto = function (el) {
    if (el.dataset.arg === "grn" && el.dataset.id) {
      App.sel.grn = el.dataset.id;
      App.go("grn");
      return;
    }
    prevGoto(el);
  };

  var RECEIVABLE = ["Issued", "Confirmed", "Partially received", "Quality hold"];

  function leftToReceive(po) {
    var t = P.grnTotals(App.state, po.id);
    return Math.max(po.qty - t.accepted - t.hold, 0);
  }

  App.actions.grnSelect = function (el) { App.sel.grn = el.dataset.id; App.render(); };

  App.actions.grnPost = function (data, form) {
    var poId = form.dataset.id;
    App.run(function (s, role, now) {
      return P.postGRN(s, role, now, poId, { qty: data.qty, result: data.result, note: data.note });
    }, function (g) { return g.id + " posted: " + g.qty + " " + g.result.toLowerCase() + "."; });
  };

  App.actions.grnRelease = function (data, form) {
    var id = form.dataset.id;
    var g = App.run(function (s, role, now) { return P.releaseHold(s, role, now, id, data.decision, data.note); },
      function (x) { return "Hold released as " + x.result.toLowerCase() + "."; });
    if (g) { App.sel.grn = g.poId; App.render(); }
  };

  // ---------- quality holds, across every PO ----------
  function holdsSection() {
    var holds = App.state.grns.filter(function (g) { return g.result === "Hold"; });
    if (!holds.length) return "";
    var quality = App.role === "quality";
    return '<div class="card" style="margin-bottom:12px;border-left:4px solid var(--warn)"><h3>Quality holds (' + holds.length + ")</h3>" +
      holds.map(function (g) {
        var po = App.state.pos.find(function (p) { return p.id === g.poId; });
        var head = "<div><b>" + g.id + "</b> on " + g.poId + ", " + g.qty + " x " + esc(App.item(po.itemId).name) + ' <span class="hint">' + esc(g.note) + "</span></div>";
        if (!quality) return '<div style="padding:8px 0;border-top:1px solid var(--line)">' + head + '<div class="hint">Waiting on the Quality role to inspect and decide.</div></div>';
        return '<div style="padding:8px 0;border-top:1px solid var(--line)">' + head +
          '<form data-form="grnRelease" data-id="' + g.id + '" class="form" style="margin-top:6px">' +
          '<label>Decision<select name="decision"><option>Accepted</option><option>Rejected</option></select></label>' +
          '<label class="wide">Inspection result<input name="note" placeholder="What was checked and what was found"></label>' +
          '<div class="wide actions"><button type="submit">Record decision</button></div></form></div>';
      }).join("") + "</div>";
  }

  // ---------- selected PO ----------
  function postForm(po) {
    var left = leftToReceive(po);
    if (left <= 0) return '<div class="note">Everything on this PO is received or on hold. Nothing left to post.</div>';
    return '<h3 style="margin-top:14px">Post a goods receipt</h3>' +
      '<p class="hint">' + left + " units still open on " + po.id + ". Held goods count as received until Quality decides. Rejected units do not use up the open quantity.</p>" +
      '<form data-form="grnPost" data-id="' + po.id + '" class="form">' +
      '<label>Quantity received<input type="number" name="qty" min="1" step="1" value="' + left + '"></label>' +
      '<label>Result<select name="result"><option>Accepted</option><option>Hold</option><option>Rejected</option></select></label>' +
      '<label class="wide">Note (required for Hold or Rejected)<input name="note" placeholder="Count, damage, certificate, inspection reason"></label>' +
      '<div class="wide actions"><button type="submit">Post receipt</button></div></form>';
  }

  function history(po) {
    var list = App.state.grns.filter(function (g) { return g.poId === po.id; });
    if (!list.length) return '<p class="empty">Nothing received yet.</p>';
    return '<div class="wrap" style="margin-top:8px"><table><tr><th>GRN</th><th>Date</th><th class="num">Qty</th><th>Result</th><th>Note</th></tr>' +
      list.map(function (g) {
        return "<tr><td>" + g.id + "</td><td>" + g.date + '</td><td class="num">' + g.qty + "</td><td>" + App.status(g.result) + "</td><td>" + esc(g.note) +
          (g.releaseNote ? '<div class="hint">Inspection: ' + esc(g.releaseNote) + "</div>" : "") + "</td></tr>";
      }).join("") + "</table></div>";
  }

  function detail(po) {
    var s = App.state, t = P.grnTotals(s, po.id), st = P.poStatus(s, po);
    var h = '<div class="card"><h3>' + po.id + " " + App.status(st) + "</h3>" +
      '<p class="hint">' + esc(App.supplier(po.supplierId).name) + ", " + po.qty + " x " + esc(App.item(po.itemId).name) + ", promised " + po.promisedDate + ".</p>" +
      '<div class="chain">' + App.pill("Ordered " + po.qty, "info") + " " + App.pill("Accepted " + t.accepted, "ok") + " " +
      App.pill("On hold " + t.hold, t.hold ? "warn" : "mut") + " " + App.pill("Rejected " + t.rejected, t.rejected ? "bad" : "mut") + "</div>" +
      history(po);
    if (App.role === "warehouse" && !po.cancelled) h += postForm(po);
    h += '<div class="actions"><button class="ghost" data-act="goto" data-arg="pos" data-id="' + po.id + '">View the PO</button>' +
      '<button class="ghost" data-act="goto" data-arg="invoices" data-id="' + po.id + '">Invoices for this PO</button></div></div>';
    return h;
  }

  App.views.grn = function () {
    var s = App.state, wh = App.role === "warehouse";
    var html = "<h2>Receipts (GRN)</h2>";
    if (!wh) html += '<div class="note">Receiving is done by the Warehouse. Quality decides what happens to held goods.</div>';

    html += holdsSection();

    var open = s.pos.filter(function (po) { return RECEIVABLE.indexOf(P.poStatus(s, po)) >= 0; })
      .sort(function (a, b) { return a.promisedDate < b.promisedDate ? -1 : 1; });
    html += '<div class="wrap"><table><tr><th>PO</th><th>Supplier</th><th>Item</th><th>Promised</th><th class="num">Ordered</th><th class="num">Accepted</th><th class="num">Hold</th><th class="num">Left to receive</th><th>Status</th><th></th></tr>' +
      (open.length ? open.map(function (po) {
        var t = P.grnTotals(s, po.id);
        return '<tr class="clickable ' + (po.id === App.sel.grn ? "sel" : "") + '" data-act="grnSelect" data-id="' + po.id + '"><td>' + po.id + "</td><td>" + esc(App.supplier(po.supplierId).name) +
          "</td><td>" + esc(App.item(po.itemId).name) + "</td><td>" + po.promisedDate + '</td><td class="num">' + po.qty + '</td><td class="num">' + t.accepted +
          '</td><td class="num">' + t.hold + '</td><td class="num">' + leftToReceive(po) + "</td><td>" + App.status(P.poStatus(s, po)) + "</td><td>" +
          (wh ? '<button class="small" data-act="grnSelect" data-id="' + po.id + '">Receive</button>' : "") + "</td></tr>";
      }).join("") : '<tr><td colspan="10" class="empty">No POs are open for receiving.</td></tr>') + "</table></div>";

    var po = s.pos.find(function (p) { return p.id === App.sel.grn; });
    html += '<div style="margin-top:12px">' + (po ? detail(po) : '<p class="hint">Select a PO to see its receipts' + (wh ? " and post a new one" : "") + ". Fully received POs are reached from the Purchase orders tab.</p>") + "</div>";
    return html;
  };
})();
