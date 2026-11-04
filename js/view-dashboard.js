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

  // Clicking a chart part opens the list behind it, with the matching filter where the screen has one.
  App.actions.dashGo = function (el) {
    if (el.dataset.filter) { App.sel.poFilter = el.dataset.filter; App.sel.poFilterRole = App.role; }
    App.go(el.dataset.arg);
  };

  function deliveryChart(m) {
    return App.charts.split([
      { label: "Clear", n: m.ctb.Clear, cls: "ok", act: "dashGo", arg: "pos", filter: "open" },
      { label: "At risk", n: m.ctb["At Risk"], cls: "warn", act: "dashGo", arg: "pos", filter: "risk" },
      { label: "Late", n: m.ctb.Late, cls: "bad", act: "dashGo", arg: "pos", filter: "risk" }
    ], "open PO", "No open POs.") +
      '<p class="hint">Slack is need by date minus supplier promise date. Under 5 days is at risk, below zero is late.</p>';
  }

  function invoiceChart(s, m) {
    var n = function (st) { return s.invoices.filter(function (i) { return i.status === st; }).length; };
    return App.charts.split([
      { label: "Paid", n: n("Paid"), cls: "mut", act: "dashGo", arg: "invoices" },
      { label: "Ready to pay", n: n("Matched"), cls: "ok", act: "dashGo", arg: "invoices" },
      { label: "Exception", n: n("Exception"), cls: "bad", act: "dashGo", arg: "invoices" },
      { label: "Rejected", n: n("Rejected"), cls: "rej", act: "dashGo", arg: "invoices" }
    ], "invoice", "No invoices yet.") +
      '<p class="hint">' + (m.firstPass === null ? "No invoices yet." : m.firstPass + "% matched first time. " + dollars(m.exceptionValue) + " is held in exceptions.") + "</p>";
  }

  // Open exceptions, largest first, with who can fix each one. For the Director and VP.
  function exceptionList(s) {
    var rows = s.invoices.filter(function (i) { return i.status === "Exception"; })
      .sort(function (a, b) { return b.qty * b.unitPrice - a.qty * a.unitPrice; });
    if (!rows.length) return '<p class="empty">No invoice exceptions.</p>';
    return "<table><tr><th>Invoice</th><th>Supplier</th><th class=\"num\">Value</th><th>Fix owner</th></tr>" + rows.map(function (i) {
      return "<tr><td>" + i.id + "</td><td>" + esc(App.supplier(i.supplierId).name) + '</td><td class="num">' + App.money(i.qty * i.unitPrice) +
        "</td><td>" + esc(P.invOwners(i).map(P.roleLabel).join(", ")) + "</td></tr>";
    }).join("") + "</table>";
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

    var card = function (title, body, note) { return '<div class="card"><h3>' + esc(title) + (note ? ' <span class="h3note">' + esc(note) + "</span>" : "") + "</h3>" + body + "</div>"; };
    var desk = '<div class="card me"><h3>' + esc(role.label) + " desk</h3><p>" + esc(role.persona) + ". " + esc(role.desc) + "</p>" +
      '<div class="hint" style="margin-bottom:8px">You can: ' + esc(role.can) + "</div>" + queue + "</div>";
    var tiles = '<div class="grid g4">' +
        kpi(m.cycleDays === null ? "n/a" : m.cycleDays + " d", "Average days from approval to PO") +
        kpi(m.firstPass === null ? "n/a" : m.firstPass + "%", "Invoices matched first time") +
        kpi(dollars(m.exceptionValue), "Value stuck in invoice exceptions") +
        kpi(m.receivedNotInvoiced, "POs received but not fully invoiced") +
        kpi(m.posAboveRef, "POs priced above contract or standard price") +
        kpi(m.docAlerts.blocking, "Suppliers blocked by expired documents") + "</div>";
    var budget = card("Budget by cost center", App.charts.budget(m.budget) +
      '<p class="hint">A request that would take a cost center past its budget needs Executive approval.</p>', "Annual");
    var spend = card("Spend by category", App.charts.spend(App.REF.categories, m.spend, m.pipeline, App.REF.categoryType), "Landed cost");
    var delivery = card("Delivery health", deliveryChart(m), "Open POs");
    var invoices = card("Invoices", invoiceChart(s, m), "By status");
    var late = card("Late and at risk POs", '<div class="wrap" style="border:0">' + lateList(s) + "</div>");
    var flow = card("Pipeline", pipeline(s));

    // The Manager, Director and VP oversee the whole cycle: approvals first, then money and risk.
    if (App.oversees()) {
      return "<h2>Oversight</h2>" + '<p class="hint">Approvals waiting on you, then budget, spend, delivery risk and invoice exceptions across the whole cycle.</p>' +
        '<div class="dash">' +
        '<div class="grid g2">' + desk + delivery + "</div>" +
        '<div class="grid g2">' + budget + spend + "</div>" +
        '<div class="grid g2">' + invoices + card("Invoice exceptions by value", '<div class="wrap" style="border:0">' + exceptionList(s) + "</div>", "Largest first") + "</div>" +
        tiles + flow + late + "</div>";
    }
    return "<h2>Dashboard</h2>" + '<p class="hint">' + "What is waiting on you, delivery health, budgets and spend.</p>" +
      '<div class="dash">' +
      '<div class="grid g2">' + desk + '<div class="stackcol">' + delivery + invoices + "</div></div>" +
      flow + tiles +
      '<div class="grid g2">' + budget + spend + "</div>" + late + "</div>";
  };
})();
