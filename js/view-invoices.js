/* Invoices: Accounts Payable enters a supplier invoice, the system runs an exact three way match
 * (PO, goods receipt, invoice), and anything that does not match goes to the owner who can fix it. */
(function () {
  "use strict";
  var App = window.App, P = App.P, esc = App.esc;

  var prevGoto = App.actions.goto;
  App.actions.goto = function (el) {
    if (el.dataset.arg === "invoices" && el.dataset.id) {
      App.sel.invPO = /^PO-/.test(el.dataset.id) ? el.dataset.id : null;
      App.go("invoices");
      return;
    }
    prevGoto(el);
  };

  var OWNER_NAME = { ap: "Accounts Payable", buyer: "Buyer", warehouse: "Warehouse" };
  var OWNER_TAB = { buyer: ["pos", "Open the PO"], warehouse: ["grn", "Open receipts"] };

  function poOf(id) { return App.state.pos.find(function (p) { return p.id === id; }); }
  function invoiceable(po, exceptId) {
    var t = P.grnTotals(App.state, po.id);
    return t.accepted - P.invoicedQty(App.state, po.id, exceptId || null, ["Matched", "Paid"]);
  }

  // ---------- enter ----------
  function formCard() {
    var s = App.state;
    var pos = s.pos.filter(function (po) { return !po.cancelled; });
    var chosen = pos.find(function (p) { return p.id === App.sel.invPO; }) || pos[0];
    if (!chosen) return "";
    var opts = pos.map(function (po) {
      return '<option value="' + po.id + '"' + (po.id === chosen.id ? " selected" : "") + ">" + po.id + "  " + esc(App.supplier(po.supplierId).name) + ", " + esc(App.item(po.itemId).name) + "</option>";
    }).join("");
    return '<div class="card" style="margin-bottom:12px"><h3>Enter a supplier invoice</h3>' +
      '<form data-form="invEnter" data-change="invChange" class="form">' +
      '<label class="wide">Purchase order<select name="poId">' + opts + "</select></label>" +
      '<label>Supplier invoice number<input name="invNo" placeholder="As printed on the invoice"></label>' +
      '<label>Invoice date<input type="date" name="date" value="' + App.today() + '"></label>' +
      '<label>Quantity billed<input type="number" name="qty" min="1" step="1" value="' + Math.max(invoiceable(chosen), 1) + '"></label>' +
      '<label>Unit price billed<input type="number" name="unitPrice" min="0.01" step="0.01" value="' + chosen.unitPrice + '"></label>' +
      '<div class="wide"><div id="invPreview" class="note">' + previewFor(chosen) + "</div>" +
      '<div class="actions"><button type="submit">Enter and match</button></div></div></form></div>';
  }
  function previewFor(po) {
    var t = P.grnTotals(App.state, po.id);
    return "PO " + po.id + ": " + po.qty + " ordered at " + App.money(po.unitPrice) + ". Accepted into stock " + t.accepted + (t.hold ? ", on quality hold " + t.hold : "") +
      ". Available to invoice " + Math.max(invoiceable(po), 0) + ". The match is exact, so quantity and price must both agree.";
  }
  App.actions.invChange = function (target, form) {
    if (target.name !== "poId") return;
    var po = poOf(target.value);
    form.elements.qty.value = Math.max(invoiceable(po), 1);
    form.elements.unitPrice.value = po.unitPrice;
    App.sel.invPO = po.id;
    document.getElementById("invPreview").textContent = previewFor(po);
  };
  App.actions.invEnter = function (data) {
    var inv = App.run(function (s, role, now) { return P.enterInvoice(s, role, now, data); },
      function (i) { return i.invNo + (i.status === "Matched" ? " matched first time. Ready to pay." : " failed the match. See the exception queue."); });
    if (inv) { App.sel.invPO = null; App.render(); }
  };

  // ---------- act on an invoice ----------
  App.actions.invRerun = function (el) {
    var id = el.dataset.id;
    App.run(function (s, role, now) { return P.rerunMatch(s, role, now, id); },
      function (i) { return i.status === "Matched" ? "Now matches. Ready to pay." : "Still failing. See the reasons on the invoice."; });
  };
  App.actions.invReject = function (el) {
    var id = el.dataset.id, f = document.getElementById("rej-" + id);
    App.run(function (s, role, now) { return P.rejectInvoice(s, role, now, id, f ? f.value : ""); }, "Invoice rejected back to the supplier.");
  };
  App.actions.invPay = function (el) {
    var id = el.dataset.id;
    App.run(function (s, role, now) { return P.payInvoice(s, role, now, id); }, "Payment released.");
  };

  // ---------- cards ----------
  function compare(inv) {
    var po = poOf(inv.poId), t = P.grnTotals(App.state, po.id);
    var bad = function (cond) { return cond ? ' style="color:var(--bad);font-weight:600"' : ""; };
    return '<table style="margin:8px 0"><tr><th></th><th class="num">Quantity</th><th class="num">Unit price</th></tr>' +
      "<tr><td>PO " + po.id + '</td><td class="num">' + po.qty + '</td><td class="num">' + App.money(po.unitPrice) + "</td></tr>" +
      "<tr><td>Accepted receipts</td><td class=\"num\">" + t.accepted + (t.hold ? " (+" + t.hold + " on hold)" : "") + '</td><td class="num muted">n/a</td></tr>' +
      "<tr><td>Invoice " + esc(inv.invNo) + "</td><td class=\"num\"" + bad(inv.match && inv.match.issues.some(function (i) { return /QTY|NO_RECEIPT/.test(i.code); })) + ">" + inv.qty +
      '</td><td class="num"' + bad(inv.match && inv.match.issues.some(function (i) { return i.code === "PRICE"; })) + ">" + App.money(inv.unitPrice) + "</td></tr></table>";
  }

  function exceptionCard(inv) {
    var ap = App.role === "ap";
    var owners = P.invOwners(inv);
    var h = '<div class="card" style="margin-bottom:10px"><h3>' + inv.id + " / " + esc(inv.invNo) + " " + App.status("Exception") + "</h3>" +
      '<p class="hint">' + esc(App.supplier(inv.supplierId).name) + ", " + inv.poId + ", billed " + App.money(inv.qty * inv.unitPrice) + ", due " + inv.dueDate + ".</p>" +
      compare(inv) + "<ul style=\"margin:6px 0 8px;padding-left:20px\">" + inv.match.issues.map(function (i) {
        return "<li>" + esc(i.msg) + " " + App.pill("Fix owner: " + OWNER_NAME[i.owner], "warn") + "</li>";
      }).join("") + "</ul>";
    h += '<div class="actions">';
    owners.forEach(function (o) {
      if (OWNER_TAB[o]) h += '<button class="ghost small" data-act="goto" data-arg="' + OWNER_TAB[o][0] + '" data-id="' + inv.poId + '">' + OWNER_TAB[o][1] + "</button>";
    });
    if (ap) h += '<button class="small" data-act="invRerun" data-id="' + inv.id + '">Re-run the match</button>';
    h += "</div>";
    if (ap) {
      h += '<div class="actions"><input id="rej-' + inv.id + '" placeholder="Reason, and what you asked the supplier for" style="flex:1;min-width:220px">' +
        '<button class="danger small" data-act="invReject" data-id="' + inv.id + '">Reject to supplier</button></div>';
    } else {
      h += '<p class="hint" style="margin:8px 0 0">Accounts Payable re-runs the match once the ' + esc(owners.map(function (o) { return OWNER_NAME[o]; }).join(" and ")) + " has fixed the cause.</p>";
    }
    return h + "</div>";
  }

  App.views.invoices = function () {
    var s = App.state, ap = App.role === "ap", html = "<h2>Invoices</h2>";
    if (ap) html += formCard();
    else html += '<div class="note">Invoices are entered by Accounts Payable. Switch roles at the top to enter one.</div>';

    var exc = s.invoices.filter(function (i) { return i.status === "Exception"; });
    html += "<h3>Exceptions (" + exc.length + ")</h3>" + (exc.length ? exc.map(exceptionCard).join("") : '<p class="empty">No invoice exceptions.</p>');

    var ready = s.invoices.filter(function (i) { return i.status === "Matched"; });
    html += '<h3 style="margin-top:14px">Matched and ready to pay (' + ready.length + ')</h3>' +
      (ready.length ? '<div class="wrap"><table><tr><th>Invoice</th><th>Supplier</th><th>PO</th><th class="num">Amount</th><th>Due</th><th></th></tr>' + ready.map(function (i) {
        return "<tr><td>" + i.id + " / " + esc(i.invNo) + "</td><td>" + esc(App.supplier(i.supplierId).name) + "</td><td>" + i.poId + '</td><td class="num">' + App.money(i.qty * i.unitPrice) + "</td><td>" + i.dueDate +
          (i.dueDate < App.today() ? " " + App.pill("overdue", "bad") : "") + "</td><td>" + (ap ? '<button class="small" data-act="invPay" data-id="' + i.id + '">Pay</button>' : "") + "</td></tr>";
      }).join("") + "</table></div>" : '<p class="empty">Nothing is waiting for payment.</p>');

    var done = s.invoices.filter(function (i) { return i.status === "Paid" || i.status === "Rejected"; });
    html += '<h3 style="margin-top:14px">Paid and rejected</h3>' + (done.length ? '<div class="wrap"><table><tr><th>Invoice</th><th>Supplier</th><th>PO</th><th class="num">Amount</th><th>Status</th><th>Detail</th></tr>' + done.map(function (i) {
      return "<tr><td>" + i.id + " / " + esc(i.invNo) + "</td><td>" + esc(App.supplier(i.supplierId).name) + "</td><td>" + i.poId + '</td><td class="num">' + App.money(i.qty * i.unitPrice) + "</td><td>" + App.status(i.status) +
        '</td><td class="muted">' + (i.paidAt ? "Paid " + i.paidAt : "See audit trail") + "</td></tr>";
    }).join("") + "</table></div>" : '<p class="empty">None yet.</p>');
    return html;
  };
})();
