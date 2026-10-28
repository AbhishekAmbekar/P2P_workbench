/* Dashboard: what is waiting for the current role, the pipeline, and where money and risk sit. */
(function () {
  "use strict";
  var App = window.App, P = App.P, esc = App.esc;

  function kpi(value, label) { return '<div class="card kpi"><b>' + value + "</b><span>" + esc(label) + "</span></div>"; }

  function pipeline(s) {
    var count = function (f) { return s.requests.filter(f).length; };
    var steps = [
      { tab: "requests", label: "Awaiting approval", n: count(function (r) { return r.status === "Pending approval"; }) },
      { tab: "requests", label: "Approved PRs", n: count(function (r) { return r.status === "Approved"; }) },
      { tab: "rfx", label: "In RFx", n: s.rfx.filter(function (x) { return x.status !== "Awarded"; }).length },
      { tab: "pos", label: "Open POs", n: s.pos.filter(function (po) { return ["Received", "Closed", "Cancelled"].indexOf(P.poStatus(s, po)) < 0; }).length },
      { tab: "grn", label: "On quality hold", n: s.grns.filter(function (g) { return g.result === "Hold"; }).length },
      { tab: "invoices", label: "Invoice exceptions", n: s.invoices.filter(function (i) { return i.status === "Exception"; }).length },
      { tab: "invoices", label: "Ready to pay", n: s.invoices.filter(function (i) { return i.status === "Matched"; }).length }
    ];
    return '<div class="flow">' + steps.map(function (st) {
      return '<button class="step" data-act="goto" data-arg="' + st.tab + '"><b>' + st.n + "</b><span>" + esc(st.label) + "</span></button>";
    }).join("") + "</div>";
  }

  var dollars = function (n) { return App.money(n).replace(/\.\d\d$/, ""); };

  // Every category is listed, even with nothing ordered yet. Committed is issued POs at landed cost.
  // Pipeline is what approved or pending requests will still order.
  function spendBars(m) {
    var cats = App.REF.categories;
    var max = Math.max.apply(null, cats.map(function (c) { return m.spend[c] + m.pipeline[c]; })) || 1;
    return '<div class="bars">' + cats.map(function (c) {
      var a = m.spend[c], b = m.pipeline[c];
      return '<div class="brow"><div class="top2"><span>' + esc(c) + ' <span class="muted">' + esc(App.REF.categoryType[c]) + "</span></span><span>" +
        (a || b ? dollars(a) + " committed" + (b ? ", " + dollars(b) + " in pipeline" : "") : '<span class="muted">nothing yet</span>') + "</span></div>" +
        '<div class="stack"><i class="seg-open" style="width:' + (100 * a / max) + '%"></i><i class="seg-req" style="width:' + (100 * b / max) + '%"></i></div></div>';
    }).join("") + '<div class="legend"><span class="l-open">Committed (issued POs)</span><span class="l-req">Pipeline (requests not yet ordered)</span></div></div>';
  }

  function budgetCard(m) {
    return m.budget.map(function (b) {
      var total = Math.max(b.budget, b.used) || 1;
      var w = function (v) { return (100 * v / total) + "%"; };
      var cls = b.pct > 100 ? "pct-bad" : b.pct >= 90 ? "pct-warn" : "";
      return '<div class="brow"><div class="top2"><span>' + esc(b.name) + '</span><span class="' + cls + '">' + b.pct + "% used</span></div>" +
        '<div class="stack"><i class="seg-paid" style="width:' + w(b.paid) + '"></i><i class="seg-open" style="width:' + w(b.orderedOpen) + '"></i><i class="seg-req" style="width:' + w(b.requested) + '"></i></div>' +
        '<div class="sub2">' + dollars(b.used) + " of " + dollars(b.budget) + " used. " +
        (b.remaining >= 0 ? dollars(b.remaining) + " left." : '<b class="pct-bad">' + dollars(-b.remaining) + " over budget.</b>") +
        " Paid " + dollars(b.paid) + ", ordered " + dollars(b.orderedOpen) + ", requested " + dollars(b.requested) + ".</div></div>";
    }).join("") + '<div class="legend"><span class="l-paid">Paid</span><span class="l-open">Ordered, not yet paid</span><span class="l-req">Requested or in sourcing</span><span>Remaining</span></div>' +
      '<p class="hint">A request that would take a cost center past its budget needs Executive approval.</p>';
  }

  function lateList(s) {
    var rows = s.pos.map(function (po) { return { po: po, c: P.ctb(s, po) }; })
      .filter(function (x) { return x.c.status === "Late" || x.c.status === "At Risk"; })
      .sort(function (a, b) { return a.c.slack - b.c.slack; });
    if (!rows.length) return '<p class="empty">Nothing is late or at risk.</p>';
    return '<table><tr><th>PO</th><th>Item</th><th>Promised</th><th>Need by</th><th class="num">Slack</th><th>Status</th></tr>' +
      rows.map(function (x) {
        return '<tr class="clickable" data-act="goto" data-arg="pos" data-id="' + x.po.id + '"><td>' + x.po.id + "</td><td>" +
          esc(App.item(x.po.itemId).name) + "</td><td>" + x.po.promisedDate + "</td><td>" + x.po.needBy + '</td><td class="num">' +
          x.c.slack + " d</td><td>" + App.status(x.c.status) + "</td></tr>";
      }).join("") + "</table>";
  }

  App.views.dashboard = function () {
    var s = App.state, m = P.metrics(s, App.now()), role = App.roleInfo();
    var q = P.queueFor(s, App.role, App.now());
    var queue = q.length
      ? '<ul class="queue">' + q.map(function (i) {
          return '<li><span>' + esc(i.label) + "</span><span>" + App.pill(String(i.count), "info") +
            ' <button class="small ghost" data-act="goto" data-arg="' + i.tab + '">Open</button></span></li>';
        }).join("") + "</ul>"
      : '<p class="empty">Nothing is waiting on you right now.</p>';

    return '<div class="grid g2" style="margin-bottom:12px">' +
      '<div class="card me"><h3>' + esc(role.label) + " desk</h3><p>" + esc(role.persona) + ". " + esc(role.desc) + "</p>" +
      '<div class="hint" style="margin-bottom:8px">You can: ' + esc(role.can) + "</div>" + queue + "</div>" +
      '<div class="card"><h3>Delivery health</h3><div class="grid g4" style="grid-template-columns:repeat(3,1fr)">' +
        kpi(m.ctb.Clear, "Clear") + kpi(m.ctb["At Risk"], "At risk") + kpi(m.ctb.Late, "Late") + "</div>" +
        '<p class="hint">Slack is need by date minus supplier promise date. Under 5 days is at risk, below zero is late.</p></div></div>' +

      '<div class="card" style="margin-bottom:12px"><h3>Pipeline</h3>' + pipeline(s) + "</div>" +

      '<div class="grid g4" style="margin-bottom:12px">' +
        kpi(m.cycleDays === null ? "n/a" : m.cycleDays + " d", "Average days from approval to PO") +
        kpi(m.firstPass === null ? "n/a" : m.firstPass + "%", "Invoices matched first time") +
        kpi(App.money(m.exceptionValue).replace(/\.\d\d$/, ""), "Value stuck in invoice exceptions") +
        kpi(m.receivedNotInvoiced, "POs received but not fully invoiced") +
        kpi(m.posAboveRef, "POs priced above contract or standard price") +
        kpi(m.docAlerts.blocking, "Suppliers blocked by expired documents") + "</div>" +

      '<div class="card" style="margin-bottom:12px"><h3>Budget by cost center</h3>' + budgetCard(m) + "</div>" +

      '<div class="grid g2"><div class="card"><h3>Spend by category</h3>' + spendBars(m) + "</div>" +
      '<div class="card"><h3>Late and at risk POs</h3><div class="wrap" style="border:0">' + lateList(s) + "</div></div></div>";
  };
})();
