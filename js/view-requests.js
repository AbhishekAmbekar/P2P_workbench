/* Requests and PRs: raise a request, walk it through approvals, and hand it to sourcing.
 * A request becomes a PR (gets a PR number) only after its last approval. */
(function () {
  "use strict";
  var App = window.App, P = App.P, REF = App.REF, esc = App.esc;

  var FILTERS = [
    { id: "all", label: "All", test: function () { return true; } },
    { id: "pending", label: "Awaiting approval", test: function (r) { return r.status === "Pending approval"; } },
    { id: "approved", label: "Approved PRs", test: function (r) { return r.status === "Approved"; } },
    { id: "progress", label: "In sourcing or ordered", test: function (r) { return ["Sourcing", "Awarded", "Ordered"].indexOf(r.status) >= 0; } },
    { id: "closed", label: "Rejected or cancelled", test: function (r) { return r.status === "Rejected" || r.status === "Cancelled"; } }
  ];

  function nextStep(r) {
    return r.approvals.find(function (a) { return a.status === "Pending"; });
  }
  function itemOf(r) { return App.item(r.itemId); }

  function chainHtml(r) {
    return '<div class="chain">' + r.approvals.map(function (a, i) {
      var kind = a.status === "Approved" ? "ok" : a.status === "Rejected" ? "bad" : "mut";
      var current = r.status === "Pending approval" && nextStep(r) === a;
      return App.pill((i + 1) + ". " + P.roleLabel(a.role) + ": " + (current ? "waiting" : a.status.toLowerCase()), current ? "info" : kind);
    }).join(" ") + "</div>";
  }

  // ---------- new request form ----------
  function formHtml() {
    var firstItem = REF.items[0];
    var items = REF.items.map(function (i) {
      return '<option value="' + i.id + '">' + esc(i.id + "  " + i.name + " (" + i.category + ")") + "</option>";
    }).join("");
    var needBy = P.addDays(App.today(), 30);
    return '<div class="card" style="margin-bottom:12px"><h3>New purchase request</h3>' +
      '<form data-form="reqSubmit" data-change="reqChange" class="form">' +
      '<label class="wide">Item<select name="itemId">' + items + "</select></label>" +
      '<label>Quantity<input name="qty" type="number" min="1" step="1" value="10"></label>' +
      '<label>Estimated unit price<input name="estUnit" type="number" min="0.01" step="0.01" value="' + firstItem.stdPrice + '"></label>' +
      '<label>Need by<input name="needBy" type="date" value="' + needBy + '"></label>' +
      '<label>Site<select name="site">' + REF.sites.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join("") + "</select></label>" +
      '<label>Cost center<select name="costCenter">' + REF.costCenters.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join("") + "</select></label>" +
      '<label class="wide">Reason<textarea name="reason" placeholder="Why is this needed?"></textarea></label>' +
      '<div class="wide"><div id="reqPreview" class="note"></div>' +
      '<div class="actions"><button type="submit">Submit for approval</button>' +
      '<button type="button" class="ghost" data-act="reqToggle">Cancel</button></div></div></form></div>';
  }

  function previewText(form) {
    var it = App.item(form.elements.itemId.value);
    var qty = Number(form.elements.qty.value), est = Number(form.elements.estUnit.value);
    if (!it || !(qty > 0) || !(est > 0)) return "Enter a quantity and price to see the approval route.";
    var total = Math.round(qty * est * 100) / 100;
    var bc = P.budgetCheck(App.state, form.elements.costCenter.value, total);
    var chain = P.buildChain(it, total, bc.over).map(function (a) { return P.roleLabel(a.role); }).join(", then ");
    var budget = bc.found ? " " + form.elements.costCenter.value + " would be at " + bc.pctAfter + "% of its " + App.money(bc.budget).replace(/\.\d\d$/, "") + " budget" +
      (bc.over ? ", so the Executive must also approve." : ".") : "";
    var sourcing = it.contract ? "A contract price exists, so the Buyer can raise a PO directly."
      : total >= REF.thresholds.rfx ? "At this value the Buyer must run an RFx before ordering."
      : "Below " + App.money(REF.thresholds.rfx) + " the Buyer may order directly from a qualified supplier.";
    return "Value " + App.money(total) + ". Approvals: " + chain + "." + budget + " " + sourcing;
  }

  App.actions.reqToggle = function () {
    App.sel.newReq = !App.sel.newReq;
    App.render();
    var f = document.querySelector('form[data-form="reqSubmit"]');
    if (f) document.getElementById("reqPreview").textContent = previewText(f);
  };
  App.actions.reqChange = function (target, form) {
    if (target.name === "itemId") form.elements.estUnit.value = App.item(target.value).stdPrice;
    document.getElementById("reqPreview").textContent = previewText(form);
  };
  App.actions.reqSubmit = function (data) {
    var who = App.roleInfo("requester").persona.split(",")[0];
    var r = App.run(function (s, role, now) {
      return P.createRequest(s, role, now, Object.assign({}, data, { requester: who }));
    }, function (x) { return x.id + " submitted. It now needs " + P.roleLabel(x.approvals[0].role) + " approval."; });
    if (r) { App.sel.newReq = false; App.sel.requests = r.id; App.render(); }
  };
  App.actions.reqFilter = function (el) { App.sel.reqFilter = el.dataset.arg; App.render(); };
  App.actions.reqSelect = function (el) { App.sel.requests = el.dataset.id; App.render(); };

  function comment() { var c = document.getElementById("decisionNote"); return c ? c.value : ""; }
  App.actions.reqDecide = function (el) {
    var id = el.dataset.id, dec = el.dataset.arg, note = comment();
    App.run(function (s, role, now) { return P.decide(s, role, now, id, dec, note); },
      function (r) { return dec === "Approved" ? (r.prNo ? "Approved. PR " + r.prNo + " issued." : "Approved. It moves to the next approver.") : "Rejected."; });
  };
  App.actions.reqCancel = function (el) {
    var id = el.dataset.id;
    App.run(function (s, role, now) { return P.cancelRequest(s, role, now, id, "Cancelled by requester"); }, "Request cancelled.");
  };

  // ---------- detail ----------
  function detail(r) {
    var it = itemOf(r), step = nextStep(r), total = P.requestTotal(r);
    var rows = [
      ["Request", r.id], ["PR number", r.prNo || "Issued after final approval"], ["Requester", r.requester],
      ["Item", it.id + "  " + it.name], ["Category", it.category], ["Quantity", r.qty + " " + r.uom],
      ["Estimated unit price", App.money(r.estUnit)], ["Approved value", App.money(total)],
      ["Need by", r.needBy], ["Site", r.site], ["Cost center", r.costCenter], ["Reason", r.reason]
    ];
    var html = '<div class="card"><h3>' + r.id + (r.prNo ? " / " + r.prNo : "") + " " + App.status(r.status) + "</h3>" +
      '<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">' + rows.map(function (x) {
        return "<div><div class=\"hint\">" + esc(x[0]) + "</div><div>" + esc(x[1]) + "</div></div>";
      }).join("") + "</div><h3 style=\"margin-top:14px\">Approval chain</h3>" + chainHtml(r) +
      (r.overBudget ? '<div class="note warn">This request took ' + esc(r.costCenter) + " past its budget when it was raised, so the Executive approval was added.</div>" : "");

    r.approvals.filter(function (a) { return a.comment; }).forEach(function (a) {
      html += '<div class="hint">' + esc(P.roleLabel(a.role)) + ": " + esc(a.comment) + "</div>";
    });

    // what the current role can do here
    var acts = "";
    if (r.status === "Pending approval" && step) {
      if (step.role === App.role) {
        acts += '<label class="hint" style="display:block;margin-top:10px">Comment (required when rejecting)</label>' +
          '<textarea id="decisionNote" placeholder="Add a comment"></textarea>' +
          '<div class="actions"><button data-act="reqDecide" data-id="' + r.id + '" data-arg="Approved">Approve</button>' +
          '<button class="danger" data-act="reqDecide" data-id="' + r.id + '" data-arg="Rejected">Reject</button></div>';
      } else {
        acts += '<div class="note">Waiting on the ' + esc(P.roleLabel(step.role)) + ". You are working as the " + esc(P.roleLabel(App.role)) +
          ", so the approve and reject buttons are hidden. Switch roles at the top to act on it.</div>";
      }
    }
    if ((r.status === "Pending approval" || r.status === "Approved") && App.role === "requester") {
      acts += '<div class="actions"><button class="ghost" data-act="reqCancel" data-id="' + r.id + '">Cancel this request</button></div>';
    }
    if (r.status === "Approved") {
      acts += '<div class="note">Approved. Next step is sourcing. ' + (it.contract
        ? "A contract price exists for this item, so the Buyer can raise a PO directly."
        : total >= REF.thresholds.rfx ? "The value is at or above " + App.money(REF.thresholds.rfx) + " with no contract, so it needs an RFx."
        : "The Buyer can run an RFx or order directly from a qualified supplier.") + "</div>" +
        '<div class="actions"><button class="ghost" data-act="goto" data-arg="rfx" data-id="' + r.id + '">Go to RFx</button>' +
        '<button class="ghost" data-act="goto" data-arg="pos" data-id="' + r.id + '">Go to purchase orders</button></div>';
    }
    if (r.status === "Awarded") {
      acts += '<div class="note">The RFx is awarded. The Buyer can now create the PO.</div>' +
        '<div class="actions"><button class="ghost" data-act="goto" data-arg="pos" data-id="' + r.id + '">Go to purchase orders</button></div>';
    }
    if (r.status === "Sourcing") {
      acts += '<div class="actions"><button class="ghost" data-act="goto" data-arg="rfx" data-id="' + r.rfxId + '">View the RFx</button></div>';
    }
    if (r.status === "Ordered") {
      acts += '<div class="actions"><button class="ghost" data-act="goto" data-arg="pos" data-id="' + r.poId + '">View the PO</button></div>';
    }
    return html + acts + "</div>";
  }

  App.views.requests = function () {
    var s = App.state;
    var fid = App.sel.reqFilter || "all";
    var f = FILTERS.find(function (x) { return x.id === fid; });
    var list = s.requests.filter(f.test).slice().sort(function (a, b) { return b.createdAt < a.createdAt ? -1 : 1; });
    var selId = App.sel.requests;
    var cur = s.requests.find(function (r) { return r.id === selId; });

    var head = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">' +
      "<h2>Requests and PRs</h2>" +
      (App.role === "requester"
        ? '<button data-act="reqToggle">' + (App.sel.newReq ? "Close form" : "New request") + "</button>"
        : '<span class="hint">Switch to Requester to raise a request.</span>') + "</div>";
    var filters = '<div class="actions" style="margin:0 0 10px">' + FILTERS.map(function (x) {
      var n = s.requests.filter(x.test).length;
      return '<button class="small ' + (x.id === fid ? "" : "ghost") + '" data-act="reqFilter" data-arg="' + x.id + '">' + esc(x.label) + " (" + n + ")</button>";
    }).join("") + "</div>";

    var table = '<div class="wrap"><table><tr><th>Request</th><th>PR</th><th>Item</th><th class="num">Qty</th><th class="num">Value</th><th>Need by</th><th>Status</th><th>Waiting on</th></tr>' +
      (list.length ? list.map(function (r) {
        var st = nextStep(r);
        return '<tr class="clickable ' + (r.id === selId ? "sel" : "") + '" data-act="reqSelect" data-id="' + r.id + '"><td>' + r.id + "</td><td>" + (r.prNo || "") +
          "</td><td>" + esc(itemOf(r).name) + '</td><td class="num">' + r.qty + '</td><td class="num">' + App.money(P.requestTotal(r)) +
          "</td><td>" + r.needBy + "</td><td>" + App.status(r.status) + "</td><td>" + (r.status === "Pending approval" && st ? esc(P.roleLabel(st.role)) : "") + "</td></tr>";
      }).join("") : '<tr><td colspan="8" class="empty">No requests in this view.</td></tr>') + "</table></div>";

    return head + (App.sel.newReq && App.role === "requester" ? formHtml() : "") + filters + table +
      '<div style="margin-top:12px">' + (cur ? detail(cur) : '<p class="hint">Select a request to see its approval chain and next step.</p>') + "</div>";
  };
})();
