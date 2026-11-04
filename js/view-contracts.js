/* Contracts: rate contracts with a supplier, agreed prices per item, a period and a value cap.
 * The Buyer drafts them. The Director approves, and the Executive too from the executive threshold.
 * Each PO issued from an active contract is a release that uses up its cap. App.sel.contracts holds the selected contract. */
(function () {
  "use strict";
  var App = window.App, P = App.P, REF = App.REF, esc = App.esc;
  var money0 = function (v) { return App.money(v).replace(/\.00$/, ""); };

  // Received, released but not yet received, and remaining, as one bar. Used here and on the contract record page.
  App.contractBar = function (c) {
    var st = P.contractStatus(App.state, c, App.today()), w = function (v) { return (c.cap ? Math.min(100, 100 * v / c.cap) : 0) + "%"; };
    var open = Math.max(0, st.released - st.received);
    return '<div class="svcbar"><div class="stack"><i class="seg-acc" style="width:' + w(st.received) + '" data-tip="Received ' + App.money(st.received) + '" tabindex="0"></i>' +
      '<i class="seg-wait" style="width:' + w(open) + '" data-tip="Released, not yet received ' + App.money(open) + '" tabindex="0"></i></div>' +
      '<div class="legend"><span class="l-acc">Received ' + App.money(st.received) + "</span>" +
      (open ? '<span class="l-wait">Released, not yet received ' + App.money(open) + "</span>" : "") +
      "<span>Remaining " + App.money(Math.max(0, st.remaining)) + " of " + App.money(c.cap) + "</span>" +
      '<b class="' + (st.warn ? "pct-warn" : "") + '">' + st.pct + "% used</b></div>" +
      // Invoiced is part of what was received, not its own part of the bar, so it is a line below the legend.
      '<p class="barnote">Invoiced ' + App.money(st.invoiced) + " of the " + App.money(st.received) + " received" +
      (st.received > st.invoiced + 0.005 ? ", so " + App.money(st.received - st.invoiced) + " can still be billed." : ".") + "</p>" +
      App.contractNotes(c, st) + "</div>";
  };

  App.contractNotes = function (c, st) {
    var h = "";
    if (st.status === "Used up") h += '<div class="note warn">The cap is used up. New requests for these items go through normal sourcing until a new contract is approved.</div>';
    else if (st.status === "Expired") h += '<div class="note warn">This contract ended on ' + c.end + ". New requests for these items go through normal sourcing.</div>";
    else {
      if (st.endsSoon) h += '<div class="note warn">Ends in ' + st.daysLeft + " day" + (st.daysLeft === 1 ? "" : "s") + ", on " + c.end + ". Start the renewal now, so releases are not interrupted.</div>";
      if (st.warn) h += '<div class="note warn">Over ' + (REF.serviceWarnPct || 80) + "% of the cap is released. Only " + App.money(st.remaining) + " remain.</div>";
    }
    return h;
  };

  App.actions.ctSelect = function (el) { App.sel.contracts = el.dataset.id; App.render(); };
  App.actions.ctNew = function () { App.sel.ctNew = !App.sel.ctNew; App.render(); };
  App.actions.ctCreate = function (data) {
    var lines = [1, 2, 3].map(function (i) { return { itemId: data["item" + i], price: data["price" + i] }; }).filter(function (l) { return l.itemId; });
    var c = App.run(function (s, role, now) {
      return P.createContract(s, role, now, { supplierId: data.supplierId, title: data.title, lines: lines, start: data.start, end: data.end, cap: data.cap, basis: data.basis });
    }, function (c) { return c.id + " drafted. It now waits for the " + P.roleLabel(c.approvals[0].role) + " to approve it."; });
    if (c) { App.sel.contracts = c.id; App.sel.ctNew = false; App.render(); }
  };
  App.actions.ctDecide = function (el) {
    var id = el.dataset.id, d = el.dataset.decision, n = document.getElementById("ctNote-" + id);
    App.run(function (s, role, now) { return P.decideContract(s, role, now, id, d, n ? n.value : ""); }, function (c) {
      if (d === "Rejected") return "Rejected. The Buyer sees the reason on the contract.";
      return c.status === "Approved" ? "Approved. Releases can be issued from " + c.start + "." : "Approved at your step. It now waits for the " +
        P.roleLabel(c.approvals.find(function (a) { return a.status === "Pending"; }).role) + ".";
    });
  };

  function newForm() {
    var sups = REF.suppliers.filter(function (sp) { return sp.status === "Qualified"; })
      .map(function (sp) { return '<option value="' + sp.id + '">' + esc(sp.name) + " (" + esc(sp.categories.join(", ")) + ")</option>"; }).join("");
    var items = '<option value="">None</option>' + REF.items.map(function (it) {
      return '<option value="' + it.id + '">' + esc(it.id + " " + it.name) + " (standard " + App.money(it.stdPrice) + ")</option>";
    }).join("");
    var line = function (i) {
      return '<label class="wide">Item ' + i + "<select name=\"item" + i + '">' + items + "</select></label>" +
        '<label>Agreed price ' + i + '<input type="number" name="price' + i + '" min="0.01" step="0.01"></label>';
    };
    return '<div class="card" style="margin-top:12px"><h3>Draft a contract</h3>' +
      '<p class="hint">Set it up after you have sourced the supplier, for example after an RFx or a yearly negotiation. The Director approves it, and the Executive too from ' +
      money0(REF.thresholds.executive) + ". One item can only be on one contract at a time.</p>" +
      '<form data-form="ctCreate" class="form">' +
      '<label class="wide">Supplier<select name="supplierId">' + sups + "</select></label>" +
      '<label class="wide">Title<input name="title" placeholder="What it covers, such as MRO spares or crane hire"></label>' +
      line(1) + line(2) + line(3) +
      '<label>Start<input type="date" name="start" value="' + App.today() + '"></label>' +
      '<label>End<input type="date" name="end" value="' + P.addDays(App.today(), 365) + '"></label>' +
      '<label>Value cap ($)<input type="number" name="cap" min="1" step="1"></label>' +
      '<label class="wide">Basis<input name="basis" placeholder="RFx number, quote reference or negotiation it comes from"></label>' +
      '<div class="wide actions"><button type="submit">Send for approval</button></div></form></div>';
  }

  function approvalsBlock(c) {
    var step = c.status === "Pending approval" && c.approvals.find(function (a) { return a.status === "Pending"; });
    var rows = c.approvals.map(function (a) {
      var st = a.status === "Pending" ? (step && step.role === a.role ? "Waiting" : "Not yet") : a.status;
      return "<tr><td>" + esc(P.roleLabel(a.role)) + "</td><td>" + App.status(st) + "</td><td>" + (a.at ? a.at.slice(0, 10) : "") + "</td><td>" + esc(a.note) + "</td></tr>";
    }).join("");
    var h = '<div class="wrap flat"><table><tr><th>Approver</th><th>Status</th><th>Date</th><th>Note</th></tr>' + rows + "</table></div>";
    if (step && step.role === App.role) {
      h += '<div class="svcdecide pad"><input id="ctNote-' + c.id + '" placeholder="Note (needed to reject)">' +
        '<button class="small" data-act="ctDecide" data-decision="Approved" data-id="' + c.id + '">Approve</button>' +
        '<button class="small ghost" data-act="ctDecide" data-decision="Rejected" data-id="' + c.id + '">Reject</button></div>';
    } else if (step) h += '<p class="hint pad">Waiting for the ' + esc(P.roleLabel(step.role)) + ".</p>";
    else if (c.status === "Rejected") h += '<p class="hint pad">Rejected. Draft a new contract with the changes the approver asked for.</p>';
    return h;
  }

  // The same five blocks, in the same order and at the same size, for every contract, whatever its status.
  function detail(c) {
    var s = App.state, sp = App.supplier(c.supplierId), st = P.contractStatus(s, c, App.today()), approved = c.status === "Approved";
    var dl = function (rows) { return '<dl class="kv pad">' + rows.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + r[1] + "</dd>"; }).join("") + "</dl>"; };
    var head = '<div class="card"><h3>' + c.id + " " + App.status(st.status) + (st.endsSoon ? " " + App.pill("Ends in " + st.daysLeft + " d", "warn") : "") + App.recBtn(c.id) + "</h3>" +
      '<p class="hint" style="margin:0">' + esc(sp.name) + " · " + esc(c.title) + "</p></div>";
    var terms = dl([["Supplier", esc(sp.name) + " · " + App.status(sp.status)], ["Period", c.start + " to " + c.end], ["Value cap", App.money(c.cap)],
      ["Basis", esc(c.basis) || '<span class="muted">None given</span>'], ["Drafted", c.createdAt.slice(0, 10) + " by the " + esc(P.roleLabel(c.by))]]);
    var items = '<div class="wrap flat"><table><tr><th>Item</th><th>Unit</th><th class="num">Agreed rate</th><th class="num">Standard</th><th class="num">Saving</th></tr>' +
      c.lines.map(function (l) {
        var it = App.item(l.itemId), save = Math.round(100 * (it.stdPrice - l.price) / it.stdPrice);
        return "<tr><td>" + esc(it.id + " " + it.name) + "</td><td>" + esc(it.uom) + '</td><td class="num">' + App.money(l.price) + '</td><td class="num">' + App.money(it.stdPrice) +
          '</td><td class="num">' + (save > 0 ? save + "%" : save < 0 ? Math.abs(save) + "% above" : "") + "</td></tr>";
      }).join("") + "</table></div>";
    var use = approved ? '<div class="pad">' + App.contractBar(c) + "</div>"
      : '<p class="empty pad">' + (c.status === "Rejected" ? "This contract was rejected, so nothing can be released from it." : "No releases until the contract is approved.") + "</p>";
    var rel = st.pos.length ? '<div class="wrap flat"><table><tr><th>PO</th><th>Item</th><th class="num">Quantity</th><th class="num">Value</th><th>Issued</th><th>Status</th></tr>' +
      st.pos.map(function (po) {
        return "<tr><td>" + po.id + "</td><td>" + esc(po.itemId) + '</td><td class="num">' + po.qty + '</td><td class="num">' + App.money(po.qty * po.unitPrice) +
          "</td><td>" + po.createdAt.slice(0, 10) + "</td><td>" + App.status(P.poStatus(s, po)) + "</td></tr>";
      }).join("") + "</table></div>"
      : '<p class="empty pad">' + (approved ? "No releases yet. Approved requests for these items are released from this contract on Purchase orders." : "No releases until the contract is approved.") + "</p>";
    return head + '<div class="secs" style="margin-top:12px">' +
      App.card("Terms", terms) + App.card("Items and agreed rates", items, c.lines.length + " item" + (c.lines.length === 1 ? "" : "s")) +
      App.card("Consumption", use, "Cap " + App.money(c.cap), true) +
      App.card("Releases (" + st.pos.length + ")", rel, "Each PO from this contract") + App.card("Approval", approvalsBlock(c), "Director, plus the Executive from " + money0(REF.thresholds.executive)) +
      "</div>";
  }

  App.views.contracts = function () {
    var s = App.state, today = App.today(), list = (s.contracts || []).slice().sort(function (a, b) { return a.id < b.id ? 1 : -1; });
    var html = "<h2>Contracts</h2>" +
      '<p class="hint">A rate contract fixes the supplier and price for some items, for a period, up to a value cap. When a request for one of those items is approved, ' +
      "the Buyer issues a release from the contract on Purchase orders, with no RFx. Each release uses up part of the cap. When the contract ends or the cap is used up, new requests go through normal sourcing.</p>";
    if (App.role === "buyer") html += '<div style="margin-bottom:12px"><button data-act="ctNew">' + (App.sel.ctNew ? "Close the form" : "Draft a contract") + "</button></div>";
    if (App.role === "buyer" && App.sel.ctNew) html += newForm();
    if (!list.length) return html + '<div class="card"><p class="empty">No contracts yet.</p></div>';
    html += '<div class="wrap"><table><tr><th>Contract</th><th>Supplier</th><th>Title</th><th>Items</th><th>Period</th><th class="num">Cap</th><th class="num">Released</th><th class="num">Remaining</th><th class="num">Used</th><th>Status</th></tr>' +
      list.map(function (c) {
        var st = P.contractStatus(s, c, today);
        return '<tr class="clickable ' + (c.id === App.sel.contracts ? "sel" : "") + '" data-act="ctSelect" data-id="' + c.id + '"><td>' + c.id + "</td><td>" + esc(App.supplier(c.supplierId).name) +
          "</td><td>" + esc(c.title) + "</td><td>" + c.lines.map(function (l) { return esc(l.itemId); }).join(", ") + '</td><td class="nowrap">' + c.start + " to " + c.end +
          '</td><td class="num">' + money0(c.cap) + '</td><td class="num">' + App.money(st.released) + '</td><td class="num">' + App.money(Math.max(0, st.remaining)) +
          '</td><td class="num ' + (st.warn ? "pct-warn" : "") + '">' + st.pct + "%</td><td>" + App.status(st.status) + (st.endsSoon ? " " + App.pill("Ends in " + st.daysLeft + " d", "warn") : "") + "</td></tr>";
      }).join("") + "</table></div>";
    var c = list.find(function (x) { return x.id === App.sel.contracts; });
    html += '<div style="margin-top:12px">' + (c ? detail(c) : '<p class="hint">Select a contract to see its rates, releases and approvals.</p>') + "</div>";
    return html;
  };
})();
