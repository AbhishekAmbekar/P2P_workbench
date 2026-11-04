/* Service entries: the service version of a goods receipt.
 * The Requester records the work from the site log and the supplier's report (timesheet, day sheet, visit log).
 * The Manager releases it, plus the Director and the Executive by value, in order. Any of them can send it back.
 * Only released service can be invoiced. App.sel.services holds the selected service PO. */
(function () {
  "use strict";
  var App = window.App, P = App.P, REF = App.REF, esc = App.esc;
  var unit = function (po) { return App.item(po.itemId).uom; };
  var units = function (n, po) { return n + " " + unit(po) + (n === 1 ? "" : "s"); };

  // Ordered, accepted, waiting and remaining as one bar. Used here, on the PO panel and on the PO record page.
  App.serviceBar = function (po) {
    var ss = P.serviceStatus(App.state, po), w = function (v) { return (ss.ordered ? Math.min(100, 100 * v / ss.ordered) : 0) + "%"; };
    return '<div class="svcbar"><div class="stack"><i class="seg-acc" style="width:' + w(ss.accepted) + '" data-tip="Accepted ' + App.money(ss.accepted) + '" tabindex="0"></i>' +
      '<i class="seg-wait" style="width:' + w(ss.waiting) + '" data-tip="Waiting for release ' + App.money(ss.waiting) + '" tabindex="0"></i></div>' +
      '<div class="legend"><span class="l-acc">Accepted ' + App.money(ss.accepted) + '</span>' + (ss.waiting ? '<span class="l-wait">Waiting ' + App.money(ss.waiting) + "</span>" : "") +
      "<span>Remaining " + App.money(ss.remaining) + " of " + App.money(ss.ordered) + "</span><b class=\"" + (ss.warn ? "pct-warn" : "") + '">' + ss.pct + "% used</b></div>" +
      (ss.warn ? '<div class="note warn">Over ' + (REF.serviceWarnPct || 80) + "% of this PO is used. Only " + units(ss.leftQty, po) +
        (ss.leftQty === 1 ? " remains." : " remain.") + " If more work is needed, the Requester should raise a new request before the PO runs out.</div>" : "") + "</div>";
  };

  App.actions.svcSelect = function (el) { App.sel.services = el.dataset.id; App.render(); };
  App.actions.svcRecord = function (data, form) {
    var id = form.dataset.id;
    App.run(function (s, role, now) { return P.postService(s, role, now, id, { qty: data.qty, period: data.period, note: data.note }); },
      function (e) { return e.id + " recorded. Release: " + e.releases.map(function (x) { return P.roleLabel(x.role); }).join(" then ") + "."; });
  };
  App.actions.svcDecide = function (el) {
    var id = el.dataset.id, d = el.dataset.decision, n = document.getElementById("svcNote-" + id);
    App.run(function (s, role, now) { return P.decideService(s, role, now, id, d, n ? n.value : ""); },
      function (e) {
        if (d !== "Accepted") return "Sent back to the Requester to correct with the supplier.";
        var nx = P.nextReleaser(e);
        return nx ? "Released. It now waits for the " + P.roleLabel(nx) + "." : "Released. This service can now be invoiced.";
      });
  };

  // Opening Service entries from another screen with a PO id selects that PO.
  var baseGoto = App.actions.goto;
  App.actions.goto = function (el) {
    if (el.dataset.arg === "services" && el.dataset.id) { App.sel.services = el.dataset.id; App.go("services"); return; }
    baseGoto(el);
  };

  function entriesTable(po) {
    var list = App.state.ses.filter(function (e) { return e.poId === po.id; }).slice().reverse();
    if (!list.length) return '<p class="empty">No service entries yet.</p>';
    return '<div class="wrap"><table><tr><th>Entry</th><th>Month</th><th class="num">Quantity</th><th class="num">Value</th><th>Work done</th><th>Status</th><th>Release</th><th></th></tr>' +
      list.map(function (e) {
        var act = "", nx = P.nextReleaser(e);
        if (nx && nx === App.role) {
          act = '<div class="svcdecide"><input id="svcNote-' + e.id + '" placeholder="Note (needed to send back)">' +
            '<button class="small" data-act="svcDecide" data-decision="Accepted" data-id="' + e.id + '">Release</button>' +
            '<button class="small ghost" data-act="svcDecide" data-decision="Rejected" data-id="' + e.id + '">Send back</button></div>';
        } else if (nx) act = '<span class="hint">Waiting for the ' + esc(P.roleLabel(nx)) + "</span>";
        else if (e.decisionNote) act = '<span class="hint">' + esc(e.decisionNote) + "</span>";
        var chain = P.serviceReleases(e).map(function (x) {
          return App.pill(P.roleLabel(x.role), x.status === "Released" ? "ok" : x.status === "Sent back" ? "bad" : "mut");
        }).join(" ");
        return "<tr><td>" + e.id + "</td><td class=\"nowrap\">" + esc(e.period) + '</td><td class="num">' + units(e.qty, po) + '</td><td class="num">' + App.money(e.value) +
          "</td><td class=\"svcnote\">" + esc(e.note) + "</td><td>" + App.status(e.status) + '</td><td class="nowrap">' + chain + "</td><td>" + act + "</td></tr>";
      }).join("") + "</table></div>";
  }

  function recordForm(po) {
    var ss = P.serviceStatus(App.state, po);
    if (po.cancelled || ss.leftQty <= 0) return '<div class="note">Nothing is left to record on this PO.</div>';
    return '<h3 style="margin-top:14px">Record service work</h3>' +
      '<p class="hint">Enter the work done on site, from your site log and the supplier\'s timesheet or day sheet. Up to ' + units(ss.leftQty, po) + (ss.leftQty === 1 ? " remains" : " remain") + " on this PO.</p>" +
      '<form data-form="svcRecord" data-id="' + po.id + '" class="form">' +
      '<label>Month worked<input type="month" name="period" value="' + App.today().slice(0, 7) + '"></label>' +
      '<label>Quantity (' + esc(unit(po)) + 's)<input type="number" name="qty" min="0.25" step="0.25" max="' + ss.leftQty + '"></label>' +
      '<label class="wide">Work done<input name="note" placeholder="What was done, and the supplier\'s report or timesheet number"></label>' +
      '<div class="wide actions"><button type="submit">Record for release</button></div></form>' +
      '<p class="hint">The Manager releases every entry. From ' + App.money((REF.serviceRelease || {}).director || 5000).replace(/\.00$/, "") + " the Director releases it too, and from " +
      App.money((REF.serviceRelease || {}).executive || 10000).replace(/\.00$/, "") + " the Executive as well, in that order.</p>";
  }

  function detail(po) {
    var sp = App.supplier(po.supplierId), it = App.item(po.itemId);
    var h = '<div class="card"><h3>' + po.id + " " + App.status(P.poStatus(App.state, po)) + App.recBtn(po.id) + "</h3>" +
      '<p class="hint">' + esc(sp.name) + " · " + esc(it.name) + " · rate " + App.money(po.unitPrice) + " per " + esc(it.uom) + " · ordered " + units(po.qty, po) +
      " · service period ends " + po.needBy + "</p>" + App.serviceBar(po) + entriesTable(po);
    if (App.role === "requester") h += recordForm(po);
    else if (["manager", "director", "executive"].indexOf(App.role) < 0) h += '<div class="note">The Requester records service work. The Manager, Director and Executive release it by value. Switch roles at the top to act.</div>';
    return h + "</div>";
  }

  App.views.services = function () {
    var s = App.state, list = s.pos.filter(function (po) { return P.isService(po) && !po.cancelled; })
      .sort(function (a, b) { return a.id < b.id ? 1 : -1; });
    var html = "<h2>Service entries</h2>" +
      '<p class="hint">Services are ordered as hours, days, weeks or months at a rate, and used up over time. The Requester records the work each month from the site log and the supplier\'s timesheet. ' +
      "The Manager releases it, plus the Director and the Executive for larger entries, the same way a receipt confirms goods. Only released service can be invoiced.</p>";
    if (!list.length) return html + '<div class="card"><p class="empty">No service POs yet. Raise a request for a service item, such as technician hours or crane hire.</p></div>';
    html += '<div class="wrap"><table><tr><th>PO</th><th>Supplier</th><th>Service</th><th class="num">Ordered</th><th class="num">Accepted</th><th class="num">Waiting</th><th class="num">Remaining</th><th class="num">Used</th><th>Status</th></tr>' +
      list.map(function (po) {
        var ss = P.serviceStatus(s, po);
        return '<tr class="clickable ' + (po.id === App.sel.services ? "sel" : "") + '" data-act="svcSelect" data-id="' + po.id + '"><td>' + po.id + "</td><td>" + esc(App.supplier(po.supplierId).name) +
          "</td><td>" + esc(App.item(po.itemId).name) + '</td><td class="num">' + App.money(ss.ordered) + '</td><td class="num">' + App.money(ss.accepted) +
          '</td><td class="num">' + (ss.waiting ? App.money(ss.waiting) : "") + '</td><td class="num">' + App.money(ss.remaining) +
          '</td><td class="num ' + (ss.warn ? "pct-warn" : "") + '">' + ss.pct + "%</td><td>" + App.status(P.poStatus(s, po)) + "</td></tr>";
      }).join("") + "</table></div>";
    var po = list.find(function (p) { return p.id === App.sel.services; });
    html += '<div style="margin-top:12px">' + (po ? detail(po) : '<p class="hint">Select a service PO to see its entries' +
      (App.role === "requester" ? " and record work." : ["manager", "director", "executive"].indexOf(App.role) >= 0 ? " and release work." : ".") + "</p>") + "</div>";
    return html;
  };
})();
