/* RFx: start sourcing for an approved PR, collect quotes, compare on a weighted score, award.
 * App.sel.rfx holds the selected RFx id. App.sel.rfxNew holds the request id being sourced. */
(function () {
  "use strict";
  var App = window.App, P = App.P, REF = App.REF, esc = App.esc;

  function reqOf(x) { return App.state.requests.find(function (r) { return r.id === x.requestId; }); }

  // Links from other screens pass either a request id (start an RFx) or an RFx id (open it).
  var baseGoto = App.actions.goto;
  App.actions.goto = function (el) {
    if (el.dataset.arg === "rfx" && el.dataset.id) {
      if (/^REQ-/.test(el.dataset.id)) { App.sel.rfxNew = el.dataset.id; App.sel.rfx = null; }
      else { App.sel.rfx = el.dataset.id; App.sel.rfxNew = null; }
      App.go("rfx");
      return;
    }
    baseGoto(el);
  };

  // ---------- start an RFx ----------
  function startForm(r) {
    var it = App.item(r.itemId);
    var sups = REF.suppliers.filter(function (s) { return s.categories.indexOf(it.category) >= 0; });
    var boxes = sups.map(function (s) {
      return '<label style="display:flex;gap:8px;align-items:center;margin:4px 0;color:var(--ink)">' +
        '<input type="checkbox" name="inv" value="' + s.id + '" style="width:auto"' + (s.status === "Qualified" ? " checked" : "") + ">" +
        "<span>" + esc(s.name) + "</span> " + App.status(s.status) + ' <span class="hint">rating ' + s.quality + ", terms net " + s.terms + "</span></label>";
    }).join("");
    return '<div class="card" style="margin-bottom:12px"><h3>Start sourcing for ' + esc(r.prNo) + "</h3>" +
      '<p class="hint">' + r.qty + " x " + esc(it.name) + ", approved value " + App.money(P.requestTotal(r)) + ", need by " + r.needBy + ".</p>" +
      '<form data-form="rfxStart" data-id="' + r.id + '" class="form">' +
      '<label>Type<select name="type"><option value="RFQ">RFQ (price and lead time)</option><option value="RFP">RFP (full proposal)</option></select></label>' +
      '<label>Bids close on<input type="date" name="closeDate" value="' + P.addDays(App.today(), 7) + '"></label>' +
      '<div class="wide"><div class="hint">Invite suppliers (' + esc(it.category) + ")</div>" + boxes + "</div>" +
      '<label>Weight: price<input type="number" name="wPrice" value="50" min="0" max="100"></label>' +
      '<label>Weight: lead time<input type="number" name="wLead" value="25" min="0" max="100"></label>' +
      '<label>Weight: supplier quality<input type="number" name="wQuality" value="25" min="0" max="100"></label>' +
      '<label class="wide">Sole source reason (only needed when inviting one supplier)<input name="soleReason"></label>' +
      '<div class="wide actions"><button type="submit">Open the RFx</button>' +
      '<button type="button" class="ghost" data-act="rfxCancelNew">Not now</button></div></form></div>';
  }
  App.actions.rfxCancelNew = function () { App.sel.rfxNew = null; App.render(); };
  App.actions.rfxStart = function (data, form) {
    var invited = Array.prototype.map.call(form.querySelectorAll('input[name="inv"]:checked'), function (e) { return e.value; });
    var reqId = form.dataset.id;
    var x = App.run(function (s, role, now) {
      return P.startRFx(s, role, now, reqId, {
        type: data.type, invited: invited, closeDate: data.closeDate, soleReason: data.soleReason,
        wPrice: data.wPrice, wLead: data.wLead, wQuality: data.wQuality
      });
    }, function (x) { return x.id + " is open for quotes."; });
    if (x) { App.sel.rfxNew = null; App.sel.rfx = x.id; App.render(); }
  };

  // ---------- quotes, closing, awarding ----------
  App.actions.rfxQuote = function (data, form) {
    var id = form.dataset.id;
    App.run(function (s, role, now) {
      return P.addQuote(s, role, now, id, { supplierId: data.supplierId, unitPrice: data.unitPrice, leadDays: data.leadDays, terms: data.terms,
        tariffPct: data.tariffPct, freight: data.freight, validUntil: data.validUntil });
    }, "Quote recorded.");
  };
  App.actions.rfxRevalidate = function (data, form) {
    var id = form.dataset.id;
    App.run(function (s, role, now) { return P.extendQuote(s, role, now, id, data.supplierId, data.newDate, data.note); },
      "Quote revalidated.");
  };
  App.actions.rfxClose = function (el) {
    var id = el.dataset.id;
    App.run(function (s, role, now) { return P.closeBidding(s, role, now, id); }, "Bidding closed. Compare the quotes below.");
  };
  App.actions.rfxAward = function (el) {
    var id = el.dataset.id, sup = el.dataset.sup, n = document.getElementById("awardNote");
    App.run(function (s, role, now) { return P.award(s, role, now, id, sup, n ? n.value : ""); },
      function () { return "Awarded to " + App.supplier(sup).name + ". The Buyer can now create the PO."; });
  };
  App.actions.rfxSelect = function (el) { App.sel.rfx = el.dataset.id; App.sel.rfxNew = null; App.render(); };

  // ---------- detail ----------
  function quoteForm(x) {
    var quoted = x.quotes.map(function (q) { return q.supplierId; });
    var opts = x.invited.map(function (id) {
      return '<option value="' + id + '">' + esc(App.supplier(id).name) + (quoted.indexOf(id) >= 0 ? " (revise quote)" : "") + "</option>";
    }).join("");
    return '<h3 style="margin-top:14px">Record a quote</h3><form data-form="rfxQuote" data-id="' + x.id + '" class="form">' +
      '<label>Supplier<select name="supplierId">' + opts + "</select></label>" +
      '<label>Unit price<input type="number" name="unitPrice" min="0.01" step="0.01"></label>' +
      '<label>Lead time (days)<input type="number" name="leadDays" min="1" step="1"></label>' +
      '<label>Tariff or duty (%)<input type="number" name="tariffPct" min="0" max="100" step="0.1" value="0"></label>' +
      '<label>Freight per unit<input type="number" name="freight" min="0" step="0.01" value="0"></label>' +
      '<label>Quote valid until<input type="date" name="validUntil" value="' + P.addDays(App.today(), 30) + '"></label>' +
      '<label>Terms<input name="terms" placeholder="Net 45, FCA plant"></label>' +
      '<div class="wide actions"><button type="submit">Save quote</button></div></form>';
  }

  function compareTable(x, canAward) {
    var ranked = P.scoreRFx(x, App.state, App.now()), r = reqOf(x);
    var top = ranked.filter(function (q) { return q.eligible; })[0];
    var head = "<tr><th>Rank</th><th>Supplier</th><th>Status</th><th class=\"num\">Unit price</th><th class=\"num\">Landed</th><th class=\"num\">Landed total</th><th class=\"num\">Lead</th><th>Valid until</th>" +
      '<th class="num">Price pts</th><th class="num">Lead pts</th><th class="num">Quality pts</th><th class="num">Score</th><th></th></tr>';
    var rows = ranked.map(function (q, i) {
      var sp = App.supplier(q.supplierId), won = x.award && x.award.supplierId === q.supplierId;
      var cell = "";
      if (won) cell = App.pill("Awarded", "ok");
      else if (canAward) {
        if (q.supplierStatus === "Not qualified") cell = App.pill("Cannot award", "bad");
        else if (q.docIssues.length) cell = App.pill("Documents expired", "bad");
        else if (q.expired) cell = App.pill("Quote expired", "bad");
        else cell = '<button class="small" data-act="rfxAward" data-id="' + x.id + '" data-sup="' + q.supplierId + '">Award</button>';
      }
      return "<tr" + (won ? ' class="sel"' : "") + "><td>" + (i + 1) + "</td><td>" + esc(sp.name) + "</td><td>" + App.status(q.supplierStatus) +
        '</td><td class="num">' + App.money(q.unitPrice) + '</td><td class="num">' + App.money(q.landed) +
        (q.tariffPct || q.freight ? '<div class="hint">' + q.tariffPct + "% tariff" + (q.freight ? ", " + App.money(q.freight) + " freight" : "") + "</div>" : "") +
        '</td><td class="num">' + App.money(q.landed * r.qty) + '</td><td class="num">' + q.leadDays + " d</td><td>" + esc(q.validUntil || "") + (q.expired ? " " + App.pill("expired", "bad") : "") + "</td>" +
        '<td class="num">' + q.scores.price + '</td><td class="num">' + q.scores.lead + '</td><td class="num">' + q.scores.quality + '</td><td class="num"><b>' + q.total + "</b></td><td>" + cell + "</td></tr>";
    }).join("");
    return '<div class="wrap"><table>' + head + rows + "</table></div>" +
      '<p class="hint">Scores run 0 to 100. Price points use landed cost, which is price plus tariff plus freight per unit, so a tariff can change the winner. Lead time is scored against the fastest quote. Quality is the supplier rating. Weights: price ' +
      x.weights.price + ", lead time " + x.weights.lead + ", quality " + x.weights.quality + "." +
      (top ? " Top eligible quote: " + esc(App.supplier(top.supplierId).name) + "." : "") + "</p>" +
      (ranked.some(function (q) { return q.docIssues.length; }) ? '<div class="note warn">' + ranked.filter(function (q) { return q.docIssues.length; }).map(function (q) {
        return esc(App.supplier(q.supplierId).name) + ": " + q.docIssues.map(function (d) { return esc(d.label) + (d.status === "Missing" ? " missing" : " expired " + d.expires); }).join(", ");
      }).join(". ") + ". Quality must record a renewal on the Suppliers tab before an award or PO.</div>" : "");
  }

  // Buyer only. Lists quotes that have lapsed so the supplier can be asked to hold them.
  function revalidateForm(x) {
    var expired = P.scoreRFx(x, App.state, App.now()).filter(function (q) { return q.expired; });
    if (!expired.length || App.role !== "buyer" || reqOf(x).status === "Ordered") return "";
    return '<h3 style="margin-top:14px">Revalidate an expired quote</h3><form data-form="rfxRevalidate" data-id="' + x.id + '" class="form">' +
      '<label>Supplier<select name="supplierId">' + expired.map(function (q) { return '<option value="' + q.supplierId + '">' + esc(App.supplier(q.supplierId).name) + " (expired " + q.validUntil + ")</option>"; }).join("") + "</select></label>" +
      '<label>New valid until<input type="date" name="newDate" value="' + P.addDays(App.today(), 30) + '"></label>' +
      '<label class="wide">How the supplier confirmed<input name="note" placeholder="Email, call or portal message"></label>' +
      '<div class="wide actions"><button type="submit" class="ghost">Revalidate</button></div></form>';
  }

  function detail(x) {
    var r = reqOf(x), it = App.item(r.itemId), buyer = App.role === "buyer";
    var h = '<div class="card"><h3>' + x.id + " (" + x.type + ") " + App.status(x.status) + "</h3>" +
      '<p class="hint">For ' + esc(r.prNo) + ": " + r.qty + " x " + esc(it.name) + ", approved value " + App.money(P.requestTotal(r)) + ", need by " + r.needBy +
      (x.closeDate ? ". Bids close " + x.closeDate : "") + ".</p>" +
      '<div class="chain">' + x.invited.map(function (id) {
        var got = x.quotes.some(function (q) { return q.supplierId === id; });
        return App.pill(App.supplier(id).name + ": " + (got ? "quoted" : "no quote yet"), got ? "ok" : "mut");
      }).join(" ") + "</div>";
    if (x.soleReason) h += '<div class="note warn">Sole source reason: ' + esc(x.soleReason) + "</div>";

    if (x.status === "Open") {
      h += (x.quotes.length ? compareTable(x, false) + revalidateForm(x) : '<p class="empty">No quotes yet.</p>');
      if (buyer) {
        h += quoteForm(x) + '<div class="actions"><button class="ghost" data-act="rfxClose" data-id="' + x.id + '"' +
          (x.quotes.length ? "" : " disabled") + ">Close bidding and compare</button></div>";
      } else h += '<div class="note">Quotes are entered by the Buyer. Switch roles to continue.</div>';
    } else if (x.status === "Evaluating") {
      h += compareTable(x, buyer) + revalidateForm(x);
      if (buyer) {
        h += '<label class="hint" style="display:block;margin-top:10px">Justification (required for a conditional supplier, a single bid, or when not picking the top score)</label>' +
          '<textarea id="awardNote"></textarea>';
      } else h += '<div class="note">Awarding is done by the Buyer.</div>';
    } else {
      h += compareTable(x, false) + revalidateForm(x);
      var a = x.award;
      h += '<div class="note">Awarded to <b>' + esc(App.supplier(a.supplierId).name) + "</b>." + (a.justification ? " Justification: " + esc(a.justification) : "") + "</div>";
      if (r.status === "Awarded") h += '<div class="actions"><button class="ghost" data-act="goto" data-arg="pos" data-id="' + r.id + '">Create the PO</button></div>';
      if (r.poId) h += '<div class="actions"><button class="ghost" data-act="goto" data-arg="pos" data-id="' + r.poId + '">View the PO</button></div>';
    }
    return h + "</div>";
  }

  App.views.rfx = function () {
    var s = App.state, buyer = App.role === "buyer";
    var html = "<h2>RFx</h2>";

    var waiting = s.requests.filter(function (r) { return r.status === "Approved"; });
    var newReq = App.sel.rfxNew && s.requests.find(function (r) { return r.id === App.sel.rfxNew && r.status === "Approved"; });
    if (newReq && buyer) html += startForm(newReq);
    if (waiting.length) {
      html += '<div class="card" style="margin-bottom:12px"><h3>Approved PRs waiting for sourcing</h3><div class="wrap" style="border:0"><table><tr><th>PR</th><th>Item</th><th class="num">Value</th><th>Need by</th><th></th></tr>' +
        waiting.map(function (r) {
          var it = App.item(r.itemId);
          return "<tr><td>" + r.prNo + "</td><td>" + esc(it.name) + '</td><td class="num">' + App.money(P.requestTotal(r)) + "</td><td>" + r.needBy + "</td><td>" +
            (buyer ? '<button class="small" data-act="goto" data-arg="rfx" data-id="' + r.id + '">Start RFx</button>' : '<span class="hint">Buyer starts this</span>') + "</td></tr>";
        }).join("") + "</table></div></div>";
    }

    var list = s.rfx.slice().sort(function (a, b) { return a.id < b.id ? 1 : -1; });
    html += '<div class="wrap"><table><tr><th>RFx</th><th>Type</th><th>PR</th><th>Item</th><th>Quotes</th><th>Status</th></tr>' +
      (list.length ? list.map(function (x) {
        var r = reqOf(x);
        return '<tr class="clickable ' + (x.id === App.sel.rfx ? "sel" : "") + '" data-act="rfxSelect" data-id="' + x.id + '"><td>' + x.id + "</td><td>" + x.type + "</td><td>" + r.prNo +
          "</td><td>" + esc(App.item(r.itemId).name) + "</td><td>" + x.quotes.length + " of " + x.invited.length + "</td><td>" + App.status(x.status) + "</td></tr>";
      }).join("") : '<tr><td colspan="6" class="empty">No RFx yet.</td></tr>') + "</table></div>";

    var cur = s.rfx.find(function (x) { return x.id === App.sel.rfx; });
    html += '<div style="margin-top:12px">' + (cur ? detail(cur) : '<p class="hint">Select an RFx to see quotes and the comparison.</p>') + "</div>";
    return html;
  };
})();
