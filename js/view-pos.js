/* Purchase orders: create from an award, a contract or a direct buy, then manage the supplier date and price.
 * App.sel.pos holds the selected PO id. App.sel.poNew holds the request id a PO is being created for. */
(function () {
  "use strict";
  var App = window.App, P = App.P, REF = App.REF, esc = App.esc;

  var prevGoto = App.actions.goto;
  App.actions.goto = function (el) {
    if (el.dataset.arg === "pos" && el.dataset.id) {
      if (/^REQ-/.test(el.dataset.id)) { App.sel.poNew = el.dataset.id; App.sel.pos = null; }
      else { App.sel.pos = el.dataset.id; App.sel.poNew = null; }
      App.go("pos");
      return;
    }
    prevGoto(el);
  };

  function reqOf(po) { return App.state.requests.find(function (r) { return r.id === po.requestId; }); }
  function slackText(c) { return c.slack === null ? "" : c.slack + " d"; }

  // ---------- create ----------
  function createCard(r) {
    var s = App.state, it = App.item(r.itemId), total = P.requestTotal(r);
    var head = '<div class="card" style="margin-bottom:12px"><h3>Create PO for ' + esc(r.prNo) + "</h3>" +
      '<p class="hint">' + r.qty + " x " + esc(it.name) + ", approved value " + App.money(total) + ", need by " + r.needBy + ".</p>";
    var body, form = '<form data-form="poCreate" data-id="' + r.id + '" class="form">';
    if (r.status === "Awarded") {
      var x = s.rfx.find(function (z) { return z.id === r.rfxId; });
      var q = x.quotes.find(function (z) { return z.supplierId === x.award.supplierId; });
      body = '<div class="note">Source: RFx ' + x.id + ". Awarded to " + esc(App.supplier(q.supplierId).name) + " at " + App.money(q.unitPrice) +
        " each with a lead time of " + q.leadDays + " days." + (q.tariffPct || q.freight ? " Tariff " + q.tariffPct + "%, freight " + App.money(q.freight) + " per unit, landed " + App.money(q.unitPrice * (1 + q.tariffPct / 100) + q.freight) + "." : "") +
        " These come from the awarded quote and cannot be edited here.</div>" + form;
    } else if (it.contract) {
      body = '<div class="note">Source: contract. ' + esc(App.supplier(it.contract.supplierId).name) + " at " + App.money(it.contract.price) +
        " each. A contract price allows a direct PO at any value.</div>" + form +
        '<label>Lead time (days)<input type="number" name="leadDays" min="0" step="1" value="7"></label>';
    } else if (total >= REF.thresholds.rfx) {
      return head + '<div class="note warn">This is ' + App.money(total) + " with no contract. Values of " + App.money(REF.thresholds.rfx) +
        " or more need an RFx before a PO.</div>" +
        '<div class="actions"><button data-act="goto" data-arg="rfx" data-id="' + r.id + '">Start an RFx</button>' +
        '<button class="ghost" data-act="poCancelNew">Close</button></div></div>';
    } else {
      var sups = REF.suppliers.filter(function (z) { return z.categories.indexOf(it.category) >= 0 && z.status === "Qualified"; });
      body = '<div class="note">Source: direct buy. Only qualified suppliers for ' + esc(it.category) + " are listed. The PO cannot exceed the approved value by more than " +
        Math.round(REF.thresholds.poOverrun * 100) + "%.</div>" + form +
        '<label>Supplier<select name="supplierId">' + sups.map(function (z) {
          return '<option value="' + z.id + '">' + esc(z.name) + " (rating " + z.quality + ")</option>";
        }).join("") + "</select></label>" +
        '<label>Agreed unit price<input type="number" name="unitPrice" min="0.01" step="0.01" value="' + r.estUnit + '"></label>' +
        '<label>Tariff or duty (%)<input type="number" name="tariffPct" min="0" max="100" step="0.1" value="0"></label>' +
        '<label>Freight per unit<input type="number" name="freight" min="0" step="0.01" value="0"></label>' +
        '<label>Lead time (days)<input type="number" name="leadDays" min="0" step="1" value="10"></label>';
    }
    return head + body + '<label class="wide">Price reason (only needed when the price is more than ' + Math.round(REF.thresholds.priceVariance * 100) + '% above the ' +
      (it.contract ? "contract" : "standard") + " price of " + App.money(P.refPrice(it)) + ')<input name="varianceReason" placeholder="Why the price is higher"></label>' +
      '<div class="wide actions"><button type="submit">Issue the PO</button>' +
      '<button type="button" class="ghost" data-act="poCancelNew">Close</button></div></form></div>';
  }
  App.actions.poCancelNew = function () { App.sel.poNew = null; App.render(); };
  App.actions.poCreate = function (data, form) {
    var id = form.dataset.id;
    var po = App.run(function (s, role, now) { return P.createPO(s, role, now, id, data); },
      function (p) { return p.id + " issued to " + App.supplier(p.supplierId).name + ". Promised " + p.promisedDate + "."; });
    if (po) { App.sel.poNew = null; App.sel.pos = po.id; App.render(); }
  };

  // ---------- manage ----------
  App.actions.poSelect = function (el) { App.sel.pos = el.dataset.id; App.sel.poNew = null; App.render(); };
  App.actions.poConfirm = function (data, form) {
    var id = form.dataset.id;
    App.run(function (s, role, now) { return P.confirmPO(s, role, now, id, data.date); }, "Supplier date confirmed.");
  };
  App.actions.poMove = function (data, form) {
    var id = form.dataset.id;
    App.run(function (s, role, now) { return P.updatePromise(s, role, now, id, data.date, data.note); }, "Promise date updated.");
  };
  App.actions.poPrice = function (data, form) {
    var id = form.dataset.id;
    App.run(function (s, role, now) { return P.amendPOPrice(s, role, now, id, data.price, data.reason); }, "PO price amended.");
  };

  function detail(po) {
    var s = App.state, r = reqOf(po), it = App.item(po.itemId), sp = App.supplier(po.supplierId);
    var st = P.poStatus(s, po), c = P.ctb(s, po), t = P.grnTotals(s, po.id), buyer = App.role === "buyer";
    var invoiced = P.invoicedQty(s, po.id, null, ["Matched", "Paid"]);
    var rows = [
      ["Supplier", sp.name], ["Item", it.id + "  " + it.name], ["Quantity", po.qty + " " + it.uom],
      ["Unit price", App.money(po.unitPrice)], ["PO value", App.money(P.poTotal(po))],
      ["Landed cost", App.money(P.poLanded(po)) + (po.tariffPct || po.freight ? " (" + po.tariffPct + "% tariff, " + App.money(po.freight) + " freight per unit)" : " (no tariff or freight)")],
      ["Reference price", App.money(po.refPrice || P.refPrice(it)) + (it.contract ? " (contract)" : " (standard)")], ["Source", po.source],
      ["Promised delivery", po.promisedDate + (po.confirmed ? " (supplier confirmed)" : " (not confirmed)")], ["Need by", po.needBy],
      ["Site", po.site], ["From", r.id + " / " + r.prNo + (po.rfxId ? " / " + po.rfxId : "")],
      ["Received (accepted)", t.accepted + " of " + po.qty], ["On quality hold", t.hold], ["Rejected", t.rejected], ["Invoiced and matched", invoiced + " of " + po.qty]
    ];
    var h = '<div class="card"><h3>' + po.id + " " + App.status(st) + " " + (c.status !== "Delivered" ? App.status(c.status) : "") + "</h3>" +
      '<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">' + rows.map(function (x) {
        return '<div><div class="hint">' + esc(x[0]) + "</div><div>" + esc(x[1]) + "</div></div>";
      }).join("") + "</div>";
    if (po.refPrice && po.unitPrice > po.refPrice + 0.0001) {
      var over = Math.round(100 * (po.unitPrice - po.refPrice) / po.refPrice * 10) / 10;
      h += '<div class="note warn">Priced ' + over + "% above the " + (it.contract ? "contract" : "standard") + " price of " + App.money(po.refPrice) + "." +
        (po.varianceReason ? " Reason on file: " + esc(po.varianceReason) : "") + "</div>";
    }
    if (c.status === "Late" || c.status === "At Risk") {
      h += '<div class="note ' + (c.status === "Late" ? "bad" : "warn") + '">Slack is ' + c.slack + " days. " + (c.status === "Late"
        ? "The supplier promise is after the date it is needed. Ask for a pull in, or escalate to engineering and supplier management."
        : "Under 5 days of slack. Confirm the ship date.") + "</div>";
    }
    if (buyer && !po.cancelled) {
      if (!po.confirmed && st !== "Received" && st !== "Closed") {
        h += '<h3 style="margin-top:14px">Supplier confirmation</h3><form data-form="poConfirm" data-id="' + po.id + '" class="form">' +
          '<label>Confirmed delivery date<input type="date" name="date" value="' + po.promisedDate + '"></label>' +
          '<div class="actions" style="align-self:end"><button type="submit">Record confirmation</button></div></form>';
      }
      if (["Received", "Closed"].indexOf(st) < 0) {
        h += '<h3 style="margin-top:14px">Move the promise date</h3><form data-form="poMove" data-id="' + po.id + '" class="form">' +
          '<label>New promised date<input type="date" name="date" value="' + po.promisedDate + '"></label>' +
          '<label class="wide">Why did it move?<input name="note" placeholder="Supplier note or call summary"></label>' +
          '<div class="wide actions"><button type="submit" class="ghost">Update date</button></div></form>';
      }
      h += '<h3 style="margin-top:14px">Amend the price</h3><form data-form="poPrice" data-id="' + po.id + '" class="form">' +
        '<label>New unit price<input type="number" name="price" min="0.01" step="0.01" value="' + po.unitPrice + '"></label>' +
        '<label class="wide">Reason (needed for the audit trail)<input name="reason" placeholder="e.g. surcharge agreed in writing"></label>' +
        '<div class="wide actions"><button type="submit" class="ghost">Amend price</button></div></form>';
    } else if (!buyer) {
      h += '<div class="note">The Buyer manages dates and prices on a PO.</div>';
    }
    h += '<div class="actions">';
    if (["Issued", "Confirmed", "Partially received", "Quality hold"].indexOf(st) >= 0) {
      h += '<button class="ghost" data-act="goto" data-arg="grn" data-id="' + po.id + '">Receive goods</button>';
    }
    h += '<button class="ghost" data-act="goto" data-arg="invoices" data-id="' + po.id + '">Invoices for this PO</button></div></div>';
    return h;
  }

  App.views.pos = function () {
    var s = App.state, buyer = App.role === "buyer";
    var html = "<h2>Purchase orders</h2>";

    var ready = s.requests.filter(function (r) { return r.status === "Awarded" || r.status === "Approved"; });
    var cur = s.requests.find(function (r) { return r.id === App.sel.poNew && (r.status === "Awarded" || r.status === "Approved"); });
    if (cur && buyer) html += createCard(cur);
    if (ready.length) {
      html += '<div class="card" style="margin-bottom:12px"><h3>PRs ready for a PO</h3><div class="wrap" style="border:0"><table><tr><th>PR</th><th>Item</th><th class="num">Value</th><th>Route</th><th></th></tr>' +
        ready.map(function (r) {
          var it = App.item(r.itemId), total = P.requestTotal(r);
          var route = r.status === "Awarded" ? "RFx awarded" : it.contract ? "Contract" : total >= REF.thresholds.rfx ? "Needs RFx" : "Direct buy";
          return "<tr><td>" + r.prNo + "</td><td>" + esc(it.name) + '</td><td class="num">' + App.money(total) + "</td><td>" + route + "</td><td>" +
            (buyer ? '<button class="small" data-act="goto" data-arg="pos" data-id="' + r.id + '">' + (route === "Needs RFx" ? "Review" : "Create PO") + "</button>" : '<span class="hint">Buyer creates this</span>') + "</td></tr>";
        }).join("") + "</table></div></div>";
    }

    var list = s.pos.slice().sort(function (a, b) { return a.id < b.id ? 1 : -1; });
    html += '<div class="wrap"><table><tr><th>PO</th><th>Supplier</th><th>Item</th><th class="num">Value</th><th>Promised</th><th>Need by</th><th class="num">Slack</th><th>Delivery</th><th>Status</th></tr>' +
      (list.length ? list.map(function (po) {
        var c = P.ctb(s, po);
        return '<tr class="clickable ' + (po.id === App.sel.pos ? "sel" : "") + '" data-act="poSelect" data-id="' + po.id + '"><td>' + po.id + "</td><td>" + esc(App.supplier(po.supplierId).name) +
          "</td><td>" + esc(App.item(po.itemId).name) + '</td><td class="num">' + App.money(P.poTotal(po)) + "</td><td>" + po.promisedDate + "</td><td>" + po.needBy +
          '</td><td class="num">' + slackText(c) + "</td><td>" + App.status(c.status) + "</td><td>" + App.status(P.poStatus(s, po)) + "</td></tr>";
      }).join("") : '<tr><td colspan="9" class="empty">No purchase orders yet.</td></tr>') + "</table></div>";

    var po = s.pos.find(function (p) { return p.id === App.sel.pos; });
    html += '<div style="margin-top:12px">' + (po ? detail(po) : '<p class="hint">Select a PO to see delivery status, receipts and the supplier date.</p>') + "</div>";
    return html;
  };
})();
